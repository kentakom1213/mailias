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

Package both extensions:

```sh
pnpm package:extensions
```

Generated files under `dist/` are not committed．

## Protocol compatibility

Changes to canonicalization，HMAC messages，tag encoding，keyId generation，or parsing require shared test vectors and must preserve existing v1 aliases．A behavior change that invalidates v1 aliases needs a new protocol version．

Do not commit real recovery keys，Cloudflare credentials，forwarding addresses，or email contents．
