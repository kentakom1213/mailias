import { openOptionsPage, sendMessage } from "./platform";

type Status = { configured: boolean; domain?: string };

const form = document.querySelector<HTMLFormElement>("#generator")!;
const unconfigured = document.querySelector<HTMLElement>("#unconfigured")!;
const label = document.querySelector<HTMLInputElement>("#label")!;
const alias = document.querySelector<HTMLOutputElement>("#alias")!;
const copy = document.querySelector<HTMLButtonElement>("#copy")!;
const message = document.querySelector<HTMLElement>("#message")!;

async function refresh(): Promise<void> {
  const status = await sendMessage<Status>({ type: "getStatus" });
  form.classList.toggle("hidden", !status.configured);
  unconfigured.classList.toggle("hidden", status.configured);
  document.querySelector("#domain")!.textContent = status.domain ? `@${status.domain}` : "";
}

let requestNumber = 0;
label.addEventListener("input", () => {
  const currentRequest = ++requestNumber;
  message.textContent = "";
  if (!label.value) {
    alias.textContent = "";
    copy.disabled = true;
    return;
  }
  void sendMessage<{ alias: string }>({ type: "generateAlias", label: label.value }).then(
    (result) => {
      if (currentRequest !== requestNumber) return;
      alias.textContent = result.alias;
      copy.disabled = false;
    },
    (error: unknown) => {
      if (currentRequest !== requestNumber) return;
      alias.textContent = "";
      copy.disabled = true;
      message.textContent = error instanceof Error ? error.message : "Could not generate the alias.";
    },
  );
});

copy.addEventListener("click", () => {
  void navigator.clipboard.writeText(alias.textContent).then(() => {
    message.textContent = "Copied.";
  });
});

for (const selector of ["#settings", "#setup"]) {
  document.querySelector(selector)!.addEventListener("click", () => void openOptionsPage());
}

void refresh().catch((error: unknown) => {
  message.textContent = error instanceof Error ? error.message : "Could not load mailias.";
});
