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
  recoveryBackedUp: boolean;
  emailRoutingConfirmed: boolean;
  setupComplete: boolean;
};

type WorkerHealth = {
  status?: unknown;
  version?: unknown;
  configured?: { secret?: unknown; forwardTo?: unknown };
  keyId?: unknown;
};

type HealthResult = {
  health: WorkerHealth;
  matches: boolean;
  bindingsReady: boolean;
  ready: boolean;
};

type RequestMessage =
  | { type: "getStatus" }
  | { type: "generateAlias"; label: string }
  | { type: "setDomain"; domain: string }
  | { type: "importSecret"; domain: string; secret: string; recoveryBackedUp?: boolean }
  | { type: "setWorkerOrigin"; workerOrigin: string }
  | { type: "setEmailRoutingConfirmed"; confirmed: boolean }
  | { type: "checkHealth" }
  | { type: "finishSetup" }
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
  return getStorage<Settings>({
    schemaVersion: 1,
    domain: "",
    keyId: "",
    workerOrigin: "",
    recoveryBackedUp: false,
    emailRoutingConfirmed: false,
    setupComplete: false,
  });
}

async function status(): Promise<object> {
  let current = await settings();
  const key = await getKey();
  const setupLocked = Boolean(key || current.keyId);

  // v1 builds before the setup wizard already required a paste-back backup check.
  // Treat an existing persisted key as backed up when migrating that state.
  if (key && current.keyId && !current.recoveryBackedUp) {
    current = { ...current, recoveryBackedUp: true };
    await setStorage(current);
  }

  if (!key || !current.domain || !current.keyId) {
    return { ...current, configured: false, setupLocked };
  }
  const actualKeyId = await computeKeyId(key, current.domain);
  return { ...current, configured: actualKeyId === current.keyId, setupLocked };
}

async function checkWorker(current: Settings): Promise<HealthResult> {
  if (!current.workerOrigin) throw new Error("Connect the Worker first.");

  const url = new URL("/health", current.workerOrigin);
  if (current.domain) url.searchParams.set("domain", current.domain);

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  let health: unknown;
  try {
    health = await response.json();
  } catch {
    throw new Error(`Worker health check failed with HTTP ${response.status}.`);
  }
  if (!health || typeof health !== "object") {
    throw new Error("Worker returned an invalid health response.");
  }

  const parsed = health as WorkerHealth;
  if (parsed.version !== "v1") {
    throw new Error("The URL does not appear to be a mailias v1 Worker.");
  }

  const bindingsReady = parsed.configured?.secret === true && parsed.configured?.forwardTo === true;
  const matches = Boolean(current.keyId && parsed.keyId === current.keyId);
  const ready = parsed.status === "ok" && bindingsReady && matches;
  return { health: parsed, matches, bindingsReady, ready };
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
    case "setDomain": {
      const domain = normalizeDomain(message.domain);
      const current = await settings();
      const key = await getKey();
      if (key || current.keyId) {
        throw new Error("Reset mailias before changing the mail domain.");
      }
      await setStorage({ ...current, domain, setupComplete: false });
      return { domain };
    }
    case "importSecret": {
      const domain = normalizeDomain(message.domain);
      const key = await importSecret(message.secret);
      const keyId = await computeKeyId(key, domain);
      const current = await settings();
      const oldKey = await getKey();
      if (oldKey || current.keyId) {
        throw new Error("A recovery key is already stored. Reset mailias before replacing it.");
      }
      if (current.domain && current.domain !== domain) {
        throw new Error("The recovery key must use the mail domain selected in step 2.");
      }

      await putKey(key);
      const verified = await getKey();
      if (!verified || (await computeKeyId(verified, domain)) !== keyId) {
        await removeKey();
        throw new Error("The key could not be verified after saving.");
      }

      try {
        await setStorage({
          ...current,
          schemaVersion: 1,
          domain,
          keyId,
          recoveryBackedUp: message.recoveryBackedUp === true,
          setupComplete: false,
        });
      } catch (error) {
        await removeKey();
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
      await setStorage({ ...current, workerOrigin: url.origin, setupComplete: false });
      return { workerOrigin: url.origin };
    }
    case "setEmailRoutingConfirmed": {
      const current = await settings();
      await setStorage({ ...current, emailRoutingConfirmed: message.confirmed, setupComplete: false });
      return { emailRoutingConfirmed: message.confirmed };
    }
    case "checkHealth": {
      const current = await settings();
      return checkWorker(current);
    }
    case "finishSetup": {
      const current = await settings();
      const key = await getKey();
      if (!key || !current.domain || !current.keyId || !current.recoveryBackedUp) {
        throw new Error("Finish the recovery-key steps first.");
      }
      if (!current.emailRoutingConfirmed) {
        throw new Error("Confirm Email Routing before finishing setup.");
      }
      const result = await checkWorker(current);
      if (!result.ready) {
        throw new Error("Worker configuration is not ready yet. Recheck step 5.");
      }
      await setStorage({ ...current, setupComplete: true });
      return { complete: true };
    }
    case "reset":
      await deleteDatabase();
      await clearStorage();
      return { configured: false };
  }
}

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
