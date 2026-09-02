# mailias

`mailias` generates deterministic, HMAC-verified email aliases and validates
them in a Cloudflare Email Worker without storing an issued-alias database.

```console
$ mailias gen github
github-v1-vtabvg6w@m.example.test
```

The project is currently at an initial `v0.1` implementation stage.

## Repository layout

```text
crates/mailias-core/       Rust protocol implementation
crates/mailias-cli/        mailias command-line application
workers/email-router/      Cloudflare Email Worker
spec/v1.md                 byte-level protocol specification
test-vectors/v1.json       shared Rust/TypeScript vectors
```

## Protocol

Addresses use this format:

```text
<label>-v1-<tag>@<domain>
```

The `v1` tag is the first 40 bits of HMAC-SHA-256 over:

```text
"mailias/v1" || 0x00 || domain || 0x00 || label
```

See [`spec/v1.md`](spec/v1.md) for the canonical definition.

## Build the CLI

```console
cargo build --release -p mailias
```

The resulting binary is `target/release/mailias`.

## Initialize with pass

Generate a 32-byte random key, store it in `pass`, and write the local
configuration.

```console
mailias keygen | pass insert --multiline mailias/master
mailias init --domain m.example.test
```

The default configuration path is
`$XDG_CONFIG_HOME/mailias/config.toml`, falling back to
`~/.config/mailias/config.toml`.

```toml
config_version = 1
domain = "m.example.test"

[secret]
command = ["pass", "show", "mailias/master"]
```

The runtime secret loader is command-based rather than pass-specific. For
example, 1Password CLI can be configured as follows after storing a key in the
referenced field:

```toml
[secret]
command = [
  "op",
  "read",
  "--no-newline",
  "op://Personal/mailias/password",
]
```

`mailias keygen` intentionally writes the secret to standard output so it can be
piped into `pass` or another secret manager.

## CLI

```console
mailias init --domain m.example.test
mailias keygen
mailias gen <label>
mailias verify <address>
mailias verify --quiet <address>
mailias doctor
```

`gen` writes only the generated address to standard output. `verify` exits with
status `0` for a valid alias, `1` for an invalid alias, and `2` for an
operational error.

## Email Worker

Install JavaScript dependencies and run the checks:

```console
pnpm install
pnpm worker:test
pnpm worker:check
```

Configure the two Worker secrets:

```console
pass show mailias/master |
  pnpm --dir workers/email-router wrangler secret put MAILIAS_KEY

printf '%s' 'destination@example.com' |
  pnpm --dir workers/email-router wrangler secret put MAILIAS_FORWARD_TO
```

Then deploy:

```console
pnpm worker:deploy
```

Finally, configure the `m.example.test` catch-all Email Routing rule to send mail to
the deployed Worker. Valid aliases are forwarded with `X-Mailias-Label` and
`X-Mailias-Version` headers. Invalid aliases and internal verification failures
are silently dropped.

## Revocation

`v0.1` has no alias database or CLI revocation command. Revoke an individual
address by creating a higher-priority `Drop` rule for that exact address in the
Cloudflare Email Routing dashboard.

## Security boundary

`mailias` prevents arbitrary recipients from being accepted without a valid
HMAC tag. It does not protect an alias after the complete address has leaked,
provide outbound aliases, encrypt message contents, or replace spam filtering.

