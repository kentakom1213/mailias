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

const SETUP_JS = `const form=document.querySelector("#key-helper");const key=document.querySelector("#recovery-key");const copy=document.querySelector("#copy-key");const status=document.querySelector("#copy-status");form?.addEventListener("submit",event=>event.preventDefault());copy?.addEventListener("click",async()=>{if(!(key instanceof HTMLInputElement)||!key.value){status.textContent="Enter or autofill the recovery key first.";return;}try{await navigator.clipboard.writeText(key.value);status.textContent="Recovery key copied. Paste it into MAILIAS_SECRET in Cloudflare.";}catch{status.textContent="Could not copy the recovery key.";}});`;

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

function workerPage(env: MailiasEnv): Response {
  const configured = configuredBindings(runtimeBindings(env));
  const mark = (ready: boolean) => ready ? "Configured" : "Missing";
  const stateClass = (ready: boolean) => ready ? "ok" : "missing";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>mailias Worker</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark;--orange:#f6821f}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}main{width:min(720px,calc(100% - 32px));margin:48px auto 80px}.brand{display:flex;align-items:center;gap:14px}.brand img{width:48px;height:48px}h1{margin:0;color:var(--orange);font-size:26px}h2{margin:0 0 10px;font-size:17px}p{line-height:1.6;color:color-mix(in srgb,CanvasText 70%,transparent)}section{margin-top:24px;padding:20px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:14px;background:color-mix(in srgb,var(--orange) 4%,Canvas)}.status-row{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-top:1px solid color-mix(in srgb,CanvasText 10%,transparent)}.status-row:first-of-type{border-top:0}.ok{color:#237a3b;font-weight:700}.missing{color:#b42318;font-weight:700}label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}input{width:100%;padding:10px 11px;border:1px solid color-mix(in srgb,CanvasText 24%,transparent);border-radius:8px;background:Field;color:FieldText;font:inherit}button,a.button{display:inline-block;margin-top:12px;padding:9px 12px;border:1px solid var(--orange);border-radius:8px;background:var(--orange);color:white;text-decoration:none;font:inherit;cursor:pointer}.note{font-size:13px}.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions .button{margin-top:12px}.secondary{background:transparent!important;color:CanvasText!important;border-color:color-mix(in srgb,CanvasText 22%,transparent)!important}#copy-status{min-height:20px;margin-top:8px;font-size:13px}
</style>
</head>
<body><main>
<div class="brand"><img src="/favicon.svg" alt=""><div><h1>mailias Worker</h1><p>This Worker is reachable over HTTPS.</p></div></div>
<section><h2>Runtime configuration</h2><div class="status-row"><span><span class="code">MAILIAS_SECRET</span> (Secret)</span><span class="${stateClass(configured.secret)}">${mark(configured.secret)}</span></div><div class="status-row"><span><span class="code">FORWARD_TO</span> (Variable, not a secret)</span><span class="${stateClass(configured.forwardTo)}">${mark(configured.forwardTo)}</span></div><div class="actions"><a class="button" href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noreferrer">Open Cloudflare Workers</a></div></section>
<section><h2>Password manager helper</h2><p class="note">Browser extensions cannot always use password-manager autofill. This normal HTTPS page can be used as a bridge. <strong>The recovery key entered here is never submitted to the Worker or stored by mailias.</strong> The script only copies it to your clipboard when you press the button.</p><form id="key-helper" autocomplete="on"><label for="helper-user">Entry name</label><input id="helper-user" name="username" autocomplete="username" value="mailias recovery key" readonly><label for="recovery-key">Recovery key</label><input id="recovery-key" name="password" type="password" autocomplete="current-password"><button id="copy-key" type="button">Copy recovery key</button><div id="copy-status" role="status"></div></form><p class="note">Paste the copied value into <span class="code">MAILIAS_SECRET</span> as a Cloudflare <strong>Secret</strong>. Configure <span class="code">FORWARD_TO</span> separately as a normal Variable.</p></section>
</main><script src="/setup.js"></script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function helperScript(): Response {
  return new Response(SETUP_JS, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
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
      return workerPage(env);
    }
    if (request.method === "GET" && url.pathname === "/setup.js") {
      return helperScript();
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
