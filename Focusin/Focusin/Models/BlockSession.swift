import Foundation

// MARK: - Block Session Model

struct BlockSession: Codable, Identifiable {
    var id: UUID
    var startTime: Date
    var endTime: Date
    var blockedWebsites: [String]      // bare domains, e.g. "reddit.com"
    var blockedApps: [BlockedApp]

    // MARK: Computed

    var isActive: Bool { Date() < endTime }

    var timeRemaining: TimeInterval { max(0, endTime.timeIntervalSinceNow) }

    var formattedTimeRemaining: String {
        let total = Int(timeRemaining)
        let days    = total / 86400
        let hours   = (total % 86400) / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if days > 0 {
            return String(format: "%dd %02dh %02dm %02ds", days, hours, minutes, seconds)
        } else if hours > 0 {
            return String(format: "%02dh %02dm %02ds", hours, minutes, seconds)
        } else {
            return String(format: "%02dm %02ds", minutes, seconds)
        }
    }
}

// MARK: - Blocked App

struct BlockedApp: Codable, Identifiable, Hashable {
    var id: String { bundleIdentifier }
    var name: String
    var bundleIdentifier: String
}

