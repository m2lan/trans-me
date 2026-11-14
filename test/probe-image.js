'use strict'

/** 校验「图片翻译」面板：空状态 → 模拟截图带图进来 → 结果态截图 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')

app.disableHardwareAcceleration()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const demoFile = path.join(out, 'test-ocr.png')
  const demoImage = fs.existsSync(demoFile) ? `data:image/png;base64,${fs.readFileSync(demoFile).toString('base64')}` : ''

  const win = new BrowserWindow({
    width: 940,
    height: 640,
    show: false,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'stub.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--demo-image=${demoImage}`]
    }
  })

  const logs = []
  win.webContents.on('console-message', (_e, level, message) => logs.push(`${level}|${message}`))

  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await sleep(1800)
  fs.mkdirSync(out, { recursive: true })

  // 切到图片 tab，截空状态
  const switched = await win.webContents.executeJavaScript(`
    (() => {
      const b = [...document.querySelectorAll('.tab')].find(x => x.textContent.trim() === '图片')
      b && b.click()
      return !!b
    })()
  `)
  await sleep(700)
  fs.writeFileSync(path.join(out, 'ui-image-empty.png'), (await win.capturePage()).toPNG())

  // 模拟截图浮窗把图推过来
  const hasImage = await win.webContents.executeJavaScript(`
    (() => {
      const has = !!(window.api && window.api.__emitOpenImage)
      if (has) window.api.__emitOpenImage({ dataUrl: window.__demoImage || '', from: 'auto', to: 'zh-CN' })
      return has
    })()
  `)

  // 用 pickImage 路径也行：直接点「浏览文件」
  if (!hasImage) {
    await win.webContents.executeJavaScript(`document.querySelector('.dz')?.click()`)
  }
  await sleep(1600)
  fs.writeFileSync(path.join(out, 'ui-image-result.png'), (await win.capturePage()).toPNG())

  const stats = await win.webContents.executeJavaScript(`
    (() => {
      const boxes = document.querySelectorAll('.ov-box')
      const segs = document.querySelectorAll('.seg')
      return JSON.stringify({
        overlayBoxes: boxes.length,
        segRows: segs.length,
        holder: (() => { const h = document.querySelector('.img-holder'); return h ? h.getBoundingClientRect().width + 'x' + Math.round(h.getBoundingClientRect().height) : 'none' })(),
        stage: (() => { const s = document.querySelector('.stage'); return s ? Math.round(s.clientWidth) + 'x' + Math.round(s.clientHeight) : 'none' })()
      })
    })()
  `)

  console.log('CONSOLE:' + JSON.stringify(logs.slice(0, 30)))
  console.log('STATS:' + stats)
  console.log('SWITCH:' + switched)
  app.exit(0)
})
