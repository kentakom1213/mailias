import { computeKeyId, generateAlias, importSecret, normalizeDomain } from "../protocol";
import { clearStorage, getStorage, setStorage } from "./platform";

const DATABASE_NAME = "mailias-keys";
const STORE_NAME = "keys";
const ACTIVE_KEY = "active";

type Settings = {
  schemaVersion: number;
  domain: string;
  keyId: string;
  workerOrigin: string;
};

type RequestMessage =
  | { type: "getStatus" }
  | { type: "generateAlias"; label: string }
  | { type: "importSecret"; domain: string; secret: string }
  | { type: "setWorkerOrigin"; workerOrigin: string }
  | { type: "checkHealth" }
  | { type: "reset" };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the key store."));
  });
}

async function getKey(): Promise<CryptoKey | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME);
    const request = transaction.objectStore(STORE_NAME).get(ACTIVE_KEY);
    request.onsuccess = () => resolve(request.result instanceof CryptoKey ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("Could not read the key."));
    transaction.oncomplete = () => database.close();
  });
}

async function putKey(key: CryptoKey): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(key, ACTIVE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the key."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving the key was aborted."));
  });
}

async function removeKey(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the key."));
  });
}

async function deleteDatabase(): Promise<void> {
  const database = await openDatabase();
  database.close();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete the key store."));
    request.onblocked = () => reject(new Error("Close other mailias pages and try again."));
  });
}

async function settings(): Promise<Settings> {
  return getStorage<Settings>({ schemaVersion: 1, domain: "", keyId: "", workerOrigin: "" });
}

async function status(): Promise<object> {
  const current = await settings();
  const key = await getKey();
  const setupLocked = Boolean(key || current.domain || current.keyId);
  if (!key || !current.domain || !current.keyId) return { configured: false, setupLocked };
  const actualKeyId = await computeKeyId(key, current.domain);
  return { ...current, configured: actualKeyId === current.keyId, setupLocked };
}

async function handle(message: RequestMessage): Promise<object> {
  switch (message.type) {
    case "getStatus":
      return status();
    case "generateAlias": {
      const current = await settings();
      const key = await getKey();
      if (!key || !current.domain) throw new Error("mailias is not configured.");
      return { alias: await generateAlias(key, current.domain, message.label) };
    }
    case "importSecret": {
      const domain = normalizeDomain(message.domain);
      const key = await importSecret(message.secret);
      const keyId = await computeKeyId(key, domain);
      const current = await settings();
      const oldKey = await getKey();
      if (oldKey || current.domain || current.keyId) {
        throw new Error("Setup is already complete．Reset the extension before setting it up again．");
      }
      await putKey(key);
      const verified = await getKey();
      if (!verified || (await computeKeyId(verified, domain)) !== keyId) {
        if (oldKey) await putKey(oldKey);
        else await removeKey();
        throw new Error("The key could not be verified after saving.");
      }
      try {
        await setStorage({
          schemaVersion: 1,
          domain,
          keyId,
          workerOrigin: current.workerOrigin,
        });
      } catch (error) {
        if (oldKey) await putKey(oldKey);
        else await removeKey();
        throw error;
      }
      return { domain, keyId };
    }
    case "setWorkerOrigin": {
      const url = new URL(message.workerOrigin);
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
        throw new Error("Enter an HTTPS Worker origin without a path.");
      }
      const current = await settings();
      await setStorage({ ...current, workerOrigin: url.origin });
      return { workerOrigin: url.origin };
    }
    case "checkHealth": {
      const current = await settings();
      if (!current.workerOrigin || !current.domain) throw new Error("Configure the Worker URL first.");
      const url = new URL("/health", current.workerOrigin);
      url.searchParams.set("domain", current.domain);
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(`Worker health check failed with HTTP ${response.status}.`);
      const health: unknown = await response.json();
      if (!health || typeof health !== "object") throw new Error("Worker returned an invalid response.");
      return { health, matches: (health as { keyId?: unknown }).keyId === current.keyId };
    }
    case "reset":
      await deleteDatabase();
      await clearStorage();
      return { configured: false };
  }
}

// Serialize requests so concurrent setup pages cannot both overwrite the active key.
let requests: Promise<unknown> = Promise.resolve();

chrome.runtime.onMessage.addListener((message: RequestMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Untrusted sender." });
    return false;
  }
  const response = requests.then(() => handle(message));
  requests = response.catch(() => undefined);
  void response.then(
    (value) => sendResponse({ ok: true, value }),
    (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error." }),
  );
  return true;
});
