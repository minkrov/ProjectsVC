import SwiftUI

// MARK: - Commitment View
// Explicit "no way back" warning the user must acknowledge before confirming.

struct CommitmentView: View {
    let pending: PendingSession
    let onBack: () -> Void
    let onConfirm: (BlockSession) -> Void

    @State private var agreedToTerms = false
    @State private var typedConfirm  = ""
    @State private var isActivating  = false
    @State private var errorMessage: String?

    private var canConfirm: Bool {
        agreedToTerms && typedConfirm.uppercased() == "START" && !isActivating
    }

    var body: some View {
        VStack(spacing: 0) {

            // ── Nav bar ──────────────────────────────────────────────────
            HStack {
                Button("← Back", action: onBack)
                    .buttonStyle(GhostButtonStyle())
                Spacer()
                Text("Final Confirmation")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.primaryText)
                Spacer()
                Color.clear.frame(width: 72)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Theme.candlelight)
            .overlay(Divider().foregroundColor(Theme.border), alignment: .bottom)

            // ── Scrollable body ──────────────────────────────────────────
            ScrollView {
                VStack(spacing: 22) {

                    // ── Warning banner ───────────────────────────────────
                    VStack(spacing: 14) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 36))
                            .foregroundColor(Theme.terracotta)

                        Text("This cannot be undone.")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(Theme.duskSienna)

                        Text("You will not be able to access the websites or apps below for the full duration. There is no override, no disable button, and no way to contact support to lift the block early. The only way through is to wait.")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.primaryText)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(20)
                    .background(Theme.terracotta.opacity(0.07))
                    .cornerRadius(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.terracotta.opacity(0.25), lineWidth: 1.5))

                    // ── Session summary ──────────────────────────────────
                    VStack(alignment: .leading, spacing: 14) {
                        summaryRow(label: "Ends at",  value: formattedEndDate)
                        summaryRow(label: "Duration", value: durationDescription)
                        Divider().background(Theme.border)

                        if !pending.blockedWebsites.isEmpty {
                            listSection(title: "Blocked Websites", items: pending.blockedWebsites)
                        }
                        if !pending.blockedApps.isEmpty {
                            listSection(title: "Blocked Apps", items: pending.blockedApps.map(\.name))
                        }
                    }
                    .padding(16)
                    .cardStyle()

                    // ── Checkbox ─────────────────────────────────────────
                    Button { agreedToTerms.toggle() } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Image(systemName: agreedToTerms ? "checkmark.square.fill" : "square")
                                .font(.system(size: 20))
                                .foregroundColor(agreedToTerms ? Theme.terracotta : Theme.sandstone)
                            Text("I understand this block is permanent for the duration. I accept full responsibility and will not attempt to find workarounds.")
                                .font(.system(size: 13))
                                .foregroundColor(Theme.primaryText)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .buttonStyle(.plain)

                    // ── Type-to-confirm ───────────────────────────────────
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Type START to confirm")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Theme.secondaryText)
                        TextField("", text: $typedConfirm)
                            .textFieldStyle(.plain)
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(Theme.duskSienna)
                            .multilineTextAlignment(.center)
                            .padding(12)
                            .background(Theme.sandWall)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8)
                                .stroke(canConfirm ? Theme.terracotta : Theme.border, lineWidth: 1.5))
                    }

                    // ── Error ────────────────────────────────────────────
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.destructive)
                            .multilineTextAlignment(.center)
                    }

                    // ── Confirm button ────────────────────────────────────
                    Button(action: confirm) {
                        HStack(spacing: 8) {
                            if isActivating { ProgressView().scaleEffect(0.75) }
                            Text(isActivating ? "Activating…" : "Lock It In")
                        }
                        .frame(minWidth: 160)
                    }
                    .buttonStyle(PrimaryButtonStyle(isDestructive: true))
                    .disabled(!canConfirm)
                    .opacity(canConfirm ? 1 : 0.4)

                    Text("Your Mac password will be requested to update\nyour system hosts file for website blocking.")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.secondaryText)
                        .multilineTextAlignment(.center)

                    Spacer(minLength: 20)
                }
                .padding(20)
            }
            .background(Theme.background)
        }
        .background(Theme.background)
    }

    // MARK: - Confirm

    private func confirm() {
        isActivating = true
        errorMessage = nil

        DispatchQueue.global(qos: .userInitiated).async {
            var hostsOK = true
            if !pending.blockedWebsites.isEmpty {
                hostsOK = HostsFileManager().blockDomains(pending.blockedWebsites)
            }

            DispatchQueue.main.async {
                guard hostsOK else {
                    isActivating = false
                    errorMessage = "Could not update /etc/hosts — please try again and enter your password when prompted."
                    return
                }

                let session = BlockSession(
                    id: UUID(),
                    startTime: Date(),
                    endTime: pending.endTime,
                    blockedWebsites: pending.blockedWebsites,
                    blockedApps: pending.blockedApps
                )
                onConfirm(session)
            }
        }
    }

    // MARK: - Helpers

    @ViewBuilder
    private func summaryRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Theme.secondaryText)
            Spacer()
            Text(value)
                .font(.system(size: 13))
                .foregroundColor(Theme.primaryText)
        }
    }

    @ViewBuilder
    private func listSection(title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(Theme.secondaryText)
                .textCase(.uppercase)
            ForEach(items, id: \.self) { item in
                HStack(spacing: 6) {
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

    private var formattedEndDate: String {
        let f = DateFormatter(); f.dateStyle = .full; f.timeStyle = .short
        return f.string(from: pending.endTime)
    }

    private var durationDescription: String {
        let secs = pending.endTime.timeIntervalSince(Date())
        let days = Int(secs / 86400)
        let hours = Int(secs.truncatingRemainder(dividingBy: 86400) / 3600)
        if hours > 0 { return "\(days)d \(hours)h" }
        return "\(days) day\(days == 1 ? "" : "s")"
    }
}
