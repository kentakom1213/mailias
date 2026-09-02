mod cli;
mod config;
mod secret;

use std::{path::Path, process::ExitCode};

use clap::Parser;
use mailias_core::{encode_key, generate_address, verify_address, ProtocolError, KEY_BYTES};
use rand::{rngs::OsRng, RngCore};
use thiserror::Error;
use zeroize::Zeroizing;

use crate::{
    cli::{Cli, Command, InitArgs},
    config::{resolve_config_path, Config, ConfigError},
    secret::{load_key, SecretError},
};

#[derive(Debug, Error)]
enum AppError {
    #[error(transparent)]
    Config(#[from] ConfigError),

    #[error(transparent)]
    Secret(#[from] SecretError),

    #[error(transparent)]
    Protocol(#[from] ProtocolError),
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("mailias: error: {error}");
            ExitCode::from(2)
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode, AppError> {
    match cli.command {
        Command::Init(args) => {
            let config_path = resolve_config_path(cli.config)?;
            init(&config_path, &args)
        }
        Command::Keygen => {
            let key = generate_key();
            println!("{}", key.as_str());
            Ok(ExitCode::SUCCESS)
        }
        Command::Gen(args) => {
            let config_path = resolve_config_path(cli.config)?;
            let config = Config::load(&config_path)?;
            let key = load_key(&config.secret)?;
            println!("{}", generate_address(&key, &config.domain, &args.label)?);
            Ok(ExitCode::SUCCESS)
        }
        Command::Verify(args) => {
            let config_path = resolve_config_path(cli.config)?;
            let config = Config::load(&config_path)?;
            let key = load_key(&config.secret)?;
            let valid = match verify_address(&key, &config.domain, &args.address) {
                Ok(Some(_)) => true,
                Ok(None)
                | Err(ProtocolError::InvalidAddress | ProtocolError::UnsupportedVersion) => false,
                Err(error) => return Err(error.into()),
            };
            if !args.quiet {
                println!("{}", if valid { "valid" } else { "invalid" });
            }
            Ok(if valid {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            })
        }
        Command::Doctor => {
            let config_path = resolve_config_path(cli.config)?;
            doctor(&config_path)
        }
    }
}

fn init(path: &Path, args: &InitArgs) -> Result<ExitCode, AppError> {
    if path.exists() {
        return Err(ConfigError::AlreadyExists(path.to_owned()).into());
    }
    let config = Config::for_pass(&args.domain, &args.pass_entry)?;
    config.write_new(path)?;

    println!("created configuration: {}", path.display());
    println!(
        "store a key with: mailias keygen | pass insert --multiline {}",
        args.pass_entry
    );
    Ok(ExitCode::SUCCESS)
}

fn doctor(path: &Path) -> Result<ExitCode, AppError> {
    let config = Config::load(path)?;
    println!("configuration: ok");
    println!("domain: ok");

    let key = load_key(&config.secret)?;
    println!("secret command: ok");
    println!("secret key: ok");

    let address = generate_address(&key, &config.domain, "doctor")?;
    let verified = verify_address(&key, &config.domain, &address)?;
    if verified.is_none() {
        return Err(ProtocolError::InvalidAddress.into());
    }
    println!("protocol round-trip: ok");
    Ok(ExitCode::SUCCESS)
}

fn generate_key() -> Zeroizing<String> {
    let mut key = Zeroizing::new([0_u8; KEY_BYTES]);
    OsRng.fill_bytes(&mut *key);
    Zeroizing::new(encode_key(&key))
}
