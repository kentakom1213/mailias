import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import handler, { type Env, type ForwardableEmailMessage } from "../src/index.ts";
import {
  generateAddress,
  generateTag,
  normalizeLabel,
  verifyAddress,
} from "../src/protocol.ts";

interface TestVectors {
  version: number;
  vectors: Array<{
    key: string;
    domain: string;
    label: string;
    tag: string;
    address: string;
  }>;
}

const vectors = JSON.parse(
  readFileSync(new URL("../../../test-vectors/v1.json", import.meta.url), "utf8"),
) as TestVectors;

describe("mailias protocol v1", () => {
  it("matches every shared test vector", async () => {
    expect(vectors.version).toBe(1);
    for (const vector of vectors.vectors) {
      await expect(
        generateTag(vector.key, vector.domain, vector.label),
      ).resolves.toBe(vector.tag);
      await expect(
        generateAddress(vector.key, vector.domain, vector.label),
      ).resolves.toBe(vector.address);
    }
  });

  it("canonicalizes ASCII case but rejects rewritten labels", () => {
    expect(normalizeLabel("GitHub-Work")).toBe("github-work");
    expect(() => normalizeLabel("github_work")).toThrow();
    expect(() => normalizeLabel("github--work")).toThrow();
  });

  it("verifies case-insensitively and rejects a modified tag", async () => {
    const vector = vectors.vectors[0];
    expect(vector).toBeDefined();
    const verified = await verifyAddress(
      vector.key,
      vector.domain.toUpperCase(),
      vector.address.toUpperCase(),
    );
    expect(verified?.label).toBe("github");

    await expect(
      verifyAddress(
        vector.key,
        vector.domain,
        "github-v1-00000000@m.example.test",
      ),
    ).resolves.toBeNull();
  });
});

describe("email handler", () => {
  const vector = vectors.vectors[0];
  const env: Env = {
    MAILIAS_DOMAIN: vector.domain,
    MAILIAS_FORWARD_TO: "destination@example.com",
    MAILIAS_KEY: vector.key,
  };

  it("forwards a valid recipient with mailias headers", async () => {
    const forwards: Array<{ recipient: string; headers?: Headers }> = [];
    const message: ForwardableEmailMessage = {
      to: vector.address,
      async forward(recipient, headers) {
        forwards.push({ recipient, headers });
      },
    };

    await handler.email(message, env, {});
    expect(forwards).toHaveLength(1);
    expect(forwards[0]?.recipient).toBe("destination@example.com");
    expect(forwards[0]?.headers?.get("X-Mailias-Label")).toBe("github");
    expect(forwards[0]?.headers?.get("X-Mailias-Version")).toBe("1");
  });

  it("silently drops an invalid recipient", async () => {
    let forwarded = false;
    const message: ForwardableEmailMessage = {
      to: "github-v1-00000000@m.example.test",
      async forward() {
        forwarded = true;
      },
    };

    await handler.email(message, env, {});
    expect(forwarded).toBe(false);
  });
});
