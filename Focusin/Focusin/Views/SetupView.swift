import SwiftUI

// MARK: - Setup View
// User picks websites, apps, and duration.

struct SetupView: View {
    let onNext:   (PendingSession) -> Void
    let onCancel: () -> Void

    // Website input
    @State private var websiteInput: String = ""
    @State private var websiteInputError: String? = nil
    @State private var blockedWebsites: [String] = []

    // App selection
    @State private var installedApps: [InstalledApp] = []
    @State private var selectedBundleIDs: Set<String> = []
    @State private var appSearchText: String = ""
    @State private var appsLoaded = false

    // Duration — stored as total hours so sub-day options are possible
    @State private var durationHours: Int = 24
    @State private var pomodoroEnabled: Bool = false

    private let hourOptions: [Int] = [1, 2, 4, 8]
    private let dayOptions:  [Int] = [24, 48, 72, 96, 120, 144, 168]  // 1–7 days in hours

    // Preset groups
    private let presets: [(name: String, icon: String, domains: [String])] = [
        ("Social Media", "person.2.fill",  ["x.com", "twitter.com", "instagram.com",
                                             "tiktok.com", "reddit.com", "youtube.com",
                                             "facebook.com", "threads.net"]),
        ("News",         "newspaper.fill", ["bbc.com", "cnn.com", "nytimes.com",
                                            "theguardian.com", "reuters.com", "apnews.com"]),
    ]

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
                        VStack(alignment: .leading, spacing: 8) {

                            // ── Hour row (sub-day options) ───────────────────
                            HStack(spacing: 0) {
                                ForEach(hourOptions, id: \.self) { h in
                                    Button { durationHours = h } label: {
                                        Text("\(h)h")
                                            .font(.system(size: 13, weight: durationHours == h ? .bold : .regular))
                                            .foregroundColor(durationHours == h ? Theme.candlelight : Theme.secondaryText)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .background(durationHours == h ? Theme.terracotta : Color.clear)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    if h != hourOptions.last { Divider() }
                                }
                            }
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))

                            // ── Day row (1–7 days) ───────────────────────────
                            HStack(spacing: 0) {
                                ForEach(Array(dayOptions.enumerated()), id: \.offset) { idx, h in
                                    let dayNum = idx + 1
                                    Button { durationHours = h } label: {
                                        Text(dayNum == 1 ? "1 day" : "\(dayNum)d")
                                            .font(.system(size: 13, weight: durationHours == h ? .bold : .regular))
                                            .foregroundColor(durationHours == h ? Theme.candlelight : Theme.secondaryText)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .background(durationHours == h ? Theme.terracotta : Color.clear)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    if idx < dayOptions.count - 1 { Divider() }
                                }
                            }
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border, lineWidth: 1))

                            Text("Block ends \(formattedEndDate)")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.secondaryText)

                            PomodoroToggleButton(isOn: pomodoroEnabled) {
                                withAnimation(.spring(response: 0.25, dampingFraction: 0.65)) {
                                    pomodoroEnabled.toggle()
                                }
                            }
                        }
                    }

                    // ─ Block Websites ────────────────────────────────────
                    SectionCard(title: "Block Websites", icon: "globe") {
                        VStack(alignment: .leading, spacing: 10) {

                            // Quick-add presets
                            HStack(spacing: 8) {
                                ForEach(presets, id: \.name) { preset in
                                    let active = isPresetActive(preset.domains)
                                    Button { togglePreset(preset.domains) } label: {
                                        HStack(spacing: 4) {
                                            Image(systemName: preset.icon)
                                                .font(.system(size: 10, weight: .semibold))
                                            Text(preset.name)
                                                .font(.system(size: 12, weight: .semibold))
                                        }
                                        .foregroundColor(active ? Theme.candlelight : Theme.terracotta)
                                        .padding(.vertical, 5)
                                        .padding(.horizontal, 10)
                                        .background(active ? Theme.terracotta : Theme.terracotta.opacity(0.1))
                                        .cornerRadius(20)
                                        .overlay(RoundedRectangle(cornerRadius: 20)
                                            .stroke(Theme.terracotta.opacity(active ? 0 : 0.3), lineWidth: 1))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

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

                            if let err = websiteInputError {
                                Text(err)
                                    .font(.system(size: 11))
                                    .foregroundColor(Theme.destructive)
                            }

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

    private func isPresetActive(_ domains: [String]) -> Bool {
        domains.allSatisfy { blockedWebsites.contains($0) }
    }

    private func togglePreset(_ domains: [String]) {
        websiteInputError = nil   // clear any stale input-validation error
        if isPresetActive(domains) {
            blockedWebsites.removeAll { domains.contains($0) }
        } else {
            for d in domains where !blockedWebsites.contains(d) {
                blockedWebsites.append(d)
            }
        }
    }

    private func addWebsite() {
        websiteInputError = nil
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
        // Reject characters that are not valid in hostnames. This matches the
        // security gate in HostsFileManager and gives the user immediate feedback.
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-"))
        guard raw.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
            websiteInputError = "Invalid domain — only letters, numbers, hyphens, and dots are allowed."
            return
        }
        blockedWebsites.append(raw)
        websiteInput = ""
    }

    private func advance() {
        let apps = installedApps
            .filter { selectedBundleIDs.contains($0.bundleIdentifier) }
            .map { BlockedApp(name: $0.name, bundleIdentifier: $0.bundleIdentifier) }
        let end = Date().addingTimeInterval(TimeInterval(durationHours) * 3600)
        onNext(PendingSession(blockedWebsites: blockedWebsites, blockedApps: apps,
                              endTime: end, pomodoroEnabled: pomodoroEnabled))
    }

    private var formattedEndDate: String {
        let end = Date().addingTimeInterval(TimeInterval(durationHours) * 3600)
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
            .contentShape(Rectangle())
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
    var pomodoroEnabled: Bool = false
}
