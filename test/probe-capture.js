'use strict'

/** 校验整条截图链路：抓屏 → 裁剪 → OCR → 翻译 */
const { app, screen, desktopCapturer } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const { recognizeText } = require('../electron/ocr')
const { translateText } = require('../electron/translate')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  const display = screen.getPrimaryDisplay()
  console.log('display:', JSON.stringify(display.size), 'scale', display.scaleFactor)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    }
  })
  console.log('sources:', sources.length, sources.map((s) => s.display_id).join(','))

  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0]
  const image = src.thumbnail
  const size = image.getSize()
  console.log('thumbnail:', size.width + 'x' + size.height)
  fs.writeFileSync(path.join(out, 'capture-full.png'), image.toPNG())

  // 取屏幕中部一块，模拟用户框选
  const cropRect = {
    x: Math.round(size.width * 0.25),
    y: Math.round(size.height * 0.3),
    width: Math.round(size.width * 0.4),
    height: Math.round(size.height * 0.25)
  }
  const cropped = image.crop(cropRect)
  fs.writeFileSync(path.join(out, 'capture-crop.png'), cropped.toPNG())

  const file = path.join(out, 'capture-crop.png')
  try {
    const ocr = await recognizeText(file)
    console.log('OCR_ENGINE:', ocr.engine)
    console.log('OCR_TEXT:', JSON.stringify((ocr.text || '').slice(0, 200)))
    if ((ocr.text || '').trim()) {
      const t = await translateText({
        text: ocr.text,
        from: 'auto',
        to: 'zh-CN',
        settings: { provider: 'free' }
      })
      console.log('TRANSLATED:', JSON.stringify(t.text.slice(0, 220)), '| via', t.provider)
    }
  } catch (err) {
    console.log('PIPELINE_ERR:', err.message)
  }

  app.exit(0)
})
