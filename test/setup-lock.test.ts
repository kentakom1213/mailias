import { beforeEach, expect, it, vi } from "vitest";

let stored: Record<string, unknown>;
let activeKey: CryptoKey | undefined;
let listener: (message: object, sender: object, respond: (value: any) => void) => boolean;

vi.mock("../src/extension/platform", () => ({
  getStorage: async (defaults: object) => ({ ...defaults, ...stored }),
  setStorage: async (value: object) => { stored = { ...stored, ...value }; },
  clearStorage: async () => { stored = {}; },
}));

beforeEach(async () => {
  vi.resetModules();
  stored = {};
  activeKey = undefined;
  vi.stubGlobal("chrome", {
    runtime: { id: "test", onMessage: { addListener: (value: typeof listener) => { listener = value; } } },
  });
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: any = {};
      request.result = {
        close() {},
        transaction: () => {
          const tx: any = {
            objectStore: () => ({
              get: () => {
                const read: any = {};
                queueMicrotask(() => { read.result = activeKey; read.onsuccess(); tx.oncomplete?.(); });
                return read;
              },
              put: (key: CryptoKey) => {
                activeKey = key;
                queueMicrotask(() => tx.oncomplete());
              },
              delete: () => {
                activeKey = undefined;
                queueMicrotask(() => tx.oncomplete());
              },
            }),
          };
          return tx;
        },
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
    deleteDatabase: () => {
      const request: any = {};
      queueMicrotask(() => { activeKey = undefined; request.onsuccess(); });
      return request;
    },
  });
  await import("../src/extension/background");
});

function send(message: object): Promise<any> {
  return new Promise((resolve) => listener(message, { id: "test" }, resolve));
}
const setup = {
  type: "importSecret",
  domain: "m.example.com",
  secret: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
};

it("locks setup across reloads and rejects even explicit replacement until reset", async () => {
  expect((await send({ type: "getStatus" })).value.setupLocked).toBe(false);
  expect((await send(setup)).ok).toBe(true);
  const originalKey = activeKey;
  vi.resetModules();
  await import("../src/extension/background");
  expect((await send({ type: "getStatus" })).value.setupLocked).toBe(true);
  expect((await send(setup)).ok).toBe(false);
  expect((await send({ ...setup, domain: "other.example.com", replace: true })).ok).toBe(false);
  expect(activeKey).toBe(originalKey);
  expect(stored.domain).toBe("m.example.com");
  expect((await send({ type: "reset" })).ok).toBe(true);
  expect((await send({ type: "getStatus" })).value.setupLocked).toBe(false);
  expect((await send({ ...setup, domain: "other.example.com" })).ok).toBe(true);
});

it("allows only one of two concurrent initial setups", async () => {
  const results = await Promise.all([send(setup), send({ ...setup, domain: "other.example.com" })]);
  expect(results.map((result) => result.ok)).toEqual([true, false]);
  expect(stored.domain).toBe("m.example.com");
});

it("requires reset when a previously saved configuration has lost its key", async () => {
  stored = { domain: "m.example.com", keyId: "old-key" };
  expect((await send({ type: "getStatus" })).value).toMatchObject({ configured: false, setupLocked: true });
  expect((await send(setup)).ok).toBe(false);
});

it("undoes the last settings save across background reloads without changing mappings", async () => {
  stored = { mailiasState: { sites: { "example.com": { aliases: [] } } } };
  const mappings = stored.mailiasState;
  await send({ type: "setWorkerOrigin", workerOrigin: "https://first.example.com" });
  await send({ type: "setDomain", domain: "m.example.com" });
  await send({ type: "setDomain", domain: "other.example.com" });
  vi.resetModules();
  await import("../src/extension/background");
  expect((await send({ type: "getStatus" })).value.canUndoSettings).toBe(true);
  expect((await send({ type: "undoSettings" })).ok).toBe(true);
  expect(stored.domain).toBe("m.example.com");
  expect(stored.workerOrigin).toBe("https://first.example.com");
  expect(stored.mailiasState).toBe(mappings);
  expect((await send({ type: "getStatus" })).value.canUndoSettings).toBe(false);
  expect((await send({ type: "undoSettings" })).ok).toBe(false);
});

it("preserves undo history when saving an unchanged value", async () => {
  await send({ type: "setDomain", domain: "m.example.com" });
  await send({ type: "setDomain", domain: "other.example.com" });
  await send({ type: "setDomain", domain: "other.example.com" });
  await send({ type: "undoSettings" });
  expect(stored.domain).toBe("m.example.com");
});

it("does not let undo revert key storage or unlock a saved key", async () => {
  await send({ type: "setDomain", domain: "m.example.com" });
  await send(setup);
  const originalKey = activeKey;
  expect((await send({ type: "getStatus" })).value.canUndoSettings).toBe(false);
  expect((await send({ type: "undoSettings" })).ok).toBe(false);
  await send({ type: "setLanguage", language: "ja" });
  expect((await send({ type: "undoSettings" })).ok).toBe(true);
  expect(activeKey).toBe(originalKey);
  expect((await send({ type: "setDomain", domain: "other.example.com" })).ok).toBe(false);
  expect((await send(setup)).ok).toBe(false);
  await send({ type: "reset" });
  expect((await send({ type: "undoSettings" })).ok).toBe(false);
});

it("invalidates routing on Worker changes and restores its prior confirmation with undo", async () => {
  await send(setup);
  const originalKey = activeKey;
  await send({ type: "setWorkerOrigin", workerOrigin: "https://first.example.com" });
  await send({ type: "setEmailRoutingConfirmed", confirmed: true });
  await send({ type: "setWorkerOrigin", workerOrigin: "https://second.example.com" });
  expect(stored.emailRoutingConfirmed).toBe(false);
  expect((await send({ type: "undoSettings" })).ok).toBe(true);
  expect(stored.workerOrigin).toBe("https://first.example.com");
  expect(stored.emailRoutingConfirmed).toBe(true);
  expect(activeKey).toBe(originalKey);
});

it("serializes two undo requests so only one restores settings", async () => {
  await send({ type: "setLanguage", language: "ja" });
  const results = await Promise.all([send({ type: "undoSettings" }), send({ type: "undoSettings" })]);
  expect(results.map((result) => result.ok)).toEqual([true, false]);
  expect(stored.language).toBe("");
});

it("rechecks the old Worker before undo restores completed setup", async () => {
  await send({ ...setup, recoveryBackedUp: true });
  await send({ type: "setWorkerOrigin", workerOrigin: "https://first.example.com" });
  await send({ type: "setEmailRoutingConfirmed", confirmed: true });
  const health = { status: "ok", version: "v1", keyId: stored.keyId, configured: { secret: true, myAddress: true } };
  const fetchMock = vi.fn(async () => Response.json(health));
  vi.stubGlobal("fetch", fetchMock);
  expect((await send({ type: "finishSetup" })).ok).toBe(true);
  await send({ type: "setWorkerOrigin", workerOrigin: "https://second.example.com" });
  fetchMock.mockImplementationOnce(async () => Response.json({ ...health, keyId: "different-key" }));
  expect((await send({ type: "undoSettings" })).ok).toBe(false);
  expect(stored.workerOrigin).toBe("https://second.example.com");
  expect(stored.setupComplete).toBe(false);
  expect((await send({ type: "undoSettings" })).ok).toBe(true);
  expect(stored.setupComplete).toBe(true);
  expect(stored.workerOrigin).toBe("https://first.example.com");
});
