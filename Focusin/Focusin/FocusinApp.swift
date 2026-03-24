import SwiftUI

@main
struct FocusinApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appDelegate.sessionManager)
                .environmentObject(appDelegate.appWatcher)
                .preferredColorScheme(.light)   // always light — our palette is warm
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            // Remove "New Window" from the File menu
            CommandGroup(replacing: .newItem) {}
        }
    }
}
