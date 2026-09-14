export type SetupLanguage = "en" | "ja";

const japanese: Record<string, string> = {
  "page.subtitle": "拡張機能の設定",
  "progress.title": "セットアップの進捗",
  "progress.worker": "Worker を接続",
  "progress.domain": "メールドメイン",
  "progress.key": "リカバリーキー",
  "progress.backup": "キーをバックアップ",
  "progress.configure": "Worker を設定",
  "progress.routing": "Email Routing",
  "progress.final": "最終確認",

  "step1.kicker": "ステップ 1 / 7",
  "step1.title": "Worker を接続",
  "step1.description": "まず mailias を Cloudflare にデプロイし，その後 Worker の URL をここに貼り付けます．拡張機能に Cloudflare API トークンを保存する必要はありません．",
  "step1.deploy": "Cloudflare にデプロイ",
  "step1.workerUrl": "Worker URL",
  "step1.connect": "Worker を接続",

  "step2.kicker": "ステップ 2 / 7",
  "step2.title": "メールドメインを選択",
  "step2.description": "mailias のアドレスを受信するドメインを入力します．例：<code>m.example.com</code>",
  "step2.domain": "メールドメイン",
  "step2.save": "ドメインを保存",

  "step3.kicker": "ステップ 3 / 7",
  "step3.title": "リカバリーキーを設定",
  "step3.description": "新しく使い始める場合はキーを生成し，既存環境を復元する場合はパスワードマネージャーからキーを入力します．",
  "step3.newTitle": "新規セットアップ",
  "step3.newDescription": "この拡張機能内でランダムなリカバリーキーを生成します．",
  "step3.generate": "新しいキーを生成",
  "step3.restoreTitle": "既存セットアップを復元",
  "step3.restoreDescription": "パスワードマネージャーに保存済みのリカバリーキーを貼り付けます．",
  "step3.recoveryKey": "リカバリーキー",
  "step3.restore": "既存のキーを使う",

  "step4.kicker": "ステップ 4 / 7",
  "step4.title": "リカバリーキーをバックアップ",
  "step4.description": "続行する前に，このキーをパスワードマネージャーへ保存してください．このステップの後，拡張機能にはエクスポートできないキーだけが保存されます．",
  "step4.warning": "<strong>mailias が生のリカバリーキーを表示するのは今回だけです．</strong>",
  "step4.recoveryKey": "リカバリーキー",
  "step4.copy": "コピー",
  "step4.help": "今ここでパスワードマネージャーに登録してください．次のステップでそこからキーを取り出し，Cloudflare に貼り付けます．",
  "step4.saved": "パスワードマネージャーに保存しました",

  "step5.kicker": "ステップ 5 / 7",
  "step5.title": "Worker を設定",
  "step5.description": "Cloudflare で Worker を開き，以下の2つのランタイム設定を追加します．ここでパスワードマネージャーからリカバリーキーを取り出すことで，バックアップが使えることも確認できます．",
  "step5.instruction1": "<strong>Workers &amp; Pages</strong> を開き，mailias Worker を選択します．",
  "step5.instruction2": "<strong>Settings → Variables and Secrets</strong> を開きます．",
  "step5.instruction3": "パスワードマネージャーから取り出したリカバリーキーを使い，<code>MAILIAS_SECRET</code> を <strong>Secret</strong> として追加します．",
  "step5.instruction4": "確認済みの転送先メールアドレスを <code>FORWARD_TO</code> として追加します．",
  "step5.instruction5": "Cloudflare で <strong>Deploy</strong> を選択します．",
  "step5.open": "Cloudflare Workers を開く",
  "step5.reachable": "Worker に接続可能",
  "step5.match": "リカバリーキーが一致",
  "step5.check": "Worker の設定を確認",

  "step6.kicker": "ステップ 6 / 7",
  "step6.title": "Email Routing を接続",
  "step6.description": "Cloudflare Email Routing で，メールドメインの catch-all を mailias Worker に送るよう設定します．このルールは <code>/health</code> から確認できないため，保存後にここで確認します．",
  "step6.instruction1": "<strong id=\"routing-domain\">メールドメイン</strong> の Email Routing を開きます．",
  "step6.instruction2": "catch-all のアクションを <strong>Send to a Worker</strong> にします．",
  "step6.instruction3": "mailias Worker を選択してルールを保存します．",
  "step6.open": "Email Routing を開く",
  "step6.confirm": "Email Routing を設定しました",

  "step7.kicker": "ステップ 7 / 7",
  "step7.title": "最終確認",
  "step7.description": "完了前に Worker をもう一度確認します．完了後は mailias をリセットするまで，このセットアップ画面は表示されません．",
  "step7.worker": "Worker",
  "step7.domain": "メールドメイン",
  "step7.backup": "リカバリーキーのバックアップ",
  "step7.workerConfig": "Worker の設定",
  "step7.routing": "Email Routing",
  "step7.ready": "準備完了",
  "step7.confirmed": "確認済み",
  "step7.start": "mailias を使い始める",

  "management.title": "エイリアス管理",
  "management.description": "mailias の設定は完了しています．保存済みのサイト / ラベル対応を管理できます．",
  "management.resetTitle": "mailias をリセット",
  "management.resetDescription": "ローカルキー，Worker URL，セットアップ状態，保存済みのサイト / ラベル対応を削除します．復元にはパスワードマネージャーのリカバリーキーが必要です．",
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
