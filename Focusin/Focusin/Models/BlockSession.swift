import Foundation

// MARK: - Block Session Model

struct BlockSession: Codable, Identifiable {
    var id: UUID
    var startTime: Date
    var endTime: Date
    var blockedWebsites: [String]      // bare domains, e.g. "reddit.com"
    var blockedApps: [BlockedApp]
    var pomodoroEnabled: Bool
    var pomodoroStartTime: Date?       // when Pomodoro was last toggled on; nil when off

    // Custom decoder — keeps backwards compatibility with sessions saved before these fields existed
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id                = try c.decode(UUID.self,          forKey: .id)
        startTime         = try c.decode(Date.self,          forKey: .startTime)
        endTime           = try c.decode(Date.self,          forKey: .endTime)
        blockedWebsites   = try c.decode([String].self,      forKey: .blockedWebsites)
        blockedApps       = try c.decode([BlockedApp].self,  forKey: .blockedApps)
        pomodoroEnabled   = try c.decodeIfPresent(Bool.self,  forKey: .pomodoroEnabled)   ?? false
        pomodoroStartTime = try c.decodeIfPresent(Date.self,  forKey: .pomodoroStartTime)
    }

    init(id: UUID, startTime: Date, endTime: Date,
         blockedWebsites: [String], blockedApps: [BlockedApp],
         pomodoroEnabled: Bool = false, pomodoroStartTime: Date? = nil) {
        self.id                = id
        self.startTime         = startTime
        self.endTime           = endTime
        self.blockedWebsites   = blockedWebsites
        self.blockedApps       = blockedApps
        self.pomodoroEnabled   = pomodoroEnabled
        self.pomodoroStartTime = pomodoroStartTime
    }

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

