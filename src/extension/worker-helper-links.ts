const HELPER_LINK_IDS = ["open-worker-helper-backup", "open-worker-helper-config"] as const;

async function updateWorkerHelperLinks(): Promise<void> {
  const stored = await chrome.storage.local.get(["workerOrigin", "language"]);
  const workerOrigin = typeof stored.workerOrigin === "string" ? stored.workerOrigin : "";
  const language = stored.language === "ja" ? "ja" : "en";

  for (const id of HELPER_LINK_IDS) {
    const link = document.querySelector<HTMLAnchorElement>(`#${id}`);
    if (!link) continue;

    if (!workerOrigin) {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      continue;
    }

    const url = new URL(language === "ja" ? "/ja" : "/", workerOrigin);
    link.href = url.toString();
    link.removeAttribute("aria-disabled");
  }
}

void updateWorkerHelperLinks();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.workerOrigin || changes.language) void updateWorkerHelperLinks();
});
