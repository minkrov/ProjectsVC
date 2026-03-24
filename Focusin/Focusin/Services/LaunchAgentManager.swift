import Foundation

// MARK: - Launch Agent Manager
//
// Manages two separate LaunchAgents:
//
//  com.focusin.app     – relaunches the main UI on login (no KeepAlive)
//                        so the countdown / expiry prompt appears automatically.
//
//  com.focusin.watcher – runs FocusinWatcher with KeepAlive so app-blocking
//                        persists even when the main UI is closed.

final class LaunchAgentManager {

    // MARK: - Labels & paths

    private static let appLabel     = "com.focusin.app"
    private static let watcherLabel = "com.focusin.watcher"

    private var appPlistURL: URL {
        agentsDir.appendingPathComponent("\(Self.appLabel).plist")
    }
    private var watcherPlistURL: URL {
        agentsDir.appendingPathComponent("\(Self.watcherLabel).plist")
    }
    private var agentsDir: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents")
    }

    // MARK: - Main-app agent (login relaunch, no KeepAlive)

    func installMainAppAgent() {
        guard let execPath = Bundle.main.executablePath else { return }
        let plist: [String: Any] = [
            "Label":             Self.appLabel,
            "ProgramArguments":  [execPath],
            "RunAtLoad":         true,
            "KeepAlive":         false,
            "ThrottleInterval":  5,
        ]
        writePlist(plist, to: appPlistURL)
        bootstrap(plistURL: appPlistURL)
    }

    func uninstallMainAppAgent() {
        bootout(label: Self.appLabel, plistURL: appPlistURL)
        try? FileManager.default.removeItem(at: appPlistURL)
    }

    // MARK: - Watcher agent (KeepAlive on crash, stops on clean exit)

    /// Call this once when the user confirms a block session.
    /// `appBundle` should be `Bundle.main.bundleURL` — the .app wrapper.
    func installWatcherAgent(appBundle: URL = Bundle.main.bundleURL) {
        // Safety: refuse to install if the app is running from a DMG mount
        // (path contains /Volumes/). A DMG-based LaunchAgent would break the
        // moment the disk image is ejected, causing an endless restart loop.
        let bundlePath = appBundle.path
        guard !bundlePath.hasPrefix("/Volumes/") else {
            fputs("[LaunchAgentManager] Skipping LaunchAgent install — app is running from a DMG. Install to /Applications first.\n", stderr)
            return
        }

        let watcherExec = appBundle
            .appendingPathComponent("Contents/MacOS/FocusinWatcher")
            .path

        // KeepAlive.SuccessfulExit = false:
        //   → launchd restarts the watcher if it crashes (non-zero exit)
        //   → launchd does NOT restart it if it exits cleanly (exit 0)
        // This lets the watcher shut itself down permanently when the session
        // expires just by calling exit(0) after removing this plist.
        let plist: [String: Any] = [
            "Label":            Self.watcherLabel,
            "ProgramArguments": [watcherExec],
            "RunAtLoad":        true,
            "KeepAlive":        ["SuccessfulExit": false],
            "ThrottleInterval": 5,
            "StandardOutPath":  "/tmp/com.focusin.watcher.log",
            "StandardErrorPath":"/tmp/com.focusin.watcher.log",
        ]
        writePlist(plist, to: watcherPlistURL)
        bootstrap(plistURL: watcherPlistURL)
    }

    /// Call this when the block session expires (from the main app side).
    func uninstallWatcherAgent() {
        bootout(label: Self.watcherLabel, plistURL: watcherPlistURL)
        try? FileManager.default.removeItem(at: watcherPlistURL)
    }

    // MARK: - launchctl helpers

    private func bootstrap(plistURL: URL) {
        shell("/bin/launchctl", args: ["bootstrap", "gui/\(getuid())", plistURL.path])
    }

    private func bootout(label: String, plistURL: URL) {
        // Try path-based bootout first (works even if label lookup fails)
        if FileManager.default.fileExists(atPath: plistURL.path) {
            shell("/bin/launchctl", args: ["bootout", "gui/\(getuid())", plistURL.path])
        } else {
            // Fall back to label-based bootout
            shell("/bin/launchctl", args: ["bootout", "gui/\(getuid())/\(label)"])
        }
    }

    // MARK: - File writing

    private func writePlist(_ dict: [String: Any], to url: URL) {
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        guard let data = try? PropertyListSerialization.data(
            fromPropertyList: dict, format: .xml, options: 0
        ) else { return }
        try? data.write(to: url, options: .atomic)
    }

    // MARK: - Shell

    @discardableResult
    private func shell(_ exec: String, args: [String]) -> Int32 {
        let t = Process()
        t.executableURL = URL(fileURLWithPath: exec)
        t.arguments = args
        t.standardOutput = FileHandle.nullDevice
        t.standardError  = FileHandle.nullDevice
        try? t.run()
        t.waitUntilExit()
        return t.terminationStatus
    }
}
