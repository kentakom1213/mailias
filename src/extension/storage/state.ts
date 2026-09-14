import { normalizeLabel as validateLabel } from "../../protocol";
import { isRegistrableDomain } from "../shared/domain";
import { SCHEMA_VERSION, type AliasRecord, type ExtensionState, type MappingExportV1 } from "./types";

const STORAGE_KEY = "mailiasState";

export function emptyState(): ExtensionState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { mailDomain: null },
    sites: {},
  };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeAlias(value: unknown): AliasRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AliasRecord>;

  if (typeof candidate.id !== "string" || candidate.id.length === 0) return null;
  if (typeof candidate.label !== "string") return null;
  if (!isIsoDate(candidate.createdAt)) return null;
  if (candidate.lastUsedAt !== null && !isIsoDate(candidate.lastUsedAt)) return null;

  try {
    return {
      id: candidate.id,
      label: validateLabel(candidate.label),
      createdAt: candidate.createdAt,
      lastUsedAt: candidate.lastUsedAt,
    };
  } catch {
    return null;
  }
}

function normalizeState(value: unknown): ExtensionState {
  if (typeof value !== "object" || value === null) return emptyState();
  const candidate = value as Partial<ExtensionState>;
  if (candidate.schemaVersion !== SCHEMA_VERSION) return emptyState();

  const state = emptyState();
  if (candidate.settings && typeof candidate.settings.mailDomain === "string") {
    state.settings.mailDomain = candidate.settings.mailDomain;
  }

  if (candidate.sites && typeof candidate.sites === "object") {
    for (const [domain, site] of Object.entries(candidate.sites)) {
      if (!isRegistrableDomain(domain) || typeof site !== "object" || site === null) continue;
      const aliasesValue = (site as { aliases?: unknown }).aliases;
      if (!Array.isArray(aliasesValue)) continue;
      const aliases = aliasesValue.map(normalizeAlias).filter((x): x is AliasRecord => x !== null);
      state.sites[domain] = { aliases };
    }
  }

  return state;
}

export async function loadState(): Promise<ExtensionState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = normalizeState(result[STORAGE_KEY]);
  const settings = await chrome.storage.local.get("domain");
  state.settings.mailDomain = typeof settings.domain === "string" ? settings.domain : null;
  return state;
}

export async function saveState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function setMailDomain(mailDomain: string): Promise<void> {
  const state = await loadState();
  state.settings.mailDomain = mailDomain;
  await saveState(state);
}

export async function addAlias(siteDomain: string, label: string): Promise<AliasRecord> {
  const state = await loadState();
  const canonicalLabel = validateLabel(label);
  const site = state.sites[siteDomain] ?? { aliases: [] };

  if (site.aliases.some((entry) => entry.label === canonicalLabel)) {
    throw new Error(`Label \"${canonicalLabel}\" already exists for ${siteDomain}.`);
  }

  const record: AliasRecord = {
    id: crypto.randomUUID(),
    label: canonicalLabel,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  site.aliases.push(record);
  state.sites[siteDomain] = site;
  await saveState(state);
  return record;
}

export async function removeAlias(siteDomain: string, aliasId: string): Promise<void> {
  const state = await loadState();
  const site = state.sites[siteDomain];
  if (!site) return;

  site.aliases = site.aliases.filter((entry) => entry.id !== aliasId);
  if (site.aliases.length === 0) {
    delete state.sites[siteDomain];
  }
  await saveState(state);
}

export async function touchAlias(siteDomain: string, aliasId: string): Promise<void> {
  const state = await loadState();
  const alias = state.sites[siteDomain]?.aliases.find((entry) => entry.id === aliasId);
  if (!alias) return;
  alias.lastUsedAt = new Date().toISOString();
  await saveState(state);
}

export async function removeSite(siteDomain: string): Promise<void> {
  const state = await loadState();
  delete state.sites[siteDomain];
  await saveState(state);
}

export function sortAliases(aliases: AliasRecord[]): AliasRecord[] {
  return [...aliases].sort((a, b) => {
    const aKey = a.lastUsedAt ?? a.createdAt;
    const bKey = b.lastUsedAt ?? b.createdAt;
    return bKey.localeCompare(aKey);
  });
}

export function findOtherSitesUsingLabel(
  state: ExtensionState,
  currentSite: string,
  label: string,
): string[] {
  return Object.entries(state.sites)
    .filter(([domain]) => domain !== currentSite)
    .filter(([, site]) => site.aliases.some((entry) => entry.label === label))
    .map(([domain]) => domain)
    .sort();
}

export function exportMappings(state: ExtensionState): MappingExportV1 {
  if (!state.settings.mailDomain) {
    throw new Error("Mail domain is not configured.");
  }

  const sites: MappingExportV1["sites"] = {};
  for (const [domain, site] of Object.entries(state.sites)) {
    sites[domain] = site.aliases.map(({ label, createdAt, lastUsedAt }) => ({
      label,
      createdAt,
      lastUsedAt,
    }));
  }

  return {
    format: "mailias-extension",
    version: 1,
    exportedAt: new Date().toISOString(),
    mailDomain: state.settings.mailDomain,
    sites,
  };
}

function parseMappingExport(value: unknown): MappingExportV1 {
  if (typeof value !== "object" || value === null) throw new Error("Invalid import file.");
  const doc = value as Partial<MappingExportV1>;
  if (doc.format !== "mailias-extension" || doc.version !== 1) {
    throw new Error("Unsupported import format.");
  }
  if (typeof doc.mailDomain !== "string") throw new Error("Import file has no mail domain.");
  if (typeof doc.sites !== "object" || doc.sites === null) throw new Error("Import file has no sites.");

  const sites: MappingExportV1["sites"] = {};
  for (const [domain, aliasesValue] of Object.entries(doc.sites)) {
    if (!isRegistrableDomain(domain) || !Array.isArray(aliasesValue)) {
      throw new Error(`Invalid site in import: ${domain}`);
    }
    sites[domain] = aliasesValue.map((entry) => {
      if (typeof entry !== "object" || entry === null) throw new Error("Invalid alias entry.");
      const alias = entry as { label?: unknown; createdAt?: unknown; lastUsedAt?: unknown };
      if (typeof alias.label !== "string") throw new Error("Invalid alias label.");
      const label = validateLabel(alias.label);
      if (!isIsoDate(alias.createdAt)) throw new Error(`Invalid createdAt for ${label}.`);
      if (alias.lastUsedAt !== null && !isIsoDate(alias.lastUsedAt)) {
        throw new Error(`Invalid lastUsedAt for ${label}.`);
      }
      return { label, createdAt: alias.createdAt, lastUsedAt: alias.lastUsedAt };
    });
  }

  return {
    format: "mailias-extension",
    version: 1,
    exportedAt: isIsoDate(doc.exportedAt) ? doc.exportedAt : new Date(0).toISOString(),
    mailDomain: doc.mailDomain,
    sites,
  };
}

export async function importMappings(value: unknown): Promise<{ added: number; skipped: number }> {
  const incoming = parseMappingExport(value);
  const state = await loadState();

  if (!state.settings.mailDomain) {
    throw new Error("Configure the mail domain before importing mappings.");
  }
  if (incoming.mailDomain !== state.settings.mailDomain) {
    throw new Error(
      `Import mail domain (${incoming.mailDomain}) does not match this extension (${state.settings.mailDomain}).`,
    );
  }

  let added = 0;
  let skipped = 0;
  for (const [domain, aliases] of Object.entries(incoming.sites)) {
    const site = state.sites[domain] ?? { aliases: [] };
    const existing = new Set(site.aliases.map((entry) => entry.label));

    for (const alias of aliases) {
      if (existing.has(alias.label)) {
        skipped += 1;
        continue;
      }
      site.aliases.push({ id: crypto.randomUUID(), ...alias });
      existing.add(alias.label);
      added += 1;
    }
    if (site.aliases.length > 0) state.sites[domain] = site;
  }

  await saveState(state);
  return { added, skipped };
}
