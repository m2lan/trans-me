'use strict'

const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')
const out = path.join(root, '.tmp')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 940,
    height: 640,
    show: false,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'stub.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const logs = []
  win.webContents.on('console-message', (_e, level, message) => logs.push(`${level}|${message}`))
  win.webContents.on('did-fail-load', (_e, code, desc) => logs.push(`fail|${code} ${desc}`))

  await win.loadFile(path.join(root, 'dist', 'index.html'))
  await new Promise((r) => setTimeout(r, 2200))

  fs.mkdirSync(out, { recursive: true })
  const png = (await win.capturePage()).toPNG()
  fs.writeFileSync(path.join(out, 'ui-main.png'), png)

  // 翻译页填入文本，检查输出面板
  await win.webContents.executeJavaScript(`
    (async () => {
      const ta = document.querySelector('textarea')
      if (ta) {
        ta.value = 'Screenshot translation is way better than opening a web page every time.'
        ta.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return document.querySelectorAll('.pane').length
    })()
  `)
  await new Promise((r) => setTimeout(r, 1200))
  fs.writeFileSync(path.join(out, 'ui-filled.png'), (await win.capturePage()).toPNG())

  // 切到历史页
  await win.webContents.executeJavaScript(`
    (() => {
      const btns = [...document.querySelectorAll('.tab')]
      const h = btns.find(b => b.textContent.includes('历史'))
      h && h.click()
      return !!h
    })()
  `)
  await new Promise((r) => setTimeout(r, 600))
  fs.writeFileSync(path.join(out, 'ui-history.png'), (await win.capturePage()).toPNG())

  // 打开设置
  await win.webContents.executeJavaScript(`
    (() => {
      const b = document.querySelector('.titlebar .icon-btn:last-of-type')
      b && b.click()
      return !!document.querySelector('.modal')
    })()
  `)
  await new Promise((r) => setTimeout(r, 600))
  fs.writeFileSync(path.join(out, 'ui-settings.png'), (await win.capturePage()).toPNG())

  // 滚动到"截图识别"分组，检查三通道开关
  await win.webContents.executeJavaScript(`
    (() => {
      const t = [...document.querySelectorAll('.section-title')].find(x => x.textContent.includes('截图识别'))
      if (t) t.scrollIntoView({ block: 'start' })
      return !!t
    })()
  `)
  await new Promise((r) => setTimeout(r, 500))
  fs.writeFileSync(path.join(out, 'ui-settings-ocr.png'), (await win.capturePage()).toPNG())

  console.log('CONSOLE:' + JSON.stringify(logs.slice(0, 40)))
  app.exit(0)
})
