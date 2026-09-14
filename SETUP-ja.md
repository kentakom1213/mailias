# mailias v1セットアップ

mailiasを利用するには，ChromeまたはFirefox拡張，Cloudflareアカウント，Cloudflareで管理しているドメイン，パスワードマネージャーが必要です．初回設定は拡張のSettings画面から進めます．

拡張のSettings画面がセットアップの起点です．各ステータスがすべて完了すると，初期設定画面は非表示になり，以後はエイリアス管理画面だけが表示されます．初期設定画面を再表示するにはResetが必要です．

## 1．拡張をインストールする

Chrome版またはFirefox版をインストールし，Settings画面を開きます．開発中は`pnpm package:extensions`でビルドし，`dist/chrome`または`dist/firefox`を各ブラウザへ読み込みます．

## 2．復旧キーを生成する

Settings画面の案内に従い，メール用ドメインを入力して復旧キーを生成します．表示されたキーをコピーし，パスワードマネージャーへ手動で保存します．

設定完了後，拡張から復旧キーを表示・コピーすることはできません．パスワードマネージャーに保存した値が唯一の復旧元です．

## 3．Workerをデプロイする

Settings画面の**Deploy to Cloudflare**からWorkerをデプロイします．初回デプロイでは`MAILIAS_SECRET`と`MY_ADDRESS`が未設定でもWorkerを起動できます．

デプロイ後，Cloudflareで次のruntime bindingを設定します．

- `MAILIAS_SECRET`: パスワードマネージャーに保存した復旧キー．Secretとして設定します．
- `MY_ADDRESS`: 実際にメールを受け取りたい自分の転送先メールアドレス．通常のVariableとして設定します．

`MY_ADDRESS`はSecretではありません．`MAILIAS_SECRET`はGitHubリポジトリやビルドログへ書き込まないでください．

## 4．Worker URLを拡張へ登録する

CloudflareでWorkerの`workers.dev`ドメインを有効にするかCustom Domainを追加し，公開HTTPS URLを用意します．デプロイ済みWorkerのURL，例えば`https://mailias.example.workers.dev`をSettings画面へ入力して保存します．ブラウザが確認した場合は，そのWorker originへのアクセスを許可します．

拡張は`/health`を使い，次の状態を確認します．

- Workerへ到達できること
- `MAILIAS_SECRET`が設定済みであること
- `MY_ADDRESS`が設定済みであること
- Workerの`keyId`と拡張の`keyId`が一致すること

Workerの通常Webページは意図的に最小限にしています．初期設定とエイリアス管理はブラウザ拡張から行います．

## 5．Email Routingを接続する

Cloudflare Email Routingで，サブドメインを使う場合は先にそのサブドメインを追加し，その後メール用ドメインのcatch-allをmailias Workerへ送るよう設定します．この設定は`/health`から確認できないため，保存後にSettings画面の**I configured Email Routing**を選びます．

## 6．初期設定を完了する

Settings画面の**Check and finish setup**を実行します．すべてのステータスが完了すると，初期設定状態が拡張に保存され，初期設定画面は非表示になります．以後はエイリアス管理画面だけが表示されます．

この状態はResetするまで維持されます．Workerが一時的に停止した場合でも，初期設定画面へ自動的に戻ることはありません．

## テストメール

初期設定後，popupから`setup-test`などのラベルでエイリアスを生成し，別のメールアカウントから送信して`MY_ADDRESS`に設定した自分のメールアドレスへ届くことを確認してください．

## 拡張を再インストール・移行する場合

Reset後または新しいブラウザでは，**Restore existing setup**からメール用ドメインとパスワードマネージャー内の復旧キーを入力します．同じドメインとキーを使えば，同じエイリアスを再生成できます．

## 特定のエイリアスを停止する場合

mailias v1は内部に失効リストを持ちません．漏洩したエイリアスだけを停止するには，その完全なアドレスに一致するCloudflare Email Routingルールを追加し，アクションを**Drop**にします．

`MAILIAS_SECRET`を変更すると既存エイリアスがすべて無効になります．設定全体を置き換える場合にだけ行ってください．
