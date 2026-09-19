# mailias user guide

[日本語](SETUP-ja.md) · [Website](https://mailias.pwll.dev/)

The extension guides you through setup．This guide covers preparation and tasks outside that setup flow．

## Before you start

You need Chrome or Firefox on a desktop，a Cloudflare account，a domain managed by Cloudflare，and a password manager．Choose:

- A mail domain，such as `m.example.com`，for receiving aliases．This is separate from the Worker's HTTPS URL．
- A destination inbox where forwarded messages should arrive．It must be verified in Cloudflare Email Routing．

Keep the secret key in your password manager．After it is saved in the extension，the original key cannot be displayed or exported again．The extension's backup confirmation does not check your password-manager entry；verify that you saved it correctly．

## Start setup

Install the extension from the [website](https://mailias.pwll.dev/)，open **Settings**，and follow the on-screen instructions．They guide Worker deployment，key creation or restoration，Email Routing，and configuration checks．

After completion，Settings shows alias management．The setup wizard returns only after reset．

## Test delivery

Open a normal HTTP or HTTPS website and open the extension popup．Add a label such as `setup-test` and copy its alias．Send a message from another account and confirm that it reaches your chosen destination inbox．

This delivery test checks the complete mail route；the extension's Worker check cannot verify the Email Routing rule itself．

## Backup and browser migration

Keep two separate backups:

- **Secret key** in your password manager：required to restore alias generation．
- **Mapping export** from Settings：preserves site domains，labels，creation times，and latest copy times．It contains no secret key．

Export mappings before resetting or changing browsers．On the new installation，follow setup using the original mail domain and existing secret key，then import the mappings in Settings．The same mail domain，key，and label reproduce the same address．Restoring the key alone does not restore the saved site/label associations．

Reset deletes local settings，mappings，and the key．It does not remove your Cloudflare configuration or stop existing aliases from receiving mail．

## Stop an alias

Removing a label from the extension only removes its local mapping．To stop delivery to one alias，add an exact-address Cloudflare Email Routing rule with the **Drop** action．

Changing the Worker's `MAILIAS_SECRET` invalidates all existing aliases．Reserve this for replacing the whole configuration．See the [security model](https://github.com/kentakom1213/mailias/blob/main/docs/security-model.md) for the protection limits．
