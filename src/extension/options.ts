import { render as renderMappings } from "./mapping-settings";
import { generateSecret, normalizeDomain } from "../protocol";
import { requestOrigin, sendMessage } from "./platform";

type Status = {
  configured: boolean;
  setupLocked: boolean;
  domain?: string;
  keyId?: string;
  workerOrigin?: string;
  emailRoutingConfirmed?: boolean;
  setupComplete?: boolean;
};

type WorkerHealth = {
  status?: string;
  configured?: { secret?: boolean; forwardTo?: boolean };
  keyId?: string | null;
};

type HealthResult = {
  health: WorkerHealth;
  matches: boolean;
  complete: boolean;
};

const message = document.querySelector<HTMLElement>("#message")!;
const backupStep = document.querySelector<HTMLElement>("#backup-step")!;
const verifyStep = document.querySelector<HTMLElement>("#verify-step")!;
const generatedSecret = document.querySelector<HTMLInputElement>("#generated-secret")!;
const verifySecret = document.querySelector<HTMLInputElement>("#verify-secret")!;
let setupSecret = "";
let setupDomain = "";
let lastHealth: HealthResult | null = null;

function showMessage(text: string, error = false): void {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function clearSetup(): void {
  setupSecret = "";
  setupDomain = "";
  for (const input of document.querySelectorAll<HTMLInputElement>("#new-setup input, #restore-setup input")) {
    input.value = "";
  }
  backupStep.classList.add("hidden");
  verifyStep.classList.add("hidden");
}

function setStatus(id: string, ready: boolean | null, readyText = "Ready", pendingText = "Not ready"): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)!;
  if (ready === null) {
    node.textContent = pendingText;
    node.className = "setup-status pending";
    return;
  }
  node.textContent = ready ? readyText : pendingText;
  node.className = `setup-status ${ready ? "ready" : "missing"}`;
}

function renderSetupStatuses(status: Status): void {
  setStatus("status-key", status.configured, "Ready", status.setupLocked ? "Needs reset" : "Not ready");
  setStatus("status-worker", Boolean(status.workerOrigin), "Ready", "Not ready");
  setStatus(
    "status-worker-secret",
    lastHealth ? lastHealth.health.configured?.secret === true : null,
    "Ready",
    lastHealth ? "Missing" : "Not checked",
  );
  setStatus(
    "status-forward",
    lastHealth ? lastHealth.health.configured?.forwardTo === true : null,
    "Ready",
    lastHealth ? "Missing" : "Not checked",
  );
  setStatus(
    "status-match",
    lastHealth ? lastHealth.matches : null,
    "Ready",
    lastHealth ? "Mismatch" : "Not checked",
  );
  setStatus("status-routing", status.emailRoutingConfirmed === true, "Confirmed", "Not confirmed");
}

async function refresh(): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  const setupView = document.querySelector<HTMLElement>("#setup-view")!;
  const managementView = document.querySelector<HTMLElement>("#management-view")!;
  setupView.classList.toggle("hidden", status.setupComplete === true);
  managementView.classList.toggle("hidden", status.setupComplete !== true);

  if (status.setupComplete) {
    clearSetup();
    await renderMappings();
    return;
  }

  for (const id of ["new-setup", "restore-setup"]) {
    const section = document.querySelector<HTMLFieldSetElement>(`#${id}`)!;
    section.disabled = status.setupLocked;
    section.classList.toggle("hidden", status.setupLocked);
  }
  if (status.setupLocked) clearSetup();

  const workerInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
  if (status.workerOrigin && !workerInput.value) workerInput.value = status.workerOrigin;
  renderSetupStatuses(status);
}

async function saveSecret(domainInput: string, secret: string): Promise<{ domain: string; keyId: string }> {
  const domain = normalizeDomain(domainInput);
  return sendMessage({ type: "importSecret", domain, secret });
}

async function checkHealth(showResult = true): Promise<HealthResult> {
  const result = await sendMessage<HealthResult>({ type: "checkHealth" });
  lastHealth = result;
  const status = await sendMessage<Status>({ type: "getStatus" });
  renderSetupStatuses(status);
  if (showResult) {
    if (result.complete) {
      showMessage("Setup complete．Switching to alias management．");
    } else if (!result.health.configured?.secret || !result.health.configured?.forwardTo) {
      showMessage("Worker is reachable，but required runtime bindings are still missing．", true);
    } else if (!result.matches) {
      showMessage("Worker recovery key does not match this extension．", true);
    } else if (!status.emailRoutingConfirmed) {
      showMessage("Worker is ready．Confirm Email Routing to finish setup．");
    } else {
      showMessage("Setup is not complete yet．", true);
    }
  }
  await refresh();
  return result;
}

document.querySelector("#generate")!.addEventListener("click", () => {
  try {
    setupDomain = normalizeDomain(document.querySelector<HTMLInputElement>("#new-domain")!.value);
    setupSecret = generateSecret();
    generatedSecret.value = setupSecret;
    backupStep.classList.remove("hidden");
    verifyStep.classList.add("hidden");
    showMessage("");
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Could not generate a key.", true);
  }
});

document.querySelector("#copy-secret")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(generatedSecret.value).then(() => showMessage("Recovery key copied．"));
});

document.querySelector("#saved")!.addEventListener("click", () => {
  generatedSecret.value = "";
  backupStep.classList.add("hidden");
  verifyStep.classList.remove("hidden");
  verifySecret.focus();
});

document.querySelector("#verify")!.addEventListener("click", () => {
  if (!setupSecret || verifySecret.value.trim() !== setupSecret) {
    showMessage("The pasted key does not match．Copy it again from your password manager．", true);
    return;
  }
  const secret = verifySecret.value.trim();
  verifySecret.value = "";
  void saveSecret(setupDomain, secret).then(
    async ({ keyId }) => {
      setupSecret = "";
      setupDomain = "";
      verifyStep.classList.add("hidden");
      showMessage(`Recovery key ready．keyId ${keyId}`);
      await refresh();
    },
    (error: unknown) => showMessage(error instanceof Error ? error.message : "Setup failed．", true),
  );
});

document.querySelector("#restore")!.addEventListener("click", () => {
  const domain = document.querySelector<HTMLInputElement>("#restore-domain")!.value;
  const secretInput = document.querySelector<HTMLInputElement>("#restore-secret")!;
  const secret = secretInput.value.trim();
  secretInput.value = "";
  void saveSecret(domain, secret).then(
    async ({ keyId }) => {
      showMessage(`Recovery key restored．keyId ${keyId}`);
      await refresh();
    },
    (error: unknown) => showMessage(error instanceof Error ? error.message : "Restore failed．", true),
  );
});

document.querySelector("#save-worker")!.addEventListener("click", () => {
  const raw = document.querySelector<HTMLInputElement>("#worker-origin")!.value;
  void (async () => {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("Worker URL must use HTTPS．");
    const granted = await requestOrigin(url.origin);
    if (!granted) throw new Error("Permission to contact this Worker was not granted．");
    await sendMessage({ type: "setWorkerOrigin", workerOrigin: url.origin });
    lastHealth = null;
    showMessage("Worker URL saved．");
    await refresh();
  })().catch((error: unknown) => showMessage(error instanceof Error ? error.message : "Could not save the Worker URL．", true));
});

document.querySelector("#check-worker")!.addEventListener("click", () => {
  void checkHealth().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Health check failed．", true));
});

document.querySelector("#confirm-routing")!.addEventListener("click", () => {
  void sendMessage({ type: "setEmailRoutingConfirmed", confirmed: true }).then(async () => {
    showMessage("Email Routing marked as configured．Run the final check to finish setup．");
    await refresh();
  });
});

document.querySelector("#finish-setup")!.addEventListener("click", () => {
  void checkHealth().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Final setup check failed．", true));
});

document.querySelector("#reset")!.addEventListener("click", () => {
  if (!confirm("Delete the local key，Worker URL，setup state，and saved site/label mappings? Make sure the recovery key is available in your password manager．")) return;
  void sendMessage({ type: "reset" }).then(async () => {
    clearSetup();
    lastHealth = null;
    showMessage("Extension reset．");
    await refresh();
  });
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void refresh().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not load settings．", true));
});

void refresh().catch((error: unknown) => showMessage(error instanceof Error ? error.message : "Could not load settings．", true));
