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
        guard !apps.isEmpty else { return }
        blockedBundleIDs = Set(apps.map(\.bundleIdentifier))
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
        sweepAll()  // immediately kill anything already running
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
            app.processIdentifier != myPID
        else { return }
        app.forceTerminate()
    }
}
