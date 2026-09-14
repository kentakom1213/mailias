# mailias v1セットアップ

mailiasを利用するには，ChromeまたはFirefox拡張，Cloudflareアカウント，Cloudflareで管理しているドメイン，パスワードマネージャーが必要です．初回設定の目安は約10分です．

## 事前に決めるもの

次の2点を用意します．

- `m.example.com`など，メールエイリアスに使うドメイン
- 転送メールを受け取るメールアドレス

パスワードマネージャーに保存するキーが，唯一の復旧元です．拡張に保存したキーはエクスポートできず，CloudflareのWorker Secretも設定後には読み戻せません．パスワードマネージャーの項目と拡張データを両方失うと，既存エイリアスを復旧できません．

## 1．拡張をインストールする

Chrome版またはFirefox版をインストールし，拡張のSettings画面を開きます．開発中は`pnpm package:extensions`でビルドし，`dist/chrome`または`dist/firefox`を各ブラウザへ読み込みます．

## 2．復旧キーを生成して保存を確認する

1. 拡張のSettings画面へメール用ドメインを入力します．
2. **Generate recovery key**を選びます．
3. 表示されたキーをパスワードマネージャーへ保存します．
4. **I saved it in my password manager**を選びます．拡張上のキー表示が消去されます．
5. パスワードマネージャーからキーを取得し，拡張へ貼り戻します．
6. **Verify backup and finish setup**を選びます．

貼り戻しによる一致確認は必須です．設定完了後，拡張から復旧キーを表示・コピーすることはできません．

## 3．Cloudflareで転送先を確認する

CloudflareのEmail Routingで，転送先にするメールアドレスを追加します．Cloudflareから届く確認メールを開き，転送先の確認を完了してください．

## 4．Workerをデプロイする

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kentakom1213/mailias)

ボタンを押すと，次の処理が行われます．

1. Cloudflareが公開リポジトリ`kentakom1213/mailias`を利用者自身のGitHubアカウントへcloneします．
2. clone先のリポジトリ名とWorker名を選びます．
3. CloudflareがWorker設定を読み，必要なsecretの入力画面を表示します．
4. cloneされたリポジトリからWorkerをビルドしてデプロイします．

Cloudflareの設定画面では，次の値を入力します．

| 名前 | 入力する値 |
|---|---|
| `MAILIAS_SECRET` | パスワードマネージャーから復旧キーを取得して貼り付けます． |
| `FORWARD_TO` | 手順3で確認した転送先メールアドレスを入力します． |

これらはCloudflare Worker Secretとして保存され，cloneされたGitHubリポジトリには書き込まれません．`wrangler.jsonc`，`.env`，GitHub Actions，Issue，ビルドログにも入力しないでください．

## 5．Email RoutingをWorkerへ接続する

CloudflareのEmail Routingで次の操作を行います．

1. メール用ドメインを選びます．
2. Email Routingが無効なら有効化します．
3. catch-allのアクションを**Send to a Worker**にします．
4. 手順4でデプロイしたmailias Workerを選びます．
5. ルールを保存します．

Workerをデプロイしただけでは，catch-allルールは作成されません．Email Routingの設定は別途必要です．

## 6．拡張をWorkerへ接続する

1. `https://mailias.example.workers.dev`のようなデプロイ済みWorker URLをコピーします．
2. 拡張のSettings画面を開きます．
3. **Cloudflare Worker**へURLを貼り付けて保存します．
4. ブラウザが確認したら，そのWorker originへのアクセスを許可します．
5. **Check setup**を選びます．

Workerへ到達できること，2つのWorker Secretが設定済みであること，Workerと拡張の`keyId`が一致することを確認します．一致しない場合は，拡張とWorkerで復旧キーまたはドメインが異なります．

## 7．テストメールを送る

1. 拡張のpopupを開きます．
2. `setup-test`などのラベルを入力します．
3. 生成されたエイリアスをコピーします．
4. 別のメールアカウントからエイリアスへ送信します．
5. `FORWARD_TO`へ届くことを確認します．

health checkだけではEmail Routingの接続を確認できないため，テストメールは必須です．

## 拡張を再インストール・移行する場合

拡張の**Restore existing setup**を選び，ドメインとパスワードマネージャー内の復旧キーを入力します．同じドメインとキーを使えば，ChromeとFirefoxのどちらでも同じエイリアスを生成できます．

## 特定のエイリアスを停止する場合

mailias v1は内部に失効リストを持ちません．漏洩したエイリアスだけを停止するには，その完全なアドレスに一致するCloudflare Email Routingルールを追加し，アクションを**Drop**にします．ほかのエイリアス向けのcatch-allルールは維持します．

`MAILIAS_SECRET`を変更すると，既存エイリアスがすべて無効になります．設定全体を置き換える場合にだけ行ってください．

## リポジトリ所有者がデプロイする場合

Deploy to Cloudflareボタンは，利用者のGitHubへcloneを作る第三者向けの導線です．`kentakom1213/mailias`の所有者は，GitHubに`CLOUDFLARE_API_TOKEN`と`CLOUDFLARE_ACCOUNT_ID`を設定し，手動の**Deploy Worker** Actions workflowから既存リポジトリをデプロイできます．`MAILIAS_SECRET`と`FORWARD_TO`は，この場合もCloudflare Worker Secretとして直接設定します．
