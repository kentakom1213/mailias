use std::{
    io::Write,
    process::{Command, Stdio},
};

use mailias_core::{decode_key, ProtocolError, KEY_BYTES};
use thiserror::Error;
use zeroize::Zeroizing;

use crate::config::SecretConfig;

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("secret.command is empty")]
    EmptyCommand,

    #[error("could not execute secret command {program}: {source}")]
    Execute {
        program: String,
        source: std::io::Error,
    },

    #[error("secret command exited unsuccessfully: {0}")]
    Unsuccessful(std::process::ExitStatus),

    #[error("secret command returned non-UTF-8 output")]
    NonUtf8,

    #[error("secret command returned an invalid key: {0}")]
    InvalidKey(#[from] ProtocolError),

    #[error("pass entry already exists: {0}")]
    PassEntryExists(String),

    #[error("pass entry must not be empty")]
    EmptyPassEntry,

    #[error("could not inspect pass entry {entry}: {source}")]
    InspectPass {
        entry: String,
        source: std::io::Error,
    },

    #[error("could not start pass: {0}")]
    StartPass(std::io::Error),

    #[error("could not write the key to pass: {0}")]
    WritePass(std::io::Error),

    #[error("pass exited unsuccessfully: {0}")]
    PassFailed(std::process::ExitStatus),
}

pub fn load_key(config: &SecretConfig) -> Result<Zeroizing<[u8; KEY_BYTES]>, SecretError> {
    let (program, args) = config
        .command
        .split_first()
        .ok_or(SecretError::EmptyCommand)?;
    let output = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|source| SecretError::Execute {
            program: program.clone(),
            source,
        })?;
    if !output.status.success() {
        return Err(SecretError::Unsuccessful(output.status));
    }

    let stdout = Zeroizing::new(output.stdout);
    let encoded = std::str::from_utf8(stdout.as_slice()).map_err(|_| SecretError::NonUtf8)?;
    let encoded = encoded.trim_matches(|character: char| character.is_ascii_whitespace());
    Ok(Zeroizing::new(decode_key(encoded)?))
}

pub fn ensure_pass_entry_absent(entry: &str) -> Result<(), SecretError> {
    if entry.is_empty() {
        return Err(SecretError::EmptyPassEntry);
    }
    let status = Command::new("pass")
        .args(["ls", entry])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|source| SecretError::InspectPass {
            entry: entry.to_owned(),
            source,
        })?;
    if status.success() {
        Err(SecretError::PassEntryExists(entry.to_owned()))
    } else {
        Ok(())
    }
}

pub fn store_key_in_pass(entry: &str, encoded_key: &str) -> Result<(), SecretError> {
    let mut child = Command::new("pass")
        .args(["insert", "--multiline", entry])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(SecretError::StartPass)?;

    let mut stdin = child.stdin.take().expect("pass stdin is piped");
    stdin
        .write_all(encoded_key.as_bytes())
        .and_then(|()| stdin.write_all(b"\n"))
        .map_err(SecretError::WritePass)?;
    drop(stdin);

    let status = child.wait().map_err(SecretError::StartPass)?;
    if status.success() {
        Ok(())
    } else {
        Err(SecretError::PassFailed(status))
    }
}
