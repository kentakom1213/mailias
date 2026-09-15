export type SetupLanguage = "en" | "ja";

const japanese: Record<string, string> = {
  "navigation.undo": "直前の設定に戻す",
  "navigation.undoHelp": "Worker URL，メールドメイン，言語，セットアップの確認状態を直前の保存内容に戻します．秘密キーの保存，リセット，エイリアスの対応表は対象外です．",
  "navigation.back": "戻る",
  "navigation.next": "次へ",
  "navigation.keyStored": "秘密キーは保存済みです．保存済みのキーを使って次へ進めます．",
  "navigation.domainLocked": "秘密キーを保存したため，メールドメインは変更できません．",
  "navigation.backupStored": "秘密キーは保存済みです．Worker の設定には，パスワードマネージャーに保存したキーを使ってください．",
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
  "step1.domainInstruction1": "デプロイ後，Cloudflare で Worker を開き，<strong>Domains</strong>（または <strong>Settings → Domains &amp; Routes</strong>）へ移動します．",
  "step1.domainInstruction2": "<code>workers.dev</code> ドメインを有効にするか，Custom Domain を追加してください．拡張機能が <code>/health</code> へアクセスするため，公開 HTTPS URL が必要です．",
  "step1.domainInstruction3": "その URL を通常のブラウザタブで一度開き，下の欄に origin を貼り付けます．",
  "step1.openWorkers": "Workers &amp; Pages を開く",
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
  "step4.help": "リカバリーキーをコピーし，パスワードマネージャーへ手動で保存してください．この保存内容が唯一の復旧元になります．",
  "step4.saved": "パスワードマネージャーに保存しました",

  "step5.kicker": "ステップ 5 / 7",
  "step5.title": "Worker を設定",
  "step5.description": "Cloudflare で Worker を開き，以下の2つのランタイム設定を追加します．",
  "step5.instruction1": "<strong>Workers &amp; Pages</strong> を開き，mailias Worker を選択します．",
  "step5.instruction2": "<strong>Settings → Variables and Secrets</strong> を開きます．",
  "step5.instruction3": "パスワードマネージャーから取り出したリカバリーキーを使い，<code>MAILIAS_SECRET</code> を <strong>Secret</strong> として追加します．",
  "step5.instruction4": "自分の転送先メールアドレスを <code>MY_ADDRESS</code> として通常の <strong>Variable</strong> に追加します．これは Secret ではありません．",
  "step5.instruction5": "Cloudflare で <strong>Deploy</strong> を選択します．",
  "step5.open": "Cloudflare Workers を開く",
  "step5.reachable": "Worker に接続可能",
  "step5.match": "リカバリーキーが一致",
  "step5.check": "Worker の設定を確認",

  "step6.kicker": "ステップ 6 / 7",
  "step6.title": "Email Routing を接続",
  "step6.description": "メールドメインの Email Routing を設定します．転送先アドレスを先に確認し，サブドメインを使う場合は有効化してから，catch-all を mailias Worker に送るよう設定します．",
  "step6.instruction1": "<strong id=\"routing-domain\">メールドメイン</strong> を含む apex domain の Email Routing を開きます．",
  "step6.instruction2": "<strong>Destination Addresses</strong> を開き，<code>MY_ADDRESS</code> に設定したメールアドレスを追加します．Cloudflare から届く確認メールを開き，<strong>Verify email address</strong> を選択して認証を完了します．",
  "step6.instruction3": "<code>m.example.com</code> のようなサブドメインを使う場合は，<strong>Settings → Subdomains</strong> で先に追加し，利用可能になるまで待ちます．",
  "step6.instruction4": "メールドメインの <strong>Routing Rules</strong> を開き，<strong>Catch-all</strong> ルールを有効にします．",
  "step6.instruction5": "Catch-all のアクションを <strong>Send to a Worker</strong> にし，mailias Worker を選択して保存します．",
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