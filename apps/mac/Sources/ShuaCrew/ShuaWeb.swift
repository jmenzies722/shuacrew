import AppKit
import ApplicationServices

/// Shua's hands inside web pages, with no extension: the browser runs a small script in the open tab through Apple
/// Events. Chrome hides a page from macOS accessibility (0 named controls out of 399 on a real tab), so "press by name"
/// and typing through the keyboard missed; here Shua sees the page's real buttons, links and fields with their exact
/// frames, and clicks and types on the element itself — no pixel guessing, no text typed twice.
/// Needs the browser's "Allow JavaScript from Apple Events" (Chrome: View › Developer), which Shua can turn on.
@MainActor
enum ShuaWeb {
    /// Browsers that run a tab's JavaScript over Apple Events.
    static let chromium: Set<String> = ["com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.canary", "com.brave.Browser", "com.microsoft.edgemac", "com.vivaldi.Vivaldi", "company.thebrowser.Browser"]
    static let safari: Set<String> = ["com.apple.Safari", "com.apple.SafariTechnologyPreview"]
    static func supports(_ app: NSRunningApplication?) -> Bool { let id = app?.bundleIdentifier ?? ""; return chromium.contains(id) || safari.contains(id) }

    enum Failure: LocalizedError {
        case javascriptOff(String), noWindow, script(String)
        var errorDescription: String? {
            switch self {
            case .javascriptOff(let app): return "\(app) blocks page control until “Allow JavaScript from Apple Events” is on. Ask me to turn it on (browser_js), or: \(app == "Safari" ? "Safari › Develop" : "View › Developer") › Allow JavaScript from Apple Events."
            case .noWindow: return "No browser window is open."
            case .script(let m): return m
            }
        }
    }

    /// AppleScript is blocking: one at a time, off the main thread, never longer than a few seconds.
    private static let queue = DispatchQueue(label: "shuacrew.web")

    /// Run `js` (an expression that returns a string) in the front tab of `app`.
    static func run(_ js: String, in app: NSRunningApplication, timeout: Int = 4) async throws -> String {
        let id = app.bundleIdentifier ?? "", name = app.localizedName ?? "the browser"
        let literal = "\"" + js.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
        let body = safari.contains(id) ? "do JavaScript \(literal) in current tab of front window" : "execute active tab of front window javascript \(literal)"
        let source = "with timeout of \(timeout) seconds\ntell application id \"\(id)\"\nif (count of windows) is 0 then return \"__SHUA_NO_WINDOW__\"\n\(body)\nend tell\nend timeout"
        let result: Result<String, Failure> = await withCheckedContinuation { done in
            queue.async {
                var error: NSDictionary?
                let out = NSAppleScript(source: source)?.executeAndReturnError(&error)
                if let error {
                    let message = (error[NSAppleScript.errorMessage] as? String) ?? "The browser didn't answer."
                    let off = message.range(of: "JavaScript", options: .caseInsensitive) != nil && message.range(of: "(turned off|Allow JavaScript|not allowed|enable)", options: [.regularExpression, .caseInsensitive]) != nil
                    done.resume(returning: .failure(off ? .javascriptOff(name) : .script(message)))
                } else if out?.stringValue == "__SHUA_NO_WINDOW__" { done.resume(returning: .failure(.noWindow)) }
                else { done.resume(returning: .success(out?.stringValue ?? "")) }
            }
        }
        return try result.get()
    }

    // MARK: seeing the page

    /// The page's controls as ScreenElements-style entries (centre + size as fractions of `screen`), plus its URL.
    static func snapshot(of app: NSRunningApplication, on screen: NSScreen) async -> (page: [String: String], elements: [[String: Any]])? {
        guard supports(app), let raw = try? await run(snapshotJS, in: app, timeout: 3), let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = json["e"] as? [[Any]] else { return nil }
        // CSS pixels → screen points: the page zoom is the device pixel ratio over the display's own scale.
        let zoom = max(0.25, (json["dpr"] as? Double ?? screen.backingScaleFactor) / screen.backingScaleFactor)
        let originX = json["x"] as? Double ?? 0, originY = json["y"] as? Double ?? 0
        let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height, f = screen.frame, top = mainHeight - f.maxY
        var out: [[String: Any]] = []
        for row in rows {
            guard row.count >= 7, let name = row[1] as? String, let role = row[2] as? String, let x = row[3] as? Double, let y = row[4] as? Double, let w = row[5] as? Double, let h = row[6] as? Double else { continue }
            let gx = originX + x * zoom, gy = originY + y * zoom, gw = w * zoom, gh = h * zoom
            let cx = (gx + gw / 2 - f.minX) / f.width, cy = (gy + gh / 2 - top) / f.height
            guard (0...1).contains(cx), (0...1).contains(cy) else { continue }
            let r = { (v: Double) in (v * 10000).rounded() / 10000 }
            out.append(["name": name, "role": "web \(role)", "x": r(cx), "y": r(cy), "w": r(min(1, gw / f.width)), "h": r(min(1, gh / f.height))])
        }
        return (["url": json["u"] as? String ?? "", "title": json["t"] as? String ?? ""], out)
    }

    // MARK: acting on the page

    /// Click the page element that fits `label` (a link, button, tab…). Returns what was clicked.
    static func click(_ label: String, in app: NSRunningApplication) async throws -> String {
        try await act(["kind": "click", "name": label], in: app)
    }
    /// Put `text` into the field that fits `label` (or the focused field when the label is empty) as if typed:
    /// the page's own input events fire, so forms, search boxes and React apps all see it. `submit` presses Enter.
    static func type(_ text: String, into label: String, submit: Bool, in app: NSRunningApplication) async throws -> String {
        try await act(["kind": "type", "name": label, "value": text, "submit": submit], in: app)
    }

    private static func act(_ args: [String: Any], in app: NSRunningApplication) async throws -> String {
        let payload = String(data: try JSONSerialization.data(withJSONObject: args), encoding: .utf8) ?? "{}"
        let raw = try await run("(\(actJS))(\(payload))", in: app)
        guard let data = raw.data(using: .utf8), let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Failure.script("The page didn't answer.") }
        guard json["ok"] as? Bool == true else { throw Failure.script(json["why"] as? String ?? "Couldn't do that on the page.") }
        return json["did"] as? String ?? "Done"
    }

    /// Turn on the browser's "Allow JavaScript from Apple Events" through its own menu (no keystrokes).
    static func enableJavaScript(in app: NSRunningApplication) -> (ok: Bool, message: String) {
        guard supports(app), AXIsProcessTrusted() else { return (false, "Open Chrome or Safari first.") }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        var bar: CFTypeRef?
        guard AXUIElementCopyAttributeValue(root, kAXMenuBarAttribute as CFString, &bar) == .success, let bar else { return (false, "Couldn't read \(app.localizedName ?? "the browser")'s menus.") }
        var queue: [(AXUIElement, Int)] = [(bar as! AXUIElement, 0)], seen = 0
        while !queue.isEmpty, seen < 3000 {
            let (el, depth) = queue.removeFirst(); seen += 1
            var title: CFTypeRef?
            AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &title)
            if let t = title as? String, t.range(of: "Allow JavaScript from Apple Events", options: .caseInsensitive) != nil {
                var mark: CFTypeRef?
                AXUIElementCopyAttributeValue(el, "AXMenuItemMarkChar" as CFString, &mark)
                if let m = mark as? String, !m.isEmpty { return (true, "It was already on.") }
                return AXUIElementPerformAction(el, kAXPressAction as CFString) == .success ? (true, "Turned on Allow JavaScript from Apple Events in \(app.localizedName ?? "the browser").") : (false, "Couldn't press it. It's under View › Developer.")
            }
            guard depth < 6 else { continue }
            var kids: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids) == .success, let list = kids as? [AXUIElement] { queue += list.map { ($0, depth + 1) } }
        }
        return (false, app.bundleIdentifier.map { safari.contains($0) } == true ? "Safari needs its Develop menu first: Safari › Settings › Advanced › Show features for web developers." : "Couldn't find it. It's under View › Developer.")
    }

    // MARK: the scripts (kept small; they run in the page)

    /// Every visible control: [id, name, role, x, y, w, h] in CSS px from the tab's top-left, and the tab's place on
    /// screen (toolbar height = outer − inner). Each element is tagged data-shua so an action finds the same one again.
    private static let snapshotJS = #"""
    (() => { const sel = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true]';
    const out = []; let n = 0; document.querySelectorAll('[data-shua]').forEach((e) => e.removeAttribute('data-shua'));
    for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) continue;
      const tag = el.tagName, type = (el.type || '').toLowerCase(), field = tag === 'TEXTAREA' || el.isContentEditable || (tag === 'INPUT' && !['checkbox','radio','submit','button','reset','image','file','range','color'].includes(type));
      const role = el.getAttribute('role') || (tag === 'A' ? 'link' : field ? 'field' : tag === 'SELECT' ? 'select' : type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : 'button');
      const lab = el.labels && el.labels[0] ? el.labels[0].innerText : '';
      let name = (el.getAttribute('aria-label') || lab || (field ? '' : el.innerText) || el.getAttribute('placeholder') || el.title || el.alt || (field ? '' : el.value) || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!name && field) name = (el.getAttribute('placeholder') || type || 'text') + ' field';
      if (!name) continue; el.setAttribute('data-shua', String(++n)); out.push([n, name, role, r.left, r.top, r.width, r.height]); if (n >= 150) break; }
    return JSON.stringify({ u: location.href, t: document.title, x: screenX, y: screenY + (outerHeight - innerHeight), dpr: devicePixelRatio, e: out }); })()
    """#

    /// Find the element by name (exact › starts with › contains, visible first), bring it into view, then click it
    /// like a person would (pointer + mouse events, then click) or fill it with the page's own input events.
    private static let actJS = #"""
    (a) => { const sel = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=option],[role=combobox],[role=searchbox],[role=textbox],[contenteditable=""],[contenteditable=true],[data-shua]';
    const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[“”"']/g, '').trim(), want = norm(a.name);
    const nameOf = (el) => norm(el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].innerText : '') || el.innerText || el.getAttribute('placeholder') || el.title || el.value || el.name);
    const isField = (el) => el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && !['checkbox','radio','submit','button','reset','image','file'].includes((el.type || '').toLowerCase()));
    const seen = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    let el = null;
    if (a.kind === 'type' && !want) { el = document.activeElement && isField(document.activeElement) ? document.activeElement : [...document.querySelectorAll(sel)].find((e) => isField(e) && seen(e)); }
    else { const all = [...document.querySelectorAll(sel)].filter((e) => a.kind !== 'type' || isField(e)); const score = (e) => { const n = nameOf(e); return !n ? 0 : n === want ? 4 : n.startsWith(want) ? 3 : n.includes(want) ? 2 : want.includes(n) && n.length > 3 ? 1 : 0; };
      let best = 0; for (const e of all) { const s = score(e) + (seen(e) ? 0.5 : 0); if (s > best && s >= 1.5) { best = s; el = e; } } }
    if (!el) return JSON.stringify({ ok: false, why: 'Nothing on the page called “' + a.name + '”. Take a fresh look.' });
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const label = ((el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].innerText : '') || el.innerText || el.getAttribute('placeholder') || el.title || a.name) + '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (a.kind === 'click') { const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      for (const t of ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown']) el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, { ...o, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(t, o));
      if (el.focus) el.focus({ preventScroll: true });
      for (const t of ['pointerup', 'mouseup']) el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, { ...o, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(t, o));
      el.click(); return JSON.stringify({ ok: true, did: 'Clicked “' + label + '” on the page' }); }
    el.focus();
    if (el.isContentEditable) { document.execCommand('selectAll', false); document.execCommand('insertText', false, a.value); }
    else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, a.value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: a.value })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    if (a.submit) { const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      const go = el.dispatchEvent(new KeyboardEvent('keydown', k)); el.dispatchEvent(new KeyboardEvent('keypress', k)); el.dispatchEvent(new KeyboardEvent('keyup', k));
      if (go && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); } }
    const now = el.isContentEditable ? el.innerText : el.value;
    return JSON.stringify({ ok: true, did: 'Typed into “' + label + '” — it now reads “' + String(now).slice(-80) + '”' + (a.submit ? ', and pressed Enter' : '') }); }
    """#
}
