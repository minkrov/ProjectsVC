import SwiftUI
import AppKit

// MARK: - Active Session View

struct ActiveSessionView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @EnvironmentObject var appWatcher: AppWatcherService

    let session: BlockSession
    let onExpire: () -> Void

    @State private var timeRemaining: TimeInterval = 0
    @State private var timer: Timer? = nil
    @State private var showAddMore = false
    @State private var footerMessage: String = ""

    private static let footerMessages = [
        "There is no early exit. Stay on course.",
        "The resistance is temporary. The work is permanent.",
        "Distraction is a choice. So is focus.",
        "Every hour completed is a promise kept.",
        "The session ends. Until then, be here.",
    ]

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
                    Button { showAddMore = true } label: {
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
                            AppBlockListCard(apps: liveSession.blockedApps)
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
                    Text(footerMessage)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.sandstone)
                }
                .padding(.bottom, 18)
            }
        }
        .onAppear {
            timeRemaining = liveSession.timeRemaining
            footerMessage = Self.footerMessages.randomElement()!
            startTimer()
        }
        .onDisappear {
            timer?.invalidate()
        }
        .sheet(isPresented: $showAddMore) {
            AddMoreView(session: liveSession) { newWebsites, newApps in
                sessionManager.addToSession(websites: newWebsites, apps: newApps)
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

// MARK: - Website Block List Card (text only)

private struct BlockListCard: View {
    let title: String
    let icon: String
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CardHeader(title: title, icon: icon, count: items.count)
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

// MARK: - App Block List Card (with icons)

private struct AppBlockListCard: View {
    let apps: [BlockedApp]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            CardHeader(title: "Blocked Apps", icon: "app.badge.fill", count: apps.count)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(apps) { app in
                    AppIconRow(app: app)
                }
            }
        }
        .padding(14)
        .cardStyle()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Shared card header

private struct CardHeader: View {
    let title: String; let icon: String; let count: Int
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.terracotta)
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(Theme.primaryText)
            Spacer()
            Text("\(count)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.secondaryText)
        }
    }
}

// MARK: - App Icon Row

private struct AppIconRow: View {
    let app: BlockedApp
    @State private var icon: NSImage? = nil

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if let icon {
                    Image(nsImage: icon)
                        .resizable()
                        .interpolation(.high)
                        .frame(width: 20, height: 20)
                } else {
                    Image(systemName: "app.fill")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.sandstone)
                        .frame(width: 20, height: 20)
                }
            }
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 10))
                .foregroundColor(Theme.sandstone)
            Text(app.name)
                .font(.system(size: 13))
                .foregroundColor(Theme.primaryText)
        }
        .task {
            icon = await resolveIcon(for: app.bundleIdentifier)
        }
    }

    private func resolveIcon(for bundleID: String) async -> NSImage? {
        await Task.detached(priority: .utility) {
            guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID)
            else { return nil }
            return NSWorkspace.shared.icon(forFile: url.path)
        }.value
    }
}
