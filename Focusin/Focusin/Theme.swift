import SwiftUI

// MARK: - Golden Adobe Color Palette

struct Theme {
    // Palette
    static let sandWall    = Color(hex: "F0D9A8")  // base background
    static let warmHoney   = Color(hex: "EEC97E")  // accent
    static let candlelight = Color(hex: "F5D48A")  // surface / card
    static let sandstone   = Color(hex: "D4924A")  // secondary text / border
    static let oldAmber    = Color(hex: "E8B96A")  // subtle accent
    static let terracotta  = Color(hex: "B05A28")  // primary action
    static let duskSienna  = Color(hex: "6B3318")  // strong text / heading

    // Semantic aliases
    static let background      = sandWall
    static let surface         = candlelight
    static let surfaceDeep     = warmHoney
    static let primaryText     = duskSienna
    static let secondaryText   = sandstone
    static let accent          = terracotta
    static let accentLight     = oldAmber
    static let border          = oldAmber.opacity(0.5)
    static let destructive     = Color(hex: "8B1A1A")
    static let success         = Color(hex: "4A7C3F")

    // Typography helpers
    static func monoFont(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: .alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: h).scanHexInt64(&int)
        let r, g, b: UInt64
        switch h.count {
        case 3:
            (r, g, b) = ((int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        default:
            (r, g, b) = (int >> 16, int >> 8 & 0xFF, int & 0xFF)
        }
        self.init(.sRGB,
                  red:   Double(r) / 255,
                  green: Double(g) / 255,
                  blue:  Double(b) / 255)
    }
}

// MARK: - Reusable Modifiers

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Theme.surface)
            .cornerRadius(12)
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border, lineWidth: 1))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var isDestructive = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(Theme.candlelight)
            .padding(.vertical, 12)
            .padding(.horizontal, 28)
            .background(
                (isDestructive ? Theme.destructive : Theme.accent)
                    .opacity(configuration.isPressed ? 0.8 : 1)
            )
            .cornerRadius(10)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Theme.accent)
            .padding(.vertical, 9)
            .padding(.horizontal, 20)
            .background(Theme.accent.opacity(configuration.isPressed ? 0.12 : 0.07))
            .cornerRadius(8)
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardStyle()) }
}

// MARK: - Pomodoro Toggle Button
// Shared between SetupView and ActiveSessionView.
// Looks "pressed in" when active; springs back when toggled off.

struct PomodoroToggleButton: View {
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button {
            action()
        } label: {
            HStack(alignment: .top, spacing: 12) {

                // Icon circle
                ZStack {
                    Circle()
                        .fill(isOn ? Theme.terracotta : Theme.sandstone.opacity(0.18))
                        .frame(width: 34, height: 34)
                    Image(systemName: "timer")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(isOn ? Theme.candlelight : Theme.sandstone)
                }

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 0) {
                        Text("Pomodoro Mode")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(isOn ? Theme.duskSienna : Theme.primaryText)
                        Spacer()
                        // Toggle pill
                        Capsule()
                            .fill(isOn ? Theme.terracotta : Theme.sandstone.opacity(0.28))
                            .frame(width: 36, height: 20)
                            .overlay(
                                Circle()
                                    .fill(Color.white)
                                    .frame(width: 15, height: 15)
                                    .offset(x: isOn ? 8 : -8)
                                    .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isOn)
                                    .shadow(color: .black.opacity(0.12), radius: 1, x: 0, y: 1)
                            )
                    }
                    Text("25 min focus · 5 min break, cycling. Toggle off at any time to stop and reset the cycle.")
                        .font(.system(size: 11))
                        .foregroundColor(isOn ? Theme.terracotta.opacity(0.75) : Theme.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(12)
            .background(isOn ? Theme.terracotta.opacity(0.10) : Theme.candlelight)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isOn ? Theme.terracotta.opacity(0.45) : Theme.border, lineWidth: 1)
            )
            .scaleEffect(isOn ? 0.98 : 1.0)
        }
        .buttonStyle(PomodoroButtonPressStyle(isOn: isOn))
    }
}

private struct PomodoroButtonPressStyle: ButtonStyle {
    let isOn: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed
                ? (isOn ? 0.955 : 0.965)
                : 1.0)
            .animation(.spring(response: 0.18, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
