import SwiftUI

// MARK: - Active Session View
// Shown while a block is running. No stop button anywhere.

struct ActiveSessionView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @EnvironmentObject var appWatcher: AppWatcherService

    // Session is passed in but we also watch sessionManager so the list
    // updates live when the user adds more items mid-session.
    let session: BlockSession
    let onExpire: () -> Void

    @State private var timeRemaining: TimeInterval = 0
    @State private var timer: Timer? = nil
    @State private var showAddMore = false

    // Use the live session from the manager so additions appear instantly
    private var liveSession: BlockSession {
        sessionManager.currentSession ?? session
    }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {

                // ── Header ───────────────────────────────────────────────
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(Theme.terracotta)
                                .frame(width: 8, height: 8)
                            Text("Session Active")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Theme.terracotta)
                        }
                        Text("Focusin")
                            .font(.system(size: 26, weight: .bold, design: .serif))
                            .foregroundColor(Theme.duskSienna)
                    }
                    Spacer()
                    // ── Add more button ──────────────────────────────────
                    Button {
                        showAddMore = true
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "plus")
                                .font(.system(size: 11, weight: .bold))
                            Text("Add more")
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(Theme.terracotta)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 12)
                        .background(Theme.terracotta.opacity(0.1))
                        .cornerRadius(20)
                        .overlay(RoundedRectangle(cornerRadius: 20)
                            .stroke(Theme.terracotta.opacity(0.25), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
                .padding(.bottom, 16)

                // ── Countdown ────────────────────────────────────────────
                VStack(spacing: 8) {
                    Text(formattedTime)
                        .font(Theme.monoFont(46, weight: .bold))
                        .foregroundColor(Theme.terracotta)
                        .animation(.easeInOut(duration: 0.3), value: formattedTime)

                    Text("remaining")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.secondaryText)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Theme.sandstone.opacity(0.25))
                                .frame(height: 5)
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Theme.terracotta)
                                .frame(width: geo.size.width * progressFraction, height: 5)
                                .animation(.linear(duration: 1), value: progressFraction)
                        }
                    }
                    .frame(height: 5)
                    .padding(.horizontal, 40)
                    .padding(.top, 4)
                }
                .padding(.vertical, 24)

                // ── Blocked items ─────────────────────────────────────────
                ScrollView {
                    VStack(spacing: 14) {
                        if !liveSession.blockedWebsites.isEmpty {
                            BlockListCard(
                                title: "Blocked Websites",
                                icon: "globe",
                                items: liveSession.blockedWebsites
                            )
                        }
                        if !liveSession.blockedApps.isEmpty {
                            BlockListCard(
                                title: "Blocked Apps",
                                icon: "app.badge.fill",
                                items: liveSession.blockedApps.map(\.name)
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }

                // ── Footer ────────────────────────────────────────────────
                VStack(spacing: 4) {
                    Text("Ends \(formattedEndDate)")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.secondaryText)
                    Text("There is no early exit. Stay the course.")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.sandstone)
                }
                .padding(.bottom, 18)
            }
        }
        .onAppear {
            timeRemaining = liveSession.timeRemaining
            startTimer()
        }
        .onDisappear {
            timer?.invalidate()
        }
        .sheet(isPresented: $showAddMore) {
            AddMoreView(session: liveSession) { newWebsites, newApps in
                // 1. Persist to session file (watcher picks it up within 2s)
                sessionManager.addToSession(websites: newWebsites, apps: newApps)
                // 2. Update in-process watcher immediately
                if !newApps.isEmpty { appWatcher.addBlocking(apps: newApps) }
                showAddMore = false
            } onCancel: {
                showAddMore = false
            }
            .frame(width: 520, height: 600)
        }
    }

    // MARK: - Timer

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            let remaining = liveSession.timeRemaining
            withAnimation { timeRemaining = remaining }
            if remaining <= 0 {
                timer?.invalidate()
                onExpire()
            }
        }
    }

    // MARK: - Computed

    private var formattedTime: String {
        let total = Int(max(0, timeRemaining))
        let days    = total / 86400
        let hours   = (total % 86400) / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if days > 0 { return String(format: "%d:%02d:%02d:%02d", days, hours, minutes, seconds) }
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }

    private var progressFraction: Double {
        let total = liveSession.endTime.timeIntervalSince(liveSession.startTime)
        guard total > 0 else { return 0 }
        return min(1, max(0, timeRemaining / total))
    }

    private var formattedEndDate: String {
        let f = DateFormatter(); f.dateStyle = .medium; f.timeStyle = .short
        return f.string(from: liveSession.endTime)
    }
}

// MARK: - Block List Card

private struct BlockListCard: View {
    let title: String
    let icon: String
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Theme.primaryText)
                Spacer()
                Text("\(items.count)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.secondaryText)
            }
            VStack(alignment: .leading, spacing: 5) {
                ForEach(items, id: \.self) { item in
                    HStack(spacing: 8) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(Theme.sandstone)
                        Text(item)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.primaryText)
                    }
                }
            }
        }
        .padding(14)
        .cardStyle()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
