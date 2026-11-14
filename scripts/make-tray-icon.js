'use strict'

/**
 * 生成托盘 / 菜单栏图标
 * - macOS：template image（纯黑 + alpha，系统自动反色）→ build/trayTemplate[.@2x].png
 * - Windows：彩色小方块（深色任务栏也能看见）→ build/tray-win.png
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'build')
const MASTER = path.join(OUT, 'tray-master.png')
const WIN_MASTER = path.join(OUT, 'tray-win-master.png')

const osascript = (script) =>
  execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  }).trim()

/* --------------------------- macOS：Template --------------------------- */

const MAC = `
ObjC.import('AppKit')
const S = 144
const img = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S))
img.lockFocus

$.NSColor.clearColor.setFill
$.NSRectFill($.NSMakeRect(0, 0, S, S))

function draw(str, fontName, size, x, y) {
  const a = $.NSMutableDictionary.alloc.init
  a.setObjectForKey($.NSFont.fontWithNameSize(fontName, size), $.NSFontAttributeName)
  a.setObjectForKey($.NSColor.blackColor, $.NSForegroundColorAttributeName)
  $(str).drawAtPointWithAttributes($.NSMakePoint(x, y), a)
}

// 「文」+「A」：18pt 下也能认出来
draw('文', 'PingFang SC', 82, 12, 30)
draw('A', 'Helvetica-Bold', 76, 90, 33)

img.unlockFocus
const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation)
rep.representationUsingTypeProperties(4, $()).base64EncodedStringWithOptions(0).js
`

/* ---------------------------- Windows：彩色 ---------------------------- */

const WIN = `
ObjC.import('AppKit')
const S = 64
const img = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S))
img.lockFocus

const rect = $.NSMakeRect(2, 2, S - 4, S - 4)
const p = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect, 14, 14)
$.NSGradient.alloc.initWithStartingColorEndingColor(
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.27, 0.54, 1.0, 1),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.07, 0.21, 0.62, 1)
).drawInBezierPathAngle(p, -90)

function drawW(str, fontName, size, x, y) {
  const a = $.NSMutableDictionary.alloc.init
  a.setObjectForKey($.NSFont.fontWithNameSize(fontName, size), $.NSFontAttributeName)
  a.setObjectForKey($.NSColor.whiteColor, $.NSForegroundColorAttributeName)
  $(str).drawAtPointWithAttributes($.NSMakePoint(x, y), a)
}
drawW('文', 'PingFang SC', 34, 4, 12)
drawW('A', 'Helvetica-Bold', 30, 36, 15)

img.unlockFocus
const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation)
rep.representationUsingTypeProperties(4, $()).base64EncodedStringWithOptions(0).js
`

fs.mkdirSync(OUT, { recursive: true })

fs.writeFileSync(MASTER, Buffer.from(osascript(MAC), 'base64'))
for (const [px, name] of [
  [18, 'trayTemplate.png'],
  [36, 'trayTemplate@2x.png']
]) {
  const out = path.join(OUT, name)
  execFileSync('sips', ['-z', String(px), String(px), MASTER, '--out', out], { stdio: 'ignore' })
  console.log('[tray]', name, Math.round(fs.statSync(out).size / 1024) + 'KB')
}

fs.writeFileSync(WIN_MASTER, Buffer.from(osascript(WIN), 'base64'))
const winOut = path.join(OUT, 'tray-win.png')
execFileSync('sips', ['-z', '32', '32', WIN_MASTER, '--out', winOut], { stdio: 'ignore' })
console.log('[tray] tray-win.png', Math.round(fs.statSync(winOut).size / 1024) + 'KB')

fs.unlinkSync(MASTER)
fs.unlinkSync(WIN_MASTER)
