import AppKit
import ShuaCrewCore
import UserNotifications

/// The menu-bar icon, the Dock badge and approval notifications, all fed by one poll of
/// `/api/status`. You can answer an agent from any of them without opening the window.
@MainActor
final class Tray: NSObject, UNUserNotificationCenterDelegate {
    private let gateway: Gateway
    private let window: MainWindow
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private var status = CrewStatus.empty
    private var notified: Set<String> = []
    private var finished: Set<String> = []
    private var reviewed: Set<String> = []
    private var primed = false
    private var timer: Timer?
    private let notifications: Bool

    init(gateway: Gateway, window: MainWindow, notifications: Bool) {
        self.gateway = gateway
        self.window = window
        self.notifications = notifications
        super.init()
        item.button?.image = Self.glyph
        item.button?.imagePosition = .imageLeading
        item.button?.toolTip = "ShuaCrew"
        render()
        if notifications { setUpNotifications() }
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.poll() }
        }
        timer?.tolerance = 0.5
        Task { await poll() }
    }

    private func poll() async {
        guard let next = try? await gateway.status() else { return }
        let fresh = next.newApprovals(since: notified)
        // Approvals already waiting when the app opens are on the badge; only new ones interrupt.
        if primed {
            for approval in fresh { notify(approval) }
            for outcome in next.newlyFinished(since: finished) { notify(outcome) }
            for review in next.newReviews(since: reviewed) { notify(review) }
        }
        finished.formUnion(next.recent.map(\.key))
        reviewed.formUnion(next.reviews.map(\.key))
        // Each morning's briefing announces itself once — even across app restarts.
        if let briefing = next.briefing, UserDefaults.standard.string(forKey: "lastBriefing") != briefing.id {
            UserDefaults.standard.set(briefing.id, forKey: "lastBriefing")
            notify(briefing)
        }
        primed = true
        let gone = notified.subtracting(next.approvals.map(\.id))
        if !gone.isEmpty { UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: Array(gone)) }
        notified = Set(next.approvals.map(\.id))
        if next != status {
            status = next
            render()
        }
    }

    private func render() {
        NSApp.dockTile.badgeLabel = status.needsYou > 0 ? "\(status.needsYou)" : nil
        if let badge = status.badge {
            let color: NSColor = status.needsYou > 0 ? Self.amber : .labelColor
            item.button?.attributedTitle = NSAttributedString(string: " \(badge)", attributes: [
                .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold), .foregroundColor: color,
            ])
        } else {
            item.button?.title = ""
        }
        item.menu = menu()
    }

    private func menu() -> NSMenu {
        let menu = NSMenu()
        let headline = NSMenuItem(title: status.headline, action: nil, keyEquivalent: "")
        headline.isEnabled = false
        menu.addItem(headline)
        if let briefing = status.briefing {
            let today = NSMenuItem(title: "Today: \(briefing.headline.prefix(70))", action: #selector(openHome), keyEquivalent: "")
            today.target = self
            today.image = NSImage(systemSymbolName: "sunrise", accessibilityDescription: nil)
            menu.addItem(today)
        }
        if !status.limited.isEmpty {
            let limited = NSMenuItem(title: "Usage limit: \(status.limited.joined(separator: ", "))", action: nil, keyEquivalent: "")
            limited.isEnabled = false
            menu.addItem(limited)
        }
        if !status.approvals.isEmpty {
            menu.addItem(.separator())
            for approval in status.approvals.prefix(8) {
                let entry = NSMenuItem(title: "\(approval.tool): \(approval.summary.prefix(60))", action: nil, keyEquivalent: "")
                entry.image = NSImage(systemSymbolName: approval.risk == "high" || approval.risk == "critical" ? "exclamationmark.triangle" : "hand.raised", accessibilityDescription: nil)
                let sub = NSMenu()
                if !approval.runTitle.isEmpty {
                    let run = NSMenuItem(title: approval.runTitle, action: nil, keyEquivalent: "")
                    run.isEnabled = false
                    sub.addItem(run)
                }
                let why = NSMenuItem(title: approval.reason, action: nil, keyEquivalent: "")
                why.isEnabled = false
                sub.addItem(why)
                sub.addItem(.separator())
                sub.addItem(action("Allow", #selector(allow(_:)), approval.id))
                sub.addItem(action("Deny", #selector(deny(_:)), approval.id))
                if let run = approval.run { sub.addItem(action("Open Session", #selector(openRun(_:)), run)) }
                entry.submenu = sub
                menu.addItem(entry)
            }
        }
        if !status.reviews.isEmpty {
            menu.addItem(.separator())
            for review in status.reviews.prefix(8) {
                let entry = NSMenuItem(title: "\(review.phase) — \(review.title.prefix(50))", action: nil, keyEquivalent: "")
                entry.image = NSImage(systemSymbolName: review.failed ? "xmark.octagon" : "checklist", accessibilityDescription: nil)
                let sub = NSMenu()
                let who = NSMenuItem(title: review.detail, action: nil, keyEquivalent: "")
                who.isEnabled = false
                sub.addItem(who)
                sub.addItem(.separator())
                if !review.failed { sub.addItem(action(review.last ? "Approve & Finish" : "Approve & Continue", #selector(approvePhase(_:)), "\(review.play)#\(review.index)")) }
                sub.addItem(action("Open Playbook", #selector(openPlay(_:)), review.play))
                entry.submenu = sub
                menu.addItem(entry)
            }
        }
        menu.addItem(.separator())
        menu.addItem(action("Open ShuaCrew", #selector(open), nil))
        menu.addItem(action("New Session…", #selector(newRun), nil))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit ShuaCrew", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        return menu
    }

    private func action(_ title: String, _ selector: Selector, _ value: String?) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        item.representedObject = value
        return item
    }

    @objc private func allow(_ sender: NSMenuItem) { decide(sender.representedObject as? String, allow: true) }
    @objc private func deny(_ sender: NSMenuItem) { decide(sender.representedObject as? String, allow: false) }
    @objc private func openRun(_ sender: NSMenuItem) {
        guard let run = sender.representedObject as? String else { return }
        NSApp.activate()
        window.navigate("/sessions/\(run)")
    }
    @objc private func openPlay(_ sender: NSMenuItem) {
        guard let play = sender.representedObject as? String else { return }
        NSApp.activate()
        window.navigate("/plays/\(play)")
    }
    @objc private func approvePhase(_ sender: NSMenuItem) { approve(sender.representedObject as? String) }
    @objc private func openHome() {
        NSApp.activate()
        window.showWindow(nil)
        window.navigate("/")
    }

    /// "play#index" → approve that gate, then refresh.
    private func approve(_ ref: String?) {
        guard let ref, let hash = ref.lastIndex(of: "#"), let index = Int(ref[ref.index(after: hash)...]) else { return }
        let play = String(ref[..<hash])
        Task {
            try? await gateway.approvePhase(play, index: index)
            await poll()
        }
    }

    @objc private func open() {
        NSApp.activate()
        window.showWindow(nil)
    }
    @objc private func newRun() {
        NSApp.activate()
        window.page("launch()")
    }

    private func decide(_ id: String?, allow: Bool) {
        guard let id else { return }
        Task {
            try? await gateway.decide(id, allow: allow)
            await poll()
        }
    }

    // MARK: notifications

    private func setUpNotifications() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let allow = UNNotificationAction(identifier: "ALLOW", title: "Allow")
        let deny = UNNotificationAction(identifier: "DENY", title: "Deny", options: [.destructive])
        let approvePhase = UNNotificationAction(identifier: "APPROVE_PHASE", title: "Approve & Continue")
        center.setNotificationCategories([
            UNNotificationCategory(identifier: "APPROVAL", actions: [allow, deny], intentIdentifiers: []),
            UNNotificationCategory(identifier: "REVIEW", actions: [approvePhase], intentIdentifiers: []),
        ])
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    private func notify(_ approval: CrewStatus.Approval) {
        guard notifications else { return }
        let content = UNMutableNotificationContent()
        content.title = "Allow \(approval.tool)?"
        content.subtitle = approval.runTitle
        content.body = approval.summary
        content.categoryIdentifier = "APPROVAL"
        content.sound = .default
        content.interruptionLevel = approval.risk == "critical" ? .timeSensitive : .active
        content.userInfo = ["approval": approval.id, "run": approval.run ?? ""]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: approval.id, content: content, trigger: nil))
    }

    private func notify(_ outcome: CrewStatus.Finished) {
        guard notifications else { return }
        let content = UNMutableNotificationContent()
        content.title = outcome.headline
        content.body = outcome.detail
        content.sound = outcome.status == "failed" ? .defaultCritical : .default
        content.userInfo = ["run": outcome.id]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: outcome.key, content: content, trigger: nil))
    }

    private func notify(_ briefing: CrewStatus.Briefing) {
        guard notifications else { return }
        let content = UNMutableNotificationContent()
        content.title = "Your morning briefing"
        content.body = briefing.headline
        content.sound = .default
        content.userInfo = ["home": true]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: briefing.id, content: content, trigger: nil))
    }

    private func notify(_ review: CrewStatus.Review) {
        guard notifications else { return }
        let content = UNMutableNotificationContent()
        content.title = review.headline
        content.body = review.detail
        content.sound = review.failed ? .defaultCritical : .default
        if !review.failed { content.categoryIdentifier = "REVIEW" }
        content.userInfo = ["play": review.play, "phase": "\(review.play)#\(review.index)"]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: review.key, content: content, trigger: nil))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let approval = info["approval"] as? String
        let run = info["run"] as? String ?? ""
        let play = info["play"] as? String ?? ""
        let phase = info["phase"] as? String
        if response.actionIdentifier == "APPROVE_PHASE" {
            await MainActor.run { approve(phase) }
            return
        }
        if info["home"] as? Bool == true {
            await MainActor.run { openHome() }
            return
        }
        if !play.isEmpty, response.actionIdentifier == UNNotificationDefaultActionIdentifier {
            await MainActor.run {
                NSApp.activate()
                window.navigate("/plays/\(play)")
            }
            return
        }
        switch response.actionIdentifier {
        case "ALLOW": await MainActor.run { decide(approval, allow: true) }
        case "DENY": await MainActor.run { decide(approval, allow: false) }
        default:
            await MainActor.run {
                NSApp.activate()
                if !run.isEmpty { window.navigate("/sessions/\(run)") } else { window.showWindow(nil) }
            }
        }
    }

    /// While you're looking at the window, its own approval toasts do the job; don't double up.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run { NSApp.isActive } ? [] : [.banner, .sound, .list]
    }

    // MARK: art

    static let amber = NSColor(srgbRed: 1, green: 0.69, blue: 0.125, alpha: 1)

    /// The ShuaCrew mark as a template image, so it follows the menu bar's light or dark.
    static let glyph: NSImage = {
        let image = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            NSColor.black.set()
            let ring = NSBezierPath(ovalIn: NSRect(x: 5, y: 5, width: 8, height: 8))
            ring.lineWidth = 1.6
            ring.stroke()
            let outer = NSBezierPath(ovalIn: NSRect(x: 2, y: 2, width: 14, height: 14))
            outer.lineWidth = 1
            NSColor.black.withAlphaComponent(0.45).set()
            outer.stroke()
            NSColor.black.set()
            for (x, y) in [(9.0, 16.0), (15.1, 5.5), (2.9, 5.5)] {
                NSBezierPath(ovalIn: NSRect(x: x - 1.9, y: y - 1.9, width: 3.8, height: 3.8)).fill()
            }
            return true
        }
        image.isTemplate = true
        return image
    }()
}
