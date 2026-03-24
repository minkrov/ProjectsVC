import SwiftUI

// MARK: - Setup View
// User picks websites, apps, and duration.

struct SetupView: View {
    let onNext:   (PendingSession) -> Void
    let onCancel: () -> Void

    // Website input
    @State private var websiteInput: String = ""
    @State private var blockedWebsites: [String] = []

    // App selection
    @State private var installedApps: [InstalledApp] = []
    @State private var selectedBundleIDs: Set<String> = []
    @State private var appSearchText: String = ""
    @State private var appsLoaded = false

    // Duration
    @State private var durationDays: Int = 1

    private var filteredApps: [InstalledApp] {
        appSearchText.isEmpty ? installedApps
            : installedApps.filter { $0.name.localizedCaseInsensitiveContains(appSearchText) }
    }

    private var canProceed: Bool {
        !blockedWebsites.isEmpty || !selectedBundleIDs.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {

            // ── Nav bar ──────────────────────────────────────────────────
            HStack {
                Button("Cancel", action: onCancel)
                    .buttonStyle(GhostButtonStyle())
                Spacer()
                Text("New Session")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.primaryText)
                Spacer()
                Button("Next →") { advance() }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canProceed)
                    .opacity(canProceed ? 1 : 0.4)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Theme.candlelight)
            .overlay(Divider().foregroundColor(Theme.border), alignment: .bottom)

            // ── Scrollable body ──────────────────────────────────────────
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {

                    // ─ Duration ─────────────────────────────────────────
                    SectionCard(title: "Duration", icon: "clock.fill") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 0) {
                                ForEach(1...7, id: \.self) { day in
                                    Button { durationDays = day } label: {
                                        Text(day == 1 ? "1 day" : "\(day)d")
                                            .font(.system(size: 13, weight: durationDays == day ? .bold : .regular))
                                            .foregroundColor(durationDays == day ? Theme.candlelight : Theme.secondaryText)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .background(durationDays == day ? Theme.terracotta : Color.clear)
                                    }
                                    .buttonStyle(.plain)
                                    if day < 7 {
                                        Divider()
                                    }
                                }
                            }
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))

                            Text("Block ends \(formattedEndDate)")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.secondaryText)
                        }
                    }

                    // ─ Block Websites ────────────────────────────────────
                    SectionCard(title: "Block Websites", icon: "globe") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                TextField("e.g. reddit.com, twitter.com", text: $websiteInput)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.primaryText)
                                    .onSubmit { addWebsite() }

                                Button(action: addWebsite) {
                                    Image(systemName: "plus.circle.fill")
                                        .foregroundColor(Theme.terracotta)
                                        .font(.system(size: 20))
                                }
                                .buttonStyle(.plain)
                                .disabled(websiteInput.trimmingCharacters(in: .whitespaces).isEmpty)
                            }
                            .padding(10)
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))

                            if blockedWebsites.isEmpty {
                                Text("No websites added yet. Enter a domain above and press Return or +.")
                                    .font(.system(size: 12))
                                    .foregroundColor(Theme.secondaryText)
                            } else {
                                WebsiteTags(items: blockedWebsites) { site in
                                    blockedWebsites.removeAll { $0 == site }
                                }
                            }
                        }
                    }

                    // ─ Block Apps ────────────────────────────────────────
                    SectionCard(title: "Block Apps", icon: "app.fill") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Image(systemName: "magnifyingglass")
                                    .foregroundColor(Theme.secondaryText)
                                    .font(.system(size: 12))
                                TextField("Search installed apps…", text: $appSearchText)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.primaryText)
                            }
                            .padding(9)
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))

                            if !appsLoaded {
                                HStack(spacing: 8) {
                                    ProgressView().scaleEffect(0.7)
                                    Text("Scanning /Applications…")
                                        .font(.system(size: 12))
                                        .foregroundColor(Theme.secondaryText)
                                }
                                .padding(.vertical, 4)
                            } else if filteredApps.isEmpty {
                                Text("No apps found.")
                                    .font(.system(size: 12))
                                    .foregroundColor(Theme.secondaryText)
                            } else {
                                VStack(spacing: 1) {
                                    ForEach(filteredApps) { app in
                                        AppRow(app: app,
                                               isSelected: selectedBundleIDs.contains(app.bundleIdentifier)) {
                                            if selectedBundleIDs.contains(app.bundleIdentifier) {
                                                selectedBundleIDs.remove(app.bundleIdentifier)
                                            } else {
                                                selectedBundleIDs.insert(app.bundleIdentifier)
                                            }
                                        }
                                    }
                                }
                            }

                            if !selectedBundleIDs.isEmpty {
                                Text("\(selectedBundleIDs.count) app\(selectedBundleIDs.count == 1 ? "" : "s") selected")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(Theme.terracotta)
                            }
                        }
                    }

                    Spacer(minLength: 20)
                }
                .padding(20)
            }
            .background(Theme.background)
        }
        .background(Theme.background)
        .onAppear {
            InstalledAppsProvider.shared.load { apps in
                installedApps = apps
                appsLoaded = true
            }
        }
    }

    // MARK: - Actions

    private func addWebsite() {
        var raw = websiteInput
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        // Strip protocol
        if let range = raw.range(of: "://") { raw = String(raw[range.upperBound...]) }
        // Strip path
        if let slash = raw.firstIndex(of: "/") { raw = String(raw[..<slash]) }
        guard !raw.isEmpty, !blockedWebsites.contains(raw) else {
            websiteInput = ""
            return
        }
        blockedWebsites.append(raw)
        websiteInput = ""
    }

    private func advance() {
        let apps = installedApps
            .filter { selectedBundleIDs.contains($0.bundleIdentifier) }
            .map { BlockedApp(name: $0.name, bundleIdentifier: $0.bundleIdentifier) }
        let end = Calendar.current.date(byAdding: .day, value: durationDays, to: Date())!
        onNext(PendingSession(blockedWebsites: blockedWebsites, blockedApps: apps, endTime: end))
    }

    private var formattedEndDate: String {
        let end = Calendar.current.date(byAdding: .day, value: durationDays, to: Date())!
        let f = DateFormatter(); f.dateStyle = .full; f.timeStyle = .short
        return f.string(from: end)
    }
}

// MARK: - Section Card

private struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Theme.primaryText)
            }
            content
        }
        .padding(16)
        .cardStyle()
    }
}

// MARK: - App Row

private struct AppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                if let icon = app.icon {
                    Image(nsImage: icon)
                        .resizable()
                        .interpolation(.high)
                        .frame(width: 22, height: 22)
                } else {
                    Image(systemName: "app")
                        .frame(width: 22, height: 22)
                        .foregroundColor(Theme.secondaryText)
                }
                Text(app.name)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.primaryText)
                    .lineLimit(1)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Theme.terracotta)
                        .font(.system(size: 15))
                }
            }
            .padding(.vertical, 5)
            .padding(.horizontal, 8)
            .background(isSelected ? Theme.terracotta.opacity(0.08) : Color.clear)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Website Tags

private struct WebsiteTags: View {
    let items: [String]
    let onRemove: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(items, id: \.self) { item in
                HStack(spacing: 6) {
                    Text(item)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.duskSienna)
                    Button { onRemove(item) } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Theme.terracotta)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Theme.warmHoney.opacity(0.5))
                .cornerRadius(20)
            }
        }
    }
}

// MARK: - Pending Session

struct PendingSession {
    var blockedWebsites: [String]
    var blockedApps: [BlockedApp]
    var endTime: Date
}
