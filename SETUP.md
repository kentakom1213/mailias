# Set up mailias v1

mailias requires a Chrome or Firefox extension，a Cloudflare account，a domain managed by Cloudflare，and a password manager．Allow about 10 minutes for the first setup．

## Before you start

Choose:

- A mail domain，such as `m.example.com`．
- A forwarding address you can receive mail at．

The password-manager entry is the only supported recovery source．The extension stores a non-exportable key，and Cloudflare does not reveal a Worker Secret after it is saved．Losing both the password-manager entry and extension data makes every existing alias unrecoverable．

## 1．Install the extension

Install the Chrome or Firefox extension and open its Settings page．During development，build the packages with `pnpm package:extensions` and load the appropriate package from `dist/chrome` or `dist/firefox`．

## 2．Create and verify the recovery key

1. Enter the mail domain in the extension Settings page．
2. Select **Generate recovery key**．
3. Save the displayed key in your password manager．
4. Select **I saved it in my password manager**．The extension clears the displayed value．
5. Retrieve the key from your password manager and paste it back into the extension．
6. Select **Verify backup and finish setup**．

The paste-back check is mandatory．After setup，the extension cannot display or export the recovery key．

## 3．Verify the forwarding destination in Cloudflare

In Cloudflare Email Routing，add the address that should receive forwarded mail．Complete the verification message sent by Cloudflare before continuing．

## 4．Deploy the Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kentakom1213/mailias)

The button performs these actions:

1. Cloudflare clones the public `kentakom1213/mailias` repository into your GitHub account．
2. You choose the cloned repository name and Worker name．
3. Cloudflare reads the Worker configuration and asks for its secrets．
4. Cloudflare builds and deploys the Worker from your cloned repository．

Enter these values on the Cloudflare configuration screen:

| Name | Value |
|---|---|
| `MAILIAS_SECRET` | Retrieve the recovery key from your password manager and paste it here． |
| `FORWARD_TO` | Enter the forwarding address verified in step 3． |

These values are stored as Cloudflare Worker Secrets．They are not written to the cloned GitHub repository．Do not add them to `wrangler.jsonc`，`.env`，GitHub Actions，an issue，or a build log．

## 5．Connect Email Routing

In Cloudflare Email Routing:

1. Select the mail domain．
2. Enable Email Routing if it is not already enabled．
3. Set the catch-all action to **Send to a Worker**．
4. Select the mailias Worker deployed in step 4．
5. Save the rule．

Deploying the Worker does not create this catch-all rule．It must be configured separately．

## 6．Connect the extension to the Worker

1. Copy the deployed Worker URL，such as `https://mailias.example.workers.dev`．
2. Open the extension Settings page．
3. Paste the URL under **Cloudflare Worker** and save it．
4. Grant access to that Worker origin when the browser asks．
5. Select **Check setup**．

The extension should report that the Worker is reachable，both Worker secrets are configured，and the Worker `keyId` matches the extension `keyId`．A mismatch means the extension and Worker have different recovery keys or domains．

## 7．Send a test message

1. Open the extension popup．
2. Enter a label such as `setup-test`．
3. Copy the generated alias．
4. Send a message to it from another account．
5. Confirm that it reaches `FORWARD_TO`．

The health check cannot prove that Email Routing is connected，so the test message is required．

## Recovery

After reinstalling the extension or moving to another browser，choose **Restore existing setup** and enter the domain and recovery key from your password manager．The same domain and key produce the same aliases in Chrome and Firefox．

## Revoke one alias

mailias v1 has no internal revocation list．To stop one leaked alias，add an exact-address Cloudflare Email Routing rule for that complete alias and choose **Drop**．Keep the catch-all rule for all other aliases．

Changing `MAILIAS_SECRET` invalidates every existing alias．Do this only when replacing the entire configuration．

## Repository owners

The Deploy to Cloudflare button is intended for other users，because it creates a clone in their GitHub account．The owner of `kentakom1213/mailias` can deploy the existing repository with the manual **Deploy Worker** GitHub Actions workflow after configuring `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`．`MAILIAS_SECRET` and `FORWARD_TO` should still be configured directly as Cloudflare Worker Secrets．
