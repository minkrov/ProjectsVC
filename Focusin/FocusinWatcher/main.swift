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

/// Returns false if the session looks corrupted (end date wildly in the past or future).
private func isSessionSane(_ s: WatchSession) -> Bool {
    let now = Date()
    // Reject sessions that ended more than a minute ago (shouldn't happen but guards
    // against a stale file) or that claim to end more than 8 days from now (max duration).
    let maxDuration: TimeInterval = 8 * 24 * 3600
    return s.endTime > now.addingTimeInterval(-60) && s.endTime < now.addingTimeInterval(maxDuration)
}

/// Remove our own LaunchAgent plist and exit cleanly.
/// KeepAlive.SuccessfulExit=false means launchd will NOT restart on exit(0).
private func shutDown() -> Never {
    fputs("[FocusinWatcher] Session ended — shutting down.\n", stderr)

    // Unblock websites: remove Focusin's block from /etc/hosts.
    // This runs with administrator privileges (same as when blocking began).
    let unblockCmd = #"sed -i '' '/===FOCUSIN_BLOCK_START===/,/===FOCUSIN_BLOCK_END===/d' /etc/hosts && dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null || true"#
    let escaped = unblockCmd
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
    let src = "do shell script \"\(escaped)\" with administrator privileges"
    if let script = NSAppleScript(source: src) {
        var err: NSDictionary?
        script.executeAndReturnError(&err)
        if let e = err { fputs("[FocusinWatcher] Unblock error: \(e)\n", stderr) }
    }

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
            // If session file is missing, unreadable, or expired — shut down cleanly.
            guard let session = loadSession(), isSessionSane(session), session.isActive else {
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
            app.processIdentifier != myPID,
            !app.isTerminated          // don't call forceTerminate on a zombie
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
    fputs("[FocusinWatcher] No active session — cleaning up and removing LaunchAgent.\n", stderr)
    // If a session file existed but was already expired, unblock hosts before exiting.
    // This covers the case where the watcher was restarted after session expiry.
    let hostsContent = (try? String(contentsOfFile: "/etc/hosts", encoding: .utf8)) ?? ""
    if hostsContent.contains("===FOCUSIN_BLOCK_START===") {
        let cmd = #"sed -i '' '/===FOCUSIN_BLOCK_START===/,/===FOCUSIN_BLOCK_END===/d' /etc/hosts && dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null || true"#
        let escaped = cmd
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        if let script = NSAppleScript(source: "do shell script \"\(escaped)\" with administrator privileges") {
            var err: NSDictionary?
            script.executeAndReturnError(&err)
        }
    }
    try? FileManager.default.removeItem(at: watcherPlistURL)
    exit(0)
}

fputs("[FocusinWatcher] Started. Blocking \(initial.blockedApps.count) app(s).\n", stderr)

private let watcher = AppWatcher()
watcher.start(with: initial)

// Run the main run loop so NSWorkspace notifications are delivered immediately.
RunLoop.main.run()
