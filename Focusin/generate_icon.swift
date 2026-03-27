#!/usr/bin/env swift
// Focusin icon generator
// Uses the SF Symbol flame.fill (same as the app homepage) on a warm sienna background.
// Run: swift generate_icon.swift <output_iconset_dir>

import Foundation
import AppKit

// MARK: - Palette (Golden Adobe)
func c(_ hex: UInt32, a: CGFloat = 1) -> CGColor {
    CGColor(red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255,
            alpha: a)
}

let bgCenter  = c(0x7B3B1C)          // warm terracotta — gradient centre
let bgEdge    = c(0x4E1E0A)          // deep sienna — gradient edge
let flameNS   = NSColor(cgColor: c(0xF5D48A))!  // Candlelight
let shadowNS  = NSColor(cgColor: c(0x2E1006, a: 0.55))!

// MARK: - Tinted flame SF Symbol

func tintedFlame(pointSize: CGFloat) -> NSImage {
    let cfg = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .regular)
    guard let sym = NSImage(systemSymbolName: "flame.fill", accessibilityDescription: nil)?
            .withSymbolConfiguration(cfg) else {
        fatalError("flame.fill SF Symbol not available on this system")
    }
    // Fill with candlelight colour, masked by the symbol's alpha
    let out = NSImage(size: sym.size, flipped: false) { rect in
        flameNS.setFill()
        rect.fill()
        sym.draw(in: rect, from: .zero, operation: .destinationIn, fraction: 1)
        return true
    }
    return out
}

// MARK: - Draw icon

func makeIcon(size: Int) -> CGImage {
    let s = CGFloat(size)

    let ctx = CGContext(
        data: nil, width: size, height: size,
        bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    ctx.interpolationQuality = .high

    // ── Rounded-rect clip (standard macOS icon corner: 22.37 %) ──────
    let r   = s * 0.2237
    let box = CGRect(x: 0, y: 0, width: s, height: s)
    ctx.addPath(CGPath(roundedRect: box, cornerWidth: r, cornerHeight: r, transform: nil))
    ctx.clip()

    // ── Radial background gradient ────────────────────────────────────
    let cs   = CGColorSpaceCreateDeviceRGB()
    let grad = CGGradient(colorsSpace: cs,
                          colors: [bgCenter, bgEdge] as CFArray,
                          locations: [0, 1])!
    ctx.drawRadialGradient(
        grad,
        startCenter: CGPoint(x: s * 0.50, y: s * 0.55), startRadius: 0,
        endCenter:   CGPoint(x: s * 0.50, y: s * 0.50), endRadius:   s * 0.80,
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )

    // ── Flame SF Symbol ───────────────────────────────────────────────
    // pointSize drives how large the glyph is rendered; we'll centre it.
    let flame     = tintedFlame(pointSize: s * 0.60)
    let fw        = flame.size.width
    let fh        = flame.size.height
    let destRect  = CGRect(
        x: (s - fw) / 2,
        y: (s - fh) / 2 - s * 0.02,   // tiny downward nudge for visual balance
        width:  fw,
        height: fh
    )

    // Draw via NSGraphicsContext so NSShadow works
    NSGraphicsContext.saveGraphicsState()
    let nsCtx = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.current = nsCtx

    let shadow = NSShadow()
    shadow.shadowOffset     = NSSize(width: 0, height: -s * 0.014)
    shadow.shadowBlurRadius = s * 0.045
    shadow.shadowColor      = shadowNS
    shadow.set()

    flame.draw(in: destRect)

    NSGraphicsContext.restoreGraphicsState()

    // ── Subtle inner highlight (top 30 %, very soft) ──────────────────
    let hiGrad = CGGradient(
        colorsSpace: cs,
        colors: [c(0xFFFFFF, a: 0.055), c(0xFFFFFF, a: 0)] as CFArray,
        locations: [0, 1]
    )!
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: box, cornerWidth: r, cornerHeight: r, transform: nil))
    ctx.clip()
    ctx.drawLinearGradient(
        hiGrad,
        start: CGPoint(x: s / 2, y: s),
        end:   CGPoint(x: s / 2, y: s * 0.55),
        options: []
    )
    ctx.restoreGState()

    return ctx.makeImage()!
}

// MARK: - Save PNG

func save(_ img: CGImage, to path: String) {
    let url  = URL(fileURLWithPath: path)
    guard let dst = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)
    else { fputs("Cannot write \(path)\n", stderr); return }
    CGImageDestinationAddImage(dst, img, nil)
    CGImageDestinationFinalize(dst)
}

// MARK: - Generate all sizes

let outDir = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

struct Entry { let file: String; let px: Int }
let entries: [Entry] = [
    .init(file: "icon_16x16.png",      px: 16),
    .init(file: "icon_16x16@2x.png",   px: 32),
    .init(file: "icon_32x32.png",      px: 32),
    .init(file: "icon_32x32@2x.png",   px: 64),
    .init(file: "icon_128x128.png",    px: 128),
    .init(file: "icon_128x128@2x.png", px: 256),
    .init(file: "icon_256x256.png",    px: 256),
    .init(file: "icon_256x256@2x.png", px: 512),
    .init(file: "icon_512x512.png",    px: 512),
    .init(file: "icon_512x512@2x.png", px: 1024),
]

var cache: [Int: CGImage] = [:]
for e in entries {
    let img = cache[e.px] ?? makeIcon(size: e.px)
    cache[e.px] = img
    save(img, to: "\(outDir)/\(e.file)")
    print("  ✓ \(e.file)")
}
print("Done.")
