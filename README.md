# AWaz Realty app

Ahmed Wazir's UAE property toolkit for Android (iOS next).

- **Client mode** (default): the website's calculators and buyer guides, launches, weekly market data, FX, headlines, contact and socials.
- **Broker mode** (PIN): leads and follow-ups, message templates, client cost sheet, payment plan quote, commission, market brief, deal checklists, converter, credentials card.

## How it stays in sync

```
claude.ai website (daily refresh 7:41am Dubai)
        │  tools/sync_from_site.py
        ▼
docs/  ── GitHub Pages ──►  https://ahmedwazir93.github.io/awaz-app/
                                   ▲
Android app (thin WebView shell) ──┘  loads it, caches it for offline use
```

- `docs/site.html` is the website in "app mode", so every calculator and guide matches the site exactly.
- `docs/data.js` holds launches, market pulse, ticker, news, FX and buyer rules from the site's data blocks.
- The APK rarely needs rebuilding: content updates reach phones on next open.

Sync by hand: `python3 tools/sync_from_site.py <website.html> docs`

## Install on a phone

Open **github.com/ahmedwazir93/awaz-app/releases/latest** on the phone, tap `AWaz-Realty.apk`, allow installs from your browser, install.

## Signing

Builds use the test key `android/app/awaz-test.jks` so updates install over each other. Before publishing on Google Play, add a private key as the `KEYSTORE_B64`, `KS_PASS` and `KS_ALIAS` repository secrets; the workflow uses it automatically.

Leads, templates and checklists live only on the phone (local storage); back them up from Broker → Settings.
