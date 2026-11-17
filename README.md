# Ahmed Wazir app

Ahmed Wazir's UAE property app for Android (iOS next). Light by day, dark at night.

- **Client mode** (default): profile with one-tap WhatsApp, call, booking and email; project catalogue with search, filters and a satellite map; native calculators (payment plan, total cost, mortgage, rental yield, return on equity, resale, buy vs rent, Golden Visa, converter); buyer guides; market data, dirham rates, UAE calendar and headlines.
- **Broker mode** (PIN): leads and follow-ups, message templates, shortlist builder, project finder, cost sheet, plan quote, commission, market brief, deal checklists, credentials card, backup.

## Data

| File | What | Refreshed by |
|---|---|---|
| `docs/data.js`, `docs/site.html`, `docs/logos.js` | Website data (launches, market, news, FX, holidays, rules) and the website itself in app mode, for the guides | `tools/sync_from_site.py <website.html> docs` |
| `docs/data/projects.json` | Full Reelly catalogue (1,200+ projects), shared with the website's Property search | `sync_from_site.py` copies it from the website |
| `docs/reelly.js` | Reelly flags: new launches (EOI, start of sales, announced) and on-sale projects from Emaar, Nakheel, Meraas, Wasl, Imtiaz, DAMAC, Modon, Aldar, Beyond, Omniyat, Reportage and Azizi | `tools/build_reelly.py docs/reelly.js <saved Reelly search results...>` |

The Android app is a thin shell that loads https://ahmedwazir93.github.io/awaz-app/ and keeps an offline copy, so content updates reach phones without a new APK.

## Install on a phone

Open **github.com/ahmedwazir93/awaz-app/releases/latest** on the phone, tap `Ahmed-Wazir.apk`, allow installs from your browser, install. It installs over the earlier version and keeps leads and settings.

## Signing

Builds use the test key `android/app/awaz-test.jks` so updates install over each other. Before publishing on Google Play, add a private key as the `KEYSTORE_B64`, `KS_PASS` and `KS_ALIAS` repository secrets; the workflow uses it automatically.

Leads, templates and checklists live only on the phone; back them up from Broker > Settings.
