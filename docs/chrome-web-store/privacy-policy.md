# Spark for ShuaCrew: Privacy Policy

_Last updated: 29 September 2026_

Spark for ShuaCrew ("Spark") is a browser extension that works with ShuaCrew, an app running on your own Mac. This policy explains what Spark handles and where it goes.

## What Spark handles

Only when you use a Spark feature:

- **Text you select**, when you ask Spark to explain, summarize, rewrite, reply to, save, or hand it to your crew.
- **A page's text, URL and title**, when you ask Spark to summarize the page, save something, or hand it to your crew.
- **The names and positions of controls on the page** (for example a button named "Export"), when you ask Spark on your Mac to find, point at, click or type into something. When you ask it to type, it types the text you gave it.

Spark does not track your browsing, record keystrokes or clicks, send pages you haven't asked about, or collect personal information. The one thing it does on its own: it checks, inside the page, how long a page's text is, so it can offer to summarize long reads. Nothing leaves the page unless you tap Summarize, and you can turn the offer off in the popup.

## Where it goes

Everything goes to one place: **ShuaCrew on your own computer**, at `http://127.0.0.1:7420`. Spark has no servers, accounts, analytics or advertising, and the developer receives none of your data.

To answer you, ShuaCrew sends your request to Claude (by Anthropic) through **your own** Claude account, signed in on your Mac. That is covered by your agreement with Anthropic and its privacy policy: <https://www.anthropic.com/legal/privacy>. Things you save (to your ShuaCrew Library) or hand to your crew stay in ShuaCrew on your Mac.

## What's stored

The extension stores two things, in your browser profile only (`chrome.storage.local`): the pairing key that connects it to ShuaCrew, and whether Spark may offer to summarize long reads. To avoid repeating that offer, it also leaves a marker in the tab's session storage, which clears when the tab closes. **Unpair** in the popup deletes the key; removing the extension deletes both.

## Sharing and sale

Your data is never sold, never shared with third parties apart from the Claude request you make through your own account, and never used for advertising, credit or lending decisions, or anything unrelated to Spark's purpose.

## Changes and contact

If this policy changes, the date above changes with it. Questions: jmenzies722@gmail.com.
