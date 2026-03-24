// FocusinWatcher — lightweight background executable
// Lives at Focusin.app/Contents/MacOS/FocusinWatcher
// Launched and kept alive by com.focusin.watcher LaunchAgent.
// No UI, no Dock icon, no menu bar — pure background process.

import Foundation
import AppKit

// MARK: - Models (must match SessionManager's JSON layout exactly)

private struct WatchSession: Codable {
    var endTime: Date
    var blockedApps: [WatchApp]
    var isActive: Bool { Date() < endTime }
}

private struct WatchApp: Codable {
    var bundleIdentifier: String
}

// MARK: - Paths

private let sessionURL: URL =
    FileManager.default
        .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Focusin/session.json")

private let watcherPlistURL: URL =
    FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/LaunchAgents/com.focusin.watcher.plist")

// MARK: - Helpers

private func loadSession() -> WatchSession? {
    guard let data = try? Data(contentsOf: sessionURL) else { return nil }
    return try? JSONDecoder().decode(WatchSession.self, from: data)
}

/// Remove our own LaunchAgent plist and exit cleanly.
/// KeepAlive.SuccessfulExit=false means launchd will NOT restart on exit(0).
private func shutDown() -> Never {
    fputs("[FocusinWatcher] Session ended — shutting down.\n", stderr)
    try? FileManager.default.removeItem(at: watcherPlistURL)
    let t = Process()
    t.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    t.arguments = ["bootout", "gui/\(getuid())/com.focusin.watcher"]
    try? t.run()
    exit(0)
}

// MARK: - Watcher class (needs NSObject for NotificationCenter selectors)

private final class AppWatcher: NSObject {

    private var blockedIDs: Set<String> = []
    private let myPID = ProcessInfo.processInfo.processIdentifier

    func start(with session: WatchSession) {
        reload(from: session)

        // ── Instant response via NSWorkspace notifications ────────────
        // didLaunchApplicationNotification fires the moment an app finishes
        // launching — we kill it before the user sees a single frame.
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(appLaunched(_:)),
            name: NSWorkspace.didLaunchApplicationNotification,
            object: nil
        )
        // didActivateApplicationNotification catches apps that were already
        // running when the session started, or apps that evade the launch event.
        NSWorkspace.shared.notificationCenter.addObserver(
            self,
            selector: #selector(appActivated(_:)),
            name: NSWorkspace.didActivateApplicationNotification,
            object: nil
        )

        // ── Initial sweep — kill anything already running ─────────────
        sweepAllRunningApps()

        // ── 2-second poll as a safety net + expiry check ──────────────
        Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            guard let self else { return }
            guard let session = loadSession(), session.isActive else {
                shutDown()
            }
            self.reload(from: session)
            self.sweepAllRunningApps()
        }
    }

    // MARK: - Notification handlers

    @objc private func appLaunched(_ note: Notification) {
        guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey]
                as? NSRunningApplication else { return }
        kill(app)
    }

    @objc private func appActivated(_ note: Notification) {
        guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey]
                as? NSRunningApplication else { return }
        kill(app)
    }

    // MARK: - Core logic

    private func sweepAllRunningApps() {
        NSWorkspace.shared.runningApplications.forEach { kill($0) }
    }

    private func kill(_ app: NSRunningApplication) {
        guard
            let bid = app.bundleIdentifier,
            blockedIDs.contains(bid),
            app.processIdentifier != myPID
        else { return }
        fputs("[FocusinWatcher] Terminating \(bid)\n", stderr)
        app.forceTerminate()
    }

    private func reload(from session: WatchSession) {
        blockedIDs = Set(session.blockedApps.map(\.bundleIdentifier))
    }
}

// MARK: - Entry point

// Initialize NSApplication so NSWorkspace notifications are delivered via the
// run loop, then immediately set .prohibited so the process has zero presence:
// no Dock icon, no App Switcher entry, no bouncing, nothing visible to the user.
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

guard let initial = loadSession(), initial.isActive else {
    fputs("[FocusinWatcher] No active session — removing LaunchAgent.\n", stderr)
    try? FileManager.default.removeItem(at: watcherPlistURL)
    exit(0)
}

fputs("[FocusinWatcher] Started. Blocking \(initial.blockedApps.count) app(s).\n", stderr)

private let watcher = AppWatcher()
watcher.start(with: initial)

// Run the main run loop so NSWorkspace notifications are delivered immediately.
RunLoop.main.run()
