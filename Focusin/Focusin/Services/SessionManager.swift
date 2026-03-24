import Foundation
import Combine

// MARK: - Session Manager

final class SessionManager: ObservableObject {
    @Published var currentSession: BlockSession?

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
            // Expired – clean up quietly
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

    func addToSession(websites: [String], apps: [BlockedApp]) {
        guard var session = currentSession else { return }

        let existingDomains = Set(session.blockedWebsites)
        session.blockedWebsites += websites.filter { !existingDomains.contains($0) }

        let existingIDs = Set(session.blockedApps.map(\.bundleIdentifier))
        session.blockedApps += apps.filter { !existingIDs.contains($0.bundleIdentifier) }

        saveSession(session)
    }

    func clearSession() {
        currentSession = nil
        silentlyDeleteSessionFile()
    }

    // MARK: - Helpers

    private func silentlyDeleteSessionFile() {
        try? FileManager.default.removeItem(at: sessionFileURL)
    }
}
