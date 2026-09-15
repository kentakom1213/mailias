export type SetupLanguage = "en" | "ja";

const japanese: Record<string, string> = {
  "navigation.back": "戻る",
  "navigation.keyStored": "秘密キーは保存済みです．保存済みのキーを使って次へ進めます．",
  "navigation.domainLocked": "秘密キーを保存したため，メールドメインは変更できません．",
  "navigation.backupStored": "秘密キーは保存済みです．Worker の設定には，パスワードマネージャーに保存したキーを使ってください．",
  "page.subtitle": "拡張機能の設定",
  "progress.title": "セットアップの進捗",
  "progress.worker": "Worker を接続",
  "progress.domain": "メールドメイン",
  "progress.key": "秘密キー",
  "progress.backup": "キーをバックアップ",
  "progress.configure": "Worker を設定",
  "progress.routing": "Email Routing",
  "progress.final": "最終確認",

  "step1.kicker": "ステップ 1 / 7",
  "step1.title": "Worker を接続",
  "step1.description": "mailias をデプロイし，Worker URL を入力します．",
  "step1.deploy": "Cloudflare にデプロイ",
  "step1.domainInstruction1": "Worker → <strong>Domains</strong>（または <strong>Settings → Domains &amp; Routes</strong>）を開く",
  "step1.domainInstruction2": "<code>workers.dev</code> を有効化，または Custom Domain を追加",
  "step1.domainInstruction3": "HTTPS の URL を下に貼り付ける（パス不要）",
  "step1.openWorkers": "Workers &amp; Pages を開く",
  "step1.workerUrl": "Worker URL",
  "step1.connect": "次に進む",
  "step1.continue": "デプロイを確認せず進む",

  "step2.kicker": "ステップ 2 / 7",
  "step2.title": "メールドメインを選択",
  "step2.description": "エイリアスの受信ドメイン．例：<code>m.example.com</code>",
  "step2.domain": "メールドメイン",
  "step2.save": "ドメインを保存",

  "step3.kicker": "ステップ 3 / 7",
  "step3.title": "秘密キーを設定",
  "step3.newTitle": "新規セットアップ",
  "step3.generate": "新しいキーを生成",
  "step3.restoreTitle": "既存セットアップを復元",
  "step3.restoreDescription": "パスワードマネージャーからキーを貼り付けます．",
  "step3.recoveryKey": "秘密キー",
  "step3.restore": "既存のキーを使う",

  "step4.kicker": "ステップ 4 / 7",
  "step4.title": "秘密キーをバックアップ",
  "step4.description": "キーをコピーし，パスワードマネージャーに保存してください．",
  "step4.warning": "<strong>保存後はキーを再表示できません．</strong>",
  "step4.recoveryKey": "秘密キー",
  "step4.copy": "コピー",
  "step4.saved": "パスワードマネージャーに保存しました",

  "step5.kicker": "ステップ 5 / 7",
  "step5.title": "Worker を設定",
  "step5.instruction1": "<strong>Workers &amp; Pages</strong> で mailias を選択",
  "step5.instruction2": "<strong>Settings → Variables and Secrets</strong> を開く",
  "step5.instruction3": "<code>MAILIAS_SECRET</code> · <strong>Secret</strong>：保存した秘密キー",
  "step5.instruction4": "<code>MY_ADDRESS</code> · <strong>Variable</strong>：転送先メールアドレス",
  "step5.instruction5": "<strong>Deploy</strong> で反映",
  "step5.open": "Cloudflare Workers を開く",
  "step5.reachable": "Worker に接続可能",
  "step5.match": "秘密キーが一致",
  "step5.check": "Worker の設定を確認",

  "step6.kicker": "ステップ 6 / 7",
  "step6.title": "Email Routing を接続",
  "step6.instruction1": "<strong id=\"routing-domain\">メールドメイン</strong> を含むルートドメインで Email Routing を開く",
  "step6.instruction2": "<strong>Destination Addresses</strong>：<code>MY_ADDRESS</code> を追加し，届いたメールで認証",
  "step6.instruction3": "サブドメインの場合：<strong>Settings → Subdomains</strong> に追加し，有効化を待つ",
  "step6.instruction4": "受信ドメインの <strong>Routing Rules → Catch-all</strong> を有効化",
  "step6.instruction5": "<strong>Send to a Worker → mailias</strong> を選んで保存",
  "step6.open": "Email Routing を開く",
  "step6.confirm": "Email Routing を設定しました",

  "step7.kicker": "ステップ 7 / 7",
  "step7.title": "最終確認",
  "step7.description": "Worker を再確認してセットアップを完了します．",
  "step7.worker": "Worker",
  "step7.domain": "メールドメイン",
  "step7.backup": "秘密キーのバックアップ",
  "step7.workerConfig": "Worker の設定",
  "step7.routing": "Email Routing",
  "step7.ready": "準備完了",
  "step7.confirmed": "確認済み",
  "step7.start": "mailias を使い始める",

  "management.title": "エイリアス管理",
  "management.resetTitle": "mailias をリセット",
  "management.resetDescription": "ローカルのキー・設定・ラベルを削除します．復元用の秘密キーをパスワードマネージャーに残してください．",
  "management.reset": "リセット",
};

export function applySetupLanguage(language: SetupLanguage): void {
  document.documentElement.lang = language;
  for (const node of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    if (node.dataset.enHtml === undefined) node.dataset.enHtml = node.innerHTML;
    const key = node.dataset.i18n!;
    node.innerHTML = language === "ja" && japanese[key] !== undefined
      ? japanese[key]
      : node.dataset.enHtml;
  }
}