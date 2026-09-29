// Spark for ShuaCrew — the only part that talks to your Mac. It reaches the local ShuaCrew gateway
// (127.0.0.1 only) with the pairing key you pasted; pages never see the key or the gateway.
const BASE = "http://127.0.0.1:7420";

async function call(path, body) {
  const { key } = await chrome.storage.local.get("key");
  if (!key) return { error: "Pair Spark first: click the Spark icon and paste the key from ShuaCrew → Settings → Spark." };
  try {
    const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", "X-ShuaCrew-Key": key }, body: JSON.stringify(body ?? {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || `ShuaCrew answered ${r.status}` };
    return data;
  } catch {
    return { error: "Can't reach ShuaCrew. Is the app running on this Mac?" };
  }
}

const ROUTES = { act: "/api/ext/act", save: "/api/ext/save", crew: "/api/ext/crew", ping: "/api/ext/ping" };
chrome.runtime.onMessage.addListener((message, _sender, send) => {
  const path = ROUTES[message?.type];
  if (!path) return false;
  call(path, message.body).then(send);
  return true; // answered asynchronously
});

const MENU = [
  ["explain", "Explain with Spark"],
  ["summarize", "Summarize with Spark"],
  ["rewrite", "Rewrite with Spark"],
  ["reply", "Draft a reply with Spark"],
];
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title] of MENU) chrome.contextMenus.create({ id, title, contexts: ["selection"] });
    chrome.contextMenus.create({ id: "page", title: "Summarize this page with Spark", contexts: ["page"] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "open", action: info.menuItemId, text: info.selectionText || "" }).catch(() => {});
});
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "spark-open") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "open" }).catch(() => {});
});

// Spark → this page, precisely: ShuaCrew asks to find, click or type into an element by what it's called; the page
// script does it on the real element and answers with its exact screen position. A long poll keeps this listening;
// an alarm restarts it after Chrome puts the worker to sleep.
let pumping = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function inActiveTab(command) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { found: false, error: "No page is open in Chrome." };
  try { return (await chrome.tabs.sendMessage(tab.id, { type: "spark-web", command })) ?? { found: false, error: "The page didn't answer." }; }
  catch { return { found: false, error: "Spark can't reach this page (Chrome's own pages and the Web Store are off-limits)." }; }
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const r = await call("/api/ext/next", {});
      if (r?.error) { await sleep(5000); continue; }
      if (r?.command) await call("/api/ext/result", { id: r.command.id, result: await inActiveTab(r.command) });
    }
  } finally { pumping = false; }
}
chrome.alarms.create("spark-web", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => void pump());
chrome.runtime.onStartup.addListener(() => void pump());
void pump();
