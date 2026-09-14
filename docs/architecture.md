# Architecture

```text
Browser extension
├── options page
│   ├── generate or restore recovery key
│   ├── require password-manager round-trip verification
│   └── compare Worker keyId
├── popup
│   └── generate and copy aliases
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

No content script is installed，and the extension does not inspect the active tab．The Worker stores no alias list or mutable application state．
