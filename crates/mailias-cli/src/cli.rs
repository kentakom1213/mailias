use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "mailias", version, about)]
pub struct Cli {
    /// Use a configuration file at this path.
    #[arg(long, global = true, value_name = "PATH")]
    pub config: Option<PathBuf>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Create a pass-backed configuration.
    Init(InitArgs),

    /// Generate a new 32-byte key as unpadded Base64URL.
    Keygen,

    /// Generate an address for a label.
    Gen(GenArgs),

    /// Verify an address using the configured key and domain.
    Verify(VerifyArgs),

    /// Check the configuration, secret command, and protocol round trip.
    Doctor,
}

#[derive(Debug, Args)]
pub struct InitArgs {
    /// Domain used for generated aliases.
    #[arg(long)]
    pub domain: String,

    /// pass entry from which the master key is read.
    #[arg(long, default_value = "mailias/master")]
    pub pass_entry: String,
}

#[derive(Debug, Args)]
pub struct GenArgs {
    /// Human-readable service label.
    pub label: String,
}

#[derive(Debug, Args)]
pub struct VerifyArgs {
    /// Complete recipient address to verify.
    pub address: String,

    /// Report validity only through the process exit code.
    #[arg(long)]
    pub quiet: bool,
}
