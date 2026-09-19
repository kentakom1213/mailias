# Releasing mailias

This document is for maintainers．For initial Worker setup，install the extension from the [website](https://mailias.pwll.dev/) and follow its Settings screen．For development prerequisites，see [Contributing](https://github.com/kentakom1213/mailias/blob/main/CONTRIBUTING.md)．

## Build and submit extensions

Run `pnpm package:extensions`，or download the two separate extension artifacts from GitHub Actions．The command creates:

```text
dist/packages/mailias-extension-chrome.zip
dist/packages/mailias-extension-firefox.zip
```

CI uploads them separately as `mailias-extension-chrome.zip` and `mailias-extension-firefox.zip` artifacts．

The Firefox manifest uses `mailias@pwll.dev` as its Gecko ID．Keep this ID stable for updates to the existing extension．The repository includes `amo-metadata.json` and `pnpm release:firefox` for a listed Firefox submission through `web-ext sign`．Provide signing credentials through your local environment，never committed files．GitHub release ZIPs and store publication are separate steps．

## Create a GitHub release

Update `package.json` for the new release and commit the release changes first．The following commands read that version to create its tag．Confirm that the version has not already been released before running them:

```sh
release_version="$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')"
git tag "v${release_version}"
git push origin "v${release_version}"
```

The release workflow validates the project，builds both ZIP files，and attaches `mailias-extension-chrome.zip` and `mailias-extension-firefox.zip` as separate GitHub release assets．Store submission and signing remain separate operations．

## Maintainer Worker deployment

For manual deployment from GitHub Actions，add these repository or environment secrets:

- `CLOUDFLARE_API_TOKEN` — a narrowly scoped token that can deploy this Worker
- `CLOUDFLARE_ACCOUNT_ID` — the target account identifier

The `Deploy Worker` workflow is manual and uses the GitHub `production` environment．It deploys code while preserving runtime bindings already configured in Cloudflare．

The Deploy to Cloudflare button targets `https://github.com/kentakom1213/mailias`．If distributing a fork，update the button URL to its public repository．Runtime binding behavior and legacy compatibility are defined in the [specification](https://github.com/kentakom1213/mailias/blob/main/SPEC.md)．

## Website publication

The Pages workflow publishes `docs/` and copies the root user guides and specification into the site artifact．The public entry points are [English](https://mailias.pwll.dev/) and [日本語](https://mailias.pwll.dev/ja/)．Changes to the site or copied documents on `main` trigger that workflow；verify the published pages after deployment．
