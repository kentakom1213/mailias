import { render as renderMappings } from "./mapping-settings";
import { generateSecret, normalizeDomain } from "../protocol";
import { applySetupLanguage, type SetupLanguage } from "./i18n";
import { requestOrigin, sendMessage } from "./platform";
import { nextSetupStep, previousSetupStep, visibleSetupStep, type WizardStep } from "./setup-navigation";

type Status = {
  configured: boolean;
  setupLocked: boolean;
  language?: SetupLanguage | "";
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
  configured?: { secret?: boolean; myAddress?: boolean };
  keyId?: string | null;
};

type HealthResult = {
  health: WorkerHealth;
  matches: boolean;
  bindingsReady: boolean;
  ready: boolean;
};

const message = document.querySelector<HTMLElement>("#message")!;
const generatedSecret = document.querySelector<HTMLInputElement>("#generated-secret")!;
let setupSecret = "";
let lastHealth: HealthResult | null = null;
let currentStatus: Status | null = null;
let renderedStep: WizardStep | null = null;
let requestedStep: WizardStep | null = null;
let choosingLanguage = false;

function localize(english: string, japanese: string): string {
  return currentStatus?.language === "ja" ? japanese : english;
}

function showMessage(text: string, error = false): void {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function setSmallStatus(id: string, ready: boolean | null, readyText?: string, missingText?: string): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)!;
  if (ready === null) {
    node.textContent = localize("Not checked", "未確認");
    node.className = "setup-status pending";
    return;
  }
  node.textContent = ready
    ? `${readyText ?? localize("Ready", "準備完了")}`
    : `❌ ${missingText ?? localize("Missing", "未設定")}`;
  node.className = `setup-status ${ready ? "ready" : "missing"}`;
}

function workerIsReady(): boolean {
  return lastHealth?.ready === true;
}

function currentStep(status: Status): WizardStep {
  return nextSetupStep(status, Boolean(setupSecret), workerIsReady());
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
    state.textContent = active
      ? localize("Current", "現在")
      : done
        ? localize("Done", "完了")
        : localize("Pending", "未完了");
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

  setSmallStatus("worker-check-reachable", true, localize("Reachable", "接続可能"));
  setSmallStatus("worker-check-secret", lastHealth.health.configured?.secret === true, localize("Configured", "設定済み"));
  setSmallStatus("worker-check-forward", lastHealth.health.configured?.myAddress === true, localize("Configured", "設定済み"));
  setSmallStatus("worker-check-match", lastHealth.matches, localize("Matches", "一致"), localize("Mismatch", "不一致"));
}

function renderWizard(status: Status): WizardStep {
  const available = currentStep(status);
  const step = visibleSetupStep(requestedStep, available);
  renderedStep = step;
  renderProgress(status, step);

  for (const node of document.querySelectorAll<HTMLElement>(".wizard-step")) {
    node.classList.toggle("hidden", Number(node.dataset.step) !== step);
  }

  const workerInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
  if (status.workerOrigin && !workerInput.value) workerInput.value = status.workerOrigin;

  const domainInput = document.querySelector<HTMLInputElement>("#mail-domain")!;
  if (status.domain && (!domainInput.value || status.setupLocked)) domainInput.value = status.domain;

  domainInput.readOnly = status.setupLocked;
  document.querySelector("#save-domain")!.classList.toggle("hidden", status.setupLocked);
  document.querySelector("#domain-locked")!.classList.toggle("hidden", !status.setupLocked);
  document.querySelector("#key-choices")!.classList.toggle("hidden", status.setupLocked);
  document.querySelector("#key-stored")!.classList.toggle("hidden", !status.setupLocked);
  document.querySelector("#backup-input")!.classList.toggle("hidden", status.setupLocked);
  document.querySelector("#backup-stored")!.classList.toggle("hidden", !status.setupLocked);
  generatedSecret.value = setupSecret;
  const routingDomain = document.querySelector<HTMLElement>("#routing-domain");
  if (routingDomain) routingDomain.textContent = status.domain ?? localize("your mail domain", "メールドメイン");
  document.querySelector("#final-worker")!.textContent = status.workerOrigin ?? "—";
  document.querySelector("#final-domain")!.textContent = status.domain ?? "—";
  renderWorkerChecks();
  return step;
}

async function checkWorkerConfiguration(showResult: boolean): Promise<void> {
  try {
    const checkedStatus = currentStatus;
    const result = await sendMessage<HealthResult>({ type: "checkHealth" });
    if (checkedStatus?.workerOrigin !== currentStatus?.workerOrigin ||
        checkedStatus?.keyId !== currentStatus?.keyId || checkedStatus?.domain !== currentStatus?.domain) return;
    if (showResult && result.ready && renderedStep === 5) requestedStep = 6;
    lastHealth = result;
    if (showResult) {
      if (result.ready) {
        showMessage(localize("Worker configuration is ready.", "Worker の設定を確認できました．"));
      } else {
        showMessage(workerProblem(result), true);
      }
    }
    await refresh(false);
  } catch (error) {
    lastHealth = null;
    renderWorkerChecks();
    setSmallStatus("worker-check-reachable", false, undefined, localize("Connection failed", "接続失敗"));
    if (showResult) {
      showMessage(error instanceof Error ? error.message : localize("Worker health check failed.", "Worker の確認に失敗しました．"), true);
    }
  }
}

async function refresh(_probeWorker = true): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  if (currentStatus && (currentStatus.workerOrigin !== status.workerOrigin ||
      currentStatus.domain !== status.domain || currentStatus.keyId !== status.keyId)) lastHealth = null;
  if (status.setupLocked) {
    setupSecret = "";
    document.querySelector<HTMLInputElement>("#existing-secret")!.value = "";
  }
  currentStatus = status;

  const setupView = document.querySelector<HTMLElement>("#setup-view")!;
  const managementView = document.querySelector<HTMLElement>("#management-view")!;
  const languageView = document.querySelector<HTMLElement>("#language-view")!;
  const setupLayout = document.querySelector<HTMLElement>("#setup-layout")!;

  setupView.classList.toggle("hidden", status.setupComplete === true);
  managementView.classList.toggle("hidden", status.setupComplete !== true);

  if (status.setupComplete) {
    requestedStep = null;
    choosingLanguage = false;
    applySetupLanguage(status.language === "ja" ? "ja" : "en");
    setupSecret = "";
    generatedSecret.value = "";
    renderedStep = null;
    await renderMappings();
    return;
  }

  const language = !choosingLanguage && (status.language === "en" || status.language === "ja") ? status.language : null;
  languageView.classList.toggle("hidden", language !== null);
  setupLayout.classList.toggle("hidden", language === null);

  if (!language) {
    applySetupLanguage("en");
    renderedStep = null;
    return;
  }

  applySetupLanguage(language);
  const previousStep = renderedStep;
  const step = renderWizard(status);
  renderedStep = step;

  if (step === 5 && previousStep !== 5 && lastHealth === null) {
    await checkWorkerConfiguration(false);
  }
}

async function importRecoveryKey(secret: string, recoveryBackedUp: boolean): Promise<{ domain: string; keyId: string }> {
  if (!currentStatus?.domain) throw new Error(localize("Choose the mail domain first.", "先にメールドメインを設定してください．"));
  return sendMessage({
    type: "importSecret",
    domain: currentStatus.domain,
    secret,
    recoveryBackedUp,
  });
}

function workerProblem(result: HealthResult): string {
  if (result.health.configured?.secret !== true) {
    return localize(
      "MAILIAS_SECRET is not configured yet. Add it in Worker Settings → Variables and Secrets.",
      "❌ MAILIAS_SECRET が未設定です",
    );
  }
  if (result.health.configured?.myAddress !== true) {
    return localize(
      "MY_ADDRESS is not configured yet. Add your own destination inbox address in Worker Settings → Variables and Secrets.",
      "❌ MY_ADDRESS が未設定です",
    );
  }
  if (!result.matches) {
    return localize(
      "The Worker recovery key does not match this extension. Retrieve the saved key from your password manager and update MAILIAS_SECRET.",
      "❌ キーが不一致です．保存したキーで MAILIAS_SECRET を更新してください．",
    );
  }
  return localize("The Worker configuration is not ready yet.", "Worker の設定がまだ完了していません．");
}

function navigateBack(): void {
  if (!currentStatus || currentStatus.setupComplete || renderedStep === null) return;
  if (renderedStep === 1) {
    choosingLanguage = true;
    document.querySelector("#language-view")!.classList.remove("hidden");
    document.querySelector("#setup-layout")!.classList.add("hidden");
    document.querySelector<HTMLButtonElement>("#language-en")!.focus();
  } else {
    const next = previousSetupStep(renderedStep, currentStatus.setupLocked, Boolean(setupSecret));
    requestedStep = next;
    renderWizard(currentStatus);
    const heading = document.querySelector<HTMLElement>(`#step-${next} .step-title`)!;
    heading.tabIndex = -1;
    heading.focus();
  }
  showMessage("");
}

document.querySelector("#setup-back")!.addEventListener("click", navigateBack);

for (const language of ["en", "ja"] as const) {
  document.querySelector(`#language-${language}`)!.addEventListener("click", () => {
    void sendMessage({ type: "setLanguage", language }).then(
      async () => {
        choosingLanguage = false;
        requestedStep = 1;
        showMessage("");
        await refresh(false);
      },
      (error: unknown) => showMessage(error instanceof Error ? error.message : "Could not save language.", true),
    );
  });
}

const deploymentStatus = document.querySelector<HTMLElement>("#deployment-status")!;
function showDeploymentStatus(state: "ready" | "missing" | "pending", title: string, hint = ""): void {
  deploymentStatus.className = `deployment-status ${state}`;
  const label = document.createElement("strong");
  label.textContent = `${state === "ready" ? "✓" : state === "missing" ? "⚠️" : "⏳"} ${title}`;
  deploymentStatus.replaceChildren(label);
  if (hint) {
    const detail = document.createElement("span");
    detail.textContent = hint;
    deploymentStatus.appendChild(detail);
  }
}

const workerOriginInput = document.querySelector<HTMLInputElement>("#worker-origin")!;
const continueWorker = document.querySelector<HTMLButtonElement>("#continue-worker")!;
let checkedOrigin = "";

workerOriginInput.addEventListener("input", () => {
  checkedOrigin = "";
  continueWorker.disabled = true;
  continueWorker.classList.add("hidden");
  deploymentStatus.textContent = "";
});

continueWorker.addEventListener("click", () => {
  if (!currentStatus || !checkedOrigin || workerOriginInput.value.trim() !== checkedOrigin) return;
  requestedStep = null;
  renderWizard(currentStatus);
  showMessage("");
});

document.querySelector("#connect-worker")!.addEventListener("click", () => {
  const button = document.querySelector<HTMLButtonElement>("#connect-worker")!;
  button.disabled = true;
  continueWorker.disabled = true;
  continueWorker.classList.add("hidden");
  checkedOrigin = "";
  requestedStep = 1;
  void (async () => {
    const raw = workerOriginInput.value.trim();
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new Error(localize("Enter the HTTPS Worker origin without a path.", "パスを含まない HTTPS の Worker URL を入力してください．"));
    }
    const granted = await requestOrigin(url.origin);
    await sendMessage({ type: "setWorkerOrigin", workerOrigin: url.origin });
    lastHealth = null;
    await refresh(false);
    if (workerOriginInput.value.trim() !== raw) return;
    workerOriginInput.value = url.origin;
    checkedOrigin = url.origin;
    showMessage("");
    const allowSkip = () => {
      continueWorker.disabled = false;
      continueWorker.classList.remove("hidden");
    };
    if (!granted) {
      allowSkip();
      showDeploymentStatus("missing", localize("Permission required", "アクセス権限がありません"), localize("You can continue", "このまま進めます"));
      return;
    }
    showDeploymentStatus("pending", localize("Checking…", "確認中…"));
    try {
      const result = await sendMessage<HealthResult>({ type: "checkHealth" });
      if (checkedOrigin !== url.origin) return;
      if (result.health.status === "ok") {
        showDeploymentStatus("ready", localize("Deployment confirmed", "デプロイを確認できました"));
        if (currentStatus && renderedStep === 1 && !choosingLanguage) {
          requestedStep = null;
          renderWizard(currentStatus);
        }
      } else {
        allowSkip();
        showDeploymentStatus("missing", localize("Worker error", "Worker がエラーを返しました"), localize("You can continue", "このまま進めます"));
      }
    } catch {
      if (checkedOrigin !== url.origin) return;
      allowSkip();
      showDeploymentStatus("missing", localize("Deployment not confirmed", "デプロイ確認できません"), localize("Check the URL · You can continue", "URL を確認してください · このまま進めます"));
    }
  })().catch((error: unknown) => {
    deploymentStatus.textContent = "";
    showMessage(error instanceof Error ? error.message : localize("Could not save the Worker URL.", "Worker URL を保存できませんでした．"), true);
  }).finally(() => { button.disabled = false; });
});

document.querySelector("#save-domain")!.addEventListener("click", () => {
  void (async () => {
    const raw = document.querySelector<HTMLInputElement>("#mail-domain")!.value;
    const domain = normalizeDomain(raw);
    await sendMessage({ type: "setDomain", domain });
    lastHealth = null;
    requestedStep = setupSecret ? 4 : 3;
    showMessage(localize("Mail domain saved.", "メールドメインを保存しました．"));
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : localize("Could not save the mail domain.", "メールドメインを保存できませんでした．"), true));
});

document.querySelector("#generate")!.addEventListener("click", () => {
  try {
    if (!currentStatus?.domain) throw new Error(localize("Choose the mail domain first.", "先にメールドメインを設定してください．"));
    setupSecret = generateSecret();
    requestedStep = 4;
    generatedSecret.value = setupSecret;
    showMessage(localize("Key generated. Save it in your password manager.", "キーを生成しました"));
    if (currentStatus) renderWizard(currentStatus);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : localize("Could not generate a recovery key.", "秘密キーを生成できませんでした．"), true);
  }
});

document.querySelector("#copy-secret")!.addEventListener("click", () => {
  if (!setupSecret) return;
  void navigator.clipboard.writeText(setupSecret).then(
    () => showMessage(localize("Recovery key copied. Save it in your password manager.", "秘密キーをコピーしました．パスワードマネージャーに保存してください．")),
    () => showMessage(localize("Could not copy the recovery key.", "秘密キーをコピーできませんでした．"), true),
  );
});

document.querySelector("#saved")!.addEventListener("click", () => {
  void (async () => {
    if (!setupSecret) throw new Error(localize("Generate a recovery key first.", "先に秘密キーを生成してください．"));
    const secret = setupSecret;
    await importRecoveryKey(secret, true);
    setupSecret = "";
    generatedSecret.value = "";
    requestedStep = 5;
    lastHealth = null;
    showMessage(localize(
      "Key saved.",
      "キーを保存しました",
    ));
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : localize("Could not save the recovery key.", "秘密キーを保存できませんでした．"), true));
});

document.querySelector("#restore")!.addEventListener("click", () => {
  void (async () => {
    const input = document.querySelector<HTMLInputElement>("#existing-secret")!;
    const secret = input.value.trim();
    if (!secret) throw new Error(localize("Paste the recovery key from your password manager.", "パスワードマネージャーから秘密キーを貼り付けてください．"));
    await importRecoveryKey(secret, true);
    input.value = "";
    setupSecret = "";
    generatedSecret.value = "";
    requestedStep = 5;
    lastHealth = null;
    showMessage(localize("Existing recovery key restored.", "既存の秘密キーを復元しました．"));
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : localize("Could not restore the recovery key.", "秘密キーを復元できませんでした．"), true));
});

document.querySelector("#check-worker")!.addEventListener("click", () => {
  void checkWorkerConfiguration(true);
});

document.querySelector("#confirm-routing")!.addEventListener("click", () => {
  void sendMessage({ type: "setEmailRoutingConfirmed", confirmed: true }).then(
    async () => {
      requestedStep = 7;
      showMessage(localize("Email Routing confirmed.", "Email Routing の設定を確認しました．"));
      await refresh(false);
    },
    (error: unknown) => showMessage(error instanceof Error ? error.message : localize("Could not save Email Routing confirmation.", "Email Routing の確認状態を保存できませんでした．"), true),
  );
});

document.querySelector("#finish-setup")!.addEventListener("click", () => {
  void (async () => {
    await sendMessage({ type: "finishSetup" });
    showMessage("");
    await refresh(false);
  })().catch((error: unknown) =>
    showMessage(error instanceof Error ? error.message : localize("Final setup check failed.", "最終確認に失敗しました．"), true));
});

document.querySelector("#reset")!.addEventListener("click", () => {
  const prompt = localize(
    "Delete the local key，Worker URL，setup state，and saved site/label mappings? Make sure the recovery key is available in your password manager.",
    "ローカルキー，Worker URL，セットアップ状態，保存済みのサイト / ラベル対応を削除しますか？ パスワードマネージャーに秘密キーが保存されていることを確認してください．",
  );
  if (!confirm(prompt)) return;
  void sendMessage({ type: "reset" }).then(async () => {
    setupSecret = "";
    lastHealth = null;
    currentStatus = null;
    renderedStep = null;
    requestedStep = null;
    choosingLanguage = false;
    generatedSecret.value = "";
    showMessage("");
    await refresh(false);
  });
});

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    void refresh(false).catch((error: unknown) =>
      showMessage(error instanceof Error ? error.message : localize("Could not load settings.", "設定を読み込めませんでした．"), true));
  }
});

void refresh().catch((error: unknown) =>
  showMessage(error instanceof Error ? error.message : "Could not load settings.", true));
