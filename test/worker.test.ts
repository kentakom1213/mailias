import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import worker from "../src/worker";
import { encodeSecret } from "../src/protocol";

const secretBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
const env = {
  MAILIAS_SECRET: encodeSecret(secretBytes),
  FORWARD_TO: "owner@example.com",
} satisfies Env;

describe("Worker health endpoint", () => {
  it("reports configuration without disclosing values", async () => {
    const response = await worker.fetch(new Request("https://mailias.example/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "v1",
      configured: { secret: true, forwardTo: true },
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

  it("does not expose other HTTP routes", async () => {
    const response = await worker.fetch(new Request("https://mailias.example/secret"), env);
    expect(response.status).toBe(404);
  });
});
