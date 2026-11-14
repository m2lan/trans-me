'use strict'

/**
 * 生成 GitHub 社交预览图（1280×640）
 * 用 AppKit 画：深色渐变底 + 应用图标 + 名称 + 卖点。
 * 产物：docs/social-preview.png，在仓库 Settings → Social preview 手动上传。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'social-preview.png')

const DRAW = `
ObjC.import('AppKit')
const W = 1280, H = 640
const img = $.NSImage.alloc.initWithSize($.NSMakeSize(W, H))
img.lockFocus

// 背景：深蓝渐变
const bg = $.NSGradient.alloc.initWithStartingColorEndingColor(
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.06, 0.09, 0.17, 1),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.10, 0.17, 0.34, 1)
)
bg.drawInRectAngle($.NSMakeRect(0, 0, W, H), 35)

// 右上角光斑：JXA 里传 CGPoint 不便，用大量同心圆叠加模拟径向渐变
const steps = 34
for (let i = steps; i >= 1; i--) {
  const r = 780 * (i / steps)
  const cx = W - 120, cy = H + 60
  const p = $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(cx - r, cy - r, r * 2, r * 2))
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.30, 0.55, 1.0, 0.013).setFill
  p.fill
}


// 图标
const S = 236
const ix = 104, iy = (H - S) / 2
const iconRect = $.NSMakeRect(ix, iy, S, S)
const iconPath = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(iconRect, 52, 52)
const iconGrad = $.NSGradient.alloc.initWithStartingColorEndingColor(
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.27, 0.54, 1.0, 1),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.07, 0.21, 0.62, 1)
)
iconGrad.drawInBezierPathAngle(iconPath, -90)

function draw(str, font, color, x, y) {
  const a = $.NSMutableDictionary.alloc.init
  a.setObjectForKey(font, $.NSFontAttributeName)
  a.setObjectForKey(color, $.NSForegroundColorAttributeName)
  $(str).drawAtPointWithAttributes($.NSMakePoint(x, y), a)
}

draw('译', $.NSFont.fontWithNameSize('PingFang SC', S * 0.55),
  $.NSColor.whiteColor, ix + S * 0.20, iy + S * 0.17)

// 文案
const tx = ix + S + 56
draw('TransMe', $.NSFont.boldSystemFontOfSize(84), $.NSColor.whiteColor, tx, 360)
draw('截图即译，划词即译', $.NSFont.fontWithNameSize('PingFang SC', 42),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.88, 0.92, 1.0, 1), tx, 286)
draw('中 / 英 / 日 / 韩 / 泰   ·   macOS & Windows', $.NSFont.fontWithNameSize('PingFang SC', 26),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.62, 0.70, 0.86, 1), tx, 238)

// 底部标签
const tags = ['Electron', 'Vue 3', 'OCR', 'DeepSeek']
const chipFont = $.NSFont.fontWithNameSize('PingFang SC', 22)
let cx = tx
for (const t of tags) {
  const a = $.NSMutableDictionary.alloc.init
  a.setObjectForKey(chipFont, $.NSFontAttributeName)
  const w = $(t).sizeWithAttributes(a).width
  const cw = w + 44, ch = 44, cy = 132
  const p = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius($.NSMakeRect(cx, cy, cw, ch), 22, 22)
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(1, 1, 1, 0.10).setFill
  p.fill
  draw(t, chipFont, $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.85, 0.90, 1.0, 1), cx + 22, cy + 11)
  cx += cw + 14
}

img.unlockFocus
const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation)
const png = rep.representationUsingTypeProperties(4, $())
png.base64EncodedStringWithOptions(0).js
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
const b64 = execFileSync('osascript', ['-l', 'JavaScript', '-e', DRAW], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
}).trim()
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'))
console.log('[social] 输出', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB')
