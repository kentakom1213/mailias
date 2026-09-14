import { computeKeyId, importSecret, verifyAlias } from "../protocol";

export interface MailiasEnv {
  MAILIAS_SECRET?: string;
  FORWARD_TO?: string;
}

type RuntimeBindings = {
  secret?: string;
  forwardTo?: string;
};

type PageLanguage = "en" | "ja";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="mailias"><rect width="128" height="128" rx="28" fill="#F6821F"/><path d="M28 30h72a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8Z" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="m25 38 39 29 39-29" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M36 98h50" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="m79 87 13 11-13 11" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SETUP_JS = `const form=document.querySelector("#key-helper");const key=document.querySelector("#recovery-key");const prepare=document.querySelector("#prepare-verify");const verify=document.querySelector("#verify-key");const copy=document.querySelector("#copy-key");const status=document.querySelector("#copy-status");const ja=document.documentElement.lang==="ja";let expectedKey="";let verified=false;const setStatus=(text,kind="")=>{status.textContent=text;status.className=kind;};form?.addEventListener("submit",event=>event.preventDefault());prepare?.addEventListener("click",()=>{if(!(key instanceof HTMLInputElement)||!key.value){setStatus(ja?"先にリカバリーキーを入力してください．":"Enter the recovery key first.","missing");return;}expectedKey=key.value;verified=false;key.value="";if(verify instanceof HTMLButtonElement)verify.disabled=false;if(copy instanceof HTMLButtonElement)copy.disabled=true;key.focus();setStatus(ja?"入力欄を空にしました．パスワードマネージャーからこの欄へリカバリーキーを自動入力し，確認してください．":"The field is now empty. Autofill the recovery key from your password manager, then verify it.");});verify?.addEventListener("click",()=>{if(!(key instanceof HTMLInputElement)||!expectedKey){setStatus(ja?"先に「保存したので復元を確認」を押してください．":"Press ‘I saved it — test restore’ first.","missing");return;}if(!key.value){setStatus(ja?"パスワードマネージャーからリカバリーキーを入力してください．":"Autofill the recovery key from your password manager first.","missing");return;}if(key.value!==expectedKey){verified=false;if(copy instanceof HTMLButtonElement)copy.disabled=true;setStatus(ja?"復元したキーが元のキーと一致しません．パスワードマネージャーの保存内容を確認してください．":"The restored key does not match the original. Check the entry saved in your password manager.","missing");return;}verified=true;if(copy instanceof HTMLButtonElement)copy.disabled=false;setStatus(ja?"バックアップを確認できました．このキーを Cloudflare 用にコピーできます．":"Backup verified. You can now copy this key for Cloudflare.","ok");});key?.addEventListener("input",()=>{if(verified){verified=false;if(copy instanceof HTMLButtonElement)copy.disabled=true;setStatus(ja?"キーが変更されたため，再確認が必要です．":"The key changed, so verification is required again.");}});copy?.addEventListener("click",async()=>{if(!(key instanceof HTMLInputElement)||!verified||!key.value){setStatus(ja?"先にパスワードマネージャーからの復元確認を完了してください．":"Verify the password-manager restore first.","missing");return;}try{await navigator.clipboard.writeText(key.value);setStatus(ja?"確認済みのリカバリーキーをコピーしました．Cloudflare の MAILIAS_SECRET に貼り付けてください．":"Verified recovery key copied. Paste it into MAILIAS_SECRET in Cloudflare.","ok");}catch{setStatus(ja?"リカバリーキーをコピーできませんでした．":"Could not copy the recovery key.","missing");}});`;

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

function workerPage(env: MailiasEnv, language: PageLanguage): Response {
  const configured = configuredBindings(runtimeBindings(env));
  const ja = language === "ja";
  const text = ja
    ? {
        title: "mailias Worker セットアップ補助",
        subtitle: "このページは，リカバリーキーをパスワードマネージャーへ保存・復元確認してから Cloudflare に設定するための補助ページです．",
        languageLink: "English",
        languageHref: "/",
        runtimeTitle: "Worker の設定状態",
        configured: "設定済み",
        missing: "未設定",
        openCloudflare: "Cloudflare Workers を開く",
        helperTitle: "リカバリーキーをバックアップして Cloudflare に設定する",
        helperIntro: "パスワードマネージャーの保存ダイアログは Web ページ側から確実に起動できません．この通常の HTTPS ページをパスワードマネージャーのブラウザ拡張から手動保存し，実際に復元できることを確認してから Cloudflare へ進みます．",
        step1: "拡張機能で生成したリカバリーキーを下の欄へ貼り付けます．既存環境を復元する場合はパスワードマネージャーから入力します．",
        step2: "パスワードマネージャーのブラウザ拡張を開き，このページのログイン情報として保存します．mailias 自身が保存するわけではありません．",
        step3: "「保存したので復元を確認」を押します．入力欄が空になるので，パスワードマネージャーからもう一度自動入力し，「復元したキーを確認」を押します．",
        step4: "一致を確認できたら「確認済みキーをコピー」を押し，Cloudflare の Worker Settings → Variables and Secrets で MAILIAS_SECRET を Secret として追加します．",
        step5: "FORWARD_TO には転送先メールアドレスを通常の Variable として追加します．これは Secret ではありません．",
        privacy: "リカバリーキーは Worker へ送信されず，mailias にも永続保存されません．復元確認中の元のキーはこのページの JavaScript メモリにだけ一時保持され，ページを再読み込みすると失われます．",
        entryName: "パスワードマネージャーのエントリ名",
        recoveryKey: "リカバリーキー",
        prepareVerify: "保存したので復元を確認",
        verify: "復元したキーを確認",
        copy: "確認済みキーをコピー",
        after: "バックアップ確認後，コピーした値を Cloudflare の MAILIAS_SECRET に貼り付けてください．FORWARD_TO は別途，通常の Variable として設定します．",
      }
    : {
        title: "mailias Worker setup helper",
        subtitle: "Use this page to back up the recovery key, verify that your password manager can restore it, and then configure Cloudflare.",
        languageLink: "日本語",
        languageHref: "/ja",
        runtimeTitle: "Worker configuration status",
        configured: "Configured",
        missing: "Missing",
        openCloudflare: "Open Cloudflare Workers",
        helperTitle: "Back up the recovery key and configure Cloudflare",
        helperIntro: "A web page cannot reliably trigger every password manager's save dialog. Save this normal HTTPS page manually from your password manager's browser extension, then verify that the saved key can actually be restored before continuing to Cloudflare.",
        step1: "Paste the recovery key generated by the extension into the field below. When restoring an existing setup, fill it from your password manager.",
        step2: "Open your password manager's browser extension and save this page as a login. mailias itself does not save the entry.",
        step3: "Press ‘I saved it — test restore’. The field is cleared; autofill it again from your password manager and press ‘Verify restored key’.",
        step4: "After the values match, press ‘Copy verified key’. In Cloudflare Worker Settings → Variables and Secrets, add MAILIAS_SECRET as a Secret and paste it.",
        step5: "Add FORWARD_TO separately as a normal Variable containing your forwarding email address. It is not a secret.",
        privacy: "The recovery key is never submitted to the Worker or persistently stored by mailias. During verification, the original key exists only temporarily in this page's JavaScript memory and disappears when the page is reloaded.",
        entryName: "Password-manager entry name",
        recoveryKey: "Recovery key",
        prepareVerify: "I saved it — test restore",
        verify: "Verify restored key",
        copy: "Copy verified key",
        after: "After backup verification, paste the copied value into MAILIAS_SECRET in Cloudflare. Configure FORWARD_TO separately as a normal Variable.",
      };

  const mark = (ready: boolean) => ready ? text.configured : text.missing;
  const stateClass = (ready: boolean) => ready ? "ok" : "missing";
  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${text.title}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark;--orange:#f6821f}*{box-sizing:border-box}body{margin:0;background:Canvas;color:CanvasText}main{width:min(760px,calc(100% - 32px));margin:40px auto 80px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.brand{display:flex;align-items:center;gap:14px}.brand img{width:48px;height:48px}h1{margin:0;color:var(--orange);font-size:26px}h2{margin:0 0 10px;font-size:18px}p,li{line-height:1.65;color:color-mix(in srgb,CanvasText 72%,transparent)}section{margin-top:24px;padding:20px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:14px;background:color-mix(in srgb,var(--orange) 4%,Canvas)}ol{padding-left:22px}.status-row{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-top:1px solid color-mix(in srgb,CanvasText 10%,transparent)}.status-row:first-of-type{border-top:0}.ok{color:#237a3b;font-weight:700}.missing{color:#b42318;font-weight:700}label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}input{width:100%;padding:10px 11px;border:1px solid color-mix(in srgb,CanvasText 24%,transparent);border-radius:8px;background:Field;color:FieldText;font:inherit}button,a.button{display:inline-block;margin-top:12px;padding:9px 12px;border:1px solid var(--orange);border-radius:8px;background:var(--orange);color:white;text-decoration:none;font:inherit;cursor:pointer}button:disabled{cursor:default;opacity:.45}.note{font-size:13px}.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.actions{display:flex;flex-wrap:wrap;gap:8px}.actions .button,.actions button{margin-top:12px}.secondary{background:transparent!important;color:CanvasText!important;border-color:color-mix(in srgb,CanvasText 22%,transparent)!important}.language-link{font-size:13px;color:var(--orange);text-decoration:none;font-weight:700}#copy-status{min-height:20px;margin-top:10px;font-size:13px}.privacy{padding:12px 14px;border-radius:9px;background:color-mix(in srgb,var(--orange) 10%,Canvas);font-size:13px}@media(max-width:560px){.top{flex-direction:column}.status-row{align-items:flex-start;flex-direction:column;gap:3px}}
</style>
</head>
<body><main>
<div class="top"><div class="brand"><img src="/favicon.svg" alt=""><div><h1>${text.title}</h1><p>${text.subtitle}</p></div></div><a class="language-link" href="${text.languageHref}">${text.languageLink}</a></div>
<section><h2>${text.runtimeTitle}</h2><div class="status-row"><span><span class="code">MAILIAS_SECRET</span> (Secret)</span><span class="${stateClass(configured.secret)}">${mark(configured.secret)}</span></div><div class="status-row"><span><span class="code">FORWARD_TO</span> (Variable)</span><span class="${stateClass(configured.forwardTo)}">${mark(configured.forwardTo)}</span></div><div class="actions"><a class="button" href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noreferrer">${text.openCloudflare}</a></div></section>
<section><h2>${text.helperTitle}</h2><p>${text.helperIntro}</p><ol><li>${text.step1}</li><li>${text.step2}</li><li>${text.step3}</li><li>${text.step4}</li><li>${text.step5}</li></ol><p class="privacy"><strong>${text.privacy}</strong></p><form id="key-helper" autocomplete="on"><label for="helper-user">${text.entryName}</label><input id="helper-user" name="username" autocomplete="username" value="mailias recovery key"><label for="recovery-key">${text.recoveryKey}</label><input id="recovery-key" name="password" type="password" autocomplete="current-password"><div class="actions"><button id="prepare-verify" type="button" class="secondary">${text.prepareVerify}</button><button id="verify-key" type="button" class="secondary" disabled>${text.verify}</button><button id="copy-key" type="button" disabled>${text.copy}</button></div><div id="copy-status" role="status"></div></form><p class="note">${text.after}</p></section>
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
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/en")) {
      return workerPage(env, "en");
    }
    if (request.method === "GET" && url.pathname === "/ja") {
      return workerPage(env, "ja");
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
      const valid = await verifyAlias(key, message.to);
      console.log(JSON.stringify({ event: "mailias_alias_verification", valid }));
      if (!valid) return;

      console.log(JSON.stringify({ event: "mailias_email_forward_start" }));
      await message.forward(bindings.forwardTo);
      console.log(JSON.stringify({ event: "mailias_email_forward_success" }));
    } catch (error) {
      console.error("mailias email handling failed", error);
      throw error;
    }
  },
} satisfies ExportedHandler<MailiasEnv>;
