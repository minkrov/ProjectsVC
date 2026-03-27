import AppKit
import SwiftUI
import UserNotifications

// MARK: - App Delegate
// Handles app lifecycle, status bar item, and background-mode switching.

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {

    let sessionManager = SessionManager()
    let appWatcher     = AppWatcherService()

    private var statusItem: NSStatusItem?
    private var statusBarTimer: Timer?
    private var expiryTimer: Timer?
    private var popover: NSPopover?
    private var hasCleanedUpSession = false
    // Strong reference — prevents SwiftUI from deallocating the window when red X is pressed
    private var mainWindowController: NSWindowController?

    // MARK: - Launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Request notification permission once so we can deliver a session-end alert
        // even when the app is in background / accessory mode.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

        // Capture the SwiftUI WindowGroup window controller.
        // Holding a STRONG reference prevents SwiftUI from deallocating the window
        // when the user presses the red X button — it becomes hide-able instead.
        // We also set ourselves as the window delegate to intercept close.
        DispatchQueue.main.async { self.captureMainWindow() }

        // Fallback: if the window appears later (e.g. after accessory-mode launch),
        // grab it the moment it first becomes key.
        NotificationCenter.default.addObserver(
            forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let self, self.mainWindowController == nil,
                  let w = note.object as? NSWindow, w.styleMask.contains(.titled)
            else { return }
            self.captureMainWindow()
        }

        // Restore an active session that survived a relaunch / login
        if let session = sessionManager.currentSession, session.isActive {
            hasCleanedUpSession = false   // reset so cleanup works when this session ends
            // In-process watcher for while this app is in the foreground
            appWatcher.start(blocking: session.blockedApps)
            // Ensure the persistent watcher LaunchAgent is still installed
            // (covers the case where it was removed manually)
            LaunchAgentManager().installWatcherAgent()
            enterBackgroundMode(session: session)
            scheduleExpiryTimer(for: session)
            scheduleEndNotification(for: session)
        } else {
            // No active session — but the hosts file may still be blocked if the
            // background watcher shut down without cleaning up (e.g. app was closed
            // when the session expired). Unblock silently as a safety net.
            DispatchQueue.global(qos: .userInitiated).async {
                if HostsFileManager().hostsAreBlocked() {
                    HostsFileManager().unblockDomains()
                }
            }
            // If session.json existed but was already expired, loadSession() already
            // cleared currentSession — surface the end-of-session overlay via the
            // sessionJustEnded flag that loadSession() set.
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool {
        // Keep alive if a session is running (status bar icon keeps it going)
        return sessionManager.currentSession == nil
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard sessionManager.currentSession?.isActive == true else { return .terminateNow }
        // Inform the user that blocking continues even after the app closes
        let alert = NSAlert()
        alert.messageText = "Quit Focusin?"
        alert.informativeText = "Your focus session keeps running in the background. Blocked websites and apps will remain blocked until the session ends."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Quit")
        alert.addButton(withTitle: "Stay")
        return alert.runModal() == .alertFirstButtonReturn ? .terminateNow : .terminateCancel
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    // MARK: - Window capture & delegate

    private func captureMainWindow() {
        guard mainWindowController == nil,
              let w = NSApp.windows.first(where: { $0.styleMask.contains(.titled) })
        else { return }
        mainWindowController = w.windowController
        w.delegate = self                              // intercept red-X close
        w.collectionBehavior.insert(.canJoinAllSpaces) // feature 3: follow across Spaces
    }

    // NSWindowDelegate — called when the user presses the red X button.
    // During an active session we hide the window instead of destroying it,
    // so it can always be brought back without needing to recreate it.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sessionManager.currentSession?.isActive == true else { return true }
        sender.orderOut(nil)   // hide, don't destroy
        return false
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
        popover?.performClose(nil)
        popover = nil
        statusItem = nil
        statusBarTimer?.invalidate()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: - Status Bar

    private func setupStatusBar(session: BlockSession) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.image         = makeFlameIcon()
        statusItem?.button?.imagePosition = .imageLeft
        updateStatusBarLabel(session: session)

        statusBarTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self = self,
                  let s = self.sessionManager.currentSession else { return }
            self.updateStatusBarLabel(session: s)
        }

        // Build the SwiftUI popover
        let popoverView = MenuBarPopoverView(
            onShowApp: { [weak self] in self?.showMainWindow() },
            onQuit: { [weak self] in
                // Close popover first so the quit-warning dialog appears on top cleanly
                self?.popover?.performClose(nil)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    NSApplication.shared.terminate(nil)
                }
            }
        )
        .environmentObject(sessionManager)

        let vc  = NSHostingController(rootView: popoverView)
        let pop = NSPopover()
        pop.contentViewController = vc
        pop.contentSize           = NSSize(width: 300, height: 0)   // height auto-fits
        pop.behavior              = .transient                       // closes on outside click
        self.popover = pop

        // Left-click toggles the popover
        if let btn = statusItem?.button {
            btn.action = #selector(togglePopover(_:))
            btn.target = self
        }
    }

    @objc private func togglePopover(_ sender: NSStatusBarButton) {
        guard let pop = popover else { return }
        if pop.isShown {
            pop.performClose(nil)
        } else {
            pop.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
            pop.contentViewController?.view.window?.makeKey()
        }
    }

    private func updateStatusBarLabel(session: BlockSession) {
        let remaining = Int(session.timeRemaining)
        let days    = remaining / 86400
        let hours   = (remaining % 86400) / 3600
        let minutes = (remaining % 3600) / 60
        let seconds = remaining % 60
        let label: String
        if days > 0 {
            label = " \(days)d \(hours)h"
        } else if hours > 0 {
            label = " \(hours)h \(minutes)m"
        } else if minutes > 0 {
            label = " \(minutes)m"
        } else {
            label = " \(seconds)s"
        }
        statusItem?.button?.title = label
    }

    // MARK: - Flame icon for status bar

    private func makeFlameIcon() -> NSImage {
        let cfg = NSImage.SymbolConfiguration(pointSize: 14, weight: .regular)
        guard let img = NSImage(systemSymbolName: "flame.fill", accessibilityDescription: nil)?
                .withSymbolConfiguration(cfg) else {
            // Fallback: empty image
            return NSImage(size: NSSize(width: 14, height: 14), flipped: false) { _ in true }
        }
        img.isTemplate = true   // auto-adapts to light / dark menu bar
        return img
    }

    @objc private func showMainWindow() {
        popover?.performClose(nil)
        NSApp.setActivationPolicy(.regular)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            NSApp.activate(ignoringOtherApps: true)
            // showWindow(nil) handles every window state:
            //   • hidden (orderOut)  → orders it front
            //   • minimized          → deminiaturizes + orders front
            //   • already visible    → makes it key
            self.mainWindowController?.showWindow(nil)
        }
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

    // MARK: - Session-End Notification

    func scheduleEndNotification(for session: BlockSession) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["focusin.session.end"])

        let content = UNMutableNotificationContent()
        content.title = "Focus Session Complete 🎉"
        content.body  = "Your focus session has ended. Everything is now accessible again."
        content.sound = .default

        let fireDate = session.endTime
        let comps    = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
        let trigger  = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request  = UNNotificationRequest(identifier: "focusin.session.end", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { _ in }
    }

    // MARK: - Clean Up

    func cleanUpExpiredSession() {
        guard !hasCleanedUpSession else { return }
        hasCleanedUpSession = true

        guard let session = sessionManager.currentSession else {
            // Session already gone (double-fire guard) — nothing left to do
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

        // Cancel any scheduled notification (we'll deliver it immediately instead)
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["focusin.session.end"])

        // Deliver an immediate system notification so the user is informed
        // even if they switched to another Space or the window is hidden.
        let content = UNMutableNotificationContent()
        content.title = "Focus Session Complete 🎉"
        content.body  = "Your focus session has ended. Everything is now accessible again."
        content.sound = .default
        let req = UNNotificationRequest(identifier: "focusin.session.end.now",
                                        content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req) { _ in }

        // Remove the status bar icon and restore normal dock presence.
        exitBackgroundMode()

        // Signal ContentView to show the session-end overlay, then bring the window front.
        sessionManager.sessionJustEnded = true
        showMainWindow()
    }
}
