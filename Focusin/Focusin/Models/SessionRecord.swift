import Foundation

// MARK: - Session Record (history entry)

struct SessionRecord: Codable, Identifiable {
    let id: UUID
    let startTime: Date
    let endTime: Date
    let websiteCount: Int
    let appCount: Int

    init(from session: BlockSession) {
        self.id           = UUID()
        self.startTime    = session.startTime
        self.endTime      = session.endTime
        self.websiteCount = session.blockedWebsites.count
        self.appCount     = session.blockedApps.count
    }

    // MARK: - Display helpers

    var formattedDate: String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f.string(from: startTime)
    }

    var formattedDuration: String {
        let total   = Int(endTime.timeIntervalSince(startTime))
        let days    = total / 86400
        let hours   = (total % 86400) / 3600
        let minutes = (total % 3600) / 60
        if days > 0  { return "\(days)d \(hours)h" }
        if hours > 0 { return "\(hours)h \(minutes)m" }
        return "\(minutes)m"
    }

    var summary: String {
        switch (websiteCount, appCount) {
        case (0, let a) where a > 0: return "\(a) app\(a == 1 ? "" : "s")"
        case (let w, 0) where w > 0: return "\(w) site\(w == 1 ? "" : "s")"
        default:                     return "\(websiteCount) sites · \(appCount) apps"
        }
    }
}
