import { computeKeyId, generateSecret, importSecret, normalizeDomain } from "../protocol";
import { requestOrigin, sendMessage } from "./platform";

type Status = {
  configured: boolean;
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

async function refresh(): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  document.querySelector("#status")!.textContent = status.configured
    ? `${status.domain} · keyId ${status.keyId}`
    : "Not configured";
  const workerInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
  if (status.workerOrigin && !workerInput.value) workerInput.value = status.workerOrigin;
}

async function saveSecret(domainInput: string, secret: string): Promise<{ domain: string; keyId: string }> {
  const domain = normalizeDomain(domainInput);
  const candidateKey = await importSecret(secret);
  const candidateKeyId = await computeKeyId(candidateKey, domain);
  const current = await sendMessage<Status>({ type: "getStatus" });
  let replace = false;
  if (current.configured && current.keyId !== candidateKeyId) {
    replace = confirm(
      `Replace keyId ${current.keyId} with ${candidateKeyId}? Existing aliases will stop working if the Worker secret is also changed．`,
    );
    if (!replace) throw new Error("Key replacement cancelled．");
  }
  return sendMessage({ type: "importSecret", domain, secret, replace });
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
  if (!confirm("Delete the local key? Make sure the recovery key is available in your password manager．")) return;
  void sendMessage({ type: "reset" }).then(async () => {
    showMessage("Extension reset．");
    await refresh();
  });
});

void refresh().catch((error: unknown) => showMessage(error instanceof Error ? error.message : "Could not load settings．", true));
