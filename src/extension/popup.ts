import { normalizeLabel as validateLabel } from "../protocol";
import { openOptionsPage, sendMessage } from "./platform";
import { siteDomainFromUrl, suggestLabel } from "./shared/domain";
import { append, button, el, formatDate, message, mustGetRoot } from "./shared/ui";
import {
  addAlias,
  findOtherSitesUsingLabel,
  loadState,
  removeAlias,
  sortAliases,
  touchAlias,
} from "./storage/state";
import type { AliasRecord, ExtensionState } from "./storage/types";

const root = mustGetRoot();

async function openOptions(): Promise<void> {
  await openOptionsPage();
  window.close();
}

async function currentSiteDomain(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? siteDomainFromUrl(tab.url) : null;
}

function header(siteDomain?: string): HTMLElement {
  const node = el("header", "popup-header");
  const left = el("div");
  const brand = el("div", "brand");
  const icon = el("img");
  icon.src = "/icons/icon32.png";
  icon.alt = "";
  icon.width = 24;
  icon.height = 24;
  append(brand, icon, el("span", "", "mailias"));
  append(left, brand);
  if (siteDomain) append(left, el("div", "site-domain", siteDomain));
  const settings = button("Settings", "text-button");
  settings.addEventListener("click", () => void openOptions());
  append(node, left, settings);
  return node;
}

function renderNotConfigured(): void {
  root.replaceChildren();
  append(root, header());
  const body = el("main", "popup-body empty-state");
  append(body, el("h1", "empty-title", "Set up mailias"));
  append(body,
    el(
      "p",
      "muted",
      "Configure one mail domain and import your master key before generating aliases.",
    ),
  );
  const setup = button("Open settings", "button primary");
  setup.addEventListener("click", () => void openOptions());
  append(body, setup);
  append(root, body);
}

function renderUnsupported(): void {
  root.replaceChildren();
  append(root, header());
  const body = el("main", "popup-body empty-state");
  append(body, el("h1", "empty-title", "No site domain"));
  append(body, el("p", "muted", "mailias works on normal HTTP and HTTPS sites with a registrable domain."));
  append(root, body);
}

async function copyAlias(
  siteDomain: string,
  alias: AliasRecord,
  address: string,
  copyButton: HTMLButtonElement,
): Promise<void> {
  await navigator.clipboard.writeText(address);
  await touchAlias(siteDomain, alias.id);
  copyButton.textContent = "Copied";
  setTimeout(() => void render(), 500);
}

function buildAliasDetails(
  siteDomain: string,
  alias: AliasRecord,
  address: string,
  container: HTMLElement,
): void {
  const details = el("div", "alias-details");
  append(details, el("div", "address", address));

  const meta = el("div", "details-meta");
  append(meta, el("span", "muted", `Created ${formatDate(alias.createdAt)}`));
  append(meta,
    el(
      "span",
      "muted",
      alias.lastUsedAt ? `Last used ${formatDate(alias.lastUsedAt)}` : "Never copied",
    ),
  );
  append(details, meta);

  const remove = button("Remove from extension", "text-button danger-text");
  remove.addEventListener("click", () => {
    details.replaceChildren();
    append(details,
      el(
        "p",
        "warning-text",
        `Removing “${alias.label}” only removes it from this extension. The email alias remains valid.`,
      ),
    );
    const actions = el("div", "confirm-actions");
    const cancel = button("Cancel", "button secondary");
    const proceed = button("Continue", "button danger-outline");
    cancel.addEventListener("click", () => void render());
    proceed.addEventListener("click", () => {
      details.replaceChildren();
      append(details, el("p", "warning-text", `Remove “${alias.label}” from ${siteDomain}?`));
      const finalActions = el("div", "confirm-actions");
      const finalCancel = button("Cancel", "button secondary");
      const confirm = button("Remove", "button danger");
      finalCancel.addEventListener("click", () => void render());
      confirm.addEventListener("click", async () => {
        await removeAlias(siteDomain, alias.id);
        await render();
      });
      append(finalActions, finalCancel, confirm);
      append(details, finalActions);
    });
    append(actions, cancel, proceed);
    append(details, actions);
  });
  append(details, remove);
  append(container, details);
}

function aliasRow(siteDomain: string, alias: AliasRecord, address: string): HTMLElement {
  const wrapper = el("div", "alias-wrapper");
  const row = el("div", "alias-row");

  const labelButton = button(alias.label, "label-button");
  labelButton.title = "Show details";
  const created = el("span", "created", formatDate(alias.createdAt));
  const copy = button("Copy", "button copy-button");

  labelButton.addEventListener("click", async () => {
    const existing = wrapper.querySelector(".alias-details");
    if (existing) {
      existing.remove();
      return;
    }
    buildAliasDetails(siteDomain, alias, address, wrapper);
  });

  copy.addEventListener("click", async () => {
    copy.disabled = true;
    try {
      await copyAlias(siteDomain, alias, address, copy);
    } catch (error) {
      copy.textContent = "Failed";
      copy.disabled = false;
      console.error(error);
    }
  });

  append(row, labelButton, created, copy);
  append(wrapper, row);
  return wrapper;
}

function renderNewAliasForm(state: ExtensionState, siteDomain: string, host: HTMLElement): void {
  const form = el("form", "new-alias-form");
  const field = el("label", "field");
  append(field, el("span", "field-label", "Label"));
  const input = el("input", "text-input");
  input.name = "label";
  input.autocomplete = "off";
  input.value = suggestLabel(siteDomain);
  append(field, input);

  const feedback = el("div", "form-feedback");
  const actions = el("div", "form-actions");
  const cancel = button("Cancel", "button secondary");
  const add = button("Add", "button primary");
  add.type = "submit";
  append(actions, cancel, add);
  append(form, field, feedback, actions);
  host.replaceChildren(form);
  input.focus();
  input.select();

  const validate = (): string | null => {
    feedback.replaceChildren();
    try {
      const label = validateLabel(input.value);
      const currentAliases = state.sites[siteDomain]?.aliases ?? [];
      if (currentAliases.some((entry) => entry.label === label)) {
        append(feedback, el("div", "error-text", "This label already exists for this site."));
        return null;
      }
      const otherSites = findOtherSitesUsingLabel(state, siteDomain, label);
      if (otherSites.length > 0) {
        append(feedback,
          el(
            "div",
            "warning-text",
            `Also used for ${otherSites.join(", ")}. It will generate the same email alias.`,
          ),
        );
      }
      return label;
    } catch (error) {
      append(feedback,
        el("div", "error-text", error instanceof Error ? error.message : "Invalid label."),
      );
      return null;
    }
  };

  input.addEventListener("input", validate);
  cancel.addEventListener("click", () => void render());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = validate();
    if (!label) return;
    add.disabled = true;
    try {
      await addAlias(siteDomain, label);
      await render();
    } catch (error) {
      feedback.replaceChildren();
      append(feedback,
        el("div", "error-text", error instanceof Error ? error.message : "Could not add alias."),
      );
      add.disabled = false;
    }
  });
}

async function render(): Promise<void> {
  root.replaceChildren();
  const [state, status, siteDomain] = await Promise.all([loadState(), sendMessage<{ configured: boolean }>({ type: "getStatus" }), currentSiteDomain()]);

  if (!state.settings.mailDomain || !status.configured) {
    renderNotConfigured();
    return;
  }
  if (!siteDomain) {
    renderUnsupported();
    return;
  }

  append(root, header(siteDomain));
  const body = el("main", "popup-body");
  const aliases = sortAliases(state.sites[siteDomain]?.aliases ?? []);

  if (aliases.length === 0) {
    append(body, el("p", "muted first-alias", "No aliases saved for this site yet."));
  } else {
    const list = el("div", "alias-list");
    const addresses = await Promise.all(
      aliases.map((alias) => sendMessage<{ alias: string }>({ type: "generateAlias", label: alias.label }).then(result => result.alias)),
    );
    aliases.forEach((alias, index) => {
      const address = addresses[index];
      if (address) append(list, aliasRow(siteDomain, alias, address));
    });
    append(body, list);
  }

  const newAliasHost = el("div", "new-alias-host");
  const newAlias = button("+ New alias", "new-alias-button");
  newAlias.addEventListener("click", () => renderNewAliasForm(state, siteDomain, newAliasHost));
  append(newAliasHost, newAlias);
  append(body, newAliasHost);
  append(root, body);
}

render().catch((error) => {
  root.replaceChildren();
  append(root, header());
  const body = el("main", "popup-body");
  message(body, error instanceof Error ? error.message : "Unexpected error.", "error");
  append(root, body);
  console.error(error);
});
