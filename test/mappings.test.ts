import { beforeEach, expect, it, vi } from "vitest";
import { addAlias, exportMappings, importMappings, loadState, removeAlias, sortAliases, touchAlias } from "../src/extension/storage/state";
import { siteDomainFromUrl } from "../src/extension/shared/domain";

beforeEach(() => {
  let data: Record<string, unknown> = { domain: "m.example.com" };
  vi.stubGlobal("chrome", { storage: { local: {
    get: async (key: string) => ({ [key]: structuredClone(data[key]) }),
    set: async (value: object) => { data = { ...data, ...structuredClone(value) }; },
  } } });
});

it("uses the registrable domain including private suffixes", () => {
  expect(siteDomainFromUrl("https://www.example.co.uk/path")).toBe("example.co.uk");
  expect(siteDomainFromUrl("https://alice.github.io/path")).toBe("alice.github.io");
  expect(siteDomainFromUrl("chrome://extensions")).toBeNull();
});

it("saves labels and dates without storing generated addresses or keys", async () => {
  const first = await addAlias("github.com", "GitHub");
  const second = await addAlias("github.com", "github-work");
  await expect(addAlias("github.com", "github")).rejects.toThrow("already exists");
  await touchAlias("github.com", first.id);
  const state = await loadState();
  expect(state.settings.mailDomain).toBe("m.example.com");
  expect(sortAliases(state.sites["github.com"]!.aliases)[0]!.id).toBe(first.id);
  expect(Object.keys(state.sites["github.com"]!.aliases[0]!).sort()).toEqual(["createdAt", "id", "label", "lastUsedAt"]);
  await removeAlias("github.com", second.id);
  expect((await loadState()).sites["github.com"]!.aliases).toHaveLength(1);
});

it("exports and imports mappings using the configured domain", async () => {
  const alias = await addAlias("github.com", "github");
  const exported = exportMappings(await loadState());
  await removeAlias("github.com", alias.id);
  expect(await importMappings(exported)).toEqual({ added: 1, skipped: 0 });
  expect(await importMappings(exported)).toEqual({ added: 0, skipped: 1 });
  await expect(importMappings({ ...exported, mailDomain: "other.example.com" })).rejects.toThrow("does not match");
});
