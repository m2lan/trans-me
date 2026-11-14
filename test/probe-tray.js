'use strict'

/** 校验菜单栏小面板：空状态 → 输入后自动翻译 → 结果态截图 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 400,
    height: 420,
    show: false,
    frame: false,
    backgroundColor: '#eceef2',
    webPreferences: {
      preload: path.join(__dirname, 'stub-tray.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const logs = []
  win.webContents.on('console-message', (_e, level, message) => logs.push(`${level}|${message}`))

  await win.loadFile(path.join(root, 'dist', 'tray.html'))
  await sleep(900)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'ui-tray.png'), (await win.capturePage()).toPNG())

  // 输入一句英文，等自动翻译
  await win.webContents.executeJavaScript(`
    (() => {
      const ta = document.getElementById('src')
      ta.value = 'Good morning, how are you today?'
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return ta.value
    })()
  `)
  await sleep(1400)
  fs.writeFileSync(path.join(out, 'ui-tray-result.png'), (await win.capturePage()).toPNG())

  const stats = await win.webContents.executeJavaScript(`
    JSON.stringify({
      lastHeight: window.__lastHeight || 0,
      bodyH: Math.ceil(document.body.scrollHeight),
      hasResult: !!document.querySelector('.out-text'),
      resultText: (document.querySelector('.out-text') || {}).textContent || '',
      provider: (document.querySelector('.meta') || {}).textContent || ''
    })
  `)

  console.log('CONSOLE:' + JSON.stringify(logs.slice(0, 20)))
  console.log('STATS:' + stats)
  app.exit(0)
})
