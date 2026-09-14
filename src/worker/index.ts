import { computeKeyId, importSecret, verifyAlias } from "../protocol";

export interface MailiasEnv {
  MAILIAS_SECRET?: string;
  FORWARD_TO?: string;
}

type RuntimeBindings = {
  secret?: string;
  forwardTo?: string;
};

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="mailias"><rect width="128" height="128" rx="28" fill="#F6821F"/><path d="M28 30h72a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="m25 38 39 29 39-29" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 98h50" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="m79 87 13 11-13 11" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

function workerPage(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mailias Worker</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"><style>:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}main{width:min(520px,calc(100% - 40px));padding:32px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:16px;background:color-mix(in srgb,#f6821f 5%,Canvas)}.brand{display:flex;align-items:center;gap:14px}.brand img{width:48px;height:48px}h1{margin:0;color:#f6821f;font-size:26px}p{line-height:1.6;color:color-mix(in srgb,CanvasText 70%,transparent)}</style></head><body><main><div class="brand"><img src="/favicon.svg" alt=""><h1>mailias Worker</h1></div><p>This Worker is running. Use the mailias browser extension to finish setup and manage aliases.</p></main></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    },
  });
}

function favicon(): Response {
  return new Response(ICON_SVG, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
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
    if (request.method === "GET" && url.pathname === "/") {
      return workerPage();
    }
    if (request.method === "GET" && url.pathname === "/favicon.svg") {
      return favicon();
    }
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
