import AppKit

/// The chess lens: read the real board off the page (chess.com or lichess, through ShuaWeb), ask Stockfish on this Mac,
/// and hand Spark the move with the exact squares on screen, so it points at the move instead of guessing pixels
/// (it once clicked the same square over and over). Fair play: only games against the computer, analysis, puzzles and
/// lessons — never a live game against a person.
@MainActor
enum ShuaChess {
    static func best(on screen: NSScreen) async -> (ok: Bool, message: String, output: String?) {
        guard let app = SparkHands.target, ShuaWeb.supports(app) else { return (false, "Open the board in Chrome or Safari first.", nil) }
        let raw: String
        do { raw = try await ShuaWeb.run(boardJS, in: app, timeout: 4) }
        catch { return (false, (error as? LocalizedError)?.errorDescription ?? "Couldn't read the page.", nil) }
        guard let data = raw.data(using: .utf8), let b = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pieces = b["p"] as? [[Any]], !pieces.isEmpty, let rect = b["r"] as? [Double], rect.count == 4 else {
            return (false, "I don't see a chess board on this page.", nil)
        }
        let url = b["u"] as? String ?? ""
        guard b["fair"] as? Bool == true else {
            return (false, "This looks like a live game against a person. Engine help there breaks fair play, so I won't suggest moves — I can go through it with you after the game, or help against the computer, in analysis or puzzles.", nil)
        }
        // The board as FEN. Squares are file 0–7 (a–h), rank 0–7 (1–8).
        var grid = [[Character?]](repeating: [Character?](repeating: nil, count: 8), count: 8)
        for p in pieces { if p.count == 3, let f = p[0] as? Int, let r = p[1] as? Int, let c = (p[2] as? String)?.first, (0..<8).contains(f), (0..<8).contains(r) { grid[r][f] = c } }
        let placement = (0..<8).reversed().map { r -> String in
            var row = "", empty = 0
            for f in 0..<8 { if let c = grid[r][f] { if empty > 0 { row += String(empty); empty = 0 }; row.append(c) } else { empty += 1 } }
            return empty > 0 ? row + String(empty) : row
        }.joined(separator: "/")
        let flipped = b["f"] as? Bool ?? false, plies = b["n"] as? Int ?? -1
        let white = plies >= 0 ? plies % 2 == 0 : !flipped // unknown move count: the side at the bottom (theirs) is to move
        var castle = ""
        if grid[0][4] == "K" { if grid[0][7] == "R" { castle += "K" }; if grid[0][0] == "R" { castle += "Q" } }
        if grid[7][4] == "k" { if grid[7][7] == "r" { castle += "k" }; if grid[7][0] == "r" { castle += "q" } }
        let fen = "\(placement) \(white ? "w" : "b") \(castle.isEmpty ? "-" : castle) - 0 1"
        guard let (move, score) = await stockfish(fen) else { return (false, "Stockfish isn't answering (brew install stockfish).", nil) }
        guard move.count >= 4, move != "(none)" else { return (true, "No legal moves — the game's over.", "FEN \(fen): no legal moves (checkmate or stalemate).") }
        let chars = Array(move), from = (Int(chars[0].asciiValue! - 97), Int(chars[1].asciiValue! - 49)), to = (Int(chars[2].asciiValue! - 97), Int(chars[3].asciiValue! - 49))
        let names: [Character: String] = ["p": "Pawn", "n": "Knight", "b": "Bishop", "r": "Rook", "q": "Queen", "k": "King"]
        let piece = grid[from.1][from.0].flatMap { names[Character($0.lowercased())] } ?? "Piece"
        let sq = { (s: (Int, Int)) in "\(Character(UnicodeScalar(97 + s.0)!))\(s.1 + 1)" }
        // Square centres on screen (fractions), from the board's frame on the page.
        let zoom = max(0.25, (b["dpr"] as? Double ?? screen.backingScaleFactor) / screen.backingScaleFactor)
        let ox = b["x"] as? Double ?? 0, oy = b["y"] as? Double ?? 0
        let mainHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height, f = screen.frame, top = mainHeight - f.maxY
        let centre = { (s: (Int, Int)) -> (Double, Double) in
            let col = flipped ? 7 - s.0 : s.0, row = flipped ? s.1 : 7 - s.1, side = rect[2] / 8
            let gx = ox + (rect[0] + (Double(col) + 0.5) * side) * zoom, gy = oy + (rect[1] + (Double(row) + 0.5) * side) * zoom
            return (((gx - f.minX) / f.width * 10000).rounded() / 10000, ((gy - top) / f.height * 10000).rounded() / 10000)
        }
        let (fx, fy) = centre(from), (tx, ty) = centre(to)
        let promo = chars.count > 4 ? " promoting to a \(names[chars[4]] ?? "Queen")" : ""
        let spoken = "\(piece) \(sq(from)) to \(sq(to))\(promo)"
        let output = """
        Board read from \(url) (\(white ? "White" : "Black") to move). Stockfish 18's best move: \(spoken)\(score.map { " (\($0))" } ?? ""). FEN \(fen).
        Say the move in plain words, and show it on their board with exactly this block: ```draw [{"shape":"arrow","from":[\(fx),\(fy)],"to":[\(tx),\(ty)],"label":"\(sq(from))→\(sq(to))"}]```
        Explain the idea behind it in a sentence if it isn't obvious.
        """
        return (true, "Best move: \(spoken)", output)
    }

    /// Stockfish on this Mac: the best move in under a second, and how it scores the position.
    private static func stockfish(_ fen: String) async -> (String, String?)? {
        let path = ["/opt/homebrew/bin/stockfish", "/usr/local/bin/stockfish"].first { FileManager.default.isExecutableFile(atPath: $0) }
        guard let path else { return nil }
        return await withCheckedContinuation { done in
            DispatchQueue.global(qos: .userInitiated).async {
                let p = Process(), inPipe = Pipe(), outPipe = Pipe()
                p.executableURL = URL(fileURLWithPath: path); p.standardInput = inPipe; p.standardOutput = outPipe; p.standardError = FileHandle.nullDevice
                guard (try? p.run()) != nil else { done.resume(returning: nil); return }
                inPipe.fileHandleForWriting.write("uci\nsetoption name Threads value 4\nisready\nposition fen \(fen)\ngo movetime 900\n".data(using: .utf8)!)
                var text = "", best: String?, score: String?
                let deadline = Date().addingTimeInterval(5)
                while best == nil, Date() < deadline {
                    let chunk = outPipe.fileHandleForReading.availableData
                    if chunk.isEmpty { break }
                    text += String(decoding: chunk, as: UTF8.self)
                    for line in text.split(separator: "\n") {
                        if line.hasPrefix("info"), let r = line.range(of: " score ") {
                            let parts = line[r.upperBound...].split(separator: " ")
                            if parts.count >= 2 { score = parts[0] == "mate" ? "mate in \(parts[1])" : (Double(parts[1]).map { String(format: "%+.1f for the side to move", $0 / 100) }) }
                        }
                        if line.hasPrefix("bestmove") { best = line.split(separator: " ").dropFirst().first.map(String.init) }
                    }
                }
                inPipe.fileHandleForWriting.write("quit\n".data(using: .utf8)!); p.terminate()
                done.resume(returning: best.map { ($0, score) })
            }
        }
    }

    /// Pieces as [file, rank, fenChar], the board's frame (CSS px), whether it's flipped, the move count if the page
    /// shows one, and whether engine help is fair here (computer game, analysis, puzzle or lesson).
    private static let boardJS = #"""
    (() => { const u = location.href, host = location.hostname; let p = [], r = null, f = false, n = -1, fair = false;
    const kinds = { p: 'p', n: 'n', b: 'b', r: 'r', q: 'q', k: 'k', pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
    if (/chess\.com$/.test(host)) { const board = document.querySelector('wc-chess-board, chess-board, .board'); if (board) { const b = board.getBoundingClientRect(); r = [b.left, b.top, b.width, b.height]; f = board.classList.contains('flipped');
        board.querySelectorAll('.piece').forEach((el) => { const c = [...el.classList], t = c.find((x) => /^[wb][pnbrqk]$/.test(x)), s = c.find((x) => /^square-\d\d$/.test(x)); if (t && s) { const ch = t[1]; p.push([+s[7] - 1, +s[8] - 1, t[0] === 'w' ? ch.toUpperCase() : ch]); } });
        const plies = [...document.querySelectorAll('[data-ply]')].map((e) => +e.getAttribute('data-ply')).filter((x) => x > 0); if (plies.length) n = Math.max(...plies); }
      fair = /\/(play\/computer|game\/computer|computer|analysis|puzzles?|lessons?|practice|drills|learn|explorer|daily-puzzle|puzzle-rush|bots?)(\/|$|\?)/.test(location.pathname); }
    else if (/lichess\.org$/.test(host)) { const board = document.querySelector('cg-board'), wrap = document.querySelector('.cg-wrap'); if (board) { const b = board.getBoundingClientRect(), side = b.width / 8; r = [b.left, b.top, b.width, b.height]; f = !!(wrap && wrap.classList.contains('orientation-black'));
        board.querySelectorAll('piece').forEach((el) => { if (el.classList.contains('ghost') || el.classList.contains('fading')) return; const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform || ''); const t = Object.keys(kinds).find((k) => k.length > 1 && el.classList.contains(k)); if (!m || !t) return;
          const col = Math.round(+m[1] / side), row = Math.round(+m[2] / side), file = f ? 7 - col : col, rank = f ? row : 7 - row; const ch = kinds[t]; p.push([file, rank, el.classList.contains('white') ? ch.toUpperCase() : ch]); });
        const moves = document.querySelectorAll('l4x kwdb, .tview2 move, rm6 kwdb'); if (moves.length) n = moves.length;
        const side = /_(w|b)_/.exec(decodeURIComponent(location.pathname)); if (side && !moves.length) n = side[1] === 'w' ? 0 : 1; }
      fair = /^\/(analysis|training|study|practice|editor|learn|streak|storm|racer)/.test(location.pathname) || /stockfish level|\bAI level\b/i.test(document.body.innerText.slice(0, 20000)); }
    return JSON.stringify({ u, p, r, f, n, fair, x: screenX, y: screenY + (outerHeight - innerHeight), dpr: devicePixelRatio }); })()
    """#
}
