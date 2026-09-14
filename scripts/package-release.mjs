import { mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = resolve(root, "dist/packages");

await rm(packages, { recursive: true, force: true });
await mkdir(packages, { recursive: true });

for (const browser of ["chrome", "firefox"]) {
  const output = resolve(packages, `mailias-${browser}-extension.zip`);
  const result = spawnSync("zip", ["-qr", output, "."], {
    cwd: resolve(root, `dist/${browser}`),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not package the ${browser} extension.`);
}
