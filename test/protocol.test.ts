import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeKeyId,
  decodeSecret,
  encodeSecret,
  generateAlias,
  importSecret,
  normalizeDomain,
  normalizeLabel,
  parseAlias,
  verifyAlias,
} from "../src/protocol";

const secretBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
const secret = encodeSecret(secretBytes);

function expectedTag(domain: string, label: string): string {
  const bytes = createHmac("sha256", secretBytes).update(`mailias/v1\0${domain}\0${label}`).digest().subarray(0, 5);
  const alphabet = "023456789abcdefghjkmnpqrstuvwxyz";
  let result = "";
  for (let offset = 0; offset < 40; offset += 5) {
    let value = 0;
    for (let bit = 0; bit < 5; bit += 1) {
      const absolute = offset + bit;
      value = (value << 1) | ((bytes[Math.floor(absolute / 8)]! >>> (7 - (absolute % 8))) & 1);
    }
    result += alphabet[value];
  }
  return result;
}

describe("mailias v1 protocol", () => {
  it("round-trips the 32-byte Base64URL secret", () => {
    expect(decodeSecret(secret)).toEqual(secretBytes);
    expect(secret).toHaveLength(43);
  });

  it("matches an independent HMAC implementation", async () => {
    const key = await importSecret(secret);
    const tag = expectedTag("m.example.com", "github-personal");
    expect(await generateAlias(key, "m.example.com", "GitHub-Personal"))
      .toBe(`github-personal-v1-${tag}@m.example.com`);
  });

  it("generates a domain-bound 64-bit keyId", async () => {
    const key = await importSecret(secret);
    const expected = createHmac("sha256", secretBytes)
      .update("mailias/key-id/v1\0m.example.com")
      .digest("hex")
      .slice(0, 16);
    expect(await computeKeyId(key, "m.example.com")).toBe(expected);
    expect(await computeKeyId(key, "other.example.com")).not.toBe(expected);
  });

  it("accepts 48-character labels and rejects longer labels", () => {
    expect(normalizeLabel("a".repeat(48))).toHaveLength(48);
    expect(() => normalizeLabel("a".repeat(49))).toThrow(/48/);
  });

  it("normalizes ASCII domains and rejects ambiguous input", () => {
    expect(normalizeDomain("Mail.Example.COM")).toBe("mail.example.com");
    expect(normalizeDomain("localhost")).toBe("localhost");
    expect(() => normalizeDomain("m.example.com.")).toThrow();
    expect(() => normalizeDomain("m.例.jp")).toThrow();
  });

  it("parses and verifies valid aliases", async () => {
    const key = await importSecret(secret);
    const address = await generateAlias(key, "m.example.com", "github-work");
    expect(parseAlias(address)).toMatchObject({ label: "github-work", domain: "m.example.com", version: "v1" });
    expect(await verifyAlias(key, address)).toBe(true);
    expect(await verifyAlias(key, address.replace("github-work", "github-home"))).toBe(false);
  });

  it("rejects malformed aliases and unknown versions", async () => {
    const key = await importSecret(secret);
    expect(parseAlias("github-v2-aaaaaaaa@m.example.com")).toBeNull();
    expect(parseAlias("github-v1-11111111@m.example.com")).toBeNull();
    expect(await verifyAlias(key, "not-an-alias@m.example.com")).toBe(false);
  });
});

it("matches the original Firefox fixed vector", async () => {
  const key = await importSecret(secret);
  const address = "github-v1-6e4du4hu@m.pwll.dev";
  expect(await generateAlias(key, "m.pwll.dev", "github")).toBe(address);
  expect(await verifyAlias(key, address)).toBe(true);
  expect(await verifyAlias(key, "github-v1-fndm2dq2@m.pwll.dev")).toBe(false);
});

it("preserves the original label and domain validation rules", () => {
  for (const label of ["-github", "github-", "github--work", "github_work", "a".repeat(49)]) {
    expect(() => normalizeLabel(label)).toThrow();
  }
  expect(normalizeLabel(" GitHub-Work ")).toBe("github-work");
  for (const domain of ["m.example.com.", "https://example.com", "a..com", "a".repeat(64)+".com", "user@example.com"]) {
    expect(() => normalizeDomain(domain)).toThrow();
  }
});
