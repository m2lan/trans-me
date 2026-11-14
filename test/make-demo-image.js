'use strict'

/**
 * 生成一张「英文网页截图」，用于 README 的截图翻译/图片翻译示意图
 * 产物：.tmp/demo-page.png (1600×1000, 2x)
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, '.tmp', 'demo-page.png')

const DRAW = `
ObjC.import('AppKit')
const W = 1600, H = 1000
const img = $.NSImage.alloc.initWithSize($.NSMakeSize(W, H))
img.lockFocus

function fill(color, rect) {
  color.setFill
  $.NSBezierPath.fillRect(rect)
}

function text(str, fontName, size, color, x, y) {
  const a = $.NSMutableDictionary.alloc.init
  a.setObjectForKey($.NSFont.fontWithNameSize(fontName, size), $.NSFontAttributeName)
  a.setObjectForKey(color, $.NSForegroundColorAttributeName)
  $(str).drawAtPointWithAttributes($.NSMakePoint(x, y), a)
}

const white = $.NSColor.whiteColor
const dark = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.09, 0.11, 0.15, 1)
const gray = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.36, 0.40, 0.47, 1)
const light = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.92, 0.93, 0.95, 1)
const accent = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.18, 0.44, 0.92, 1)

// 页面底
fill(white, $.NSMakeRect(0, 0, W, H))

// 顶部浏览器条
fill(light, $.NSMakeRect(0, H - 90, W, 90))
fill($.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.85, 0.86, 0.89, 1), $.NSMakeRect(0, H - 92, W, 2))
for (let i = 0; i < 3; i++) {
  const c = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.80, 0.82, 0.86, 1)
  c.setFill
  $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(40 + i * 34, H - 58, 20, 20)).fill
}
text('docs.transme.app/getting-started', 'Helvetica', 22, gray, 180, H - 62)

// 标题
text('Getting started', 'Helvetica-Bold', 62, dark, 110, H - 250)
fill(accent, $.NSMakeRect(110, H - 292, 120, 6))

// 正文
const lines = [
  'TransMe is a lightweight translator for macOS and Windows.',
  'Press the shortcut to capture any region of the screen, or drop',
  'an image into the window and read the translation in place.'
]
lines.forEach((line, i) => text(line, 'Helvetica', 30, dark, 110, H - 380 - i * 52))

// 三个要点
const items = [
  ['Screenshot translation', 'Select any region, get the translation in a popup.'],
  ['Image translation', 'Drag, paste or pick a file — translated text lands on the image.'],
  ['Text translation', 'Type or paste, with history and favorites stored locally.']
]
items.forEach(([title, desc], i) => {
  const y = H - 620 - i * 96
  fill(accent, $.NSMakeRect(110, y + 8, 10, 10))
  text(title, 'Helvetica-Bold', 28, dark, 140, y)
  text(desc, 'Helvetica', 24, gray, 140, y - 34)
})

// 右侧卡片
fill($.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.96, 0.97, 0.99, 1), $.NSMakeRect(1060, H - 720, 430, 330))
text('Quick start', 'Helvetica-Bold', 26, dark, 1100, H - 450)
text('1  npm install', 'Menlo', 20, gray, 1100, H - 500)
text('2  npm run dev', 'Menlo', 20, gray, 1100, H - 536)
text('3  press ⌘⇧T', 'Menlo', 20, gray, 1100, H - 572)

img.unlockFocus
const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation)
rep.representationUsingTypeProperties(4, $()).base64EncodedStringWithOptions(0).js
`

fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true })
const b64 = execFileSync('osascript', ['-l', 'JavaScript', '-e', DRAW], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024
}).trim()
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'))
console.log('[demo] ', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB')
