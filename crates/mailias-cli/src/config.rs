use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
};

use mailias_core::normalize_domain;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const CONFIG_VERSION: u8 = 1;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub config_version: u8,
    pub domain: String,
    pub secret: SecretConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SecretConfig {
    pub command: Vec<String>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("could not determine the configuration path; set HOME or XDG_CONFIG_HOME")]
    MissingHome,

    #[error("configuration already exists at {0}")]
    AlreadyExists(PathBuf),

    #[error("could not read configuration {path}: {source}")]
    Read {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("could not parse configuration {path}: {source}")]
    Parse {
        path: PathBuf,
        source: toml::de::Error,
    },

    #[error("unsupported configuration version {0}")]
    UnsupportedVersion(u8),

    #[error("configuration contains an invalid domain: {0}")]
    InvalidDomain(String),

    #[error("secret.command must contain at least one argument")]
    EmptySecretCommand,

    #[error("could not serialize configuration: {0}")]
    Serialize(#[from] toml::ser::Error),

    #[error("could not create configuration directory {path}: {source}")]
    CreateDirectory {
        path: PathBuf,
        source: std::io::Error,
    },

    #[error("could not create configuration {path}: {source}")]
    Create {
        path: PathBuf,
        source: std::io::Error,
    },
}

impl Config {
    pub fn for_pass(domain: &str, pass_entry: &str) -> Result<Self, ConfigError> {
        let domain = normalize_domain(domain)
            .map_err(|error| ConfigError::InvalidDomain(error.to_string()))?;
        Ok(Self {
            config_version: CONFIG_VERSION,
            domain,
            secret: SecretConfig {
                command: vec!["pass".to_owned(), "show".to_owned(), pass_entry.to_owned()],
            },
        })
    }

    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let contents = fs::read_to_string(path).map_err(|source| ConfigError::Read {
            path: path.to_owned(),
            source,
        })?;
        let mut config: Self = toml::from_str(&contents).map_err(|source| ConfigError::Parse {
            path: path.to_owned(),
            source,
        })?;

        if config.config_version != CONFIG_VERSION {
            return Err(ConfigError::UnsupportedVersion(config.config_version));
        }
        config.domain = normalize_domain(&config.domain)
            .map_err(|error| ConfigError::InvalidDomain(error.to_string()))?;
        if config.secret.command.is_empty() || config.secret.command[0].is_empty() {
            return Err(ConfigError::EmptySecretCommand);
        }

        Ok(config)
    }

    pub fn write_new(&self, path: &Path) -> Result<(), ConfigError> {
        if path.exists() {
            return Err(ConfigError::AlreadyExists(path.to_owned()));
        }
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|source| ConfigError::CreateDirectory {
                path: parent.to_owned(),
                source,
            })?;
        }

        let contents = toml::to_string_pretty(self)?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(path).map_err(|source| ConfigError::Create {
            path: path.to_owned(),
            source,
        })?;
        file.write_all(contents.as_bytes())
            .map_err(|source| ConfigError::Create {
                path: path.to_owned(),
                source,
            })
    }
}

pub fn resolve_config_path(explicit: Option<PathBuf>) -> Result<PathBuf, ConfigError> {
    if let Some(path) = explicit {
        return Ok(path);
    }
    if let Some(path) = env::var_os("MAILIAS_CONFIG").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    if let Some(path) = env::var_os("XDG_CONFIG_HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path).join("mailias/config.toml"));
    }
    env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .map(|home| PathBuf::from(home).join(".config/mailias/config.toml"))
        .ok_or(ConfigError::MissingHome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pass_config_has_no_inline_secret() {
        let config = Config::for_pass("M.EXAMPLE.TEST", "mailias/master").unwrap();
        let encoded = toml::to_string(&config).unwrap();
        assert_eq!(config.domain, "m.example.test");
        assert!(encoded.contains("pass"));
        assert!(!encoded.contains("MAILIAS_KEY"));
    }
}
