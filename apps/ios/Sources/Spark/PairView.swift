import SwiftUI
import VisionKit

/// Pair once: point the camera at the code in ShuaCrew → Settings → Mobile on your Mac (or paste it).
struct PairView: View {
    @Environment(SparkLink.self) private var link
    @Environment(\.dismiss) private var dismiss
    @State private var pasted = ""
    @State private var working = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                    QRScanner { code in pair(code) }
                        .frame(height: 320)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.white.opacity(0.15)))
                } else {
                    ContentUnavailableView("No camera here", systemImage: "camera", description: Text("Paste the pairing text from your Mac instead."))
                }
                Text("On your Mac: ShuaCrew → Settings → Mobile → Pair iPhone. Both devices need Tailscale on.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                HStack {
                    TextField("…or paste the pairing text", text: $pasted).textFieldStyle(.roundedBorder).autocorrectionDisabled().textInputAutocapitalization(.never)
                    Button("Pair") { pair(pasted) }.buttonStyle(.borderedProminent).disabled(pasted.isEmpty || working)
                }
                if working { ProgressView("Reaching your Mac…") }
                Spacer()
            }
            .padding()
            .navigationTitle("Pair with your Mac")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func pair(_ text: String) {
        guard !working else { return }
        working = true
        Task {
            await link.pair(with: text)
            working = false
            if link.pairing != nil, link.error == nil { UINotificationFeedbackGenerator().notificationOccurred(.success); dismiss() }
        }
    }
}

/// VisionKit's live scanner, looking only for QR codes; the first readable one is handed back once.
private struct QRScanner: UIViewControllerRepresentable {
    let found: (String) -> Void
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
        scanner.delegate = context.coordinator
        try? scanner.startScanning()
        return scanner
    }
    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var done = false
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ scanner: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !done else { return }
            for case .barcode(let code) in items { if let text = code.payloadStringValue { done = true; found(text); return } }
        }
    }
}
