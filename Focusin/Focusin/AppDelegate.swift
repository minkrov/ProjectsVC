import AppKit
import SwiftUI

// MARK: - App Delegate
// Handles app lifecycle, status bar item, and background-mode switching.

final class AppDelegate: NSObject, NSApplicationDelegate {

    let sessionManager = SessionManager()
    let appWatcher     = AppWatcherService()

    private var statusItem: NSStatusItem?
    private var statusBarTimer: Timer?
    private var expiryTimer: Timer?

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Restore an active session that survived a relaunch / login
        if let session = sessionManager.currentSession, session.isActive {
            // In-process watcher for while this app is in the foreground
            appWatcher.start(blocking: session.blockedApps)
            // Ensure the persistent watcher LaunchAgent is still installed
            // (covers the case where it was removed manually)
            LaunchAgentManager().installWatcherAgent()
            enterBackgroundMode(session: session)
            scheduleExpiryTimer(for: session)
        } else if sessionManager.currentSession != nil {
            // Session was saved but has now expired
            cleanUpExpiredSession()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool {
        // Keep alive if a session is running (status bar icon keeps it going)
        return sessionManager.currentSession == nil
    }

    func applicationWillTerminate(_ notification: Notification) {
        statusBarTimer?.invalidate()
        expiryTimer?.invalidate()
    }

    // MARK: - Background Mode (status bar only)

    func enterBackgroundMode(session: BlockSession) {
        NSApp.setActivationPolicy(.accessory)   // no dock icon
        setupStatusBar(session: session)
    }

    func exitBackgroundMode() {
        statusItem = nil
        statusBarTimer?.invalidate()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Status Bar

    private func setupStatusBar(session: BlockSession) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        updateStatusBarLabel(session: session)

        statusBarTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self,
                  let s = self.sessionManager.currentSession else { return }
            self.updateStatusBarLabel(session: s)
        }

        // Menu
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Focusin", action: #selector(showMainWindow), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit Focusin", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem?.menu = menu
    }

    private func updateStatusBarLabel(session: BlockSession) {
        let remaining = Int(session.timeRemaining)
        let days    = remaining / 86400
        let hours   = (remaining % 86400) / 3600
        let minutes = (remaining % 3600) / 60
        let label: String
        if days > 0 {
            label = "🔥 \(days)d \(hours)h"
        } else if hours > 0 {
            label = "🔥 \(hours)h \(minutes)m"
        } else {
            label = "🔥 \(minutes)m"
        }
        statusItem?.button?.title = label
    }

    @objc private func showMainWindow() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.windows.first?.makeKeyAndOrderFront(nil)
    }

    // MARK: - Expiry Polling

    func scheduleExpiryTimer(for session: BlockSession) {
        expiryTimer?.invalidate()
        // Check every 5 seconds
        expiryTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            if !(self.sessionManager.currentSession?.isActive ?? false) {
                self.expiryTimer?.invalidate()
                self.cleanUpExpiredSession()
            }
        }
        // Also fire at the exact end date
        let fireDate = session.endTime
        let delay = max(1, fireDate.timeIntervalSinceNow)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self else { return }
            if !(self.sessionManager.currentSession?.isActive ?? false) {
                self.cleanUpExpiredSession()
            }
        }
    }

    // MARK: - Clean Up

    func cleanUpExpiredSession() {
        guard let session = sessionManager.currentSession else {
            sessionManager.clearSession()
            exitBackgroundMode()
            return
        }

        appWatcher.stop()

        if !session.blockedWebsites.isEmpty {
            DispatchQueue.global(qos: .userInitiated).async {
                HostsFileManager().unblockDomains()
            }
        }

        sessionManager.clearSession()
        let agents = LaunchAgentManager()
        agents.uninstallWatcherAgent()
        agents.uninstallMainAppAgent()
        expiryTimer?.invalidate()
        statusBarTimer?.invalidate()
        exitBackgroundMode()

        // Notify user
        let alert = NSAlert()
        alert.messageText = "Focus Session Complete"
        alert.informativeText = "Your focus session has ended. Everything is now accessible again."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Great!")
        alert.runModal()
    }
}
