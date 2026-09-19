# mailias

mailias generates deterministic email aliases locally in a browser extension and verifies them in a stateless Cloudflare Email Worker．

```text
<label>-v1-<tag>@<domain>
```

To get started，visit the website: [English](https://mailias.pwll.dev/) · [日本語](https://mailias.pwll.dev/ja/)．The extension guides you through setup．

## Development

Requires Node.js 22 or newer and pnpm 10.25.0．

```sh
pnpm install
pnpm check
pnpm build
```

See [Contributing](CONTRIBUTING.md) for local development and validation．

## Documentation

- User guide: [English](SETUP.md) · [日本語](SETUP-ja.md) — preparation，delivery testing，migration，and revocation
- [Specification](SPEC.md) — protocol and implementation requirements
- [Architecture](docs/architecture.md) — components and data flow
- [Security model](docs/security-model.md) — protections and limitations
- [Releasing](docs/releasing.md) — packaging，publication，and maintainer deployment
- [Security policy](SECURITY.md) — vulnerability reporting
- Privacy policy: [English](https://mailias.pwll.dev/privacy-policy/) · [日本語](https://mailias.pwll.dev/ja/privacy-policy/)

## License

[MIT](LICENSE)．
