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
        ZStack {
            Group {
                if let session = sessionManager.currentSession, session.isActive {
                    ActiveSessionView(session: session) {
                        handleExpiry()
                    }
                } else {
                    HomeView(onStart: { showingSetupSheet = true })
                }
            }
            .frame(minWidth: 480, idealWidth: 520, minHeight: 560, idealHeight: 640)

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
        .frame(minWidth: 480, idealWidth: 520, minHeight: 560, idealHeight: 640)
        // Single sheet — coordinator handles the multi-step flow inside
        .sheet(isPresented: $showingSetupSheet) {
            SetupCoordinator { session in
                activateSession(session)
                showingSetupSheet = false
            } onCancel: {
                showingSetupSheet = false
            }
            .frame(width: 520, height: 660)
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
        guard let session = sessionManager.currentSession else { return }
        appWatcher.stop()
        if !session.blockedWebsites.isEmpty {
            DispatchQueue.global(qos: .userInitiated).async {
                HostsFileManager().unblockDomains()
            }
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["focusin.session.end"])
        sessionManager.clearSession()
        let agents = LaunchAgentManager()
        agents.uninstallWatcherAgent()
        agents.uninstallMainAppAgent()
        // Show the calm session-end overlay on top of the home screen
        withAnimation(.easeIn(duration: 0.4)) {
            showSessionEndOverlay = true
        }
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
        ZStack {
            Theme.background.ignoresSafeArea()

            switch step {
            case .setup:
                SetupView(
                    onNext: { ps in
                        pending = ps
                        withAnimation(.easeInOut(duration: 0.25)) { step = .commitment }
                    },
                    onCancel: onCancel
                )
                .transition(.asymmetric(
                    insertion: .move(edge: .leading),
                    removal: .move(edge: .leading)
                ))

            case .commitment:
                if let ps = pending {
                    CommitmentView(
                        pending: ps,
                        onBack: {
                            withAnimation(.easeInOut(duration: 0.25)) { step = .setup }
                        },
                        onConfirm: { session in
                            onConfirm(session)
                        }
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing),
                        removal: .move(edge: .trailing)
                    ))
                }
            }
        }
    }
}
