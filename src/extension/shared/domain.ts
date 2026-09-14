import { getDomain, parse } from "tldts";
import { normalizeLabel as validateLabel } from "../../protocol";

const TLDTS_OPTIONS = { allowPrivateDomains: true } as const;

export function siteDomainFromUrl(urlString: string): string | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  return getDomain(url.hostname, TLDTS_OPTIONS);
}

export function isRegistrableDomain(domain: string): boolean {
  const normalized = domain.trim().toLowerCase();
  return getDomain(normalized, TLDTS_OPTIONS) === normalized;
}

export function suggestLabel(siteDomain: string): string {
  const parsed = parse(siteDomain, TLDTS_OPTIONS);
  const source = parsed.domainWithoutSuffix ?? siteDomain.split(".")[0] ?? "site";

  let candidate = source
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/g, "");

  if (candidate.length === 0) {
    candidate = "site";
  }

  try {
    return validateLabel(candidate);
  } catch {
    return "site";
  }
}
