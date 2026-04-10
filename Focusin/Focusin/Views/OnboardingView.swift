import SwiftUI

// MARK: - Onboarding View
// Shown exactly once on first launch. Dismissed by tapping "Get Started"
// on the final step, which sets the hasSeenOnboarding AppStorage flag.

struct OnboardingView: View {
    let onFinish: () -> Void

    @State private var currentStep: Int = 0
    @State private var goingForward: Bool = true

    // Unskippable step — Next button is locked for 2.5 s when landing here
    private let unskippableStep = 4
    @State private var nextUnlocked = false
    @State private var unlockItem: DispatchWorkItem? = nil

    private let totalSteps = 6

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Slide area ────────────────────────────────────────────
                ZStack {
                    ForEach(0..<totalSteps, id: \.self) { index in
                        if index == currentStep {
                            stepView(for: index)
                                .transition(.asymmetric(
                                    insertion: .move(edge: goingForward ? .trailing : .leading),
                                    removal:   .move(edge: goingForward ? .leading  : .trailing)
                                ))
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .clipped()

                // ── Step dots ─────────────────────────────────────────────
                HStack(spacing: 7) {
                    ForEach(0..<totalSteps, id: \.self) { i in
                        Capsule()
                            .fill(i == currentStep ? Theme.terracotta : Theme.sandstone.opacity(0.3))
                            .frame(width: i == currentStep ? 20 : 7, height: 7)
                            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentStep)
                    }
                }
                .padding(.bottom, 24)

                // ── Navigation buttons ─────────────────────────────────────
                HStack(spacing: 14) {
                    if currentStep > 0 {
                        Button("Back") { advance(by: -1) }
                            .buttonStyle(GhostButtonStyle())
                    }

                    Spacer()

                    if currentStep < totalSteps - 1 {
                        // Skip jumps straight to the uninstall step (unskippable),
                        // and is hidden once the user is on or past it.
                        if currentStep < unskippableStep {
                            Button("Skip") {
                                goingForward = true
                                withAnimation(.easeInOut(duration: 0.28)) {
                                    currentStep = unskippableStep
                                }
                            }
                            .buttonStyle(GhostButtonStyle())
                        }

                        Button("Next") { advance(by: 1) }
                            .buttonStyle(PrimaryButtonStyle())
                            // Locked until the 2.5 s timer fires
                            .opacity(currentStep == unskippableStep && !nextUnlocked ? 0.35 : 1)
                            .disabled(currentStep == unskippableStep && !nextUnlocked)
                    } else {
                        Button("Get Started") { onFinish() }
                            .buttonStyle(PrimaryButtonStyle())
                    }
                }
                .padding(.horizontal, 40)
                .padding(.bottom, 40)
            }
        }
        .onChange(of: currentStep) { step in
            // Cancel any in-flight timer first
            unlockItem?.cancel()
            nextUnlocked = false

            guard step == unskippableStep else { return }

            let item = DispatchWorkItem {
                withAnimation(.easeIn(duration: 0.25)) { nextUnlocked = true }
            }
            unlockItem = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 6.5, execute: item)
        }
    }

    // MARK: - Step routing

    @ViewBuilder
    private func stepView(for index: Int) -> some View {
        switch index {
        case 0: StepWelcome()
        case 1: StepHowItWorks()
        case 2: StepPomodoro()
        case 3: StepMenuBar()
        case 4: StepUninstall()
        case 5: StepReady()
        default: EmptyView()
        }
    }

    private func advance(by delta: Int) {
        goingForward = delta > 0
        withAnimation(.easeInOut(duration: 0.28)) {
            currentStep = max(0, min(totalSteps - 1, currentStep + delta))
        }
    }
}

// MARK: - Step 1: Welcome

private struct StepWelcome: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Theme.terracotta.opacity(0.12))
                    .frame(width: 96, height: 96)
                Image(systemName: "flame.fill")
                    .font(.system(size: 48))
                    .foregroundColor(Theme.terracotta)
            }

            Spacer().frame(height: 24)

            Text("Welcome to Focusin")
                .font(.system(size: 30, weight: .bold, design: .serif))
                .foregroundColor(Theme.duskSienna)
                .multilineTextAlignment(.center)

            Spacer().frame(height: 10)

            Text("Hard-mode focus. No exceptions.")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Theme.secondaryText)

            Spacer().frame(height: 28)

            Text("Focusin blocks the websites and apps you choose for a set period of time — with no way to undo once you commit. Real focus, by design.")
                .font(.system(size: 14))
                .foregroundColor(Theme.primaryText.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 48)

            Spacer()
        }
    }
}

// MARK: - Step 2: How it works

private struct StepHowItWorks: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 48)

            OnboardingStepHeader(
                icon: "lightbulb.fill",
                title: "How it works",
                subtitle: "Three simple steps to a distraction-free session."
            )

            Spacer().frame(height: 32)

            VStack(spacing: 12) {
                OnboardingFeatureCard(
                    icon: "checklist",
                    title: "Pick what to block",
                    detail: "Choose websites and apps you want to keep off-limits during your session."
                )
                OnboardingFeatureCard(
                    icon: "clock.fill",
                    title: "Set your duration",
                    detail: "Decide how long you need to focus — from 15 minutes to several hours."
                )
                OnboardingFeatureCard(
                    icon: "lock.fill",
                    title: "Commit and go",
                    detail: "Once you confirm, the block is active. No shortcuts, no early exit."
                )
            }
            .padding(.horizontal, 40)

            Spacer()
        }
    }
}

// MARK: - Step 3: Pomodoro Mode

private struct StepPomodoro: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 48)

            OnboardingStepHeader(
                icon: "timer",
                title: "Pomodoro Mode",
                subtitle: "Focus in structured intervals, automatically."
            )

            Spacer().frame(height: 32)

            // Cycle illustration
            HStack(spacing: 0) {
                PomoCycleBlock(label: "Focus", duration: "25 min", color: Theme.terracotta, icon: "flame.fill")
                PomoCycleDivider()
                PomoCycleBlock(label: "Break", duration: "5 min", color: Theme.success, icon: "cup.and.saucer.fill")
                PomoCycleDivider()
                PomoCycleBlock(label: "Repeat", duration: "∞", color: Theme.sandstone, icon: "arrow.2.circlepath")
            }
            .padding(.horizontal, 40)

            Spacer().frame(height: 24)

            VStack(spacing: 12) {
                OnboardingFeatureCard(
                    icon: "timer",
                    title: "Automatic cycling",
                    detail: "25 minutes of focus, then a 5-minute break — repeated automatically throughout your session."
                )
                OnboardingFeatureCard(
                    icon: "slider.horizontal.3",
                    title: "Always optional",
                    detail: "Enable Pomodoro during setup, or toggle it on and off mid-session whenever you need."
                )
            }
            .padding(.horizontal, 40)

            Spacer()
        }
    }
}

private struct PomoCycleBlock: View {
    let label: String
    let duration: String
    let color: Color
    let icon: String

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.13))
                    .frame(width: 42, height: 42)
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(color)
            }
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Theme.primaryText)
            Text(duration)
                .font(.system(size: 10, weight: .medium).monospaced())
                .foregroundColor(Theme.secondaryText)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct PomoCycleDivider: View {
    var body: some View {
        Image(systemName: "arrow.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Theme.sandstone.opacity(0.5))
            .padding(.bottom, 18)
    }
}

// MARK: - Step 4: Menu Bar

private struct StepMenuBar: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 48)

            OnboardingStepHeader(
                icon: "menubar.rectangle",
                title: "Lives in your menu bar",
                subtitle: "Focusin stays out of the way while you work."
            )

            Spacer().frame(height: 32)

            VStack(spacing: 12) {
                OnboardingFeatureCard(
                    icon: "eye.slash.fill",
                    title: "Hides from the Dock",
                    detail: "When a session is active, Focusin removes itself from the Dock so nothing distracts you."
                )
                OnboardingFeatureCard(
                    icon: "menubar.arrow.up.rectangle",
                    title: "Always one click away",
                    detail: "Click the flame icon in the menu bar to see your countdown, blocked list, or bring the window back."
                )
                OnboardingFeatureCard(
                    icon: "bell.badge.fill",
                    title: "Notified when done",
                    detail: "You'll get a system notification the moment your session ends and everything is unblocked."
                )
            }
            .padding(.horizontal, 40)

            Spacer()
        }
    }
}

// MARK: - Step 5: Clean Uninstall

private struct StepUninstall: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer().frame(height: 48)

            OnboardingStepHeader(
                icon: "trash",
                title: "Removing Focusin",
                subtitle: "Don't just drag it to the Trash."
            )

            Spacer().frame(height: 32)

            VStack(spacing: 12) {
                OnboardingFeatureCard(
                    icon: "exclamationmark.triangle.fill",
                    title: "Trash won't fully remove it",
                    detail: "Focusin installs background agents that keep running even after the app is deleted from your Dock or Trash."
                )
                OnboardingFeatureCard(
                    icon: "checkmark.circle.fill",
                    title: "Use the built-in uninstaller",
                    detail: "On the home screen, click \"Uninstall Focusin…\" below the Start button. It removes the app, agents, and all data in one step."
                )
            }
            .padding(.horizontal, 40)

            Spacer()
        }
    }
}

// MARK: - Step 6: Ready

private struct StepReady: View {
    @State private var showCheck = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Theme.terracotta.opacity(0.12))
                    .frame(width: 96, height: 96)
                ZStack {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 42))
                        .foregroundColor(Theme.terracotta)
                    if showCheck {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(Theme.success)
                            .offset(x: 22, y: 22)
                            .transition(.scale.combined(with: .opacity))
                    }
                }
            }

            Spacer().frame(height: 24)

            Text("You're all set.")
                .font(.system(size: 30, weight: .bold, design: .serif))
                .foregroundColor(Theme.duskSienna)

            Spacer().frame(height: 10)

            Text("Start your first session and take back your attention.")
                .font(.system(size: 14))
                .foregroundColor(Theme.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 60)

            Spacer().frame(height: 40)

            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.terracotta)
                    Text("Block websites and apps in seconds")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.primaryText)
                    Spacer()
                }
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.terracotta)
                    Text("Pomodoro intervals when you need structure")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.primaryText)
                    Spacer()
                }
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Theme.terracotta)
                    Text("Runs quietly in the menu bar")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.primaryText)
                    Spacer()
                }
            }
            .padding(.horizontal, 60)

            Spacer()
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.3)) {
                showCheck = true
            }
        }
    }
}

// MARK: - Shared sub-components

private struct OnboardingStepHeader: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Theme.terracotta.opacity(0.12))
                    .frame(width: 64, height: 64)
                Image(systemName: icon)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
            }

            Text(title)
                .font(.system(size: 24, weight: .bold, design: .serif))
                .foregroundColor(Theme.duskSienna)

            Text(subtitle)
                .font(.system(size: 13))
                .foregroundColor(Theme.secondaryText)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
}

private struct OnboardingFeatureCard: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Image(systemName: icon)
                    .symbolRenderingMode(.monochrome)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.terracotta)
            }
            .frame(width: 22, height: 22)
            .padding(.top, 1)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.primaryText)
                Text(detail)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
        }
        .padding(14)
        .cardStyle()
    }
}
