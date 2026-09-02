#![cfg(unix)]

use std::{fs, os::unix::fs::PermissionsExt, path::Path};

use assert_cmd::Command;
use predicates::prelude::*;
use tempfile::TempDir;

const KEY: &str = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

#[test]
fn gen_prints_only_the_address() {
    let fixture = Fixture::new();
    fixture
        .command()
        .args(["gen", "GitHub"])
        .assert()
        .success()
        .stdout("github-v1-vtabvg6w@m.example.test\n")
        .stderr("");
}

#[test]
fn verify_uses_exit_codes_for_validity() {
    let fixture = Fixture::new();
    fixture
        .command()
        .args(["verify", "github-v1-vtabvg6w@m.example.test"])
        .assert()
        .success()
        .stdout("valid\n");

    fixture
        .command()
        .args(["verify", "github-v1-00000000@m.example.test"])
        .assert()
        .code(1)
        .stdout("invalid\n");
}

#[test]
fn keygen_emits_an_unpadded_base64url_key() {
    let fixture = Fixture::new();
    fixture
        .command()
        .arg("keygen")
        .assert()
        .success()
        .stdout(predicate::str::is_match(r"^[A-Za-z0-9_-]{43}\n$").unwrap());
}

struct Fixture {
    _directory: TempDir,
    config: std::path::PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let secret = directory.path().join("secret");
        write_executable(&secret, &format!("#!/bin/sh\nprintf '%s\\n' '{KEY}'\n"));

        let config = directory.path().join("config.toml");
        fs::write(
            &config,
            format!(
                "config_version = 1\ndomain = \"m.example.test\"\n\n[secret]\ncommand = [\"{}\"]\n",
                secret.display()
            ),
        )
        .unwrap();

        Self {
            _directory: directory,
            config,
        }
    }

    fn command(&self) -> Command {
        let mut command = Command::cargo_bin("mailias").unwrap();
        command.env("MAILIAS_CONFIG", &self.config);
        command
    }
}

fn write_executable(path: &Path, contents: &str) {
    fs::write(path, contents).unwrap();
    let mut permissions = fs::metadata(path).unwrap().permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(path, permissions).unwrap();
}
