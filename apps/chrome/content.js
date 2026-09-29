// Spark on the page: highlight text and a small Spark button appears; pick what to do and the answer shows
// right there. Lives in a closed shadow root so pages can't restyle or read it. Talks only to the extension's
// background (never to the gateway directly), so the pairing key never touches the page.
(() => {
  if (window.__shuacrewSpark) return;
  window.__shuacrewSpark = true;

  const ACTIONS = [
    ["explain", "Explain"],
    ["summarize", "Summarize"],
    ["rewrite", "Rewrite"],
    ["reply", "Draft a reply"],
  ];
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: fixed; inset: 0 auto auto 0; z-index: 2147483647; pointer-events: none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; }
    .fab, .card, .chip { position: fixed; pointer-events: auto; }
    .fab { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 10px; cursor: pointer;
      background: radial-gradient(circle at 50% 45%, rgba(142,72,255,.35), transparent 70%), #19161d; box-shadow: 0 0 0 1px rgba(142,72,255,.55), 0 8px 24px rgba(0,0,0,.35); }
    .fab:hover { box-shadow: 0 0 0 2px #8e48ff, 0 8px 24px rgba(0,0,0,.4); }
    .fab svg { width: 18px; height: 18px; }
    .card { width: min(380px, calc(100vw - 24px)); max-height: min(460px, calc(100vh - 24px)); display: flex; flex-direction: column; gap: 10px; padding: 12px;
      border-radius: 16px; color: #dcdadf; background: #211d25; box-shadow: 0 0 0 1px #352f3d, 0 24px 60px rgba(0,0,0,.5); font-size: 13px; line-height: 1.5; }
    header { display: flex; align-items: center; gap: 8px; }
    header b { font-size: 13px; font-weight: 600; color: #f2f0f4; }
    header small { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #938f9b; font-size: 11.5px; }
    header button { width: 24px; height: 24px; border: 0; border-radius: 7px; background: transparent; color: #938f9b; font-size: 16px; cursor: pointer; }
    header button:hover { background: #28242e; color: #fff; }
    .quote { margin: 0; padding: 7px 10px; border-left: 2px solid #8e48ff; border-radius: 0 8px 8px 0; background: rgba(142,72,255,.1); color: #b1adb8; font-size: 12px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .btn { height: 32px; padding: 0 10px; border: 0; border-radius: 9px; cursor: pointer; font-size: 12.5px; text-align: left; color: #dcdadf;
      background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)); box-shadow: inset 0 0 0 1px #352f3d; }
    .btn:hover { color: #fff; box-shadow: inset 0 0 0 1px rgba(142,72,255,.6); background: rgba(142,72,255,.12); }
    .btn.primary { text-align: center; color: #fff; background: #8e48ff; box-shadow: none; font-weight: 600; }
    .row { display: flex; gap: 6px; }
    .row input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 0; border-radius: 9px; outline: none; color: #f2f0f4; background: #151218; box-shadow: inset 0 0 0 1px #352f3d; font-size: 12.5px; }
    .row input:focus { box-shadow: inset 0 0 0 1px #8e48ff, 0 0 0 3px rgba(142,72,255,.18); }
    .answer { flex: 1; min-height: 0; overflow: auto; white-space: pre-wrap; color: #e8e6eb; font-size: 13px; }
    .muted { color: #938f9b; }
    .answer code { padding: 1px 5px; border-radius: 5px; font: 12px ui-monospace, Menlo, monospace; color: #efe7ff; background: rgba(142,72,255,.16); }
    .answer b { color: #fff; font-weight: 600; }
    .err { color: #ff8a8a; }
    .tools { display: flex; flex-wrap: wrap; gap: 6px; }
    .tools .btn { height: 28px; text-align: center; }
    .dots::after { content: "…"; animation: d 1.2s steps(3) infinite; display: inline-block; width: 1em; text-align: left; overflow: hidden; vertical-align: bottom; }
    @keyframes d { from { width: 0 } to { width: 1em } }
    .chip { right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 8px 0 12px; border-radius: 12px; color: #dcdadf; background: #211d25;
      box-shadow: 0 0 0 1px rgba(142,72,255,.5), 0 12px 32px rgba(0,0,0,.35); font-size: 12.5px; }
    .chip button { border: 0; cursor: pointer; }
    .chip .go { height: 26px; padding: 0 10px; border-radius: 8px; color: #fff; background: #8e48ff; font-weight: 600; font-size: 12px; }
    .chip .x { width: 22px; height: 22px; border-radius: 6px; color: #938f9b; background: transparent; font-size: 15px; }
    [hidden] { display: none !important; }
    @media (prefers-reduced-motion: reduce) { .dots::after { animation: none; width: 1em; } }
  </style>
  <button class="fab" hidden aria-label="Spark: do something with this selection" title="Spark (⌥⇧S)">
    <svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="10" stroke="#c3a2ff" stroke-opacity=".45" stroke-width="1.2"/><circle cx="16" cy="16" r="4.8" stroke="#8e48ff" stroke-width="2.6"/><circle cx="16" cy="6" r="2.4" fill="#efe7ff"/><circle cx="24.7" cy="21" r="2.4" fill="#efe7ff"/><circle cx="7.3" cy="21" r="2.4" fill="#efe7ff"/></svg>
  </button>
  <div class="card" hidden role="dialog" aria-label="Spark"></div>
  <div class="chip" hidden><span>Long read. Want the gist?</span><button class="go">Summarize</button><button class="x" aria-label="Dismiss">×</button></div>`;
  document.documentElement.appendChild(host);

  const fab = root.querySelector(".fab"), card = root.querySelector(".card"), chip = root.querySelector(".chip");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const page = () => ({ url: location.href, title: document.title });
  /** Light markdown, safely: escape everything first, then style `code`, **bold**, *italics* and bullets. */
  const md = (text) => esc(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
    .replace(/^[-•] /gm, "• ");
  let sel = { text: "", rect: null, edit: null };

  /** What's selected right now — including inside text fields, which window.getSelection() doesn't cover. */
  function selection() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|url|email)$/i.test(el.type))) && el.selectionEnd > el.selectionStart) {
      const r = el.getBoundingClientRect();
      return { text: el.value.slice(el.selectionStart, el.selectionEnd), rect: r, edit: { kind: "field", el, start: el.selectionStart, end: el.selectionEnd } };
    }
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const range = s.getRangeAt(0), rect = range.getBoundingClientRect();
    const editable = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest?.("[contenteditable=''],[contenteditable=true]");
    return { text: s.toString(), rect, edit: editable ? { kind: "rich", range: range.cloneRange() } : null };
  }
  function placeNear(el, rect, w, h) {
    const x = Math.min(Math.max(8, rect.right - w / 2), innerWidth - w - 8);
    const below = rect.bottom + 8 + h < innerHeight;
    // Below the selection if it fits, else above; either way never past the bottom of the window.
    const top = Math.max(8, Math.min(below ? rect.bottom + 8 : rect.top - h - 8, innerHeight - h - 8));
    el.style.left = `${x}px`;
    el.style.top = `${top}px`;
  }
  function check() {
    if (!card.hidden) return;
    const s = selection();
    if (!s || s.text.trim().length < 3) { fab.hidden = true; return; }
    sel = { text: s.text.trim().slice(0, 20000), rect: s.rect, edit: s.edit };
    fab.hidden = false;
    placeNear(fab, s.rect, 30, 30);
  }
  document.addEventListener("mouseup", (e) => { if (!e.composedPath().includes(host)) setTimeout(check, 10); });
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") setTimeout(check, 10); });
  document.addEventListener("mousedown", (e) => { if (!e.composedPath().includes(host)) { fab.hidden = true; if (!card.hidden && !card.dataset.busy) close(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) close(); });

  function close() { card.hidden = true; card.innerHTML = ""; delete card.dataset.busy; }
  // The card grows as the answer arrives: re-place it whenever its size changes, so the end never falls off-screen.
  let anchor = null;
  const place = () => { if (!card.hidden && anchor) placeNear(card, anchor, Math.min(380, innerWidth - 24), Math.min(card.offsetHeight || 300, innerHeight - 24)); };
  new ResizeObserver(place).observe(card);
  addEventListener("resize", place);
  function open(rect) {
    fab.hidden = true;
    card.hidden = false;
    anchor = rect || { right: innerWidth - 24, bottom: 60, top: 60 };
    requestAnimationFrame(place);
  }
  function header(sub) {
    return `<header><svg width="20" height="20" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="4.8" stroke="#8e48ff" stroke-width="3"/><circle cx="16" cy="6" r="2.6" fill="#efe7ff"/><circle cx="24.7" cy="21" r="2.6" fill="#efe7ff"/><circle cx="7.3" cy="21" r="2.6" fill="#efe7ff"/></svg><b>Spark</b><small>${esc(sub)}</small><button class="close" aria-label="Close">×</button></header>`;
  }
  function menu(text) {
    card.innerHTML = `${header(document.title)}<p class="quote">${esc(text)}</p>
      <div class="grid">${ACTIONS.map(([id, label]) => `<button class="btn" data-act="${id}">${label}</button>`).join("")}</div>
      <div class="row"><input class="ask" placeholder="Ask about this…" aria-label="Ask Spark about the selection"><button class="btn primary go-ask">Ask</button></div>
      <div class="tools"><button class="btn save">Save to Library</button><button class="btn crew">Hand to the crew…</button></div>`;
    card.querySelector(".close").onclick = close;
    card.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(b.dataset.act, text)));
    const ask = card.querySelector(".ask");
    const go = () => ask.value.trim() && act("ask", text, ask.value.trim());
    card.querySelector(".go-ask").onclick = go;
    ask.onkeydown = (e) => { if (e.key === "Enter") go(); e.stopPropagation(); };
    card.querySelector(".save").onclick = () => save(text);
    card.querySelector(".crew").onclick = () => crew(text);
    setTimeout(() => ask.focus(), 30);
  }
  function busy(what) {
    card.dataset.busy = "1";
    card.innerHTML = `${header(what)}<p class="muted"><span class="dots">Spark is on it</span></p>`;
    card.querySelector(".close").onclick = close;
  }
  function done(title, body, { error = false, text = "", rewrite = false } = {}) {
    delete card.dataset.busy;
    card.innerHTML = `${header(title)}<div class="answer ${error ? "err" : ""}">${error ? esc(body) : md(body)}</div>
      ${error ? "" : `<div class="tools"><button class="btn copy">Copy</button>${rewrite && sel.edit ? '<button class="btn primary replace">Replace selection</button>' : ""}<button class="btn save">Save</button>${text ? '<button class="btn back">More actions</button>' : ""}</div>`}`;
    card.querySelector(".close").onclick = close;
    const copy = card.querySelector(".copy");
    if (copy) copy.onclick = () => navigator.clipboard.writeText(body).then(() => (copy.textContent = "Copied"), () => (copy.textContent = "Select and copy"));
    const replace = card.querySelector(".replace");
    if (replace) replace.onclick = () => { if (put(body)) close(); else replace.textContent = "Couldn't replace here"; };
    const s = card.querySelector(".save");
    if (s) s.onclick = () => save(`${text ? `${text}\n\n— Spark —\n` : ""}${body}`);
    const back = card.querySelector(".back");
    if (back) back.onclick = () => menu(text);
  }
  /** Put a rewrite back where the selection was (text fields and editors only; never the page itself). */
  function put(value) {
    const e = sel.edit;
    if (!e) return false;
    if (e.kind === "field") { e.el.focus(); e.el.setSelectionRange(e.start, e.end); return document.execCommand("insertText", false, value); }
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(e.range);
    return document.execCommand("insertText", false, value);
  }
  const ask = (type, body) => new Promise((resolve) => chrome.runtime.sendMessage({ type, body }, (r) => resolve(r || { error: chrome.runtime.lastError?.message || "No answer" })));
  const DONE = { explain: "Explained", summarize: "Summary", rewrite: "Rewritten", reply: "Reply draft", ask: "Answer", page: "This page" };
  const LABEL = { explain: "Explaining", summarize: "Summarizing", rewrite: "Rewriting", reply: "Drafting a reply", ask: "Answering", page: "Reading this page" };
  async function act(action, text, question) {
    busy(LABEL[action]);
    const r = await ask("act", { action, text, question, page: page() });
    if (r.error) done("Couldn't do that", r.error, { error: true });
    else done(DONE[action], r.answer, { text: action === "page" ? "" : text, rewrite: action === "rewrite" });
  }
  async function save(text) {
    busy("Saving to your Library");
    const r = await ask("save", { text, page: page() });
    done(r.error ? "Couldn't save" : "Saved", r.error || "In your ShuaCrew Library, where you and every agent can find it.", { error: !!r.error });
  }
  function crew(text) {
    card.innerHTML = `${header("Hand to the crew")}<p class="quote">${esc(text)}</p>
      <div class="row"><input class="task" placeholder="What should the crew do with this?" aria-label="Task for the crew"><button class="btn primary go">Go</button></div>
      <p class="muted">It becomes a mission: Spark stays with it on your Mac and tells you when it's done.</p>`;
    card.querySelector(".close").onclick = close;
    const task = card.querySelector(".task");
    const go = async () => {
      if (!task.value.trim()) return;
      busy("Starting a mission");
      const r = await ask("crew", { task: task.value.trim(), text, page: page() });
      done(r.error ? "Couldn't start it" : "The crew is on it", r.error || "Spark is staying with it and will tell you on your Mac when it's done.", { error: !!r.error });
    };
    card.querySelector(".go").onclick = go;
    task.onkeydown = (e) => { if (e.key === "Enter") go(); e.stopPropagation(); };
    setTimeout(() => task.focus(), 30);
  }
  function pageText() {
    const main = document.querySelector("article, main, [role=main]") || document.body;
    return (main.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
  }

  fab.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
  fab.onclick = () => { open(sel.rect); menu(sel.text); };

  // From the right-click menu or ⌥⇧S.
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type !== "open") return;
    const s = selection();
    if (s && s.text.trim().length >= 3) sel = { text: s.text.trim().slice(0, 20000), rect: s.rect, edit: s.edit };
    const text = (m.text || (s && s.text) || "").trim();
    if (m.action === "page" || !text) { open(null); void act("page", pageText().slice(0, 30000)); return; }
    open(sel.rect);
    if (m.action) void act(m.action, text); else menu(text);
  });

  // Proactive, once per page: a long read gets a quiet offer to summarize it.
  chrome.storage.local.get({ proactive: true }, ({ proactive }) => {
    if (!proactive || sessionStorage.getItem("shuacrew-spark-offered") === location.href) return;
    setTimeout(() => {
      if (pageText().length < 6000) return;
      sessionStorage.setItem("shuacrew-spark-offered", location.href);
      chip.hidden = false;
      chip.querySelector(".go").onclick = () => { chip.hidden = true; open(null); void act("page", pageText().slice(0, 30000)); };
      chip.querySelector(".x").onclick = () => (chip.hidden = true);
      setTimeout(() => (chip.hidden = true), 15000);
    }, 2500);
  });
})();

// ── Spark → this page ─────────────────────────────────────────────────────────────────────────────
// Find an element the way a person names it ("Sign in", "the Search box", "Add to cart"), then report exactly where it
// is on screen, click it, or type into it. The real element, not a pixel guess.
(() => {
  const FILLER = new Set(["the", "a", "an", "button", "link", "field", "box", "icon", "tab", "menu", "click", "tap", "press", "on", "in", "at", "to", "of", "top", "bottom", "left", "right", "this", "that", "input", "text"]);
  const words = (s) => (s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && !FILLER.has(w));
  const nameOf = (el) => {
    const byId = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.innerText;
    return (el.getAttribute("aria-label") || byId || el.closest("label")?.innerText || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("alt") ||
      (el.tagName === "INPUT" && ["submit", "button"].includes(el.type) ? el.value : "") || el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
  };
  const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  const SELECTOR = "a, button, input, textarea, select, summary, label, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=switch], [role=option], [role=textbox], [role=searchbox], [contenteditable=true], [tabindex]:not([tabindex='-1']), [onclick]";
  function find(text, typing) {
    const want = words(text); if (!want.length) return null;
    const pool = [...document.querySelectorAll(typing ? "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, [contenteditable=true], [role=textbox], [role=searchbox]" : SELECTOR)].filter(visible);
    let best = null;
    for (const el of pool) {
      const name = nameOf(el), have = words(name); if (!have.length) continue;
      const hit = want.filter((w) => have.includes(w)).length;
      const exact = name.toLowerCase() === text.toLowerCase().trim();
      const fits = have.every((w) => want.includes(w)) || want.every((w) => have.includes(w));
      if (!fits && hit < Math.ceil(want.length * 0.6)) continue;
      const r = el.getBoundingClientRect(), inView = r.bottom > 0 && r.top < innerHeight;
      const score = (exact ? 10 : 0) + (fits ? 4 : 0) + hit - Math.abs(have.length - want.length) * 0.3 + (inView ? 1 : 0);
      if (!best || score > best.score) best = { el, name, score };
    }
    return best;
  }
  // The element's box on screen, as fractions of the screen (what Spark draws with). Assumes 100% page zoom.
  function onScreen(el) {
    const r = el.getBoundingClientRect(), top = window.screenY + (window.outerHeight - window.innerHeight), left = window.screenX + (window.outerWidth - window.innerWidth) / 2;
    const W = screen.width, H = screen.height;
    return { x: (left + r.left + r.width / 2) / W, y: (top + r.top + r.height / 2) / H, w: r.width / W, h: r.height / H };
  }
  function typeInto(el, value) {
    el.focus();
    if (el.isContentEditable) { document.execCommand("selectAll", false); document.execCommand("insertText", false, value); return; }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);   // so React-style forms see it too
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  chrome.runtime.onMessage.addListener((message, _sender, send) => {
    if (message?.type !== "spark-web") return false;
    const { kind, text, value } = message.command || {};
    const hit = find(text, kind === "type");
    if (!hit) { send({ found: false, error: `Couldn't find “${text}” on this page.` }); return false; }
    const el = hit.el, role = el.getAttribute("role") || el.tagName.toLowerCase();
    if (kind === "locate") { el.scrollIntoView({ block: "nearest", inline: "nearest" }); send({ found: true, name: hit.name, role, rect: onScreen(el) }); return false; }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    setTimeout(() => {
      const rect = onScreen(el);
      if (kind === "type") typeInto(el, value ?? "");
      else { el.focus?.(); el.click(); }
      send({ found: true, name: hit.name, role, rect });
    }, 120);
    return true;
  });
})();
