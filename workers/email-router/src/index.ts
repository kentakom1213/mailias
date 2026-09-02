import { verifyAddress } from "./protocol.ts";

export interface Env {
  MAILIAS_DOMAIN: string;
  MAILIAS_FORWARD_TO: string;
  MAILIAS_KEY: string;
}

export interface ForwardableEmailMessage {
  readonly to: string;
  forward(recipient: string, headers?: Headers): Promise<unknown>;
}

interface EmailHandler<Bindings> {
  email(
    message: ForwardableEmailMessage,
    env: Bindings,
    context: unknown,
  ): Promise<void>;
}

const handler = {
  async email(message, env, _context): Promise<void> {
    try {
      requireBinding(env.MAILIAS_DOMAIN, "MAILIAS_DOMAIN");
      requireBinding(env.MAILIAS_FORWARD_TO, "MAILIAS_FORWARD_TO");
      requireBinding(env.MAILIAS_KEY, "MAILIAS_KEY");

      const verified = await verifyAddress(
        env.MAILIAS_KEY,
        env.MAILIAS_DOMAIN,
        message.to,
      );
      if (verified === null) {
        return;
      }

      const headers = new Headers();
      headers.set("X-Mailias-Label", verified.label);
      headers.set("X-Mailias-Version", "1");
      await message.forward(env.MAILIAS_FORWARD_TO, headers);
    } catch {
      // Fail closed. Do not reject, forward, or expose configuration details.
      console.error("mailias: verification failed closed");
    }
  },
} satisfies EmailHandler<Env>;

export default handler;

function requireBinding(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is not configured`);
  }
}
