# Deployment

## 1．Prepare the repository

Create a GitHub repository and upload this project from its root．Keep `dist/`，`.dev.vars`，and `.env` untracked．

The default branch should be named `main` to match the included CI workflow．

The Deploy to Cloudflare button targets `https://github.com/kentakom1213/mailias`．The repository must be public before other users can deploy it through the button．

## 2．Bootstrap the Worker

Users normally start deployment from the mailias extension Settings page．The initial Worker deployment is intentionally allowed to succeed before runtime bindings are configured．`wrangler.jsonc` therefore does not declare `MAILIAS_SECRET` or `FORWARD_TO` as required deployment-time secrets．

After deployment，configure these runtime bindings in Cloudflare:

- `MAILIAS_SECRET` — the recovery key generated and verified by the extension
- `FORWARD_TO` — a verified Email Routing destination

The Worker remains reachable through `/health` while either binding is missing，but incoming email is not forwarded until both are present．Secret values must not be added to repository files，GitHub Actions，issues，or build logs．

For manual deployment from GitHub Actions，add these repository or environment secrets:

- `CLOUDFLARE_API_TOKEN` — a narrowly scoped token that can deploy this Worker
- `CLOUDFLARE_ACCOUNT_ID` — the target account identifier

The `Deploy Worker` workflow is manual and uses the GitHub `production` environment．It deploys code while preserving runtime bindings already configured in Cloudflare．

## 3．Configure Email Routing

1. Verify `FORWARD_TO` as a Cloudflare Email Routing destination．
2. Route the mail domain catch-all address to the mailias Worker．
3. Confirm that step in the extension Settings page．
4. Run the extension's final setup check．
5. Generate an alias and send a test message．

To revoke one alias，add an exact-address rule before the catch-all and choose the `Drop` action．

## 4．Build extensions

Run `pnpm package:extensions`，or download the `extension-packages` artifact from GitHub Actions．The command creates:

```text
dist/packages/mailias-chrome.zip
dist/packages/mailias-firefox.zip
```

Before publishing to Firefox Add-ons，replace the development Gecko ID in `scripts/package-extensions.mjs` with the permanent extension ID．Store listing assets and signing credentials are intentionally kept outside this repository．

## 5．Create a release

Push a tag matching the package version:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The release workflow validates the project，builds both ZIP files，and attaches them to a GitHub release．Store submission and signing remain separate operations．
