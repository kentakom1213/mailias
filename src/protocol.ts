export const VERSION = "v1";
export const MAX_LABEL_LENGTH = 48;
export const TAG_LENGTH = 8;
export const SECRET_BYTES = 32;

const BASE32_ALPHABET = "023456789abcdefghjkmnpqrstuvwxyz";
const LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const encoder = new TextEncoder();

export type ParsedAlias = {
  label: string;
  version: typeof VERSION;
  tag: string;
  domain: string;
};

export function normalizeLabel(input: string): string {
  const label = input.trim().replace(/[A-Z]/g, (character) => character.toLowerCase());
  if (label.length < 1 || label.length > MAX_LABEL_LENGTH) {
    throw new Error(`Label must be between 1 and ${MAX_LABEL_LENGTH} characters.`);
  }
  if (!LABEL_PATTERN.test(label)) {
    throw new Error("Label may contain ASCII letters, digits, and single hyphens between segments only.");
  }
  return label;
}

export function normalizeDomain(input: string): string {
  const raw = input.trim();
  if (raw.length === 0) {
    throw new Error("Mail domain is required.");
  }
  if (/[\s/@:]/.test(raw)) {
    throw new Error("Enter a domain only, without protocol, path, port, or @.");
  }
  if (raw.endsWith(".")) {
    throw new Error("Trailing dots are not accepted in the mail domain.");
  }

  let hostname: string;
  try {
    hostname = new URL(`https://${raw}`).hostname.toLowerCase();
  } catch {
    throw new Error("Invalid mail domain.");
  }

  if (hostname.length === 0 || hostname.length > 253 || hostname !== raw.toLowerCase()) {
    throw new Error("Invalid mail domain.");
  }

  for (const part of hostname.split(".")) {
    if (
      part.length === 0 ||
      part.length > 63 ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)
    ) {
      throw new Error("Invalid mail domain.");
    }
  }

  return hostname;
}

export function decodeSecret(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) {
    throw new Error("Secret must be a 32-byte, unpadded Base64URL value.");
  }
  const base64 = normalized.replace(/-/g, "+").replace(/_/g, "/") + "=";
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("Secret is not valid Base64URL.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytes.byteLength !== SECRET_BYTES) {
    throw new Error(`Secret must decode to exactly ${SECRET_BYTES} bytes.`);
  }
  return bytes;
}

export function encodeSecret(bytes: Uint8Array<ArrayBufferLike>): string {
  if (bytes.byteLength !== SECRET_BYTES) {
    throw new Error(`Secret must contain exactly ${SECRET_BYTES} bytes.`);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateSecret(): string {
  return encodeSecret(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export async function importSecret(secret: string): Promise<CryptoKey> {
  const bytes = decodeSecret(secret);
  try {
    return await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } finally {
    bytes.fill(0);
  }
}

function aliasMessage(domain: string, label: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`mailias/v1\0${normalizeDomain(domain)}\0${normalizeLabel(label)}`);
}

function keyIdMessage(domain: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`mailias/key-id/v1\0${normalizeDomain(domain)}`);
}

async function sign(key: CryptoKey, message: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let accumulator = 0;
  let output = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(accumulator >>> bits) & 31];
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return output;
}

export async function computeTag(key: CryptoKey, domain: string, label: string): Promise<string> {
  const digest = await sign(key, aliasMessage(domain, label));
  return encodeBase32(digest.slice(0, 5));
}

export async function computeKeyId(key: CryptoKey, domain: string): Promise<string> {
  const digest = await sign(key, keyIdMessage(domain));
  return Array.from(digest.slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateAlias(key: CryptoKey, domain: string, input: string): Promise<string> {
  const label = normalizeLabel(input);
  const normalizedDomain = normalizeDomain(domain);
  const tag = await computeTag(key, normalizedDomain, label);
  return `${label}-${VERSION}-${tag}@${normalizedDomain}`;
}

export function parseAlias(address: string): ParsedAlias | null {
  const separator = address.lastIndexOf("@");
  if (separator < 1 || separator === address.length - 1) return null;
  const localPart = address.slice(0, separator).toLowerCase();
  const match = /^(.*)-v1-([023456789abcdefghjkmnpqrstuvwxyz]{8})$/.exec(localPart);
  if (!match?.[1] || !match[2]) return null;
  try {
    return {
      label: normalizeLabel(match[1]),
      version: VERSION,
      tag: match[2],
      domain: normalizeDomain(address.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyAlias(key: CryptoKey, address: string): Promise<boolean> {
  const parsed = parseAlias(address);
  if (!parsed) return false;
  const expected = await computeTag(key, parsed.domain, parsed.label);
  return constantTimeEqual(expected, parsed.tag);
}
