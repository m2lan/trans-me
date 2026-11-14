'use strict'

/** 校验截图浮窗与框选遮罩的渲染（截图为真实示例页面） */
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')

function demoThumb() {
  const src = path.join(out, 'demo-page.png')
  const crop = path.join(out, 'popup-thumb.png')
  if (!fs.existsSync(src)) return ''
  // 裁出「标题 + 正文」那块，模拟用户框选的区域
  execFileSync('sips', ['-c', '933', '1500', '--cropOffset', '120', '60', src, '--out', crop], {
    stdio: 'ignore'
  })
  return `data:image/png;base64,${fs.readFileSync(crop).toString('base64')}`
}

function writeStub(file, code) {
  const p = path.join(__dirname, file)
  fs.writeFileSync(p, code)
  return p
}

const popupStub = writeStub(
  'stub-popup.js',
  `const { contextBridge, ipcRenderer } = require('electron')
let thumb = ''
for (const arg of process.argv) {
  if (arg.startsWith('--thumb=')) thumb = arg.slice('--thumb='.length)
}
contextBridge.exposeInMainWorld('api', {
  onPopupInit: (cb) => setTimeout(() => cb({ image: thumb, to: 'zh-CN', from: 'auto' }), 40),
  onPopupResult: (cb) => setTimeout(() => cb({
    original: 'TransMe is a lightweight translator for macOS and Windows. Press the shortcut to capture any region of the screen.',
    translated: 'TransMe 是一款适用于 macOS 和 Windows 的轻量级翻译器。按下快捷键即可捕捉屏幕上的任意区域。',
    provider: 'Bing', engine: 'macOS Vision', elapsed: 1284
  }), 700),
  onPopupProgress: () => () => {},
  resizePopup: (h) => ipcRenderer.send('noop', h),
  copy: async () => true,
  speak: async () => true,
  closePopup: () => {}
})`
)

const overlayStub = writeStub(
  'stub-overlay.js',
  `const { contextBridge, ipcRenderer } = require('electron')
let shot = ''
for (const arg of process.argv) {
  if (arg.startsWith('--shot=')) shot = arg.slice('--shot='.length)
}
contextBridge.exposeInMainWorld('api', {
  onOverlayInit: (cb) => setTimeout(() => cb({ image: shot, width: 900, height: 560 }), 40),
  overlayImage: () => {},
  overlayReady: () => {},
  selectRegion: (r) => ipcRenderer.send('noop', r),
  cancelOverlay: () => {}
})`
)

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })
  const thumb = demoThumb()
  const screenShot = thumb

  // 1) 结果浮窗
  const popup = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: {
      preload: popupStub,
      contextIsolation: true,
      additionalArguments: [`--thumb=${thumb}`]
    }
  })
  await popup.loadFile(path.join(root, 'dist', 'popup.html'))
  await new Promise((r) => setTimeout(r, 1400))
  // 按内容高度收一下窗口，避免截图里留下大片空白
  const h = await popup.webContents.executeJavaScript(
    `Math.ceil(document.getElementById('wrap').getBoundingClientRect().height) + 30`
  )
  popup.setContentSize(480, Math.max(140, h))
  await new Promise((r) => setTimeout(r, 260))
  fs.writeFileSync(path.join(out, 'ui-popup.png'), (await popup.capturePage()).toPNG())

  // 2) 截图遮罩
  const overlay = new BrowserWindow({
    width: 900,
    height: 560,
    frame: false,
    show: false,
    backgroundColor: '#1b2434',
    webPreferences: {
      preload: overlayStub,
      contextIsolation: true,
      additionalArguments: [`--shot=${screenShot}`]
    }
  })
  await overlay.loadFile(path.join(root, 'dist', 'overlay.html'))
  await new Promise((r) => setTimeout(r, 500))

  overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 90, y: 120 })
  overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 90, y: 120, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 8; i++) {
    overlay.webContents.sendInputEvent({
      type: 'mouseMove',
      x: 90 + i * 84,
      y: 120 + i * 40,
      button: 'left',
      buttons: 1
    })
  }
  await new Promise((r) => setTimeout(r, 300))
  fs.writeFileSync(path.join(out, 'ui-overlay.png'), (await overlay.capturePage()).toPNG())

  console.log('popup/overlay 截图完成')
  app.exit(0)
})
