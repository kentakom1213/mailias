# mailias

mailias v1 generates deterministic email aliases locally and verifies them in a stateless Cloudflare Email Worker.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kentakom1213/mailias)

Setup guide: [English](SETUP.md) · [日本語](SETUP-ja.md)

Website: [kentakom1213.github.io/mailias](https://kentakom1213.github.io/mailias/)

```text
<label>-v1-<tag>@<domain>
```

The browser extension is the required client. It stores the HMAC key as a non-extractable `CryptoKey` in extension-owned IndexedDB. The original recovery key is never readable from the extension after setup.

- [Protocol specification](SPEC.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Security model](docs/security-model.md)

## Setup

Open the extension Settings page and follow its setup checklist. The extension is the setup home: it guides recovery-key backup, Worker deployment, runtime binding checks, Email Routing confirmation, and the final key match.

The first Worker deployment can succeed before `MAILIAS_SECRET` and `FORWARD_TO` are configured. After deployment, add those runtime bindings in Cloudflare and run the extension's final setup check.

Once every setup status passes, the setup UI is hidden and the Settings page shows alias management only. The setup UI returns only after reset.

The password-manager copy is the only recovery source. Cloudflare does not reveal a Worker Secret after it is set, and the extension key is deliberately non-exportable.

## Development

```sh
pnpm install
pnpm check
pnpm build
```

Build outputs are written to `dist/chrome`, `dist/firefox`, and `dist/worker`.

Create uploadable extension archives with:

```sh
pnpm package:extensions
```

This produces `dist/packages/mailias-chrome.zip` and `dist/packages/mailias-firefox.zip`.

For local Worker development, copy `.dev.vars.example` to `.dev.vars` and fill in test values. Never commit `.dev.vars`.

## Repository layout

```text
src/
├── protocol.ts          shared mailias v1 protocol
├── extension/           shared Chrome and Firefox source
└── worker/              Cloudflare Email Worker
scripts/                 extension build and packaging
test/                    protocol and Worker tests
docs/                    deployment，architecture，and security notes
.github/workflows/       CI，manual Worker deploy，and tagged releases
```

GitHub Actions validates every pull request and `main` push. A manual workflow deploys the Worker after Cloudflare credentials are configured, and `v*` tags create releases containing both extension ZIP files.

## Protocol

- Secret: 32 random bytes, encoded as unpadded Base64URL.
- Label: 1–48 characters from `a-z`, `0-9`, and single hyphens between segments; ASCII uppercase is lowercased.
- HMAC input: UTF-8 `mailias/v1\0<domain>\0<label>`.
- Tag: first 40 bits of HMAC-SHA-256, encoded as the original 32-character alphabet `023456789abcdefghjkmnpqrstuvwxyz` without padding.
- keyId: first 64 bits of `HMAC-SHA-256(secret, "mailias/key-id/v1\0" + domain)`, encoded as lowercase hexadecimal.

The 40-bit tag is lightweight alias validation, not a high-strength authentication token.

## Revoking an alias

mailias does not keep a revocation database. To stop one leaked alias, add an exact-address Email Routing rule in Cloudflare with the `Drop` action. Changing `MAILIAS_SECRET` revokes every existing alias.

## Privacy and permissions

The extension does not inspect the active tab and has no content scripts. Its only required extension permission is `storage`; access to the configured Worker origin is requested only when health checks are enabled.
