import { render as renderMappings } from "./mapping-settings";
import { generateSecret, normalizeDomain } from "../protocol";
import { requestOrigin, sendMessage } from "./platform";

type Status = {
  configured: boolean;
  setupLocked: boolean;
  domain?: string;
  keyId?: string;
  workerOrigin?: string;
};

const message = document.querySelector<HTMLElement>("#message")!;
const backupStep = document.querySelector<HTMLElement>("#backup-step")!;
const verifyStep = document.querySelector<HTMLElement>("#verify-step")!;
const generatedSecret = document.querySelector<HTMLInputElement>("#generated-secret")!;
const verifySecret = document.querySelector<HTMLInputElement>("#verify-secret")!;
let setupSecret = "";
let setupDomain = "";

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

async function refresh(): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  await renderMappings();
  document.querySelector("#status")!.textContent = status.configured
    ? `${status.domain} · keyId ${status.keyId}`
    : "Not configured";
  for (const id of ["new-setup", "restore-setup"]) {
    const section = document.querySelector<HTMLFieldSetElement>(`#${id}`)!;
    section.disabled = status.setupLocked;
    section.classList.toggle("hidden", status.setupLocked);
  }
  document.querySelector("#setup-locked")!.classList.toggle("hidden", !status.setupLocked);
  if (status.setupLocked) clearSetup();
  const workerInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
  if (status.workerOrigin && !workerInput.value) workerInput.value = status.workerOrigin;
}

async function saveSecret(domainInput: string, secret: string): Promise<{ domain: string; keyId: string }> {
  const domain = normalizeDomain(domainInput);
  return sendMessage({ type: "importSecret", domain, secret });
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
      showMessage(`Setup complete．keyId ${keyId}`);
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
      showMessage(`Setup restored．keyId ${keyId}`);
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
    showMessage("Worker URL saved．");
    await refresh();
  })().catch((error: unknown) => showMessage(error instanceof Error ? error.message : "Could not save the Worker URL．", true));
});

document.querySelector("#check-worker")!.addEventListener("click", () => {
  void sendMessage<{ health: object; matches: boolean }>({ type: "checkHealth" }).then(
    ({ health, matches }) => {
      document.querySelector("#health")!.textContent = JSON.stringify({ ...health, keyMatches: matches }, null, 2);
      showMessage(matches ? "Worker key matches this extension．" : "Worker key does not match this extension．", !matches);
    },
    (error: unknown) => showMessage(error instanceof Error ? error.message : "Health check failed．", true),
  );
});

document.querySelector("#reset")!.addEventListener("click", () => {
  if (!confirm("Delete the local key and saved site/label mappings? Make sure the recovery key is available in your password manager．")) return;
  void sendMessage({ type: "reset" }).then(async () => {
    clearSetup();
    showMessage("Extension reset．");
    await refresh();
  });
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void refresh().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : "Could not load settings．", true));
});

void refresh().catch((error: unknown) => showMessage(error instanceof Error ? error.message : "Could not load settings．", true));
