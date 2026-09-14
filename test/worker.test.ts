import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker, { type MailiasEnv } from "../src/worker";
import { encodeSecret } from "../src/protocol";

const secretBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
const env = {
  MAILIAS_SECRET: encodeSecret(secretBytes),
  MY_ADDRESS: "owner@example.com",
} satisfies MailiasEnv;

describe("Worker health endpoint", () => {
  it("reports configuration without disclosing values", async () => {
    const response = await worker.fetch(new Request("https://mailias.example/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "v1",
      configured: { secret: true, myAddress: true },
      keyId: null,
    });
  });

  it("allows the Worker to boot before runtime bindings are configured", async () => {
    const response = await worker.fetch(
      new Request("https://mailias.example/health?domain=m.example.com"),
      {} satisfies MailiasEnv,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "v1",
      configured: { secret: false, myAddress: false },
      keyId: null,
    });
  });

  it("returns the domain-bound keyId", async () => {
    const response = await worker.fetch(
      new Request("https://mailias.example/health?domain=m.example.com"),
      env,
    );
    const expected = createHmac("sha256", secretBytes)
      .update("mailias/key-id/v1\0m.example.com")
      .digest("hex")
      .slice(0, 16);
    expect(await response.json()).toMatchObject({ keyId: expected });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepts legacy FORWARD_TO while migrating existing deployments", async () => {
    const response = await worker.fetch(new Request("https://mailias.example/health"), {
      MAILIAS_SECRET: env.MAILIAS_SECRET,
      FORWARD_TO: "owner@example.com",
    } satisfies MailiasEnv);
    expect(await response.json()).toMatchObject({ configured: { secret: true, myAddress: true } });
  });

  it("does not expose other HTTP routes", async () => {
    const response = await worker.fetch(new Request("https://mailias.example/secret"), env);
    expect(response.status).toBe(404);
  });
});

describe("Worker email verification", () => {
  async function forwarded(address: string, secret = env.MAILIAS_SECRET): Promise<string[]> {
    const recipients: string[] = [];
    const message = {
      to: address,
      forward: async (recipient: string) => { recipients.push(recipient); },
    } as unknown as ForwardableEmailMessage;
    await worker.email(message, { ...env, MAILIAS_SECRET: secret });
    return recipients;
  }

  it("silently avoids forwarding while runtime bindings are incomplete", async () => {
    const recipients: string[] = [];
    const message = {
      to: "github-v1-6e4du4hu@m.pwll.dev",
      forward: async (recipient: string) => { recipients.push(recipient); },
    } as unknown as ForwardableEmailMessage;
    await worker.email(message, {} satisfies MailiasEnv);
    expect(recipients).toEqual([]);
  });

  it("forwards the independently checked current v1 vector", async () => {
    expect(await forwarded("github-v1-6e4du4hu@m.pwll.dev")).toEqual([env.MY_ADDRESS]);
  });

  it("rejects the incompatible RFC 4648 variant", async () => {
    expect(await forwarded("github-v1-fndm2dq2@m.pwll.dev")).toEqual([]);
  });

  it("does not forward altered labels, domains, tags, or versions", async () => {
    for (const address of [
      "gitlab-v1-6e4du4hu@m.pwll.dev",
      "github-v1-6e4du4hu@other.example",
      "github-v1-6e4du4hv@m.pwll.dev",
      "github-v2-6e4du4hu@m.pwll.dev",
    ]) {
      expect(await forwarded(address)).toEqual([]);
    }
  });

  it("does not forward an alias when the secret differs", async () => {
    expect(await forwarded("github-v1-6e4du4hu@m.pwll.dev", encodeSecret(new Uint8Array(32)))).toEqual([]);
  });
});
