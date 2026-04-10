import SwiftUI

// MARK: - Home View

struct HomeView: View {
    let onStart: () -> Void

    @State private var history: [SessionRecord] = []

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // ── Icon + title ─────────────────────────────────────────
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Theme.terracotta.opacity(0.12))
                            .frame(width: 88, height: 88)
                        Image(systemName: "flame.fill")
                            .font(.system(size: 44))
                            .foregroundColor(Theme.terracotta)
                    }

                    Text("Focusin")
                        .font(.system(size: 34, weight: .bold, design: .serif))
                        .foregroundColor(Theme.duskSienna)

                    Text("Hard-mode focus. No exceptions.")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.secondaryText)
                }

                Spacer().frame(height: 40)

                // ── Feature cards ────────────────────────────────────────
                VStack(spacing: 12) {
                    FeatureRow(icon: "globe",
                               title: "Website blocking",
                               detail: "Edits your system hosts file — works in every browser.")
                    FeatureRow(icon: "xmark.app.fill",
                               title: "App blocking",
                               detail: "Force-quits blocked apps the moment they launch.")
                    FeatureRow(icon: "lock.fill",
                               title: "No override",
                               detail: "Once started, the block cannot be cancelled early.")
                }
                .padding(.horizontal, 40)

                // ── Session history ───────────────────────────────────────
                if !history.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "clock.arrow.circlepath")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Theme.sandstone)
                            Text("Recent sessions")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(Theme.sandstone)
                        }
                        .padding(.horizontal, 4)

                        VStack(spacing: 4) {
                            ForEach(history.prefix(5)) { record in
                                HStack(spacing: 0) {
                                    Text(record.formattedDate)
                                        .font(.system(size: 12))
                                        .foregroundColor(Theme.primaryText)
                                    Spacer()
                                    Text(record.formattedDuration)
                                        .font(.system(size: 12, weight: .semibold).monospaced())
                                        .foregroundColor(Theme.terracotta)
                                        .padding(.trailing, 10)
                                    Text(record.summary)
                                        .font(.system(size: 11))
                                        .foregroundColor(Theme.secondaryText)
                                }
                                .padding(.vertical, 7)
                                .padding(.horizontal, 12)
                                .background(Theme.sandWall.opacity(0.6))
                                .cornerRadius(8)
                            }
                        }
                    }
                    .padding(.horizontal, 40)
                    .padding(.top, 24)
                }

                Spacer()

                // ── Start button ─────────────────────────────────────────
                Button("Start a Focus Session", action: onStart)
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.bottom, 16)

                // ── Uninstall link ────────────────────────────────────────
                Button("Uninstall Focusin…") { showUninstallAlert() }
                    .font(.system(size: 11))
                    .foregroundColor(Theme.secondaryText.opacity(0.55))
                    .buttonStyle(.plain)
                    .padding(.bottom, 32)
            }
        }
        .onAppear { history = HistoryManager.shared.load() }
    }

    // MARK: - Uninstall

    private func showUninstallAlert() {
        let alert = NSAlert()
        alert.messageText = "Uninstall Focusin?"
        alert.informativeText = """
            This will permanently remove:

            • Both Focusin LaunchAgents (login items)
            • All session history and data
            • The Focusin app itself

            This cannot be undone.
            """
        alert.alertStyle = .critical
        alert.addButton(withTitle: "Uninstall")
        alert.addButton(withTitle: "Cancel")

        // Make the Uninstall button destructive-looking
        alert.buttons.first?.hasDestructiveAction = true

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        performUninstall()
    }

    private func performUninstall() {
        // 1. Remove both LaunchAgents (unload from launchd + delete plists)
        let agents = LaunchAgentManager()
        agents.uninstallMainAppAgent()
        agents.uninstallWatcherAgent()

        // 2. Delete all app data (session.json, history.json)
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        if let dataDir = appSupport?.appendingPathComponent("Focusin") {
            try? FileManager.default.removeItem(at: dataDir)
        }

        // 3. Clear UserDefaults (hasSeenOnboarding, any future prefs)
        if let bundleID = Bundle.main.bundleIdentifier {
            UserDefaults.standard.removePersistentDomain(forName: bundleID)
        }

        // 4. Move the .app bundle to Trash, then quit
        let appURL = Bundle.main.bundleURL
        NSWorkspace.shared.recycle([appURL]) { _, _ in
            DispatchQueue.main.async { NSApp.terminate(nil) }
        }
    }
}

private struct FeatureRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Image(systemName: icon)
                    .symbolRenderingMode(.monochrome)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
            }
            .frame(width: 24, height: 24)
            .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.primaryText)
                Text(detail)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.secondaryText)
            }
            Spacer()
        }
        .padding(14)
        .cardStyle()
    }
}
