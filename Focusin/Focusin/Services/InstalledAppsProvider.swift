import Foundation
import AppKit

// MARK: - Installed App (UI model)

struct InstalledApp: Identifiable {
    var id: String { bundleIdentifier }
    var name: String
    var bundleIdentifier: String
    var icon: NSImage?
}

// MARK: - Installed Apps Provider
// Scans /Applications (and ~/Applications) to build the list the user can pick from.

final class InstalledAppsProvider {

    static let shared = InstalledAppsProvider()

    private(set) var apps: [InstalledApp] = []

    func load(completion: @escaping ([InstalledApp]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            var found: [InstalledApp] = []
            let searchPaths = [
                "/Applications",
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications").path
            ]
            for root in searchPaths {
                found += self.scanDirectory(root)
            }
            // Deduplicate by bundle ID — same app can appear in both /Applications
            // and ~/Applications, causing duplicate rows that confusingly toggle together.
            var seen = Set<String>()
            let unique = found.filter { seen.insert($0.bundleIdentifier).inserted }
            let sorted = unique.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            DispatchQueue.main.async {
                self.apps = sorted
                completion(sorted)
            }
        }
    }

    private func scanDirectory(_ path: String) -> [InstalledApp] {
        guard let items = try? FileManager.default.contentsOfDirectory(atPath: path) else { return [] }
        var result: [InstalledApp] = []
        for item in items where item.hasSuffix(".app") {
            let full = (path as NSString).appendingPathComponent(item)
            if let bundle = Bundle(path: full),
               let bid = bundle.bundleIdentifier {
                let name = bundle.infoDictionary?["CFBundleDisplayName"] as? String
                    ?? bundle.infoDictionary?["CFBundleName"] as? String
                    ?? (item as NSString).deletingPathExtension
                let icon = NSWorkspace.shared.icon(forFile: full)
                result.append(InstalledApp(name: name, bundleIdentifier: bid, icon: icon))
            }
        }
        return result
    }
}
