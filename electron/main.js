'use strict'

const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  desktopCapturer,
  clipboard,
  shell,
  systemPreferences,
  dialog,
  Tray,
  Menu,
  nativeImage
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const store = require('./store')
const { translateText, translateImageWithVision } = require('./translate')
const { recognizeText, localOcrAvailable, ocrCapability, recognizeCloud, cloudOcrAvailable } = require('./ocr')
const { translateImage } = require('./image')
const tts = require('./tts')

const isDev = process.env.NODE_ENV === 'development'
const PRELOAD = path.join(__dirname, 'preload.js')

const HOTKEYS = {
  screenshot: 'CommandOrControl+Shift+T',
  clipboard: 'CommandOrControl+Shift+D',
  toggleMain: 'CommandOrControl+Shift+Space'
}

let mainWindow = null
let overlayWindow = null
let popupWindow = null
let tray = null
let trayWindow = null
let capture = null // 当前截图上下文
let pending = { from: 'auto', to: 'zh-CN' } // 本次截图翻译的语言方向
let popupReadyAt = 0
let registered = {}

app.setName('TransMe')

/* ------------------------------- 窗口工具 ------------------------------- */

function loadView(win, page) {
  return win.loadFile(path.join(__dirname, '..', 'dist', page))
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

function createMainWindow() {
  const mac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 940,
    height: 640,
    minWidth: 760,
    minHeight: 520,
    show: false,
    frame: mac,
    titleBarStyle: mac ? 'hiddenInset' : 'default',
    trafficLightPosition: mac ? { x: 18, y: 19 } : undefined,
    backgroundColor: '#f6f7f9',
    title: 'TransMe',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  loadView(mainWindow, 'index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (process.env.TRANSME_DEVTOOLS === '1') mainWindow.webContents.openDevTools({ mode: 'detach' })
  })

  mainWindow.on('close', (e) => {
    // 关窗只是收起来，应用继续驻留在菜单栏 / 托盘
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showMainWindow() {
  if (!mainWindow) createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleMainWindow() {
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
  } else {
    showMainWindow()
  }
}

/* --------------------------- 菜单栏图标 / 小面板 -------------------------- */

const assetPath = (...segs) => path.join(__dirname, '..', 'build', ...segs)

function createTray() {
  if (tray) return
  const mac = process.platform === 'darwin'
  let icon = nativeImage.createFromPath(assetPath(mac ? 'trayTemplate.png' : 'tray-win.png'))
  if (icon.isEmpty()) {
    console.warn('[tray] 图标缺失，使用空白图标')
    icon = nativeImage.createEmpty()
  } else if (mac) {
    icon.setTemplateImage(true) // 让系统按亮/暗色菜单栏自动反色
  }

  tray = new Tray(icon)
  tray.setToolTip('TransMe · 点一下输入翻译')
  tray.on('click', () => {
    if (trayWindow && trayWindow.isVisible()) hideTrayWindow()
    else showTrayWindow()
  })
  tray.on('right-click', () => {
    if (tray) tray.popUpContextMenu(buildTrayMenu())
  })
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '输入翻译…', click: () => showTrayWindow() },
    { label: '打开主界面', click: () => showMainWindow() },
    { label: '截图翻译', click: () => startScreenshot() },
    { type: 'separator' },
    { label: '打开设置', click: () => openMainSettings() },
    { type: 'separator' },
    { label: `TransMe ${app.getVersion()}`, enabled: false },
    {
      label: '退出 TransMe',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
}

function createTrayWindow() {
  const mac = process.platform === 'darwin'
  trayWindow = new BrowserWindow({
    width: 400,
    height: 260,
    show: false,
    frame: false,
    transparent: mac,
    backgroundColor: mac ? '#00000000' : '#ffffff',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  trayWindow.setAlwaysOnTop(true, 'pop-up-menu')
  if (mac) trayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  loadView(trayWindow, 'tray.html')

  trayWindow.on('blur', () => {
    if (!trayWindow || trayWindow.isDestroyed()) return
    if (trayWindow.webContents.isDevToolsOpened()) return
    trayWindow.hide()
  })

  trayWindow.on('closed', () => {
    trayWindow = null
  })
}

/** 贴着菜单栏图标居中放下，并夹在当前显示器可视区域内（多屏也适用） */
function positionTrayWindow() {
  if (!tray || !trayWindow) return
  const b = tray.getBounds()
  const { width } = trayWindow.getBounds()
  const { height } = trayWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: Math.round(b.x), y: Math.round(b.y) })
  const area = display.workArea

  let x = Math.round(b.x + b.width / 2 - width / 2)
  let y = Math.round(b.y + b.height + 4)

  x = Math.min(Math.max(x, area.x + 6), area.x + area.width - width - 6)
  if (y + height > area.y + area.height - 6) y = area.y + area.height - height - 6
  if (y < area.y + 4) y = area.y + 4

  trayWindow.setBounds({ x, y, width, height })
}

function showTrayWindow() {
  if (!trayWindow || trayWindow.isDestroyed()) createTrayWindow()
  positionTrayWindow()
  trayWindow.show()
  trayWindow.focus()
  send(trayWindow, 'tray:shown')
}

function hideTrayWindow() {
  if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide()
}

function openMainSettings() {
  showMainWindow()
  const push = (attempt = 0) => {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
      send(mainWindow, 'app:open-settings')
    } else if (attempt < 20) {
      setTimeout(() => push(attempt + 1), 120)
    }
  }
  push()
}

/* ------------------------------ 截图遮罩层 ------------------------------ */

function closeOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
}

function closePopup() {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.destroy()
  popupWindow = null
}

async function startScreenshot() {
  if (overlayWindow) return
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen')
    if (status === 'denied' || status === 'restricted') {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['打开系统设置', '取消'],
        defaultId: 0,
        cancelId: 1,
        message: '需要「屏幕录制」权限',
        detail: '截图翻译需要读取屏幕内容。请在「系统设置 → 隐私与安全性 → 屏幕录制」中勾选 TransMe，然后重启应用。'
      })
      if (response === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
      }
      return
    }
  }

  closePopup()
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide()
  // 等一帧，确保主窗口从画面中消失
  await new Promise((r) => setTimeout(r, 200))

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)

  let sources = []
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
      }
    })
  } catch (err) {
    console.error('[capture] 失败', err)
  }

  const source =
    sources.find((s) => String(s.display_id) === String(display.id)) || sources[0] || null
  if (!source || source.thumbnail.isEmpty()) {
    dialog.showMessageBox({
      type: 'error',
      message: '截屏失败',
      detail: '未能获取屏幕画面，请检查「屏幕录制」权限后重试。'
    })
    return
  }

  const image = source.thumbnail
  const size = image.getSize()
  capture = {
    image,
    displaySize: display.size,
    scaleFactor: size.width / display.size.width,
    bounds: display.bounds
  }

  overlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.size.width,
    height: display.size.height,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  await loadView(overlayWindow, 'overlay.html')
  overlayWindow.focus()
}

/* ------------------------------- 结果浮窗 ------------------------------- */

function popupPosition(bounds, rect, width, height) {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + rect.x,
    y: bounds.y + rect.y
  })
  const area = display.workArea
  let x = Math.round(bounds.x + rect.x)
  if (x + width > area.x + area.width) x = area.x + area.width - width - 8
  if (x < area.x + 8) x = area.x + 8

  let y = Math.round(bounds.y + rect.y + rect.height + 10)
  if (y + height > area.y + area.height) {
    y = Math.round(bounds.y + rect.y - height - 10)
  }
  if (y < area.y + 8) y = area.y + 8
  return { x, y }
}

function openPopup(bounds, rect, initial) {
  const width = 480
  const height = 240
  const { x, y } = popupPosition(bounds, rect, width, height)

  popupWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  popupWindow.setAlwaysOnTop(true, 'floating')
  popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  popupWindow.on('closed', () => {
    popupWindow = null
  })
  popupWindow.on('blur', () => {
    // 刚弹出时的瞬时失焦不处理
    if (Date.now() - popupReadyAt < 400) return
    closePopup()
  })

  loadView(popupWindow, 'popup.html').then(() => {
    if (!popupWindow || popupWindow.isDestroyed()) return
    popupWindow.show()
    popupWindow.focus()
    popupReadyAt = Date.now()
    send(popupWindow, 'popup:init', initial)
  })
}

/* ----------------------------- 截图翻译流水线 ---------------------------- */

const TMP = () => path.join(os.tmpdir(), 'transme')

function saveTempPng(image) {
  fs.mkdirSync(TMP(), { recursive: true })
  const file = path.join(TMP(), `shot-${Date.now()}.png`)
  fs.writeFileSync(file, image.toPNG())
  return file
}

async function processSelection(rect) {
  if (!capture) return
  const ctx = capture
  const { image, scaleFactor } = ctx
  const cropRect = {
    x: Math.max(0, Math.round(rect.x * scaleFactor)),
    y: Math.max(0, Math.round(rect.y * scaleFactor)),
    width: Math.max(1, Math.round(rect.width * scaleFactor)),
    height: Math.max(1, Math.round(rect.height * scaleFactor))
  }
  let cropped
  try {
    cropped = image.crop(cropRect)
  } catch (err) {
    console.error('[capture] 裁剪失败', err)
    closeOverlay()
    capture = null
    return
  }
  closeOverlay()
  capture = null // 释放全屏截图，避免长期占用内存

  // 小字区域放大，提升 OCR 命中率
  const size = cropped.getSize()
  if (size.width < 900) {
    try {
      cropped = cropped.resize({ width: Math.round(size.width * 1.8), quality: 'best' })
    } catch {
      /* ignore */
    }
  }

  const state = store.getState()
  const settings = state.settings
  const from = settings.source || 'auto'
  const to = settings.target || 'zh-CN'
  pending = { from, to }

  openPopup(ctx.bounds, rect, { status: 'loading', image: cropped.toDataURL(), from, to })

  const visionPossible =
    settings.ocr.useVision !== false &&
    settings.llm.visionEnabled !== false &&
    (settings.llm.apiKey || /localhost|127\.0\.0\.1/.test(settings.llm.baseUrl || '')) &&
    (settings.provider !== 'free')

  // 云端 OCR 优先：识别准、五语种通吃、每千页 1.5 元，比图片直译更便宜也更干净
  const cloudOcrPossible = settings.ocr.remote !== false && settings.provider !== 'free' && cloudOcrAvailable(settings.llm)

  const started = Date.now()

  try {
    if (cloudOcrPossible) {
      let shot = ''
      try {
        send(popupWindow, 'popup:progress', { message: '云端 OCR 识别中…' })
        shot = saveTempPng(cropped)
        const r = await recognizeCloud(shot, { baseUrl: settings.llm.baseUrl, apiKey: settings.llm.apiKey })
        if (!r.text.trim()) throw new Error('未识别到文字')

        send(popupWindow, 'popup:progress', { message: '正在翻译…' })
        const result = await translateText({ text: r.text, from, to, settings })
        finishPopup({
          original: r.text,
          translated: result.text,
          provider: result.provider,
          engine: r.engine,
          elapsed: Date.now() - started
        })
        return
      } catch (err) {
        console.warn('[ocr] 云端 OCR 失败，回退备用通道：', err.message)
        send(popupWindow, 'popup:progress', { message: '云端 OCR 不可用，改用备用通道…' })
      } finally {
        if (shot) fs.unlink(shot, () => {})
      }
    }

    if (visionPossible) {
      try {
        const r = await translateImageWithVision(cropped.toDataURL(), from, to, settings.llm)
        finishPopup({
          original: r.original,
          translated: r.text,
          provider: '视觉模型',
          engine: 'Vision LLM',
          elapsed: Date.now() - started
        })
        return
      } catch (err) {
        console.warn('[ocr] 视觉模型失败，回退本地 OCR：', err.message)
        send(popupWindow, 'popup:progress', { message: '视觉模型不可用，已切换到本地 OCR…' })
      }
    }

    const file = saveTempPng(cropped)
    let text = ''
    let engine = ''
    if (localOcrAvailable()) {
      const r = await recognizeText(file)
      text = r.text
      engine = r.engine
    }
    fs.unlink(file, () => {})

    if (!text.trim()) {
      throw new Error('没有识别到文字，试着重新框选，或在设置里开启云端 OCR / 视觉模型')
    }

    send(popupWindow, 'popup:progress', { message: '正在翻译…' })
    const result = await translateText({ text, from, to, settings })
    finishPopup({
      original: text,
      translated: result.text,
      provider: result.provider,
      engine,
      elapsed: Date.now() - started
    })
  } catch (err) {
    finishPopup({ error: err.message || String(err) })
  }
}

function finishPopup(payload) {
  if (!popupWindow) return
  send(popupWindow, 'popup:result', payload)
  if (payload.translated && !payload.error) {
    const settings = store.getState().settings
    store.addHistory({
      source: 'screenshot',
      from: pending.from,
      to: pending.to,
      original: payload.original,
      translated: payload.translated,
      provider: payload.provider
    })
    if (settings.autoCopy) clipboard.writeText(payload.translated)
    send(mainWindow, 'app:history-updated')
  }
}

/* -------------------------------- IPC --------------------------------- */

function registerIpc() {
  ipcMain.handle('app:init', () => {
    const state = store.getState()
    return {
      ...state,
      platform: process.platform,
      isDev,
      localOcr: localOcrAvailable(),
      ocrCapability: ocrCapability(),
      hotkeys: HOTKEYS,
      registered,
      appVersion: app.getVersion(),
      electron: process.versions.electron
    }
  })

  ipcMain.handle('translate:text', async (_e, { text, from, to, mode }) => {
    const state = store.getState()
    const result = await translateText({
      text,
      from: from || state.settings.source,
      to: to || state.settings.target,
      settings: state.settings,
      mode
    })
    if (result.text) {
      const entry = store.addHistory({
        source: 'text',
        from: from || state.settings.source,
        to: to || state.settings.target,
        original: text,
        translated: result.text,
        provider: result.provider
      })
      result.id = entry.id
    }
    return result
  })

  ipcMain.handle('app:test-engine', async (_e, { mode } = {}) => {
    const state = store.getState()
    return translateText({
      text: 'The quick brown fox jumps over the lazy dog.',
      from: 'en',
      to: 'zh-CN',
      settings: state.settings,
      mode
    })
  })

  /* ---------------------------- 图片翻译 ---------------------------- */

  ipcMain.handle('image:pick', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择要翻译的图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    })
    if (r.canceled || !r.filePaths || !r.filePaths.length) return null
    const file = r.filePaths[0]
    const mime =
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp'
      }[path.extname(file).toLowerCase()] || 'image/png'
    if (fs.statSync(file).size > 24 * 1024 * 1024) throw new Error('图片太大（超过 24MB），换一张试试')
    return {
      dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`,
      name: path.basename(file)
    }
  })

  ipcMain.handle('image:paste', () => {
    const img = clipboard.readImage()
    if (!img || img.isEmpty()) return null
    return { dataUrl: img.toDataURL(), name: '剪贴板图片' }
  })

  ipcMain.handle('image:translate', async (event, { dataUrl, from, to } = {}) => {
    const state = store.getState()
    const settings = state.settings
    if (!dataUrl) throw new Error('没有图片')
    const result = await translateImage({
      dataUrl,
      from: from || settings.source,
      to: to || settings.target,
      settings,
      onProgress: (message) => {
        if (!event.sender.isDestroyed()) event.sender.send('image:progress', { message })
      }
    })
    if (result.translated) {
      store.addHistory({
        source: 'image',
        from: from || settings.source,
        to: to || settings.target,
        original: result.text,
        translated: result.translated,
        provider: result.provider
      })
      if (settings.autoCopy) clipboard.writeText(result.translated)
      send(mainWindow, 'app:history-updated')
    }
    return result
  })

  // 截图浮窗里点「在图片翻译中打开」：把图带回主窗口继续操作
  ipcMain.on('image:open-in-main', (_e, payload = {}) => {
    showMainWindow()
    const push = (attempt = 0) => {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
        send(mainWindow, 'app:open-image', payload)
      } else if (attempt < 20) {
        setTimeout(() => push(attempt + 1), 120)
      }
    }
    push()
  })

  ipcMain.handle('store:set-settings', (_e, patch) => {
    const settings = store.setSettings(patch)
    if ('launchAtLogin' in (patch || {})) {
      app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin })
    }
    return settings
  })

  ipcMain.handle('store:get', () => store.getState())
  ipcMain.handle('store:toggle-favorite', (_e, id) => store.toggleFavorite(id))
  ipcMain.handle('store:clear-history', () => {
    const r = store.clearHistory()
    send(mainWindow, 'app:history-updated')
    return r
  })
  ipcMain.handle('store:remove-history', (_e, id) => store.removeHistory(id))

  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(String(text || ''))
    return true
  })

  ipcMain.handle('tts:speak', (_e, payload) => tts.speak(payload))
  ipcMain.handle('tts:stop', () => {
    tts.stop()
    return true
  })

  ipcMain.on('screen:start', () => startScreenshot())
  ipcMain.on('overlay:request-image', () => {
    if (!capture) return
    send(overlayWindow, 'overlay:init', {
      image: capture.image.toDataURL(),
      width: capture.displaySize.width,
      height: capture.displaySize.height
    })
  })
  ipcMain.on('overlay:ready', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    overlayWindow.show()
    overlayWindow.focus()
  })
  ipcMain.on('overlay:select', async (_e, rect) => {
    if (!rect || rect.width < 4 || rect.height < 4) {
      closeOverlay()
      return
    }
    await processSelection(rect)
  })
  ipcMain.on('overlay:cancel', () => {
    closeOverlay()
    capture = null
    if (mainWindow) showMainWindow()
  })

  ipcMain.on('popup:resize', (_e, height) => {
    if (!popupWindow || popupWindow.isDestroyed()) return
    const b = popupWindow.getBounds()
    const h = Math.max(120, Math.min(Math.round(height), 620))
    const display = screen.getDisplayMatching(b)
    let y = b.y
    if (y + h > display.workArea.y + display.workArea.height) {
      y = display.workArea.y + display.workArea.height - h - 8
    }
    popupWindow.setBounds({ x: b.x, y, width: b.width, height: h })
  })
  ipcMain.on('popup:close', () => closePopup())

  /* ------------------------ 菜单栏小面板 IPC ------------------------ */

  ipcMain.on('tray:hide', () => hideTrayWindow())
  if (isDev) ipcMain.on('tray:debug-show', () => showTrayWindow())
  ipcMain.on('tray:open-main', () => showMainWindow())
  ipcMain.on('tray:resize', (_e, h) => {
    if (!trayWindow || trayWindow.isDestroyed()) return
    const b = trayWindow.getBounds()
    const display = screen.getDisplayMatching(b)
    const room = Math.max(160, display.workArea.y + display.workArea.height - b.y - 8)
    const height = Math.max(120, Math.min(Math.round(h), Math.min(620, room)))
    trayWindow.setBounds({ x: b.x, y: b.y, width: b.width, height })
  })

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.hide())
  ipcMain.on('window:hide', () => mainWindow?.hide())

  ipcMain.handle('app:open-external', (_e, url) => shell.openExternal(url))
  ipcMain.handle('app:open-screen-permission', () => {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    }
  })
  ipcMain.handle('app:open-userdata', () => shell.openPath(app.getPath('userData')))
}

/* ------------------------------ 快捷键 ------------------------------- */

function registerHotkeys() {
  registered = {}
  const map = {
    screenshot: startScreenshot,
    clipboard: () => translateClipboard(),
    toggleMain: toggleMainWindow
  }
  for (const [key, handler] of Object.entries(map)) {
    const acc = HOTKEYS[key]
    try {
      registered[key] = globalShortcut.register(acc, handler)
    } catch {
      registered[key] = false
    }
  }
}

function translateClipboard() {
  const text = clipboard.readText().trim()
  if (!text) return
  showMainWindow()
  const trySend = (attempt = 0) => {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
      send(mainWindow, 'app:prefill', { text, auto: true })
    } else if (attempt < 20) {
      setTimeout(() => trySend(attempt + 1), 120)
    }
  }
  trySend()
}

/* -------------------------------- 启动 -------------------------------- */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.transme.app')
    registerIpc()
    createMainWindow()
    createTray()
    createTrayWindow()
    registerHotkeys()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else showMainWindow()
    })
  })

  // 有菜单栏图标驻留，关掉所有窗口也继续活着（退出走托盘菜单）
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => {
    app.isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    tts.stop()
    if (tray) {
      tray.destroy()
      tray = null
    }
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.destroy()
  })
}
