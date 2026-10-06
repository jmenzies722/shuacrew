import AppKit
import iTunesLibrary

/// Your Apple Music library, read natively (iTunesLibrary: no Automation prompt, ~1 s for 5,000 songs) and played
/// through the Music app. Studio shows albums from here; nothing leaves the Mac and nothing is copied.
enum MusicLibrary {
    /// One song as Studio needs it, from either source (iTunesLibrary, or Music itself when that can't be read).
    struct Track { let id: String, title: String, artist: String, album: String, disc: Int, n: Int, ms: Int, plays: Int, item: ITLibMediaItem? }
    private static var cache: (at: Date, albums: [Album], tracks: [String: [Track]])?
    /// Where the library came from this time: "library" (native) or "music" (asked the Music app).
    private(set) static var source = "library"
    private static var art: [String: String] = [:]
    private static let lock = NSLock()

    struct Album {
        let id: String, title: String, artist: String, year: Int, tracks: Int, added: Double, plays: Int, lastPlayed: Double, genre: String
        var json: [String: Any] { ["id": id, "title": title, "artist": artist, "year": year, "tracks": tracks, "added": added, "plays": plays, "lastPlayed": lastPlayed, "genre": genre] }
    }

    private static func hex(_ n: NSNumber) -> String { String(format: "%016llX", n.uint64Value) }
    private static func ms(_ d: Date?) -> Double { (d?.timeIntervalSince1970 ?? 0) * 1000 }

    /// Every album with at least one song, newest addition first. Re-read at most every 5 minutes.
    static func albums(force: Bool = false) throws -> [Album] {
        lock.lock(); defer { lock.unlock() }
        if !force, let c = cache, Date().timeIntervalSince(c.at) < 300 { return c.albums }
        do {
            let lib = try ITLibrary(apiVersion: "1.1")
            var groups: [String: [ITLibMediaItem]] = [:]
            for item in lib.allMediaItems where item.mediaKind == .kindSong { groups[hex(item.album.persistentID), default: []].append(item) }
            let list: [Album] = groups.compactMap { id, items in
                guard let first = items.first else { return nil }
                let a = first.album
                return Album(id: id, title: a.title ?? "Untitled", artist: a.albumArtist ?? first.artist?.name ?? "Unknown artist",
                             year: items.map(\.year).max() ?? 0, tracks: items.count,
                             added: items.map { ms($0.addedDate) }.max() ?? 0, plays: items.reduce(0) { $0 + $1.playCount },
                             lastPlayed: items.map { ms($0.lastPlayedDate) }.max() ?? 0, genre: first.genre)
            }.sorted { $0.added > $1.added }
            cache = (Date(), list, groups.mapValues { $0.map { i in Track(id: hex(i.persistentID), title: i.title, artist: i.artist?.name ?? "", album: i.album.title ?? "",
                                                                           disc: i.album.discNumber, n: i.trackNumber, ms: i.totalTime, plays: i.playCount, item: i) } })
            source = "library"
            return list
        } catch {
            // The native read needs Media & Apple Music access; Music itself only needs the Automation access we have.
            let (list, groups) = try fromMusicApp()
            cache = (Date(), list, groups)
            source = "music"
            return list
        }
    }

    /// An album's songs in disc and track order.
    static func tracks(of album: String) -> [Track] {
        lock.lock(); defer { lock.unlock() }
        return (cache?.tracks[album] ?? []).sorted { ($0.disc, $0.n, $0.title) < ($1.disc, $1.n, $1.title) }
    }

    static func trackList(of album: String) -> [[String: Any]] {
        tracks(of: album).map { ["id": $0.id, "title": $0.title, "artist": $0.artist, "n": $0.n, "ms": $0.ms, "plays": $0.plays] }
    }

    /// The whole library in one Apple event per field (~1–2 s for 5,000 songs), grouped into albums by title + artist.
    private static func fromMusicApp() throws -> ([Album], [String: [Track]]) {
        let fields = ["persistent ID", "name", "artist", "album", "album artist", "disc number", "track number", "duration", "played count", "date added", "played date", "year", "genre"]
        let script = "with timeout of 30 seconds\ntell application \"Music\"\nset t to every track of library playlist 1\nreturn {" +
            fields.map { "\($0) of t" }.joined(separator: ", ") + "}\nend tell\nend timeout"
        var error: NSDictionary?
        guard let out = NSAppleScript(source: script)?.executeAndReturnError(&error), error == nil, out.numberOfItems == fields.count else {
            throw NSError(domain: "MusicLibrary", code: 1, userInfo: [NSLocalizedDescriptionKey: (error?[NSAppleScript.errorMessage] as? String) ?? "Music didn't answer"])
        }
        let col = { (i: Int) -> NSAppleEventDescriptor in out.atIndex(i + 1)! }
        let count = col(0).numberOfItems
        func str(_ c: Int, _ i: Int) -> String { col(c).atIndex(i)?.stringValue ?? "" }
        func int(_ c: Int, _ i: Int) -> Int { Int(col(c).atIndex(i)?.int32Value ?? 0) }
        func num(_ c: Int, _ i: Int) -> Double { col(c).atIndex(i)?.doubleValue ?? 0 }
        func date(_ c: Int, _ i: Int) -> Double { ms(col(c).atIndex(i)?.dateValue) }
        var groups: [String: [Track]] = [:], meta: [String: (title: String, artist: String, year: Int, added: Double, last: Double, plays: Int, genre: String)] = [:]
        for i in 1...max(count, 1) where count > 0 {
            let albumTitle = str(3, i), artist = str(4, i).isEmpty ? str(2, i) : str(4, i)
            let key = String(format: "%016llX", UInt64(bitPattern: Int64("\(albumTitle)|\(artist)".hashValue)))
            groups[key, default: []].append(Track(id: str(0, i), title: str(1, i), artist: str(2, i), album: albumTitle, disc: int(5, i), n: int(6, i),
                                                  ms: Int(num(7, i) * 1000), plays: int(8, i), item: nil))
            var m = meta[key] ?? (albumTitle.isEmpty ? "Untitled" : albumTitle, artist.isEmpty ? "Unknown artist" : artist, 0, 0, 0, 0, str(12, i))
            m.year = max(m.year, int(11, i)); m.added = max(m.added, date(9, i)); m.last = max(m.last, date(10, i)); m.plays += int(8, i)
            meta[key] = m
        }
        let list = meta.map { id, m in Album(id: id, title: m.title, artist: m.artist, year: m.year, tracks: groups[id]?.count ?? 0, added: m.added, plays: m.plays, lastPlayed: m.last, genre: m.genre) }
            .sorted { $0.added > $1.added }
        return (list, groups)
    }

    /// Small square covers as data URLs (240 px JPEG), cached for the session.
    static func artwork(for ids: [String]) -> [String: String] {
        var out: [String: String] = [:]
        for id in ids.prefix(60) {
            lock.lock(); let known = art[id]; lock.unlock()
            if let known { out[id] = known; continue }
            let songs = tracks(of: id)
            let image = songs.first(where: { $0.item?.hasArtworkAvailable == true })?.item?.artwork?.image ?? songs.first.flatMap { musicArtwork(track: $0.id) }
            guard let image, let url = jpeg(image, side: 240) else { continue }
            lock.lock(); art[id] = url; lock.unlock()
            out[id] = url
        }
        return out
    }

    private static func musicArtwork(track: String) -> NSImage? {
        guard track.count == 16, track.allSatisfy(\.isHexDigit) else { return nil }
        var error: NSDictionary?
        let script = "with timeout of 3 seconds\ntell application \"Music\" to get raw data of artwork 1 of (first track of library playlist 1 whose persistent ID is \"\(track)\")\nend timeout"
        guard let data = NSAppleScript(source: script)?.executeAndReturnError(&error).data, error == nil else { return nil }
        return NSImage(data: data)
    }

    private static func jpeg(_ image: NSImage, side: Int) -> String? {
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                         isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(x: 0, y: 0, width: side, height: side)); NSGraphicsContext.restoreGraphicsState()
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.82]) else { return nil }
        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    /// Plays a whole album in order (or from one of its songs) through Music. Music can't queue a list by script, so
    /// the album goes into one playlist of ours, "ShuaCrew · Now Playing", which is refilled each time.
    static func play(album: String, from track: String? = nil, shuffle: Bool = false) -> (ok: Bool, message: String) {
        let items = tracks(of: album)
        guard !items.isEmpty else { return (false, "That album isn't in your library anymore.") }
        let ids = items.map { "\"\($0.id)\"" }.joined(separator: ", ")
        let start = track.flatMap { t in items.firstIndex { $0.id == t } }.map { $0 + 1 } ?? 1
        let script = """
        with timeout of 20 seconds
        tell application "Music"
          set p to "ShuaCrew · Now Playing"
          if not (exists user playlist p) then make new user playlist with properties {name:p, description:"What you play from ShuaCrew Studio. Refilled each time."}
          set q to user playlist p
          delete every track of q
          repeat with i in {\(ids)}
            try
              duplicate (first track of library playlist 1 whose persistent ID is (contents of i)) to q
            end try
          end repeat
          set shuffle enabled to \(shuffle)
          play track \(start) of q
        end tell
        end timeout
        """
        var error: NSDictionary?
        _ = NSAppleScript(source: script)?.executeAndReturnError(&error)
        if let error { return (false, (error[NSAppleScript.errorMessage] as? String).map { "Music said: \($0)" } ?? "Music didn't respond.") }
        let title = items.first?.album ?? "the album"
        return (true, track == nil ? "Playing \(title)" : "Playing from \(title)")
    }
}
