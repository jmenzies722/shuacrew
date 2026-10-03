import AppKit
import ScreenCaptureKit
import ShuaCrewCore

/// Frozen display overlays intercept selection drags without clicking the underlying application.
@MainActor final class RegionSelector {
    private var panels: [NSPanel] = []
    private var generation = 0
    private var answer: (([String: Any]) -> Void)?
    func start(excluding: [Int], completion: @escaping ([String: Any]) -> Void) {
        cancel()
        answer = completion
        let token = generation
        guard ScreenAccess.granted() || ScreenAccess.request() else { finish(["error":"Screen recording access is required to select an area."]); return }
        Task { @MainActor in
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                let excluded = content.windows.filter { excluding.contains(Int($0.windowID)) }
                // Capture before showing any overlay, so the selection never includes its own handles.
                var shots: [(NSScreen, CGImage)] = []
                for screen in NSScreen.screens {
                    let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
                    guard let display = content.displays.first(where: { $0.displayID == id }) else { continue }
                    let config = SCStreamConfiguration()
                    config.width = Int(screen.frame.width * screen.backingScaleFactor)
                    config.height = Int(screen.frame.height * screen.backingScaleFactor)
                    config.showsCursor = false
                    let image = try await SCScreenshotManager.captureImage(contentFilter: SCContentFilter(display: display, excludingWindows: excluded), configuration: config)
                    shots.append((screen,image))
                }
                guard self.answer != nil, self.generation == token else { return }
                guard !shots.isEmpty else { finish(["error":"No display is available."]); return }
                for (screen,image) in shots {
                    let panel = SelectionPanel(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false)
                    panel.level = .screenSaver; panel.isReleasedWhenClosed = false
                    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
                    let view = RegionSelectionView(frame: CGRect(origin: .zero,size:screen.frame.size), image: image)
                    let viewSize = view.bounds.size
                    view.selected = { [weak self] rect in
                        guard let self else { return }
                        let pixels = RegionBox.pixels(rect,view:viewSize,image:CGSize(width:image.width,height:image.height))
                        guard let crop = image.cropping(to:pixels), let jpeg = NSBitmapImageRep(cgImage:crop).representation(using:.jpeg,properties:[.compressionFactor:0.9]) else { self.finish(["error":"Could not capture that area."]); return }
                        self.finish(["data":jpeg.base64EncodedString(),"width":crop.width,"height":crop.height])
                    }
                    view.canceled = { [weak self] in self?.cancel() }
                    panel.contentView = view; panels.append(panel); panel.orderFrontRegardless()
                    if screen.frame.contains(NSEvent.mouseLocation) { panel.makeKey(); panel.makeFirstResponder(view) }
                }
                NSApp.activate(ignoringOtherApps: true)
            } catch { guard self.generation == token else { return }; finish(["error":"Couldn't select the screen: \(error.localizedDescription)"]) }
        }
    }
    func cancel() { finish(["canceled":true]) }
    private func finish(_ result: [String:Any]) {
        generation += 1
        let callback = answer; answer = nil
        for panel in panels { panel.orderOut(nil); panel.close() }
        panels = []; callback?(result)
    }
}
private final class SelectionPanel: NSPanel { override var canBecomeKey: Bool { true } }
@MainActor private final class RegionSelectionView: NSView {
    let image: CGImage
    var selected: ((CGRect)->Void)?
    var canceled: (()->Void)?
    private var anchor: CGPoint?
    private var selection: CGRect?
    init(frame: CGRect,image:CGImage) { self.image=image; super.init(frame:frame) }
    required init?(coder:NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var acceptsFirstResponder: Bool { true }
    override func resetCursorRects() { addCursorRect(bounds,cursor:.crosshair) }
    override func keyDown(with event:NSEvent) { if event.keyCode == 53 { canceled?() } }
    override func mouseDown(with event:NSEvent) { window?.makeKey(); window?.makeFirstResponder(self); anchor=convert(event.locationInWindow,from:nil); selection=nil }
    override func mouseDragged(with event:NSEvent) {
        guard let anchor else { return }
        selection=RegionBox.rect(from:anchor,to:convert(event.locationInWindow,from:nil),bounds:bounds); needsDisplay=true
    }
    override func mouseUp(with event:NSEvent) { mouseDragged(with:event); if let selection { selected?(selection) } }
    override func draw(_ dirtyRect:NSRect) {
        NSImage(cgImage:image,size:bounds.size).draw(in:bounds)
        NSColor.black.withAlphaComponent(0.25).setFill(); bounds.fill()
        if let selection {
            NSGraphicsContext.saveGraphicsState(); NSBezierPath(rect:selection).addClip()
            NSImage(cgImage:image,size:bounds.size).draw(in:bounds); NSGraphicsContext.restoreGraphicsState()
            NSColor.systemBlue.setStroke(); let path=NSBezierPath(rect:selection); path.lineWidth=2; path.stroke()
        }
        let text="Drag a box around what Shua should analyze · Esc cancels" as NSString
        text.draw(at:CGPoint(x:24,y:bounds.height-48),withAttributes:[.font:NSFont.systemFont(ofSize:17,weight:.medium),.foregroundColor:NSColor.white,.backgroundColor:NSColor.black.withAlphaComponent(0.7)])
    }
}
