import SwiftUI
import UserNotifications

// MARK: - Content View
// Root router. All navigation lives here so there are no nested sheets.

struct ContentView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @EnvironmentObject var appWatcher: AppWatcherService

    @State private var showingSetupSheet    = false
    @State private var showSessionEndOverlay = false

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                if showingSetupSheet {
                    SetupCoordinator { session in
                        activateSession(session)
                        showingSetupSheet = false
                    } onCancel: {
                        showingSetupSheet = false
                    }
                } else if let session = sessionManager.currentSession, session.isActive {
                    ActiveSessionView(session: session) {
                        handleExpiry()
                    }
                } else {
                    HomeView(onStart: { showingSetupSheet = true })
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            // Session-end overlay — blurs the home screen with a calm message
            if showSessionEndOverlay {
                SessionEndOverlayView {
                    withAnimation(.easeOut(duration: 0.4)) {
                        showSessionEndOverlay = false
                    }
                }
                .transition(.opacity)
            }
        }
        .frame(minWidth: 480, idealWidth: 520, maxWidth: .infinity,
               minHeight: 560, idealHeight: 640, maxHeight: .infinity,
               alignment: .top)
        .onAppear {
            // Catch expiry that happened while the app was closed (flag set during loadSession)
            if sessionManager.sessionJustEnded {
                sessionManager.sessionJustEnded = false
                withAnimation(.easeIn(duration: 0.4)) { showSessionEndOverlay = true }
            }
        }
        .onChange(of: sessionManager.sessionJustEnded) { ended in
            guard ended else { return }
            sessionManager.sessionJustEnded = false
            withAnimation(.easeIn(duration: 0.4)) { showSessionEndOverlay = true }
        }
    }

    // MARK: - Session Activation

    private func activateSession(_ session: BlockSession) {
        sessionManager.saveSession(session)
        // In-process watcher (works while this app is in the foreground)
        appWatcher.start(blocking: session.blockedApps)
        // Persistent watcher LaunchAgent (survives app quit & reboots)
        let agents = LaunchAgentManager()
        agents.installMainAppAgent()
        agents.installWatcherAgent()
        // Schedule a system notification for when the session ends
        scheduleEndNotification(for: session)
        // Set up the status-bar countdown and arm the expiry polling timer.
        // Without this, a brand-new session (not restored from disk) would show
        // no status bar icon when the user hides the window during a session.
        if let delegate = NSApp.delegate as? AppDelegate {
            delegate.enterBackgroundMode(session: session)
            delegate.scheduleExpiryTimer(for: session)
        }
    }

    private func scheduleEndNotification(for session: BlockSession) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["focusin.session.end"])
        let content = UNMutableNotificationContent()
        content.title = "Focus Session Complete 🎉"
        content.body  = "Your focus session has ended. Everything is now accessible again."
        content.sound = .default
        let comps   = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: session.endTime)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        let request = UNNotificationRequest(identifier: "focusin.session.end", content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { _ in }
    }

    // MARK: - Session Expiry

    private func handleExpiry() {
        // Route all cleanup through AppDelegate so the hasCleanedUpSession guard
        // prevents double-execution when both ActiveSessionView's 1-second timer
        // and AppDelegate's 5-second expiry timer fire close together.
        // The session-end overlay is shown via sessionManager.sessionJustEnded
        // which is set inside cleanUpExpiredSession and observed by onChange below.
        (NSApp.delegate as? AppDelegate)?.cleanUpExpiredSession()
    }
}

// MARK: - Setup Coordinator
// Manages the Setup → Commitment two-step flow inside a single sheet,
// avoiding the nested-sheet SwiftUI pitfall.

private struct SetupCoordinator: View {
    let onConfirm: (BlockSession) -> Void
    let onCancel: () -> Void

    @State private var step: Step = .setup
    @State private var pending: PendingSession? = nil

    enum Step { case setup, commitment }

    var body: some View {
        ZStack(alignment: .top) {
            if step == .setup {
                SetupView(
                    onNext: { ps in
                        pending = ps
                        withAnimation(.easeInOut(duration: 0.25)) { step = .commitment }
                    },
                    onCancel: onCancel
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(.asymmetric(
                    insertion: .move(edge: .leading),
                    removal: .move(edge: .leading)
                ))
            } else if let ps = pending {
                CommitmentView(
                    pending: ps,
                    onBack: {
                        withAnimation(.easeInOut(duration: 0.25)) { step = .setup }
                    },
                    onConfirm: { session in
                        onConfirm(session)
                    }
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing),
                    removal: .move(edge: .trailing)
                ))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.background.ignoresSafeArea())
    }
}
