export const SCHEMA_VERSION = 1 as const;

export interface AliasRecord {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SiteRecord {
  aliases: AliasRecord[];
}

export interface ExtensionState {
  schemaVersion: typeof SCHEMA_VERSION;
  settings: {
    mailDomain: string | null;
  };
  sites: Record<string, SiteRecord>;
}

export interface MappingExportV1 {
  format: "mailias-extension";
  version: 1;
  exportedAt: string;
  mailDomain: string;
  sites: Record<
    string,
    Array<{
      label: string;
      createdAt: string;
      lastUsedAt: string | null;
    }>
  >;
}
