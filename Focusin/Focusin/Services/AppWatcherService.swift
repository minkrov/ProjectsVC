import Foundation
import AppKit
import Combine

// MARK: - App Watcher Service (in-process, runs while the main UI is open)
// Uses NSWorkspace notifications for instant response the moment a blocked
// app launches, plus a 2-second poll as a safety net.

final class AppWatcherService: ObservableObject {

    @Published private(set) var isRunning = false

    private var blockedBundleIDs: Set<String> = []
    private var cancellables = Set<AnyCancellable>()
    private var pollTimer: Timer?
    private let myPID = ProcessInfo.processInfo.processIdentifier

    // MARK: - Start / Stop

    func start(blocking apps: [BlockedApp]) {
        blockedBundleIDs = Set(apps.map(\.bundleIdentifier))
        guard !isRunning else { return }   // subscriptions already live; blockedIDs updated above
        isRunning = true

        // ── Instant kill on launch ─────────────────────────────────────
        NSWorkspace.shared.notificationCenter
            .publisher(for: NSWorkspace.didLaunchApplicationNotification)
            .compactMap { $0.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication }
            .sink { [weak self] app in self?.kill(app) }
            .store(in: &cancellables)

        // ── Instant kill on activation (catches already-running apps) ──
        NSWorkspace.shared.notificationCenter
            .publisher(for: NSWorkspace.didActivateApplicationNotification)
            .compactMap { $0.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication }
            .sink { [weak self] app in self?.kill(app) }
            .store(in: &cancellables)

        // ── Initial sweep ──────────────────────────────────────────────
        sweepAll()

        // ── 2-second poll as a safety net ──────────────────────────────
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.sweepAll()
        }
    }

    func addBlocking(apps: [BlockedApp]) {
        let newIDs = Set(apps.map(\.bundleIdentifier))
        blockedBundleIDs.formUnion(newIDs)
        if !isRunning {
            // Watcher wasn't started (session had no apps initially) — start it now
            // using the provided apps directly so names are preserved.
            start(blocking: apps)
        } else {
            sweepAll()  // immediately kill anything already running
        }
    }

    func stop() {
        isRunning = false
        cancellables.removeAll()
        pollTimer?.invalidate()
        pollTimer = nil
        blockedBundleIDs = []
    }

    // MARK: - Kill

    private func sweepAll() {
        NSWorkspace.shared.runningApplications.forEach { kill($0) }
    }

    private func kill(_ app: NSRunningApplication) {
        guard
            let bid = app.bundleIdentifier,
            blockedBundleIDs.contains(bid),
            app.processIdentifier != myPID,
            !app.isTerminated      // don't call forceTerminate on a zombie process
        else { return }
        app.forceTerminate()
    }
}
