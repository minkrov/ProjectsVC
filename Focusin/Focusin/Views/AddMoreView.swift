import SwiftUI

// MARK: - Add More View
// Stripped-down setup sheet shown when a session is already active.
// No duration picker — new items expire with the existing countdown.

struct AddMoreView: View {
    let session: BlockSession
    let onAdd: (_ newWebsites: [String], _ newApps: [BlockedApp]) -> Void
    let onCancel: () -> Void

    @State private var websiteInput   = ""
    @State private var newWebsites:  [String]    = []
    @State private var installedApps: [InstalledApp] = []
    @State private var selectedIDs:   Set<String> = []
    @State private var appSearchText  = ""
    @State private var appsLoaded     = false
    @State private var isAdding       = false
    @State private var errorMessage: String?

    private var filteredApps: [InstalledApp] {
        appSearchText.isEmpty ? installedApps
            : installedApps.filter { $0.name.localizedCaseInsensitiveContains(appSearchText) }
    }

    // Bundle IDs already in the session — greyed out in the picker
    private var alreadyBlockedIDs: Set<String> {
        Set(session.blockedApps.map(\.bundleIdentifier))
    }
    private var alreadyBlockedDomains: Set<String> {
        Set(session.blockedWebsites)
    }

    private var canAdd: Bool {
        !newWebsites.isEmpty || !selectedIDs.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {

            // ── Nav bar ──────────────────────────────────────────────────
            HStack {
                Button("Cancel", action: onCancel)
                    .buttonStyle(GhostButtonStyle())
                Spacer()
                VStack(spacing: 2) {
                    Text("Add to Session")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Theme.primaryText)
                    Text("Expires \(formattedExpiry)")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.secondaryText)
                }
                Spacer()
                Button(action: confirm) {
                    HStack(spacing: 6) {
                        if isAdding { ProgressView().scaleEffect(0.7) }
                        Text("Add →")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!canAdd || isAdding)
                .opacity(canAdd && !isAdding ? 1 : 0.4)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Theme.candlelight)
            .overlay(Divider().foregroundColor(Theme.border), alignment: .bottom)

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {

                    // ── Context banner ───────────────────────────────────
                    HStack(spacing: 10) {
                        Image(systemName: "clock.fill")
                            .foregroundColor(Theme.terracotta)
                            .font(.system(size: 13))
                        Text("Anything you add here will be blocked until the session ends — no separate timer.")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.primaryText)
                    }
                    .padding(12)
                    .background(Theme.terracotta.opacity(0.07))
                    .cornerRadius(8)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.terracotta.opacity(0.2), lineWidth: 1))

                    // ── Block Websites ───────────────────────────────────
                    AddSectionCard(title: "Block More Websites", icon: "globe") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                TextField("e.g. youtube.com", text: $websiteInput)
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

                            if newWebsites.isEmpty && alreadyBlockedDomains.isEmpty {
                                Text("No websites added yet.")
                                    .font(.system(size: 12))
                                    .foregroundColor(Theme.secondaryText)
                            } else {
                                if !alreadyBlockedDomains.isEmpty {
                                    Text("Already blocked")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundColor(Theme.secondaryText)
                                    DomainChips(items: Array(alreadyBlockedDomains).sorted(),
                                                dimmed: true, onRemove: nil)
                                }
                                if !newWebsites.isEmpty {
                                    Text("Adding now")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundColor(Theme.terracotta)
                                    DomainChips(items: newWebsites, dimmed: false) { site in
                                        newWebsites.removeAll { $0 == site }
                                    }
                                }
                            }
                        }
                    }

                    // ── Block Apps ───────────────────────────────────────
                    AddSectionCard(title: "Block More Apps", icon: "app.fill") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Image(systemName: "magnifyingglass")
                                    .foregroundColor(Theme.secondaryText)
                                    .font(.system(size: 12))
                                TextField("Search apps…", text: $appSearchText)
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
                            } else {
                                VStack(spacing: 1) {
                                    ForEach(filteredApps) { app in
                                        let alreadyBlocked = alreadyBlockedIDs.contains(app.bundleIdentifier)
                                        let selected = selectedIDs.contains(app.bundleIdentifier)
                                        AddAppRow(
                                            app: app,
                                            isSelected: selected,
                                            isAlreadyBlocked: alreadyBlocked
                                        ) {
                                            guard !alreadyBlocked else { return }
                                            if selected { selectedIDs.remove(app.bundleIdentifier) }
                                            else        { selectedIDs.insert(app.bundleIdentifier) }
                                        }
                                    }
                                }
                            }

                            if !selectedIDs.isEmpty {
                                Text("\(selectedIDs.count) new app\(selectedIDs.count == 1 ? "" : "s") selected")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundColor(Theme.terracotta)
                            }
                        }
                    }

                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.destructive)
                            .multilineTextAlignment(.center)
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
        var raw = websiteInput.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let range = raw.range(of: "://") { raw = String(raw[range.upperBound...]) }
        if let slash = raw.firstIndex(of: "/") { raw = String(raw[..<slash]) }
        guard !raw.isEmpty,
              !newWebsites.contains(raw),
              !alreadyBlockedDomains.contains(raw) else { websiteInput = ""; return }
        // Reject characters not valid in hostnames — same rule as HostsFileManager's
        // security gate, surfaced here so the user sees immediate feedback.
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-"))
        guard raw.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
            errorMessage = "Invalid domain — only letters, numbers, hyphens, and dots are allowed."
            websiteInput = ""
            return
        }
        newWebsites.append(raw)
        websiteInput = ""
    }

    private func confirm() {
        isAdding = true
        errorMessage = nil

        let apps = installedApps
            .filter { selectedIDs.contains($0.bundleIdentifier) }
            .map { BlockedApp(name: $0.name, bundleIdentifier: $0.bundleIdentifier) }

        DispatchQueue.global(qos: .userInitiated).async {
            // Rewrite the entire block (existing + new) with replacing:true so
            // /etc/hosts never accumulates multiple FOCUSIN_BLOCK sections from
            // repeated "Add more" uses within the same session.
            var hostsOK = true
            if !newWebsites.isEmpty {
                let allDomains = session.blockedWebsites + newWebsites
                hostsOK = HostsFileManager().blockDomains(allDomains, replacing: true)
            }
            DispatchQueue.main.async {
                if !hostsOK {
                    isAdding = false
                    errorMessage = "Could not update /etc/hosts. Try again and enter your password."
                    return
                }
                onAdd(newWebsites, apps)
            }
        }
    }

    private var formattedExpiry: String {
        let f = DateFormatter(); f.dateStyle = .medium; f.timeStyle = .short
        return f.string(from: session.endTime)
    }
}

// MARK: - Sub-components

private struct AddSectionCard<Content: View>: View {
    let title: String; let icon: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.terracotta)
                Text(title).font(.system(size: 13, weight: .bold)).foregroundColor(Theme.primaryText)
            }
            content
        }
        .padding(16).cardStyle()
    }
}

private struct AddAppRow: View {
    let app: InstalledApp
    let isSelected: Bool
    let isAlreadyBlocked: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 10) {
                if let icon = app.icon {
                    Image(nsImage: icon).resizable().interpolation(.high).frame(width: 22, height: 22)
                } else {
                    Image(systemName: "app").frame(width: 22, height: 22).foregroundColor(Theme.secondaryText)
                }
                Text(app.name)
                    .font(.system(size: 13))
                    .foregroundColor(isAlreadyBlocked ? Theme.secondaryText : Theme.primaryText)
                    .lineLimit(1)
                Spacer()
                if isAlreadyBlocked {
                    Text("Already blocked")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.sandstone)
                } else if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Theme.terracotta).font(.system(size: 15))
                }
            }
            .padding(.vertical, 5).padding(.horizontal, 8)
            .background(isSelected ? Theme.terracotta.opacity(0.08) : Color.clear)
            .cornerRadius(6)
            .contentShape(Rectangle())
            .opacity(isAlreadyBlocked ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(isAlreadyBlocked)
    }
}

private struct DomainChips: View {
    let items: [String]
    let dimmed: Bool
    let onRemove: ((String) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(items, id: \.self) { item in
                HStack(spacing: 6) {
                    Text(item)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(dimmed ? Theme.secondaryText : Theme.duskSienna)
                    if let remove = onRemove {
                        Button { remove(item) } label: {
                            Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                                .foregroundColor(Theme.terracotta)
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background((dimmed ? Theme.sandstone : Theme.warmHoney).opacity(dimmed ? 0.2 : 0.5))
                .cornerRadius(20)
            }
        }
    }
}
