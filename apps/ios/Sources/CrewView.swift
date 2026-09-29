import SwiftUI
import ShuaCrewMobile

struct CrewView: View {
    @EnvironmentObject var model: MobileModel
    var body: some View {
        List {
            if let snapshot = model.snapshot {
                Section { FreshnessView() }
                ForEach(snapshot.rooms, id: \.id) { room in
                    NavigationLink { RoomView(roomId: room.id) } label: {
                        Label { VStack(alignment: .leading) { Text(room.title); Text(room.paused ? "Paused" : "Open").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "bubble.left.and.bubble.right") }
                    }
                }
                if snapshot.rooms.isEmpty { ContentUnavailableView("No rooms shared", systemImage: "person.3", description: Text("Choose room scope in Mobile Settings on your Mac.")) }
            } else { ContentUnavailableView("Your crew stays private", systemImage: "lock.shield", description: Text("Pair with your Mac before viewing crew conversations.")) }
        }.navigationTitle("Crew")
    }
}

private struct RoomView: View {
    @EnvironmentObject var model: MobileModel
    let roomId: String
    @State private var text = ""
    @State private var confirmingPause = false
    private var room: MobileRoom? { model.snapshot?.rooms.first { $0.id == roomId } }
    var body: some View {
        List {
            FreshnessView()
            if let room {
                ForEach(room.messages, id: \.id) { message in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack { Text(message.author).font(.caption.bold()).foregroundStyle(.teal); Spacer(); Text(Date(timeIntervalSince1970: Double(message.at) / 1000), style: .time).font(.caption).foregroundStyle(.secondary) }
                        Text(message.text).textSelection(.enabled)
                    }.padding(.vertical, 4)
                }
                if room.truncated { Text("Recent messages only. Full history stays on your Mac.").font(.caption).foregroundStyle(.secondary) }
                Section("Message your crew") {
                    TextField("What needs doing?", text: $text, axis: .vertical).lineLimit(2...8)
                    Button("Queue message", systemImage: "paperplane") {
                        let message = text
                        Task { if await model.submit(.message(roomId: roomId, text: message)), text == message { text = "" } }
                    }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.utf8.count > 8000 || model.busy)
                    Text("Queued requests require a Mac acknowledgment. Review Today for their status.").font(.caption).foregroundStyle(.secondary)
                }
                Button(room.paused ? "Resume room…" : "Pause room…") { confirmingPause = true }.disabled(model.busy)
            } else { Text("This room is no longer in the shared scope.") }
        }
        .navigationTitle(room?.title ?? "Room")
        .confirmationDialog("Change this room on your Mac?", isPresented: $confirmingPause) {
            if let room { Button(room.paused ? "Resume room" : "Pause room") { Task { await model.submit(.pause(roomId: roomId, paused: !room.paused)) } } }
        }
    }
}
