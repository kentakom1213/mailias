use std::process::{Command, Stdio};

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
