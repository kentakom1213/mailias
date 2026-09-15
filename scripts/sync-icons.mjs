import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Run with --resize on macOS after replacing public/icons/icon.png.
const root = new URL("../", import.meta.url);
if (process.argv.includes("--resize")) {
  for (const size of [16, 32, 48, 128]) {
    execFileSync("sips", ["-z", String(size), String(size),
      new URL("public/icons/icon.png", root).pathname, "--out",
      new URL(`public/icons/icon${size}.png`, root).pathname]);
  }
}
const icon = await readFile(new URL("public/icons/icon128.png", root));
const base64 = icon.toString("base64");
await writeFile(new URL("docs/icon.png", root), icon);
await writeFile(new URL("docs/favicon.svg", root), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128"><image width="128" height="128" xlink:href="data:image/png;base64,${base64}"/></svg>\n`);
await writeFile(new URL("src/worker/icon.ts", root), `// Generated from public/icons/icon128.png by scripts/sync-icons.mjs.\nexport const ICON_PNG_BASE64 = "${base64}";\n`);
