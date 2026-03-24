#!/usr/bin/env swift
// Focusin icon generator
// Draws a cross on a warm sienna background using the Golden Adobe palette.
// Run: swift generate_icon.swift <output_iconset_dir>

import Foundation
import CoreGraphics
import ImageIO

// MARK: - Palette (Golden Adobe)
func c(_ hex: UInt32, a: CGFloat = 1) -> CGColor {
    CGColor(red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255,
            alpha: a)
}

let bgCenter   = c(0x7B3B1C)   // warm terracotta — gradient centre
let bgEdge     = c(0x4E1E0A)   // deep sienna — gradient edge
let crossColor = c(0xF5D48A)   // Candlelight — bright warm highlight
let shadowCol  = c(0x2E1006, a: 0.55)

// MARK: - Draw

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

    // ── Cross geometry ────────────────────────────────────────────────
    // Cross bounding box — centred, with padding
    let cw = s * 0.50       // total cross width
    let ch = s * 0.69       // total cross height
    let tw = cw * 0.335     // arm / bar thickness
    let cx = (s - cw) / 2   // cross left edge
    let cy = (s - ch) / 2   // cross bottom edge  (y=0 is bottom in CG)

    let vx = cx + (cw - tw) / 2   // vertical bar left edge

    // Horizontal bar: centre is at 30 % from cross top → 70 % from bottom
    let hMid    = cy + ch * 0.695
    let hBarTop = hMid + tw / 2       // top of h-bar
    let hBarBot = hMid - tw / 2       // bottom of h-bar

    // 12-vertex cross outline (clockwise in CG's y-up space)
    let pts: [CGPoint] = [
        CGPoint(x: vx,      y: cy + ch),   //  0 top-left of vert bar
        CGPoint(x: vx + tw, y: cy + ch),   //  1 top-right
        CGPoint(x: vx + tw, y: hBarTop),   //  2 inner top-right corner
        CGPoint(x: cx + cw, y: hBarTop),   //  3 right end top
        CGPoint(x: cx + cw, y: hBarBot),   //  4 right end bottom
        CGPoint(x: vx + tw, y: hBarBot),   //  5 inner bottom-right corner
        CGPoint(x: vx + tw, y: cy),        //  6 bottom-right of vert bar
        CGPoint(x: vx,      y: cy),        //  7 bottom-left
        CGPoint(x: vx,      y: hBarBot),   //  8 inner bottom-left corner
        CGPoint(x: cx,      y: hBarBot),   //  9 left end bottom
        CGPoint(x: cx,      y: hBarTop),   // 10 left end top
        CGPoint(x: vx,      y: hBarTop),   // 11 inner top-left corner
    ]

    let cross = CGMutablePath()
    cross.move(to: pts[0])
    pts.dropFirst().forEach { cross.addLine(to: $0) }
    cross.closeSubpath()

    // ── Draw cross with drop shadow ───────────────────────────────────
    ctx.setShadow(offset: CGSize(width: 0, height: -s * 0.014),
                  blur: s * 0.045, color: shadowCol)
    ctx.setFillColor(crossColor)
    ctx.addPath(cross)
    ctx.fillPath()

    // ── Subtle inner highlight (top 30 % of icon, very soft) ─────────
    ctx.setShadow(offset: .zero, blur: 0, color: nil)   // clear shadow
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
