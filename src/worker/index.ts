import { computeKeyId, importSecret, verifyAlias } from "../protocol";

export interface MailiasEnv {
  MAILIAS_SECRET?: string;
  MY_ADDRESS?: string;
  /** @deprecated Temporary compatibility with deployments created before MY_ADDRESS. */
  FORWARD_TO?: string;
}

type RuntimeBindings = {
  secret?: string;
  myAddress?: string;
};

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="mailias"><rect x="14" y="26" width="94" height="70" rx="12" fill="#163B67"/><path d="M17 32 61 65a6 6 0 0 0 7 0l37-31" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="95" cy="91" r="28" fill="#1677F0" stroke="#fff" stroke-width="5"/><text x="95" y="105" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="700" fill="#fff">@</text></svg>`;

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

  const configuredAddress =
    typeof env.MY_ADDRESS === "string" && env.MY_ADDRESS.length > 0
      ? env.MY_ADDRESS
      : typeof env.FORWARD_TO === "string" && env.FORWARD_TO.length > 0
        ? env.FORWARD_TO
        : undefined;

  return { secret, myAddress: configuredAddress };
}

function configuredBindings(bindings: RuntimeBindings): { secret: boolean; myAddress: boolean } {
  return {
    secret: bindings.secret !== undefined,
    myAddress: bindings.myAddress !== undefined,
  };
}

function workerPage(language: "en" | "ja"): Response {
  const japanese = language === "ja";
  const title = "mailias Worker";
  const message = japanese
    ? "Worker は稼働しています．初期設定とエイリアス管理は mailias ブラウザ拡張から行ってください．"
    : "The Worker is running. Complete setup and manage aliases from the mailias browser extension.";
  const extensionLabel = japanese ? "ブラウザ拡張を入手" : "Get the browser extension";
  const languageLink = japanese
    ? '<a class="language-link" href="/">English</a>'
    : '<a class="language-link" href="/ja">日本語</a>';

  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark;--orange:#f6821f;--orange-hover:#df6f0f}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}main{width:min(520px,calc(100% - 32px));padding:28px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:16px;background:color-mix(in srgb,var(--orange) 4%,Canvas)}.brand{display:flex;align-items:center;gap:14px}.brand img{width:48px;height:48px}h1{margin:0;color:var(--orange);font-size:26px}p{line-height:1.65;color:color-mix(in srgb,CanvasText 72%,transparent)}a{color:var(--orange);font-weight:700;text-decoration:none}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:20px}.button{display:inline-flex;align-items:center;padding:9px 13px;border-radius:8px;background:var(--orange);color:white}.button:hover{background:var(--orange-hover)}.language-link{font-size:13px}
</style>
</head>
<body><main><div class="brand"><img src="/favicon.svg" alt=""><h1>${title}</h1></div><p>${message}</p><div class="actions"><a class="button" href="https://kentakom1213.github.io/mailias/#setup" target="_blank" rel="noreferrer">${extensionLabel}</a>${languageLink}</div></main></body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
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
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/en")) {
      return workerPage("en");
    }
    if (request.method === "GET" && url.pathname === "/ja") {
      return workerPage("ja");
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
    if (!bindings.secret || !bindings.myAddress) {
      console.error(JSON.stringify({ event: "mailias_email_unconfigured" }));
      return;
    }

    try {
      const key = await importSecret(bindings.secret);
      const valid = await verifyAlias(key, message.to);
      console.log(JSON.stringify({ event: "mailias_alias_verification", valid }));
      if (!valid) return;

      console.log(JSON.stringify({ event: "mailias_email_forward_start" }));
      await message.forward(bindings.myAddress);
      console.log(JSON.stringify({ event: "mailias_email_forward_success" }));
    } catch (error) {
      console.error("mailias email handling failed", error);
      throw error;
    }
  },
} satisfies ExportedHandler<MailiasEnv>;
