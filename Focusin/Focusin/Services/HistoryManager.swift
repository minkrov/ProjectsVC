import Foundation

// MARK: - History Manager
// Persists a log of completed sessions to Application Support/Focusin/history.json.
// Keeps the 20 most recent records. Thread-safe for reads; writes on the calling queue.

final class HistoryManager {
    static let shared = HistoryManager()

    private let fileURL: URL

    private init() {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("Focusin", isDirectory: true)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        fileURL = support.appendingPathComponent("history.json")
    }

    // MARK: - Public API

    func load() -> [SessionRecord] {
        guard let data = try? Data(contentsOf: fileURL),
              let records = try? JSONDecoder().decode([SessionRecord].self, from: data)
        else { return [] }
        return records
    }

    func record(session: BlockSession) {
        // Don't record sessions with no content or that never really ran
        guard !session.blockedWebsites.isEmpty || !session.blockedApps.isEmpty else { return }
        var records = load()
        records.insert(SessionRecord(from: session), at: 0)   // newest first
        if records.count > 20 { records = Array(records.prefix(20)) }
        if let data = try? JSONEncoder().encode(records) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}
