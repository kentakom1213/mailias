import { append, button, el, message } from "./shared/ui";
import { exportMappings, importMappings, loadState, removeSite } from "./storage/state";
import type { ExtensionState } from "./storage/types";
let siteDelete: { domain: string; stage: 1 | 2 } | null = null;
let statusText = "";
let statusKind: "notice" | "error" = "notice";
function setStatus(text: string, kind: "notice" | "error" = "notice"): void {
  statusText = text; statusKind = kind;
}
function section(title: string): HTMLElement {
  const node = el("section", "settings-section");
  append(node, el("h2", "section-title", title)); return node;
}
function sitesSection(state: ExtensionState): HTMLElement {
  const node = section("Sites");
  const domains = Object.keys(state.sites).sort();
  if (domains.length === 0) {
    append(node, el("p", "setting-help", "No site mappings yet."));
    return node;
  }

  const list = el("div", "site-list");
  for (const domain of domains) {
    const site = state.sites[domain];
    if (!site) continue;
    const item = el("div", "site-item");
    const main = el("div");
    append(main, el("div", "site-name", domain));
    append(main, el("div", "setting-help", `${site.aliases.length} alias${site.aliases.length === 1 ? "" : "es"}`));
    const remove = button("Remove site", "button danger-outline");
    remove.addEventListener("click", () => {
      siteDelete = { domain, stage: 1 };
      void render();
    });
    append(item, main, remove);

    if (siteDelete?.domain === domain) {
      const confirm = el("div", "site-confirm");
      append(confirm, 
        el(
          "div",
          "warning-box",
          siteDelete.stage === 1
            ? `This removes ${site.aliases.length} saved label${site.aliases.length === 1 ? "" : "s"} for ${domain}. The email aliases themselves remain valid.`
            : `Remove ${domain} and all of its saved labels from this extension?`,
        ),
      );
      const actions = el("div", "actions");
      const cancel = button("Cancel", "button secondary");
      const next = button(siteDelete.stage === 1 ? "Continue" : "Remove site", siteDelete.stage === 1 ? "button danger-outline" : "button danger");
      cancel.addEventListener("click", () => {
        siteDelete = null;
        void render();
      });
      next.addEventListener("click", async () => {
        if (siteDelete?.stage === 1) {
          siteDelete = { domain, stage: 2 };
          await render();
          return;
        }
        await removeSite(domain);
        siteDelete = null;
        setStatus(`${domain} removed from the extension.`);
        await render();
      });
      append(actions, cancel, next);
      append(confirm, actions);
      append(item, confirm);
    }
    append(list, item);
  }
  append(node, list);
  return node;
}

function dataSection(state: ExtensionState): HTMLElement {
  const node = section("Data");
  const help = el(
    "p",
    "setting-help",
    "Export and import site/label mappings. The master key is never included.",
  );
  append(node, help);
  const actions = el("div", "data-actions");
  const exportButton = button("Export mappings", "button secondary");
  const importButton = button("Import mappings", "button secondary");
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.hidden = true;
  append(actions, exportButton, importButton, fileInput);
  append(node, actions);

  exportButton.addEventListener("click", () => {
    try {
      const data = exportMappings(state);
      const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mailias-mappings-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not export mappings.", "error");
      void render();
    }
  });

  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = await importMappings(parsed);
      setStatus(`Import complete: ${result.added} added, ${result.skipped} skipped.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import mappings.", "error");
    }
    await render();
  });
  return node;
}

export async function render(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#mapping-settings")!;
  const state = await loadState();
  root.replaceChildren();
  if (statusText) { message(root, statusText, statusKind); statusText = ""; }
  append(root, sitesSection(state), dataSection(state));
}
