# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose recovery keys or permit alias forgery．Use GitHub's private vulnerability reporting feature for this repository．

Never include a real recovery key，forwarding address，or private email content in a report．Use a newly generated test key and synthetic addresses when a reproduction requires them．

## Security boundaries

- The password-manager copy is the only supported recovery source．
- A non-extractable Web Crypto key prevents JavaScript export，but does not guarantee hardware-backed or encrypted-at-rest storage by the browser．
- A compromised extension can use its stored key to generate aliases even when it cannot export the key．
- The 40-bit tag provides lightweight alias validation，not high-strength authentication．
- mailias does not hide the label or domain contained in an alias．
- mailias does not provide per-alias revocation storage．Use an exact-address Cloudflare Email Routing `Drop` rule．

See [docs/security-model.md](docs/security-model.md) for the complete model．
