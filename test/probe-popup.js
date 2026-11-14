'use strict'

/** 校验截图浮窗与框选遮罩的渲染 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makePreload(file, code) {
  fs.writeFileSync(path.join(__dirname, file), code)
  return path.join(__dirname, file)
}

const popupPreload = makePreload(
  'stub-popup.js',
  `const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  onPopupInit: (cb) => setTimeout(() => cb({ image: '${PIXEL}', to: 'zh-CN', from: 'auto' }), 30),
  onPopupResult: (cb) => setTimeout(() => cb({
    original: 'Getting started — press ⌘⇧T to capture any region.',
    translated: '上手指南 —— 按下 ⌘⇧T 即可框选任意区域。',
    provider: 'Bing', engine: 'macOS Vision', elapsed: 1234
  }), 600),
  onPopupProgress: () => () => {},
  resizePopup: (h) => ipcRenderer.send('noop', h),
  copy: async () => true,
  speak: async () => true,
  closePopup: () => {}
})`
)

const overlayPreload = makePreload(
  'stub-overlay.js',
  `const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  onOverlayInit: (cb) => setTimeout(() => cb({ image: '${PIXEL}', width: 900, height: 560 }), 30),
  overlayImage: () => {},
  overlayReady: () => {},
  selectRegion: (r) => ipcRenderer.send('noop', r),
  cancelOverlay: () => {}
})`
)

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true })

  // 1) 结果浮窗
  const popup = new BrowserWindow({
    width: 480,
    height: 260,
    frame: false,
    transparent: true,
    show: false,
    webPreferences: { preload: popupPreload, contextIsolation: true }
  })
  await popup.loadFile(path.join(root, 'dist', 'popup.html'))
  await new Promise((r) => setTimeout(r, 300))
  fs.writeFileSync(path.join(out, 'ui-popup-loading.png'), (await popup.capturePage()).toPNG())
  await new Promise((r) => setTimeout(r, 900))
  fs.writeFileSync(path.join(out, 'ui-popup.png'), (await popup.capturePage()).toPNG())

  // 2) 截图遮罩
  const overlay = new BrowserWindow({
    width: 900,
    height: 560,
    frame: false,
    show: false,
    backgroundColor: '#1b2434',
    webPreferences: { preload: overlayPreload, contextIsolation: true }
  })
  await overlay.loadFile(path.join(root, 'dist', 'overlay.html'))
  await new Promise((r) => setTimeout(r, 400))

  overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 150 })
  overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 200, y: 150, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 8; i++) {
    overlay.webContents.sendInputEvent({
      type: 'mouseMove',
      x: 200 + i * 55,
      y: 150 + i * 28,
      button: 'left',
      buttons: 1
    })
  }
  await new Promise((r) => setTimeout(r, 260))
  fs.writeFileSync(path.join(out, 'ui-overlay.png'), (await overlay.capturePage()).toPNG())

  app.exit(0)
})
