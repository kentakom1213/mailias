import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const base = resolve(root, "dist/extension-base");

const packageJson = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);

const common = {
  manifest_version: 3,
  name: "mailias",
  version: packageJson.version,
  description: "Generate deterministic, verifiable email aliases locally.",
  permissions: ["storage", "activeTab"],
  optional_host_permissions: ["https://*/*"],
  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  action: {
    default_popup: "src/extension/popup.html",
    default_title: "mailias",
    default_icon: {
      16: "icons/icon16.png",
      32: "icons/icon32.png",
    },
  },
  options_ui: {
    page: "src/extension/options.html",
    open_in_tab: true,
  },
  content_security_policy: {
    extension_pages:
      "default-src 'self'; connect-src https:; object-src 'none'; frame-ancestors 'none'",
  },
};

const manifests = {
  chrome: {
    ...common,
    minimum_chrome_version: "121",
    background: {
      service_worker: "background.js",
      type: "module",
    },
  },
  firefox: {
    ...common,
    background: {
      scripts: ["background.js"],
      type: "module",
    },
    browser_specific_settings: {
      gecko: {
        id: "mailias@pwll.dev",
        strict_min_version: "121.0",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
};

for (const [browser, manifest] of Object.entries(manifests)) {
  const destination = resolve(root, `dist/${browser}`);

  await rm(destination, {
    recursive: true,
    force: true,
  });

  await mkdir(destination, {
    recursive: true,
  });

  await cp(base, destination, {
    recursive: true,
  });

  await writeFile(
    resolve(destination, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}
