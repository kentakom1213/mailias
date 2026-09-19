# Contributing

## Development

Requirements:

- Node.js 22 or newer
- pnpm 10.25.0

Install and validate the project:

```sh
pnpm install
pnpm check
pnpm build
```

Build outputs are written to `dist/chrome`，`dist/firefox`，and `dist/worker`．For local Worker development，copy `.dev.vars.example` to `.dev.vars` and fill in test values．Never commit `.dev.vars`．

For a local Chrome build，open `chrome://extensions`，enable Developer mode，and load `dist/chrome` with **Load unpacked**．For a temporary Firefox build，open `about:debugging#/runtime/this-firefox`，select **Load Temporary Add-on**，and choose `dist/firefox/manifest.json`．

Generated files under `dist/` are not committed．For release packaging and store submission，see [Releasing](docs/releasing.md)．

## Protocol compatibility

Changes to canonicalization，HMAC messages，tag encoding，keyId generation，or parsing require shared test vectors and must preserve existing v1 aliases．A behavior change that invalidates v1 aliases needs a new protocol version．

Do not commit real recovery keys，Cloudflare credentials，forwarding addresses，or email contents．
