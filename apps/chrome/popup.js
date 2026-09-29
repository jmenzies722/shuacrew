// Pairing and quick actions. The key lives in chrome.storage.local (this browser profile only).
const $ = (id) => document.getElementById(id);
const status = (text, tone) => { $("status").textContent = text; $("status").className = tone || ""; };

async function refresh() {
  const { key, proactive = true } = await chrome.storage.local.get(["key", "proactive"]);
  $("proactive").checked = proactive;
  $("unpair").hidden = !key;
  if (!key) { $("pair").hidden = false; $("ready").hidden = true; status("Not paired yet"); return; }
  const r = await chrome.runtime.sendMessage({ type: "ping" });
  if (r?.ok) { $("pair").hidden = true; $("ready").hidden = false; status("Connected to ShuaCrew", "ok"); }
  else { $("pair").hidden = !/pair/i.test(r?.error || ""); $("ready").hidden = true; status(r?.error || "Can't reach ShuaCrew", "bad"); }
}
$("save").onclick = async () => {
  const key = $("key").value.trim();
  if (!key) return;
  await chrome.storage.local.set({ key });
  $("key").value = "";
  await refresh();
};
$("key").onkeydown = (e) => { if (e.key === "Enter") $("save").click(); };
$("unpair").onclick = async () => { await chrome.storage.local.remove("key"); await refresh(); };
$("proactive").onchange = (e) => chrome.storage.local.set({ proactive: e.target.checked });
$("page").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "open", action: "page" }).catch(() => status("Reload the page, then try again", "bad"));
  window.close();
};
void refresh();
