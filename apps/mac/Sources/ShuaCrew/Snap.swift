import AppKit
import ApplicationServices
import ShuaCrewCore

/// The real things on screen that a point or a rough circle can snap to — with their exact frames — so what you
/// mark is boxed precisely and Spark is told exactly what it is. Web pages answer for themselves (their own
/// paragraphs, headings, cells, buttons, images); other apps through macOS accessibility, down to the line of text
/// under the pointer in a text view. All rects are global AppKit coordinates (origin bottom-left, y up).
@MainActor
enum Snap {
    /// The exact thing at a point, or nil if there's nothing smaller than a whole window there.
    static func at(_ p: CGPoint, on screen: NSScreen) async -> SnapSelect.Item? {
        if let app = SparkHands.target, ShuaWeb.supports(app), let items = await webItems(in: app), let hit = SnapSelect.at(p, among: items, screen: screen.frame) { return hit }
        return axItem(at: p, screen: screen)
    }

    /// Everything a rough circle mostly encloses, snapped to real edges (empty if nothing real is inside).
    static func within(_ area: CGRect, on screen: NSScreen) async -> [SnapSelect.Item] {
        var items: [SnapSelect.Item] = []
        if let app = SparkHands.target, ShuaWeb.supports(app), let web = await webItems(in: app) { items = web }
        if items.isEmpty { items = axItems(near: area, screen: screen) }
        // The menu bar's icons (Wi-Fi, Battery, the clock…) live in other apps: add them when the circle reaches up there.
        if area.maxY > screen.frame.maxY - 45 { items += menuBarItems(on: screen) }
        return SnapSelect.within(area, among: items, screen: screen.frame)
    }

    /// Every menu-bar icon with its exact frame, from the same scan Spark looks with — as global AppKit rects.
    private static func menuBarItems(on screen: NSScreen) -> [SnapSelect.Item] {
        let f = screen.frame, num = { (v: Any?) in (v as? NSNumber)?.doubleValue }
        return (ScreenElements.read(on: screen)["elements"] as? [[String: Any]] ?? []).compactMap { e in
            guard e["role"] as? String == "menuextra", let name = e["name"] as? String,
                  let x = num(e["x"]), let y = num(e["y"]), let w = num(e["w"]), let h = num(e["h"]) else { return nil }
            let width = w * f.width, height = h * f.height
            return SnapSelect.Item(rect: CGRect(x: f.minX + x * f.width - width / 2, y: f.maxY - y * f.height - height / 2, width: width, height: height), name: name)
        }
    }

    // MARK: web pages

    /// The page's visible blocks and controls, converted to global AppKit rects.
    private static func webItems(in app: NSRunningApplication) async -> [SnapSelect.Item]? {
        guard let raw = try? await ShuaWeb.run(blocksJS, in: app, timeout: 3), let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = json["e"] as? [[Any]] else { return nil }
        let screen = NSScreen.screens.first { $0.frame.contains(NSEvent.mouseLocation) } ?? NSScreen.main
        let backing = screen?.backingScaleFactor ?? 2, mainHeight = NSScreen.screens.first?.frame.height ?? 0
        let zoom = max(0.25, (json["dpr"] as? Double ?? backing) / backing), ox = json["x"] as? Double ?? 0, oy = json["y"] as? Double ?? 0
        return rows.compactMap { r in
            guard r.count >= 5, let name = r[0] as? String, let x = r[1] as? Double, let y = r[2] as? Double, let w = r[3] as? Double, let h = r[4] as? Double else { return nil }
            let top = oy + y * zoom, height = h * zoom
            return SnapSelect.Item(rect: CGRect(x: ox + x * zoom, y: mainHeight - top - height, width: w * zoom, height: height), name: name)
        }
    }

    /// Paragraphs, headings, list items, cells, quotes, code, figures, images and controls in view — plus any block
    /// holding its own text (modern pages often put paragraphs in plain divs). [name, x, y, w, h] in CSS px.
    private static let blocksJS = #"""
    (() => { const sel = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,code,figure,figcaption,img,video,canvas,svg,button,a[href],input,textarea,select,label,summary,[role=button],[role=link],[role=tab],[role=heading],[role=cell],article';
    const seen = new Set(), out = [];
    const add = (el) => { if (seen.has(el)) return; seen.add(el); const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return;
      const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return;
      const text = (el.getAttribute('aria-label') || el.alt || el.innerText || el.value || el.placeholder || el.title || el.tagName.toLowerCase()).trim().replace(/\s+/g, ' ').slice(0, 90);
      out.push([text, r.left, r.top, r.width, r.height]); };
    document.querySelectorAll(sel).forEach(add);
    // Blocks with text of their own (a paragraph written as a <div>).
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode()) && out.length < 600) { if (n.textContent.trim().length < 12) continue; let el = n.parentElement; while (el && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement; if (el && el !== document.body) add(el); }
    return JSON.stringify({ x: screenX, y: screenY + (outerHeight - innerHeight), dpr: devicePixelRatio, e: out.slice(0, 600) }); })()
    """#

    // MARK: native apps

    private static let meaningful: Set<String> = [kAXButtonRole, kAXStaticTextRole, kAXImageRole, kAXCellRole, kAXCheckBoxRole, kAXRadioButtonRole,
        kAXTextFieldRole, kAXPopUpButtonRole, kAXMenuItemRole, kAXMenuButtonRole, "AXLink", "AXTab", kAXRowRole, "AXHeading", kAXComboBoxRole, kAXSliderRole]

    /// What's under the point in a native app: a text view's exact line, else the nearest meaningful element.
    private static func axItem(at p: CGPoint, screen: NSScreen) -> SnapSelect.Item? {
        guard AXIsProcessTrusted() else { return nil }
        let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        var hit: AXUIElement?
        guard AXUIElementCopyElementAtPosition(AXUIElementCreateSystemWide(), Float(p.x), Float(mainHeight - p.y), &hit) == .success, var el = hit else { return nil }
        if let line = textLine(in: el, at: CGPoint(x: p.x, y: mainHeight - p.y), mainHeight: mainHeight) { return line }
        for _ in 0..<5 {
            let role = string(el, kAXRoleAttribute) ?? ""
            if meaningful.contains(role), let f = frame(el, mainHeight: mainHeight), SnapSelect.at(p, among: [SnapSelect.Item(rect: f, name: "")], screen: screen.frame) != nil {
                return SnapSelect.Item(rect: f, name: name(el) ?? role.replacingOccurrences(of: "AX", with: "").lowercased())
            }
            guard let parent = element(el, kAXParentAttribute) else { break }
            el = parent
        }
        return nil
    }

    /// In a text view, the line of text at the point (top-left global point), with its exact bounds.
    private static func textLine(in el: AXUIElement, at topLeft: CGPoint, mainHeight: CGFloat) -> SnapSelect.Item? {
        let role = string(el, kAXRoleAttribute) ?? ""
        guard role == kAXTextAreaRole || role == kAXTextFieldRole || role == "AXWebArea" else { return nil }
        var point = topLeft
        guard let pos = AXValueCreate(.cgPoint, &point), let rangeValue = parameterized(el, kAXRangeForPositionParameterizedAttribute, pos) else { return nil }
        var range = CFRange()
        guard AXValueGetValue(rangeValue as! AXValue, .cfRange, &range),
              let lineNum = parameterized(el, kAXLineForIndexParameterizedAttribute, range.location as CFNumber),
              let lineRange = parameterized(el, kAXRangeForLineParameterizedAttribute, lineNum),
              let bounds = parameterized(el, kAXBoundsForRangeParameterizedAttribute, lineRange),
              let text = parameterized(el, kAXStringForRangeParameterizedAttribute, lineRange) as? String else { return nil }
        var r = CGRect.zero
        guard AXValueGetValue(bounds as! AXValue, .cgRect, &r), r.width > 4, r.height > 4 else { return nil }
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        return SnapSelect.Item(rect: CGRect(x: r.minX, y: mainHeight - r.maxY, width: r.width, height: r.height), name: String(clean.prefix(90)))
    }

    /// Meaningful elements of the front window near the area (a bounded walk).
    private static func axItems(near area: CGRect, screen: NSScreen) -> [SnapSelect.Item] {
        guard AXIsProcessTrusted(), let app = SparkHands.target else { return [] }
        let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        let root = AXUIElementCreateApplication(app.processIdentifier)
        let start = element(root, kAXFocusedWindowAttribute) ?? root
        var queue: [AXUIElement] = [start], seen = 0, out: [SnapSelect.Item] = []
        let near = area.insetBy(dx: -40, dy: -40)
        while !queue.isEmpty, seen < 3000, out.count < 300 {
            let el = queue.removeFirst(); seen += 1
            let f = frame(el, mainHeight: mainHeight)
            if let f, !f.intersects(near) && f.width * f.height < screen.frame.width * screen.frame.height * 0.6 { continue } // off to the side: skip its subtree
            if let f, meaningful.contains(string(el, kAXRoleAttribute) ?? "") { out.append(SnapSelect.Item(rect: f, name: name(el) ?? "")) }
            var kids: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids) == .success, let list = kids as? [AXUIElement] { queue += list }
        }
        return out
    }

    private static func name(_ el: AXUIElement) -> String? {
        [kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute].lazy.compactMap { string(el, $0) }.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }.map { String($0.prefix(90)) }
    }
    private static func string(_ el: AXUIElement, _ key: String) -> String? { var v: CFTypeRef?; AXUIElementCopyAttributeValue(el, key as CFString, &v); return v as? String }
    private static func element(_ el: AXUIElement, _ key: String) -> AXUIElement? {
        var v: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, key as CFString, &v) == .success, let v else { return nil }
        return (v as! AXUIElement)
    }
    private static func parameterized(_ el: AXUIElement, _ key: String, _ param: CFTypeRef) -> CFTypeRef? {
        var v: CFTypeRef?
        return AXUIElementCopyParameterizedAttributeValue(el, key as CFString, param, &v) == .success ? v : nil
    }
    /// An element's frame as a global AppKit rect.
    private static func frame(_ el: AXUIElement, mainHeight: CGFloat) -> CGRect? {
        var pos: CFTypeRef?, size: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
              AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        AXValueGetValue(pos as! AXValue, .cgPoint, &p); AXValueGetValue(size as! AXValue, .cgSize, &s)
        guard s.width > 1, s.height > 1 else { return nil }
        return CGRect(x: p.x, y: mainHeight - p.y - s.height, width: s.width, height: s.height)
    }
}
