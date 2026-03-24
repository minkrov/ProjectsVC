import SwiftUI
import AppKit

// MARK: - Menu Bar Popover View

struct MenuBarPopoverView: View {
    @EnvironmentObject var sessionManager: SessionManager

    let onShowApp: () -> Void
    let onQuit:    () -> Void

    @State private var timeRemaining: TimeInterval = 0
    @State private var ticker: Timer? = nil

    private var session: BlockSession? { sessionManager.currentSession }

    var body: some View {
        VStack(spacing: 0) {

            // ── Header ───────────────────────────────────────────────────
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(Theme.terracotta)
                        .frame(width: 7, height: 7)
                    Text("Session Active")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.terracotta)
                    Spacer()
                }

                // Countdown
                Text(formattedTime)
                    .font(Theme.monoFont(34, weight: .bold))
                    .foregroundColor(Theme.terracotta)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text("remaining")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)

                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Theme.sandstone.opacity(0.2))
                            .frame(height: 4)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Theme.terracotta)
                            .frame(width: geo.size.width * progressFraction, height: 4)
                            .animation(.linear(duration: 1), value: progressFraction)
                    }
                }
                .frame(height: 4)
                .padding(.top, 2)

                // End time
                if let s = session {
                    Text("Ends \(formattedEndDate(s))")
                        .font(.system(size: 10))
                        .foregroundColor(Theme.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 2)
                }
            }
            .padding(16)
            .background(Theme.background)

            Divider()
                .background(Theme.sandstone.opacity(0.2))

            // ── Blocked list ─────────────────────────────────────────────
            if let s = session, !s.blockedWebsites.isEmpty || !s.blockedApps.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {

                        if !s.blockedWebsites.isEmpty {
                            PopoverSection(title: "Websites", icon: "globe", count: s.blockedWebsites.count) {
                                ForEach(s.blockedWebsites, id: \.self) { site in
                                    PopoverRow(icon: "xmark.circle.fill", label: site)
                                }
                            }
                        }

                        if !s.blockedApps.isEmpty {
                            PopoverSection(title: "Apps", icon: "app.badge.fill", count: s.blockedApps.count) {
                                ForEach(s.blockedApps) { app in
                                    PopoverAppRow(app: app)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .frame(maxHeight: 200)

                Divider()
                    .background(Theme.sandstone.opacity(0.2))
            }

            // ── Footer buttons ───────────────────────────────────────────
            HStack(spacing: 8) {
                Button(action: onShowApp) {
                    HStack(spacing: 5) {
                        Image(systemName: "arrow.up.forward.app")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Show Focusin")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(Theme.terracotta)
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)

                Button(action: onQuit) {
                    Text("Quit")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.secondaryText)
                        .padding(.vertical, 7)
                        .padding(.horizontal, 14)
                        .background(Theme.sandstone.opacity(0.12))
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8)
                            .stroke(Theme.sandstone.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .background(Theme.background)
        }
        .background(Theme.background)
        .onAppear {
            timeRemaining = session?.timeRemaining ?? 0
            ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                timeRemaining = session?.timeRemaining ?? 0
            }
        }
        .onDisappear {
            ticker?.invalidate()
            ticker = nil
        }
    }

    // MARK: - Computed

    private var formattedTime: String {
        let total   = Int(max(0, timeRemaining))
        let days    = total / 86400
        let hours   = (total % 86400) / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if days > 0 { return String(format: "%d:%02d:%02d:%02d", days, hours, minutes, seconds) }
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }

    private var progressFraction: Double {
        guard let s = session else { return 0 }
        let total = s.endTime.timeIntervalSince(s.startTime)
        guard total > 0 else { return 0 }
        return min(1, max(0, timeRemaining / total))
    }

    private func formattedEndDate(_ s: BlockSession) -> String {
        let f = DateFormatter(); f.dateStyle = .none; f.timeStyle = .short
        return f.string(from: s.endTime)
    }
}

// MARK: - Section Header

private struct PopoverSection<Content: View>: View {
    let title: String
    let icon: String
    let count: Int
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Theme.primaryText)
                Spacer()
                Text("\(count)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Theme.secondaryText)
            }
            content
        }
    }
}

// MARK: - Text Row (websites)

private struct PopoverRow: View {
    let icon: String
    let label: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundColor(Theme.sandstone)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(Theme.primaryText)
                .lineLimit(1)
        }
    }
}

// MARK: - App Row (with icon)

private struct PopoverAppRow: View {
    let app: BlockedApp
    @State private var icon: NSImage? = nil

    var body: some View {
        HStack(spacing: 6) {
            Group {
                if let icon {
                    Image(nsImage: icon)
                        .resizable()
                        .interpolation(.high)
                        .frame(width: 16, height: 16)
                } else {
                    Image(systemName: "app.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.sandstone)
                        .frame(width: 16, height: 16)
                }
            }
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 9))
                .foregroundColor(Theme.sandstone)
            Text(app.name)
                .font(.system(size: 11))
                .foregroundColor(Theme.primaryText)
                .lineLimit(1)
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
