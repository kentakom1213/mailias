# Security model

## Recovery

The generated 32-byte recovery key must be stored in a password manager．New setup is completed only after the displayed value is cleared and the user pastes it back from the password manager．

The extension imports the key as a non-extractable HMAC-SHA-256 `CryptoKey` and persists it in extension-owned IndexedDB．Cloudflare hides Worker Secret values after configuration．If both the password-manager entry and extension database are lost，the key and all existing aliases are unrecoverable．

## Protected assets

- Recovery key confidentiality
- Ability to generate valid aliases
- Forwarding destination confidentiality
- Email content confidentiality outside the unavoidable mail-delivery path

## Main risks

- A compromised password manager exposes the recovery key．
- A compromised browser or operating system may recover underlying Web Crypto key material．`extractable: false` only prevents export through the Web Crypto API．
- A malicious extension update can use the stored key as an HMAC oracle and generate aliases．
- Clipboard managers may retain a copied recovery key during setup．
- Replacing the recovery key invalidates every existing alias．
- An individual leaked alias remains valid until a Cloudflare `Drop` rule is added or the global key is replaced．
- The 40-bit tag admits a theoretical random forgery probability of 1 in 2^40 per attempt．It is not an authentication credential．

## Mitigations

- No content scripts，tab access，remote code，analytics，or telemetry are included．
- The background context alone accesses the CryptoKey and exposes only fixed alias-generation operations．
- The extension never exposes an arbitrary HMAC operation or recovery-key export．
- Worker logs exclude keys，recipients，forwarding destinations，and message contents．
- `/health` exposes only configuration booleans，protocol version，and a domain-bound 64-bit keyId．
- Protocol behavior is covered by implementation-independent HMAC test vectors．
