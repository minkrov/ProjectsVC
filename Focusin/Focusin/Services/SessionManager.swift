import Foundation
import Combine

// MARK: - Session Manager

final class SessionManager: ObservableObject {
    @Published var currentSession: BlockSession?
    /// Set to true when a session ends (either on relaunch after expiry or in-background expiry).
    /// ContentView observes this to show the session-end overlay.
    @Published var sessionJustEnded = false

    private let sessionFileURL: URL

    init() {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appendingPathComponent("Focusin", isDirectory: true)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        sessionFileURL = support.appendingPathComponent("session.json")
        loadSession()
    }

    // MARK: - Load / Save / Clear

    func loadSession() {
        guard let data = try? Data(contentsOf: sessionFileURL),
              let session = try? JSONDecoder().decode(BlockSession.self, from: data) else {
            currentSession = nil
            return
        }
        if session.isActive {
            currentSession = session
        } else {
            // Expired while app was closed — signal ContentView to show the completion overlay,
            // but only if the session ended recently (within 24 h). A very old expired session
            // (e.g. leftover data from a previous install or beta run) is cleaned up silently
            // so the user doesn't see a confusing celebration screen on first launch.
            if session.endTime.timeIntervalSinceNow > -(24 * 3600) {
                sessionJustEnded = true
            }
            currentSession = nil
            silentlyDeleteSessionFile()
        }
    }

    func saveSession(_ session: BlockSession) {
        currentSession = session
        if let data = try? JSONEncoder().encode(session) {
            try? data.write(to: sessionFileURL, options: .atomic)
        }
    }

    func setPomodoroEnabled(_ enabled: Bool) {
        guard var session = currentSession else { return }
        session.pomodoroEnabled   = enabled
        session.pomodoroStartTime = enabled ? Date() : nil
        saveSession(session)
    }

    func addToSession(websites: [String], apps: [BlockedApp]) {
        guard var session = currentSession else { return }

        let existingDomains = Set(session.blockedWebsites)
        session.blockedWebsites += websites.filter { !existingDomains.contains($0) }

        let existingIDs = Set(session.blockedApps.map(\.bundleIdentifier))
        session.blockedApps += apps.filter { !existingIDs.contains($0.bundleIdentifier) }

        saveSession(session)
    }

    func clearSession() {
        if let session = currentSession {
            HistoryManager.shared.record(session: session)
        }
        currentSession = nil
        silentlyDeleteSessionFile()
    }

    // MARK: - Helpers

    private func silentlyDeleteSessionFile() {
        try? FileManager.default.removeItem(at: sessionFileURL)
    }
}
