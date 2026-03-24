import Foundation
import AppKit

// MARK: - Hosts File Manager
// Edits /etc/hosts using AppleScript-driven privileged shell commands.
// The user sees a single macOS admin prompt when the session starts,
// and another when the session ends.

final class HostsFileManager {

    static let blockStart = "# ===FOCUSIN_BLOCK_START==="
    static let blockEnd   = "# ===FOCUSIN_BLOCK_END==="

    // MARK: - Block

    /// Adds entries to /etc/hosts for every domain in the list (and www. variant).
    /// Returns true if the operation succeeded.
    @discardableResult
    func blockDomains(_ domains: [String]) -> Bool {
        guard !domains.isEmpty else { return true }

        // Build the block to append
        var lines = [HostsFileManager.blockStart]
        for domain in domains {
            let d = domain.lowercased()
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "^https?://", with: "", options: .regularExpression)
                .replacingOccurrences(of: "/.*$", with: "", options: .regularExpression)
            guard !d.isEmpty else { continue }
            lines.append("127.0.0.1 \(d)")
            if !d.hasPrefix("www.") {
                lines.append("127.0.0.1 www.\(d)")
            }
        }
        lines.append(HostsFileManager.blockEnd)
        let block = lines.joined(separator: "\\n")   // literal \n for shell printf

        // Append via privileged shell command
        let cmd = "printf '\\n\(block)\\n' >> /etc/hosts && dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null || true"
        return runPrivileged(cmd)
    }

    // MARK: - Unblock

    /// Removes the Focusin block from /etc/hosts.
    @discardableResult
    func unblockDomains() -> Bool {
        // Use sed to delete the marker block (including surrounding blank lines)
        let cmd = #"sed -i '' '/===FOCUSIN_BLOCK_START===/,/===FOCUSIN_BLOCK_END===/d' /etc/hosts && dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null || true"#
        return runPrivileged(cmd)
    }

    // MARK: - Check existing block

    func hostsAreBlocked() -> Bool {
        guard let content = try? String(contentsOfFile: "/etc/hosts") else { return false }
        return content.contains(HostsFileManager.blockStart)
    }

    // MARK: - Privileged Execution

    private func runPrivileged(_ shellCommand: String) -> Bool {
        // Escape double-quotes inside the shell command for embedding into AppleScript
        let escaped = shellCommand
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let source = "do shell script \"\(escaped)\" with administrator privileges"

        var errorDict: NSDictionary?
        guard let script = NSAppleScript(source: source) else { return false }
        script.executeAndReturnError(&errorDict)
        if let err = errorDict {
            print("HostsFileManager error: \(err)")
            return false
        }
        return true
    }
}
