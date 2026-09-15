import { sendMessage } from "./platform";
import { append, button, el, message } from "./shared/ui";
import { isRegistrableDomain } from "./shared/domain";
import { addAlias, exportMappings, importMappings, loadState, removeSite, sortAliases } from "./storage/state";
import type { ExtensionState } from "./storage/types";

let siteDelete: { domain: string; stage: 1 | 2 } | null = null;
let statusText = "";
let statusKind: "notice" | "error" = "notice";

function t(english: string, japanese: string): string {
  return document.documentElement.lang === "ja" ? japanese : english;
}

function setStatus(text: string, kind: "notice" | "error" = "notice"): void {
  statusText = text;
  statusKind = kind;
}

function section(title: string): HTMLElement {
  const node = el("section", "settings-section");
  append(node, el("h2", "section-title", title));
  return node;
}

async function addressFor(label: string): Promise<string> {
  const result = await sendMessage<{ alias: string }>({ type: "generateAlias", label });
  return result.alias;
}

function addMappingSection(): HTMLElement {
  const node = section(t("Add site / label", "サイト / ラベルを追加"));


  const siteLabel = el("label", "field-label", t("Site domain", "サイトのドメイン"));
  const siteInput = el("input", "text-input") as HTMLInputElement;
  siteInput.placeholder = "github.com";
  siteInput.autocomplete = "off";
  siteInput.spellcheck = false;
  siteLabel.htmlFor = "mapping-site-domain";
  siteInput.id = "mapping-site-domain";

  const labelLabel = el("label", "field-label", t("Label", "ラベル"));
  const labelInput = el("input", "text-input") as HTMLInputElement;
  labelInput.placeholder = "github";
  labelInput.autocomplete = "off";
  labelInput.spellcheck = false;
  labelLabel.htmlFor = "mapping-label";
  labelInput.id = "mapping-label";

  const add = button(t("Add label", "ラベルを追加"), "button primary");
  add.addEventListener("click", async () => {
    const domain = siteInput.value.trim().toLowerCase();
    const label = labelInput.value.trim();
    try {
      if (!isRegistrableDomain(domain)) {
        throw new Error(t("Enter a registrable site domain such as github.com.", "github.com のような登録可能ドメインを入力してください．"));
      }
      const record = await addAlias(domain, label);
      const address = await addressFor(record.label);
      siteInput.value = "";
      labelInput.value = "";
      setStatus(t(
        `Added ${address} for ${domain}.`,
        `${domain} に ${address} を追加しました．`,
      ));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("Could not add the label.", "ラベルを追加できませんでした．"), "error");
    }
    await render();
  });

  const addActions = el("div", "step-actions");
  append(addActions, add);
  append(node, siteLabel, siteInput, labelLabel, labelInput, addActions);
  return node;
}

async function sitesSection(state: ExtensionState): Promise<HTMLElement> {
  const node = section(t("Registered labels", "登録済みラベル"));
  const domains = Object.keys(state.sites).sort();
  if (domains.length === 0) {
    append(node, el("p", "setting-help", t("No site mappings yet.", "まだサイト / ラベル対応はありません．")));
    return node;
  }

  const list = el("div", "site-list");
  for (const domain of domains) {
    const site = state.sites[domain];
    if (!site) continue;
    const aliases = sortAliases(site.aliases);
    const addresses = await Promise.all(aliases.map((alias) => addressFor(alias.label)));
    const item = el("div", "site-item");
    const main = el("div");
    append(main, el("div", "site-name", domain));
    append(main, el("div", "setting-help", t(
      `${aliases.length} registered label${aliases.length === 1 ? "" : "s"}`,
      `登録済みラベル ${aliases.length} 件`,
    )));
    const remove = button(t("Remove site", "サイトを削除"), "button danger-outline");
    remove.addEventListener("click", () => {
      siteDelete = { domain, stage: 1 };
      void render();
    });
    append(item, main, remove);

    const aliasList = el("div", "site-alias-list");
    aliases.forEach((alias, index) => {
      const address = addresses[index];
      if (!address) return;
      const row = el("div", "site-alias-row");
      const details = el("div");
      append(details, el("div", "setting-value", alias.label));
      append(details, el("div", "setting-help", address));
      const copy = button(t("Copy address", "アドレスをコピー"), "button secondary");
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(address);
          copy.textContent = t("Copied", "コピーしました");
          setTimeout(() => {
            copy.textContent = t("Copy address", "アドレスをコピー");
          }, 1200);
        } catch {
          copy.textContent = t("Copy failed", "コピー失敗");
        }
      });
      append(row, details, copy);
      append(aliasList, row);
    });
    append(item, aliasList);

    if (siteDelete?.domain === domain) {
      const confirm = el("div", "site-confirm");
      append(confirm,
        el(
          "div",
          "warning-box",
          siteDelete.stage === 1
            ? t(
                `This removes ${aliases.length} saved label${aliases.length === 1 ? "" : "s"} for ${domain}. The email aliases themselves remain valid.`,
                `${domain} の保存済みラベル ${aliases.length} 件を拡張機能から削除します．メールエイリアス自体は引き続き有効です．`,
              )
            : t(
                `Remove ${domain} and all of its saved labels from this extension?`,
                `${domain} と保存済みラベルをすべて拡張機能から削除しますか？`,
              ),
        ),
      );
      const actions = el("div", "actions");
      const cancel = button(t("Cancel", "キャンセル"), "button secondary");
      const next = button(
        siteDelete.stage === 1 ? t("Continue", "続行") : t("Remove site", "サイトを削除"),
        siteDelete.stage === 1 ? "button danger-outline" : "button danger",
      );
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
        setStatus(t(`${domain} removed from the extension.`, `${domain} を拡張機能から削除しました．`));
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
  const node = section(t("Data", "データ"));
  append(node, el(
    "p",
    "setting-help",
    t("Export / import labels. Secret key excluded.", "ラベルの書き出し・読み込み．秘密キーは含みません．"),
  ));
  const actions = el("div", "data-actions");
  const exportButton = button(t("Export mappings", "対応をエクスポート"), "button secondary");
  const importButton = button(t("Import mappings", "対応をインポート"), "button secondary");
  const fileInput = el("input") as HTMLInputElement;
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
      setStatus(error instanceof Error ? error.message : t("Could not export mappings.", "対応をエクスポートできませんでした．"), "error");
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
      setStatus(t(
        `Import complete: ${result.added} added, ${result.skipped} skipped.`,
        `インポート完了：${result.added} 件追加，${result.skipped} 件スキップ．`,
      ));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("Could not import mappings.", "対応をインポートできませんでした．"), "error");
    }
    await render();
  });
  return node;
}

export async function render(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#mapping-settings")!;
  const state = await loadState();
  const addSection = addMappingSection();
  const registeredSection = await sitesSection(state);
  const data = dataSection(state);
  const nodes: Node[] = [];

  if (statusText) {
    const status = el("div");
    message(status, statusText, statusKind);
    nodes.push(...status.childNodes);
    statusText = "";
  }

  nodes.push(addSection, registeredSection, data);
  root.replaceChildren(...nodes);
}
