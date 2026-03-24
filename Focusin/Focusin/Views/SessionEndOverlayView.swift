import SwiftUI

// MARK: - Session End Overlay
// Appears on top of HomeView when a session expires.
// Blurs the background, shows a calm message, then fades in a Continue button.

struct SessionEndOverlayView: View {
    let onContinue: () -> Void

    @State private var buttonVisible = false

    var body: some View {
        ZStack {
            // ── Frosted-glass blur over whatever is behind ────────────────
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            // ── Centred message ───────────────────────────────────────────
            VStack(spacing: 36) {

                VStack(spacing: 2) {
                    Text("Session over,")
                        .font(.system(size: 28, weight: .light, design: .serif))
                        .foregroundColor(Theme.duskSienna)
                    Text("Congratulations.")
                        .font(.system(size: 28, weight: .light, design: .serif))
                        .foregroundColor(Theme.duskSienna)
                }

                // ── Continue button — fades in after 1.5 s ────────────────
                if buttonVisible {
                    Button(action: onContinue) {
                        Text("Continue")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.vertical, 9)
                            .padding(.horizontal, 36)
                            .background(Theme.terracotta)
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Theme.terracotta.opacity(0.4), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .transition(.opacity)
                }
            }
        }
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation(.easeIn(duration: 0.6)) {
                    buttonVisible = true
                }
            }
        }
    }
}
