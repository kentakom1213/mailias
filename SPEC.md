# mailias v1 specification

## Protocol

An alias has the form `<label>-v1-<tag>@<domain>`.

- `label` is 1–48 characters matching `[a-z0-9]+(?:-[a-z0-9]+)*` (no leading, trailing, or consecutive hyphens). ASCII uppercase input is lowercased after surrounding whitespace is removed. Other substitutions are not performed.
- `domain` is lowercased ASCII; trailing dots are rejected. Internationalized names must be supplied in Punycode form.
- The secret is exactly 32 random bytes and is represented to users as unpadded Base64URL.
- The HMAC message is the UTF-8 encoding of `mailias/v1\0<domain>\0<label>`.
- The tag is the first 40 bits of HMAC-SHA-256, encoded as eight characters using the original alphabet `023456789abcdefghjkmnpqrstuvwxyz` (indices 0–31, most significant bits first, no padding).
- The `keyId` is the first 64 bits of `HMAC-SHA-256(secret, "mailias/key-id/v1\0" + domain)`, encoded as 16 lowercase hexadecimal characters.

The tag provides lightweight alias validation. It is not a high-strength authentication token.

## Extension

Chrome Desktop and Firefox Desktop are the v1 clients. They share all application code and use separate Manifest V3 files for their different background execution models.

The options page is the setup home and later becomes the alias-management page. New setup requires this sequence:

1. Connect a deployed Worker HTTPS origin.
2. Select the mail domain.
3. Generate the recovery key locally or restore an existing key.
4. Save the recovery key in a password manager.
5. Import it as a non-extractable HMAC-SHA-256 `CryptoKey` with only the `sign` usage.
6. Save and read back the key from extension-owned IndexedDB.
7. Verify it by calculating the expected `keyId`.
8. Configure `MAILIAS_SECRET` and `MY_ADDRESS` in Cloudflare.
9. Configure the Email Routing catch-all rule and confirm that step in the extension.
10. Check `/health` and require both Worker bindings plus a matching `keyId`.

When all setup statuses pass, the extension persists `setupComplete = true` and hides the setup UI. The options page then shows alias management only. The setup UI is shown again only after reset.

The raw recovery key is not persisted by the extension and cannot be exported later. The password-manager copy is the only recovery source.

The extension stores `domain`, `keyId`, schema version, optional Worker origin, Email Routing confirmation, setup-completion state, and site/label mappings in extension-owned storage. It does not store generated alias addresses, browsing history, or usage history. It does not inspect active tabs or inject content scripts.

## Worker

The Worker uses two user-facing runtime bindings: `MAILIAS_SECRET` and `MY_ADDRESS`. `MAILIAS_SECRET` is a Secret containing the recovery key. `MY_ADDRESS` is a normal Variable containing the user's own destination inbox address. It has no database, issued-alias list, or mutable application state.

The Worker may be deployed before either runtime binding is configured. `GET /health?domain=<domain>` remains available in that state and reports which bindings are present. Incoming email is not forwarded until both bindings are configured.

For incoming email, it parses and validates the recipient. A valid alias is forwarded to `MY_ADDRESS`; malformed and invalid aliases are silently dropped. Configuration and forwarding failures are logged without the secret, recipient, forwarding destination, or message content.

`GET /health?domain=<domain>` reports the version, whether both bindings are configured, and the domain-bound `keyId`. It never returns either binding value. The normal Worker web page is intentionally minimal and only indicates that the Worker is running. Other HTTP routes return 404.

For compatibility with deployments created before the runtime-variable rename, the implementation may temporarily accept legacy `FORWARD_TO` as a fallback for `MY_ADDRESS`. New configurations use `MY_ADDRESS`.

## Recovery and revocation

If both the password-manager copy and extension IndexedDB are lost, the secret cannot be recovered from Cloudflare or the extension.

mailias v1 has no internal per-alias revocation. A leaked alias can be stopped with an exact-address Cloudflare Email Routing `Drop` rule. Replacing the secret invalidates every existing alias and is not treated as routine rotation.
