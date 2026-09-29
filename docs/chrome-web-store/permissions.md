# Privacy practices (Developer Dashboard)

## Single purpose

Spark helps you understand and act on the web page you're looking at: it explains, summarizes, rewrites or saves text you select, and finds (or clicks) the exact control you ask about, through ShuaCrew, the companion app running on your own Mac.

## Permission justifications

**`storage`**
Keeps the pairing key that connects Spark to ShuaCrew on this Mac, and your "offer to summarize long reads" setting. Stored in `chrome.storage.local`, in this browser profile only.

**`contextMenus`**
Adds "Explain / Summarize / Rewrite / Reply / Save with Spark" to the right-click menu on a selection, and "Summarize this page with Spark" on the page.

**`activeTab`**
When you pick a Spark action (menu, popup or ⌥⇧S), Spark works on the tab you're looking at: it opens its answer card there and reads the selection or page text you asked about.

**`alarms`**
Wakes the background worker every 30 seconds to check in with ShuaCrew on this Mac, so that when you ask Spark on your Mac to find or click something on the current page, the request reaches the page. Without it, Manifest V3 suspends the worker and those requests are lost.

**Host permission `http://127.0.0.1:7420/*`**
The only address the extension talks to: ShuaCrew on your own computer (localhost). It is where your requests go and answers come from. No other server is contacted.

**Content script on `http://*/*` and `https://*/*`**
Spark has to work on whatever page you're reading. On its own, it only checks the page's text length so it can offer to summarize long reads (on the page itself, sending nothing; this can be turned off). When you use it, it:
- shows the answer card for the text you selected;
- reads the page's text when you ask for a summary;
- when you ask Spark on your Mac to find, point at, click or type into something, looks up that control by its accessible name and returns its name and position (or does the click or typing you asked for).

It runs in a closed shadow root, so it doesn't change how pages look or behave, and it sends nothing on its own.

**Remote code:** No. All code ships in the package; nothing is fetched or evaluated at runtime.

## Data usage (the checkboxes)

Collected, only when you use a feature, and only sent to ShuaCrew on your own Mac:
- **Website content**: the text you select, or a page's text when you ask for a summary, with the page URL and title. Also the names and positions of the controls you ask Spark to find.

Not collected: personally identifiable information, health, financial, authentication, personal communications, location, web history, or user activity (no keystroke or click logging).

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.
