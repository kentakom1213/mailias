import { computeKeyId, importSecret, verifyAlias } from "../protocol";

export interface MailiasEnv {
  MAILIAS_SECRET?: string;
  FORWARD_TO?: string;
}

type RuntimeBindings = {
  secret?: string;
  forwardTo?: string;
};

function json(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

function runtimeBindings(env: MailiasEnv): RuntimeBindings {
  const secret =
    typeof env.MAILIAS_SECRET === "string" && env.MAILIAS_SECRET.length > 0
      ? env.MAILIAS_SECRET
      : undefined;
  const forwardTo =
    typeof env.FORWARD_TO === "string" && env.FORWARD_TO.length > 0
      ? env.FORWARD_TO
      : undefined;
  return { secret, forwardTo };
}

function configuredBindings(bindings: RuntimeBindings): { secret: boolean; forwardTo: boolean } {
  return {
    secret: bindings.secret !== undefined,
    forwardTo: bindings.forwardTo !== undefined,
  };
}

async function health(request: Request, env: MailiasEnv): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const bindings = runtimeBindings(env);
  const configured = configuredBindings(bindings);

  if (!domain || !bindings.secret) {
    return json({ status: "ok", version: "v1", configured, keyId: null });
  }

  try {
    const key = await importSecret(bindings.secret);
    return json({
      status: "ok",
      version: "v1",
      configured,
      keyId: await computeKeyId(key, domain),
    });
  } catch {
    return json({ status: "error", version: "v1", configured, keyId: null }, 500);
  }
}

export default {
  async fetch(request: Request, env: MailiasEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return health(request, env);
    }
    return new Response("Not found", { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: MailiasEnv): Promise<void> {
    const bindings = runtimeBindings(env);
    if (!bindings.secret || !bindings.forwardTo) {
      console.error(JSON.stringify({ event: "mailias_email_unconfigured" }));
      return;
    }

    try {
      const key = await importSecret(bindings.secret);
      if (!(await verifyAlias(key, message.to))) return;
      await message.forward(bindings.forwardTo);
    } catch {
      console.error(JSON.stringify({ event: "mailias_email_error" }));
      throw new Error("mailias email handling failed");
    }
  },
} satisfies ExportedHandler<MailiasEnv>;
