import SwiftUI

// MARK: - Home View

struct HomeView: View {
    let onStart: () -> Void

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
                    FeatureRow(icon: "globe.slash",
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

                Spacer()

                // ── Start button ─────────────────────────────────────────
                Button("Start a Focus Session", action: onStart)
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.bottom, 48)
            }
        }
    }
}

private struct FeatureRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.terracotta)
                .frame(width: 24)
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
