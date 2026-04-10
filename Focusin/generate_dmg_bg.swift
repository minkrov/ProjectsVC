#!/usr/bin/env swift
// Generates the branded DMG installer background image.
// Window size: 580 × 340 pt  →  1160 × 680 px @2x (retina)
import Foundation
import CoreGraphics
import CoreText
import ImageIO

let W: CGFloat = 580
let H: CGFloat = 340
let scale = 2

let pw = Int(W) * scale
let ph = Int(H) * scale

let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: pw, height: ph,
                   bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                   bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.scaleBy(x: CGFloat(scale), y: CGFloat(scale))

// Convenience: hex → CGColor
func c(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255,
            alpha: a)
}

// ── 1. Warm diagonal gradient base ─────────────────────────────────────────
//   top-left: very light sandWall   bottom-right: rich warmHoney
let bg = CGGradient(colorsSpace: cs,
    colors: [c(0xF7EDD0), c(0xDCB55E)] as CFArray, locations: [0.0, 1.0])!
ctx.drawLinearGradient(bg,
    start: CGPoint(x: 0,  y: H),
    end:   CGPoint(x: W,  y: 0),
    options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])

// ── 2. Large faint decorative circle centred in the window ─────────────────
//   Mirrors the icon-circle motif used throughout the app UI
ctx.setFillColor(c(0xB05A28, 0.05))
let bigR: CGFloat = 195
ctx.fillEllipse(in: CGRect(x: W/2 - bigR, y: H/2 - bigR,
                           width: bigR*2,  height: bigR*2))

// ── 3. Soft radial glow behind the Focusin.app icon (left position) ────────
//   Finder places the icon at logical (160, 160) from top-left.
//   CoreGraphics origin is bottom-left, so CG-y = H - 160 = 180.
let glowPt = CGPoint(x: 160, y: H - 155)
let glow = CGGradient(colorsSpace: cs,
    colors: [c(0xB05A28, 0.15), c(0xB05A28, 0.00)] as CFArray, locations: [0.0, 1.0])!
ctx.drawRadialGradient(glow,
    startCenter: glowPt, startRadius: 0,
    endCenter:   glowPt, endRadius:   128,
    options: [])

// ── 4. Accent circle — top-right corner (amber, decorative) ────────────────
ctx.setFillColor(c(0xE8B96A, 0.20))
let trR: CGFloat = 85
ctx.fillEllipse(in: CGRect(x: W - trR * 0.65, y: H - trR * 0.65,
                           width: trR*2, height: trR*2))

// ── 5. Accent circle — bottom-left corner (sandstone, decorative) ──────────
ctx.setFillColor(c(0xD4924A, 0.12))
let blR: CGFloat = 60
ctx.fillEllipse(in: CGRect(x: -blR * 0.55, y: -blR * 0.55,
                           width: blR*2, height: blR*2))

// ── 6. Thin terracotta line at the very top of the window ──────────────────
ctx.setStrokeColor(c(0xB05A28, 0.30))
ctx.setLineWidth(1.5)
ctx.move(to:    CGPoint(x: 0, y: H - 0.75))
ctx.addLine(to: CGPoint(x: W, y: H - 0.75))
ctx.strokePath()

// ── 7. Subtle separator line near the bottom ───────────────────────────────
ctx.setStrokeColor(c(0xB05A28, 0.10))
ctx.setLineWidth(0.75)
ctx.move(to:    CGPoint(x: 44, y: 30))
ctx.addLine(to: CGPoint(x: W - 44, y: 30))
ctx.strokePath()

// ── 8. "Focusin" brand name — bottom centre ────────────────────────────────
let brandFont = CTFontCreateWithName("Georgia-Bold" as CFString, 14.5, nil)
let brandAttr: [CFString: Any] = [
    kCTFontAttributeName:            brandFont,
    kCTForegroundColorAttributeName: c(0x6B3318, 0.55),
]
let brandLine = CTLineCreateWithAttributedString(
    CFAttributedStringCreate(nil, "Focusin" as CFString, brandAttr as CFDictionary)!)
let brandW = CTLineGetTypographicBounds(brandLine, nil, nil, nil)
ctx.textPosition = CGPoint(x: (W - brandW) / 2, y: 36)
CTLineDraw(brandLine, ctx)

// ── 9. Tagline — below brand name ──────────────────────────────────────────
let tagFont = CTFontCreateWithName("Georgia" as CFString, 9, nil)
let tagAttr: [CFString: Any] = [
    kCTFontAttributeName:            tagFont,
    kCTForegroundColorAttributeName: c(0x6B3318, 0.32),
]
let tagLine = CTLineCreateWithAttributedString(
    CFAttributedStringCreate(nil, "Hard-mode focus. No exceptions." as CFString,
                             tagAttr as CFDictionary)!)
let tagW = CTLineGetTypographicBounds(tagLine, nil, nil, nil)
ctx.textPosition = CGPoint(x: (W - tagW) / 2, y: 20)
CTLineDraw(tagLine, ctx)

// ── 10. Simple arrow: Focusin.app → Applications ──────────────────────────
// Straight line from right edge of Focusin icon to left edge of Applications.
// Icon centres: Focusin (160,180), Applications (420,180). Icon half-width ≈ 50.
let lineStart = CGPoint(x: 218, y: 180)
let lineEnd   = CGPoint(x: 344, y: 180)

// Shaft
ctx.setStrokeColor(c(0xB05A28, 0.72))
ctx.setLineWidth(2.0)
ctx.setLineCap(.round)
ctx.move(to: lineStart)
ctx.addLine(to: lineEnd)
ctx.strokePath()

// Filled arrowhead triangle at lineEnd pointing right
let arrowTip  = CGPoint(x: lineEnd.x + 10, y: lineEnd.y)
let arrowTop  = CGPoint(x: lineEnd.x,      y: lineEnd.y + 6)
let arrowBot  = CGPoint(x: lineEnd.x,      y: lineEnd.y - 6)
let arrowHead = CGMutablePath()
arrowHead.move(to: arrowTip)
arrowHead.addLine(to: arrowTop)
arrowHead.addLine(to: arrowBot)
arrowHead.closeSubpath()
ctx.setFillColor(c(0xB05A28, 0.72))
ctx.addPath(arrowHead)
ctx.fillPath()

// ── Save as @2x PNG ────────────────────────────────────────────────────────
let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "dmg_background.png"
let img  = ctx.makeImage()!
let url  = URL(fileURLWithPath: outPath)
let dst  = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
let props: [CFString: Any] = [kCGImagePropertyDPIWidth: 144, kCGImagePropertyDPIHeight: 144]
CGImageDestinationAddImage(dst, img, props as CFDictionary)
CGImageDestinationFinalize(dst)
print("  ✓ DMG background (\(pw)×\(ph)px @2x)")
