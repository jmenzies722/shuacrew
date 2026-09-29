# Spark for ShuaCrew: Chrome Web Store kit

Everything needed to publish `apps/chrome` to the Chrome Web Store. You do the final submit (your Google account, the one-time $5 developer fee).

| File | Where it goes in the Developer Dashboard |
| --- | --- |
| [`listing.md`](listing.md) | Store listing: name, summary, description, category, language |
| [`permissions.md`](permissions.md) | Privacy practices: single purpose, one reason per permission, data use |
| [`privacy-policy.md`](privacy-policy.md) | Host it at a public URL and paste the link into Privacy practices |
| `screenshot-1-explain.png`, `screenshot-2-popup.png` | Store listing → Screenshots (1280×800) |
| `promo-small-440x280.png` | Store listing → Small promo tile (440×280) |
| `apps/chrome/icons/128.png` | Store icon (128×128, transparent corners) |

## Submit

1. Build the upload: `cd apps/chrome && zip -r ../../spark-for-shuacrew-$(jq -r .version manifest.json).zip . -x '.*'`
2. <https://chrome.google.com/webstore/devconsole> → **New item** → upload the zip.
3. Fill **Store listing** from `listing.md` and upload the images.
4. Fill **Privacy practices** from `permissions.md`, and paste the privacy policy URL.
5. **Distribution**: Public or Unlisted. Unlisted is a good first step, since Spark only works with ShuaCrew.
6. **Submit for review**. Reviews usually take a few days. A content script on all sites often means a longer review; the justifications in `permissions.md` are written for that.

## Before each new version

- Bump `version` in `apps/chrome/manifest.json`. The store rejects a version it has already seen.
- Re-run the end-to-end check (a real extension in headless Chromium against the running gateway): paired, type, click and locate all work, and the answer card fits on screen.
