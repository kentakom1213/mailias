# Set up mailias v1

mailias requires a Chrome or Firefox extension，a Cloudflare account，a domain managed by Cloudflare，and a password manager．Start setup from the extension Settings page．

The Settings page is the setup home．When every setup status is complete，the setup view is hidden and only alias management is shown．The setup view does not return unless you reset the extension．

## 1．Install the extension

Install the Chrome or Firefox extension and open its Settings page．During development，build the packages with `pnpm package:extensions` and load `dist/chrome` or `dist/firefox`．

## 2．Create the recovery key

Follow the Settings page to enter the mail domain，generate the recovery key，and save it manually in your password manager．

After this step，the extension cannot display or export the recovery key．The password-manager copy is the only supported recovery source．

## 3．Deploy the Worker

Use **Deploy to Cloudflare** from the extension Settings page．The first Worker deployment is allowed to complete before `MAILIAS_SECRET` and `MY_ADDRESS` are configured．

After deployment，configure these runtime bindings in Cloudflare:

- `MAILIAS_SECRET`: the recovery key from your password manager，configured as a Secret
- `MY_ADDRESS`: your own destination inbox address already verified in Cloudflare Email Routing，configured as a normal Variable

`MY_ADDRESS` is not a secret．Do not put `MAILIAS_SECRET` in the GitHub repository or build logs．

## 4．Connect the extension to the Worker

In Cloudflare，enable the Worker's `workers.dev` domain or add a Custom Domain so the Worker has a public HTTPS URL．Copy the deployed Worker origin，for example `https://mailias.example.workers.dev`，into the extension Settings page and save it．Grant origin access when the browser asks．

The extension calls `/health` to check:

- that the Worker is reachable
- that `MAILIAS_SECRET` is configured
- that `MY_ADDRESS` is configured
- that the Worker `keyId` matches the extension `keyId`

The Worker's normal web page is intentionally minimal; setup and alias management are handled by the browser extension．

## 5．Connect Email Routing

In Cloudflare Email Routing，add the mail subdomain first if you use one，then route that mail domain's catch-all to the mailias Worker．Because `/health` cannot verify that rule，select **I configured Email Routing** in the extension after saving the rule．

## 6．Finish setup

Select **Check and finish setup** in the extension．When every status passes，the extension persists setup completion and hides the setup UI．From then on，the Settings page shows alias management only．

This remains true until reset．A temporary Worker outage does not automatically bring the setup UI back．

## Test delivery

After setup，generate an alias such as `setup-test` in the popup，send mail to it from another account，and confirm that it reaches the address configured as `MY_ADDRESS`．

## Recovery

After reset or on a new browser，choose **Restore existing setup** and enter the mail domain and recovery key from your password manager．The same domain and key reproduce the same aliases．

## Revoke one alias

mailias v1 has no internal revocation list．To stop one leaked alias，add an exact-address Cloudflare Email Routing rule for that address and choose **Drop**．

Changing `MAILIAS_SECRET` invalidates every existing alias and should be reserved for replacing the whole configuration．
