'use strict'

/**
 * 生成 README 用的界面截图：驱动真实运行的应用（CDP），走真实翻译链路。
 * 用法：
 *   NODE_ENV=development electron . --remote-debugging-port=9381
 *   node test/shots.js
 */
const fs = require('node:fs')
const path = require('node:path')

const PORT = Number(process.env.CDP_PORT || 9381)
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, '.tmp')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
      if (page) return page
    } catch {
      /* 等应用启动 */
    }
    await sleep(250)
  }
  throw new Error('找不到主窗口调试目标')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const i = ++id
        pending.set(i, { res, rej })
        ws.send(JSON.stringify({ id: i, method, params }))
      })
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (!m.id || !pending.has(m.id)) return
      const { res, rej } = pending.get(m.id)
      pending.delete(m.id)
      if (m.error) rej(new Error(m.error.message))
      else res(m.result)
    })
    ws.addEventListener('error', reject)
    ws.addEventListener('open', () =>
      resolve({
        send,
        async eval(expression) {
          const r = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
          })
          return r && r.result ? r.result.value : undefined
        },
        async shot(file) {
          const r = await send('Page.captureScreenshot', { format: 'png' })
          fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'))
          console.log('  ✓', file)
        },
        close: () => ws.close()
      })
    )
  })
}

const SAMPLE = 'Screenshot translation beats opening a web page every single time.'

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const page = await connect((await findPage()).webSocketDebuggerUrl)

  // 干净的历史 + 关掉可能残留的弹窗
  await page.eval('window.api.clearHistory()')
  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(300)

  /* 1. 文本翻译 */
  await page.eval(`document.querySelectorAll('.tab')[0].click()`)
  await sleep(300)
  await page.eval(`(() => {
    const ta = document.querySelector('.editor')
    ta.value = ${JSON.stringify(SAMPLE)}
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return 1
  })()`)
  await sleep(2600)
  await page.shot('ui-translate.png')

  /* 2. 图片翻译（真实 OCR + 真实翻译） */
  const dataUrl = `data:image/png;base64,${fs
    .readFileSync(path.join(OUT, 'demo-page.png'))
    .toString('base64')}`
  await page.eval(`document.querySelectorAll('.tab')[1].click()`)
  await sleep(300)
  // 若上一轮留有图片，先点「换一张」回到空状态
  await page.eval(`(() => {
    const b = [...document.querySelectorAll('.side-foot button')].find(x => x.textContent.includes('换一张'))
    if (b) b.click()
    return !!b
  })()`)
  await sleep(400)
  await page.shot('ui-image-empty.png')
  await page.eval(`window.api.imageDebugOpen(${JSON.stringify(dataUrl)})`)
  // 等识别 + 翻译全部结束（没有遮罩即完成）
  let waited = 0
  while (waited < 90000) {
    const busy = await page.eval(`!!document.querySelector('.stage-mask')`)
    const done = await page.eval(`document.querySelectorAll('.seg').length`)
    if (!busy && done > 0) break
    await sleep(500)
    waited += 500
  }
  await sleep(400)
  await page.shot('ui-image-result.png')

  /* 3. 历史 */
  await page.eval(`document.querySelectorAll('.tab')[2].click()`)
  await sleep(500)
  await page.shot('ui-history.png')

  /* 4. 设置（临时把窗口放大一点，避免设置面板被裁） */
  // 用设备尺寸模拟把视口临时放大（Browser.setWindowBounds 在页面目标里不可用）
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1000,
    height: 880,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(300)
  await page.eval(`document.querySelector('.titlebar .icon-btn').click()`)
  await sleep(600)
  await page.shot('ui-settings.png')
  await page.eval(`(() => {
    const t = [...document.querySelectorAll('.section-title')].find(x => x.textContent.includes('截图识别'))
    if (t) t.scrollIntoView({ block: 'start' })
    return !!t
  })()`)
  await sleep(400)
  await page.shot('ui-settings-ocr.png')
  await page.send('Emulation.clearDeviceMetricsOverride')

  await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  page.close()
  console.log('完成')
  process.exit(0)
})().catch((err) => {
  console.error('ERR', err.message)
  process.exit(1)
})
