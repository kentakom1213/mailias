# mailias v1 specification

## Protocol

An alias has the form `<label>-v1-<tag>@<domain>`.

- `label` is 1–52 characters from `[a-z0-9-]`. ASCII uppercase input is lowercased after surrounding whitespace is removed. Other substitutions are not performed.
- `domain` is lowercased ASCII with no trailing dot. Internationalized names must be supplied in Punycode form.
- The secret is exactly 32 random bytes and is represented to users as unpadded Base64URL.
- The HMAC message is the UTF-8 encoding of `mailias/v1\0<domain>\0<label>`.
- The tag is the first 40 bits of HMAC-SHA-256, encoded as eight lowercase RFC 4648 Base32 characters without padding.
- The `keyId` is the first 64 bits of `HMAC-SHA-256(secret, "mailias/key-id/v1\0" + domain)`, encoded as 16 lowercase hexadecimal characters.

The tag provides lightweight alias validation. It is not a high-strength authentication token.

## Extension

Chrome Desktop and Firefox Desktop are the v1 clients. They share all application code and use separate Manifest V3 files for their different background execution models.

The options page creates or restores the configuration. New setup requires this sequence:

1. Generate the recovery key locally.
2. Save it in a password manager.
3. Clear the displayed value.
4. Paste it back from the password manager.
5. Verify exact equality.
6. Import it as a non-extractable HMAC-SHA-256 `CryptoKey` with only the `sign` usage.
7. Save and read back the key from extension-owned IndexedDB.
8. Verify it by calculating the expected `keyId`.

The raw recovery key is not persisted by the extension and cannot be exported later. The password-manager copy is the only recovery source.

The extension stores `domain`, `keyId`, schema version, and optional Worker origin in `storage.local`. It does not store labels, generated aliases, browsing history, or usage history. It does not inspect active tabs or inject content scripts.

## Worker

The Worker has two secrets: `MAILIAS_SECRET` and `FORWARD_TO`. It has no database, issued-alias list, or mutable application state.

For incoming email, it parses and validates the recipient. A valid alias is forwarded to `FORWARD_TO`; malformed and invalid aliases are silently dropped. Configuration and forwarding failures are logged without the secret, recipient, forwarding destination, or message content.

`GET /health?domain=<domain>` reports the version, whether both bindings are configured, and the domain-bound `keyId`. It never returns either secret value. Other HTTP routes return 404.

## Recovery and revocation

If both the password-manager copy and extension IndexedDB are lost, the secret cannot be recovered from Cloudflare or the extension.

mailias v1 has no internal per-alias revocation. A leaked alias can be stopped with an exact-address Cloudflare Email Routing `Drop` rule. Replacing the secret invalidates every existing alias and is not treated as routine rotation.
