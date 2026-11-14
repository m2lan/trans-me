'use strict'

/**
 * 生成 macOS 应用图标 TransMe.icns
 * 用 AppKit 直接画 1024 底图（渐变圆角方块 + 「译」字），再 sips 缩各档、iconutil 打包。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const WORK = path.join(ROOT, '.tmp', 'icon')
const ICONSET = path.join(WORK, 'TransMe.iconset')
const MASTER = path.join(WORK, 'master-1024.png')
const OUT = path.join(ROOT, 'build', 'icon.icns')

const DRAW = `
ObjC.import('AppKit')
const S = 1024
const img = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S))
img.lockFocus

$.NSColor.clearColor.setFill
$.NSRectFill($.NSMakeRect(0, 0, S, S))

const inset = 40
const rect = $.NSMakeRect(inset, inset, S - inset * 2, S - inset * 2)
const p = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(rect, 210, 210)
const grad = $.NSGradient.alloc.initWithStartingColorEndingColor(
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.23, 0.47, 0.96, 1),
  $.NSColor.colorWithCalibratedRedGreenBlueAlpha(0.07, 0.21, 0.62, 1)
)
grad.drawInBezierPathAngle(p, -90)

const attrs = $.NSMutableDictionary.alloc.init
attrs.setObjectForKey($.NSFont.fontWithNameSize('PingFang SC', 540), $.NSFontAttributeName)
attrs.setObjectForKey($.NSColor.whiteColor, $.NSForegroundColorAttributeName)
const str = $('译')
const sz = str.sizeWithAttributes(attrs)
str.drawAtPointWithAttributes($.NSMakePoint((S - sz.width) / 2, (S - sz.height) / 2 - 10), attrs)

img.unlockFocus
const rep = $.NSBitmapImageRep.imageRepWithData(img.TIFFRepresentation)
const png = rep.representationUsingTypeProperties(4, $())
png.base64EncodedStringWithOptions(0).js
`

function main() {
  fs.mkdirSync(ICONSET, { recursive: true })
  fs.mkdirSync(path.dirname(OUT), { recursive: true })

  const b64 = execFileSync('osascript', ['-l', 'JavaScript', '-e', DRAW], { encoding: 'utf8' }).trim()
  fs.writeFileSync(MASTER, Buffer.from(b64, 'base64'))
  console.log('[icon] 底图', Math.round(fs.statSync(MASTER).size / 1024) + 'KB')

  const sizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ]
  for (const [px, name] of sizes) {
    execFileSync('sips', ['-z', String(px), String(px), MASTER, '--out', path.join(ICONSET, name)], {
      stdio: 'ignore'
    })
  }
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', OUT])
  console.log('[icon] 输出', OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB')
}

main()
