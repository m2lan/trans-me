'use strict'

/**
 * 校验打包后的应用：确认加载的是 .app 内的 dist、界面渲染正常、
 * 默认配置（deepseek-flash / 云端 OCR）已生效，并导出一张实机截图。
 */
const fs = require('node:fs')
const path = require('node:path')

const PORT = Number(process.env.CDP_PORT || 9345)
const OUT = path.join(__dirname, '..', '.tmp')

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const msgId = ++id
        pending.set(msgId, { res, rej })
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    ws.addEventListener('open', () => resolve({ send, close: () => ws.close() }))
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data)
      if (data.id && pending.has(data.id)) {
        const { res, rej } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) rej(new Error(JSON.stringify(data.error)))
        else res(data.result)
      }
    })
    ws.addEventListener('error', (e) => reject(new Error('WS error ' + e.message)))
  })
}

async function main() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  const list = await res.json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('没找到页面目标')

  console.log('URL   :', decodeURIComponent(page.url))
  console.log('TITLE :', page.title)

  const cdp = await connect(page.webSocketDebuggerUrl)

  const evalJs = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return r?.result?.value
  }

  const boot = await evalJs(`JSON.stringify({
    hasApi: typeof window.api === 'object',
    panes: document.querySelectorAll('.pane').length,
    title: document.title
  })`)
  console.log('BOOT  :', boot)

  const settings = await evalJs(`(async () => {
    const s = await window.api.getState()
    return JSON.stringify({ model: s.settings.llm.model, baseUrl: s.settings.llm.baseUrl, ocr: s.settings.ocr })
  })()`)
  console.log('CONF  :', settings)

  const tr = await evalJs(`(async () => {
    const ta = document.querySelector('textarea')
    ta.value = 'Screenshot translation beats opening a web page every single time.'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 7000))
    return JSON.stringify({
      out: (document.querySelector('.output-text')?.textContent || '').trim().slice(0, 60),
      badge: (document.querySelector('.badge.ok')?.textContent || '').trim()
    })
  })()`)
  console.log('TRANS :', tr)

  await cdp.send('Page.enable')
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'pack-app.png'), Buffer.from(shot.data, 'base64'))
  console.log('SHOT  : .tmp/pack-app.png', Math.round(fs.statSync(path.join(OUT, 'pack-app.png')).size / 1024) + 'KB')

  cdp.close()
}

main().catch((e) => {
  console.log('VERIFY_ERR', e.message)
  process.exit(1)
})
