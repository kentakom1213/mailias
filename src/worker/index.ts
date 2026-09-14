import { computeKeyId, importSecret, verifyAlias } from "../protocol";

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

function configuredBindings(env: Env): { secret: boolean; forwardTo: boolean } {
  return {
    secret: typeof env.MAILIAS_SECRET === "string" && env.MAILIAS_SECRET.length > 0,
    forwardTo: typeof env.FORWARD_TO === "string" && env.FORWARD_TO.length > 0,
  };
}

async function health(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const configured = configuredBindings(env);

  if (!domain || !configured.secret) {
    return json({ status: "ok", version: "v1", configured, keyId: null });
  }

  try {
    const key = await importSecret(env.MAILIAS_SECRET);
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return health(request, env);
    }
    return new Response("Not found", { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const configured = configuredBindings(env);
    if (!configured.secret || !configured.forwardTo) {
      console.error(JSON.stringify({ event: "mailias_email_unconfigured" }));
      return;
    }

    try {
      const key = await importSecret(env.MAILIAS_SECRET);
      if (!(await verifyAlias(key, message.to))) return;
      await message.forward(env.FORWARD_TO);
    } catch {
      console.error(JSON.stringify({ event: "mailias_email_error" }));
      throw new Error("mailias email handling failed");
    }
  },
} satisfies ExportedHandler<Env>;
