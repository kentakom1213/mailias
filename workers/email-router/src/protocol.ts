export const PROTOCOL_VERSION = "v1";
export const KEY_BYTES = 32;
export const TAG_LENGTH = 8;
export const MAX_LABEL_BYTES = 48;

const CONTEXT = "mailias/v1";
const TAG_ALPHABET = "023456789abcdefghjkmnpqrstuvwxyz";
const ASCII_ENCODER = new TextEncoder();

export interface VerifiedAlias {
  label: string;
  address: string;
}

export function normalizeLabel(input: string): string {
  if (input.length === 0) {
    throw new Error("the label must not be empty");
  }
  if (!isAscii(input) || ASCII_ENCODER.encode(input).length > MAX_LABEL_BYTES) {
    throw new Error("the label is not valid ASCII or is too long");
  }

  const label = input.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) {
    throw new Error("the label has invalid syntax");
  }
  return label;
}

export function normalizeDomain(input: string): string {
  if (
    input.length === 0 ||
    input.length > 253 ||
    !isAscii(input) ||
    input.endsWith(".")
  ) {
    throw new Error("the domain is invalid");
  }

  const domain = input.toLowerCase();
  const valid = domain
    .split(".")
    .every(
      (part) =>
        part.length > 0 &&
        part.length <= 63 &&
        !part.startsWith("-") &&
        !part.endsWith("-") &&
        /^[a-z0-9-]+$/.test(part),
    );
  if (!valid) {
    throw new Error("the domain is invalid");
  }
  return domain;
}

export function decodeKey(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("the key is not canonical unpadded Base64URL");
  }
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/") + "=";
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new Error("the key is not valid Base64URL");
  }
  const key = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (key.length !== KEY_BYTES) {
    throw new Error("the key must decode to exactly 32 bytes");
  }
  return key;
}

export async function generateTag(
  encodedKey: string,
  domainInput: string,
  labelInput: string,
): Promise<string> {
  const domain = normalizeDomain(domainInput);
  const label = normalizeLabel(labelInput);
  const keyBytes = decodeKey(encodedKey);
  const keyData = new Uint8Array(keyBytes.byteLength);
  keyData.set(keyBytes);
  const message = ASCII_ENCODER.encode(`${CONTEXT}\0${domain}\0${label}`);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return encodeTag(digest.subarray(0, 5));
}

export async function generateAddress(
  encodedKey: string,
  domainInput: string,
  labelInput: string,
): Promise<string> {
  const domain = normalizeDomain(domainInput);
  const label = normalizeLabel(labelInput);
  const tag = await generateTag(encodedKey, domain, label);
  return `${label}-${PROTOCOL_VERSION}-${tag}@${domain}`;
}

export async function verifyAddress(
  encodedKey: string,
  expectedDomainInput: string,
  addressInput: string,
): Promise<VerifiedAlias | null> {
  const expectedDomain = normalizeDomain(expectedDomainInput);
  if (!isAscii(addressInput)) {
    return null;
  }

  const address = addressInput.toLowerCase();
  const separator = address.lastIndexOf("@");
  if (separator <= 0 || separator !== address.indexOf("@")) {
    return null;
  }
  const localPart = address.slice(0, separator);
  const domainInput = address.slice(separator + 1);

  let domain: string;
  try {
    domain = normalizeDomain(domainInput);
  } catch {
    return null;
  }
  if (domain !== expectedDomain) {
    return null;
  }

  const versionSeparator = localPart.lastIndexOf("-v1-");
  if (versionSeparator <= 0) {
    return null;
  }
  const labelInput = localPart.slice(0, versionSeparator);
  const tag = localPart.slice(versionSeparator + "-v1-".length);

  let label: string;
  try {
    label = normalizeLabel(labelInput);
  } catch {
    return null;
  }
  if (
    tag.length !== TAG_LENGTH ||
    ![...tag].every((character) => TAG_ALPHABET.includes(character))
  ) {
    return null;
  }

  const expectedTag = await generateTag(encodedKey, expectedDomain, label);
  if (!constantTimeEqual(expectedTag, tag)) {
    return null;
  }

  return {
    label,
    address: `${label}-${PROTOCOL_VERSION}-${expectedTag}@${expectedDomain}`,
  };
}

function encodeTag(bytes: Uint8Array): string {
  if (bytes.length !== 5) {
    throw new Error("a mailias tag requires exactly five bytes");
  }

  let value = 0;
  for (const byte of bytes) {
    value = value * 256 + byte;
  }

  const output = new Array<string>(TAG_LENGTH);
  for (let index = TAG_LENGTH - 1; index >= 0; index -= 1) {
    output[index] = TAG_ALPHABET[value % 32];
    value = Math.floor(value / 32);
  }
  return output.join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isAscii(input: string): boolean {
  return /^[\x00-\x7f]*$/.test(input);
}
