# Architecture

```text
Browser extension
├── options page
│   ├── generate or restore recovery key
│   ├── confirm password-manager backup
│   └── compare Worker keyId
├── popup
│   ├── derive the active site domain when opened
│   └── generate and copy aliases from local site/label mappings
└── background context
    ├── own the non-extractable CryptoKey
    └── perform HMAC operations

Cloudflare Email Routing
└── catch-all
    └── Email Worker
        ├── verify recipient tag
        ├── forward valid messages
        └── silently drop invalid messages
```

The protocol implementation in `src/protocol.ts` is shared by the extensions and Worker．Chrome uses an extension service worker，while Firefox uses a background script．The build creates a separate manifest for each browser around the same source．

No content script is installed．The popup uses `activeTab` to derive the current site domain without persisting the full URL．Site/label mappings and creation/latest-copy timestamps are stored locally and can be exported separately from the key．The Worker stores no alias list or mutable application state．

## Data flow

Settings sends key-import and setup operations to the background context．The popup derives the active site domain and reads its local label mappings，then requests alias generation from the background context．Only that context accesses the stored CryptoKey．Settings also provides mapping import and export．

The background context calls the configured Worker's `/health` endpoint with the mail domain to compare configuration and key identity．It does not send the secret key or active site URL．Email arrives separately through Cloudflare Email Routing；the Worker verifies recipients using its own configured secret and forwards valid mail to the destination inbox．

Protocol details and stored fields are defined in the [specification](https://github.com/kentakom1213/mailias/blob/main/SPEC.md)．Protection limits are described in the [security model](security-model.md)．
