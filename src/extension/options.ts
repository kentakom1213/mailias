import { render as renderMappings } from "./mapping-settings";
import { generateSecret, normalizeDomain } from "../protocol";
import { requestOrigin, sendMessage } from "./platform";

type Status = {
  configured: boolean;
  setupLocked: boolean;
  domain?: string;
  keyId?: string;
  workerOrigin?: string;
  recoveryBackedUp?: boolean;
  emailRoutingConfirmed?: boolean;
  setupComplete?: boolean;
};

type WorkerHealth = {
  status?: string;
  version?: string;
  configured?: { secret?: boolean; forwardTo?: boolean };
  keyId?: string | null;
};

type HealthResult = {
  health: WorkerHealth;
  matches: boolean;
  bindingsReady: boolean;
  ready: boolean;
};

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const message = document.querySelector<HTMLElement>("#message")!;
const generatedSecret = document.querySelector<HTMLInputElement>("#generated-secret")!;
let setupSecret = "";
let lastHealth: HealthResult | null = null;
let currentStatus: Status | null = null;

function showMessage(text: string, error = false): void {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function setSmallStatus(id: string, ready: boolean | null, readyText = "Ready", missingText = "Missing"): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)!;
  if (ready === null) {
    node.textContent = "Not checked";
    node.className = "setup-status pending";
    return;
  }
  node.textContent = ready ? readyText : missingText;
  node.className = `setup-status ${ready ? "ready" : "missing"}`;
}

function workerIsReady(): boolean {
  return lastHealth?.ready === true;
}

function currentStep(status: Status): WizardStep {
  if (!status.workerOrigin) return 1;
  if (!status.domain) return 2;
  if (!status.configured && !setupSecret) return 3;
  if (!status.recoveryBackedUp) return 4;
  if (!workerIsReady()) return 5;
  if (!status.emailRoutingConfirmed) return 6;
  return 7;
}

function renderProgress(status: Status, step: WizardStep): void {
  const completed = new Set<number>();
  if (status.workerOrigin) completed.add(1);
  if (status.domain) completed.add(2);
  if (status.configured || setupSecret) completed.add(3);
  if (status.recoveryBackedUp) completed.add(4);
  if (workerIsReady()) completed.add(5);
  if (status.emailRoutingConfirmed) completed.add(6);

  for (let index = 1; index <= 7; index += 1) {
    const item = document.querySelector<HTMLElement>(`[data-progress-step="${index}"]`)!;
    const state = document.querySelector<HTMLElement>(`#status-step-${index}`)!;
    const done = completed.has(index);
    const active = index === step;
    item.classList.toggle("done", done);
    item.classList.toggle("active", active);
    state.textContent = done ? "Done" : active ? "Current" : "Pending";
  }
}

function renderWorkerChecks(): void {
  if (!lastHealth) {
    setSmallStatus("worker-check-reachable", null);
    setSmallStatus("worker-check-secret", null);
    setSmallStatus("worker-check-forward", null);
    setSmallStatus("worker-check-match", null);
    return;
  }

  setSmallStatus("worker-check-reachable", true, "Reachable");
  setSmallStatus("worker-check-secret", lastHealth.health.configured?.secret === true, "Configured");
  setSmallStatus("worker-check-forward", lastHealth.health.configured?.forwardTo === true, "Configured");
  setSmallStatus("worker-check-match", lastHealth.matches, "Matches", "Mismatch");
}

function renderWizard(status: Status): void {
  const step = currentStep(status);
  renderProgress(status, step);

  for (const node of document.querySelectorAll<HTMLElement>(".wizard-step")) {
    node.classList.toggle("hidden", Number(node.dataset.step) !== step);
  }

  const workerInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
  if (status.workerOrigin && !workerInput.value) workerInput.value = status.workerOrigin;

  const domainInput = document.querySelector<HTMLInputElement>("#mail-domain")!;
  if (status.domain && !domainInput.value) domainInput.value = status.domain;

  generatedSecret.value = setupSecret;
  document.querySelector("#routing-domain")!.textContent = status.domain ?? "your mail domain";
  document.querySelector("#final-worker")!.textContent = status.workerOrigin ?? "—";
  document.querySelector("#final-domain")!.textContent = status.domain ?? "—";
  renderWorkerChecks();
}

async function refresh(probeWorker = true): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  currentStatus = status;

  const setupView = document.querySelector<HTMLElement>("#setup-view")!;
  const managementView = document.querySelector<HTMLElement>("#management-view")!;
  setupView.classList.toggle("hidden", status.setupComplete === true);
  managementView.classList.toggle("hidden", status.setupComplete !== true);

  if (status.setupComplete) {
    setupSecret = "";
    generatedSecret.value = "";
    await renderMappings();
    return;
  }

  if (
    probeWorker &&
    !lastHealth &&
    status.workerOrigin &&
    status.domain &&
    status.configured &&
    status.recoveryBackedUp
  ) {
    try {
      lastHealth = await sendMessage<HealthResult>({ type: "checkHealth" });
    } catch {
      lastHealth = null;
    }
  }

  renderWizard(status);
}

async function importRecoveryKey(secret: string, recoveryBackedUp: boolean): Promise<{ domain: string; keyId: string }> {
  if (!currentStatus?.domain) throw new Error("Choose the mail domain first.");
  return sendMessage({
    type: "importSecret",
    domain: currentStatus.domain,
    secret,
    recoveryBackedUp,
  });
}

function workerProblem(result: HealthResult): string {
  if (result.health.configured?.secret !== true) {
    return "MAILIAS_SECRET is not configured yet. Add it in Worker Settings → Variables and Secrets.";
  }
  if (result.health.configured?.forwardTo !== true) {
    return "FORWARD_TO is not configured yet. Add the forwarding address in Worker Settings → Variables and Secrets.";
  }
  if (!result.matches) {
    return "The Worker recovery key does not match this extension. Retrieve the saved key from your password manager and update MAILIAS_SECRET.";
  }
  return "The Worker configuration is not ready yet.";
}

document.querySelector("#connect-worker")!.addEventListener("click", () => {
  void (async () => {
    const raw = document.querySelector<HTMLInputElement>("#worker-origin")!.value.trim();
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Enter the HTTPS Worker origin without a path.");
    }
    const granted = await requestOrigin(url.origin);
    if (!granted) throw new Error("Permission to contact this Worker was not granted.");
    await sendMessage({ type: "setWorkerOrigin", workerOrigin: url.origin });
    lastHealth = null;
    showMessage("Worker connected.");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not connect the Worker.", true));
});

document.querySelector("#save-domain")!.addEventListener("click", () => {
  void (async () => {
    const raw = document.querySelector<HTMLInputElement>("#mail-domain")!.value;
    const domain = normalizeDomain(raw);
    await sendMessage({ type: "setDomain", domain });
    lastHealth = null;
    showMessage("Mail domain saved.");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not save the mail domain.", true));
});

document.querySelector("#generate")!.addEventListener("click", () => {
  try {
    if (!currentStatus?.domain) throw new Error("Choose the mail domain first.");
    setupSecret = generateSecret();
    generatedSecret.value = setupSecret;
    showMessage("Recovery key generated. Save it before continuing.");
    if (currentStatus) renderWizard(currentStatus);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Could not generate a recovery key.", true);
  }
});

document.querySelector("#copy-secret")!.addEventListener("click", () => {
  if (!setupSecret) return;
  void navigator.clipboard.writeText(setupSecret).then(
    () => showMessage("Recovery key copied. Save it in your password manager."),
    () => showMessage("Could not copy the recovery key.", true),
  );
});

document.querySelector("#saved")!.addEventListener("click", () => {
  void (async () => {
    if (!setupSecret) throw new Error("Generate a recovery key first.");
    const secret = setupSecret;
    await importRecoveryKey(secret, true);
    setupSecret = "";
    generatedSecret.value = "";
    lastHealth = null;
    showMessage("Recovery key saved locally. Retrieve the password-manager copy in the next step and configure the Worker.");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not save the recovery key.", true));
});

document.querySelector("#restore")!.addEventListener("click", () => {
  void (async () => {
    const input = document.querySelector<HTMLInputElement>("#existing-secret")!;
    const secret = input.value.trim();
    if (!secret) throw new Error("Paste the recovery key from your password manager.");
    await importRecoveryKey(secret, true);
    input.value = "";
    lastHealth = null;
    showMessage("Existing recovery key restored.");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not restore the recovery key.", true));
});

document.querySelector("#check-worker")!.addEventListener("click", () => {
  void (async () => {
    const result = await sendMessage<HealthResult>({ type: "checkHealth" });
    lastHealth = result;
    if (!result.ready) {
      showMessage(workerProblem(result), true);
      if (currentStatus) renderWizard(currentStatus);
      return;
    }
    showMessage("Worker configuration is ready.");
    await refresh(false);
  })().catch((error: unknown) => {
    lastHealth = null;
    renderWorkerChecks();
    showMessage(error instanceof Error ? error.message : "Worker health check failed.", true);
  });
});

document.querySelector("#confirm-routing")!.addEventListener("click", () => {
  void sendMessage({ type: "setEmailRoutingConfirmed", confirmed: true }).then(
    async () => {
      showMessage("Email Routing confirmed.");
      await refresh(false);
    },
    (error: unknown) => showMessage(error instanceof Error ? error.message : "Could not save Email Routing confirmation.", true),
  );
});

document.querySelector("#finish-setup")!.addEventListener("click", () => {
  void (async () => {
    await sendMessage({ type: "finishSetup" });
    showMessage("");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Final setup check failed.", true));
});

document.querySelector("#reset")!.addEventListener("click", () => {
  if (!confirm("Delete the local key，Worker URL，setup state，and saved site/label mappings? Make sure the recovery key is available in your password manager.")) return;
  void sendMessage({ type: "reset" }).then(async () => {
    setupSecret = "";
    lastHealth = null;
    currentStatus = null;
    generatedSecret.value = "";
    showMessage("mailias reset.");
    await refresh(false);
  });
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    void refresh(false).catch((error: unknown) =>
      showMessage(error instanceof Error ? error.message : "Could not load settings.", true));
  }
});

void refresh().catch((error: unknown) =>
  showMessage(error instanceof Error ? error.message : "Could not load settings.", true));
