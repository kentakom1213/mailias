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
