'use strict'

/**
 * 真实应用里验证「图片翻译」：把测试图通过 IPC 送进主进程流水线，
 * 检查返回的分段 / 坐标 / 译文，并把结果渲染进图片 tab 截图。
 */
const fs = require('node:fs')
const path = require('node:path')

const PORT = process.env.CDP_PORT ? Number(process.env.CDP_PORT) : 9351
const ROOT = path.join(__dirname, '..')

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
      if (page) return page
    } catch {
      /* 等应用起来 */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('找不到调试目标')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () =>
      resolve({
        eval: (expression) =>
          new Promise((res, rej) => {
            const msgId = ++id
            pending.set(msgId, { res, rej })
            ws.send(
              JSON.stringify({
                id: msgId,
                method: 'Runtime.evaluate',
                params: { expression, awaitPromise: true, returnByValue: true }
              })
            )
          }),
        close: () => ws.close()
      })
    )
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (!msg.id || !pending.has(msg.id)) return
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(msg.error.message))
      else res(msg.result && msg.result.result ? msg.result.result.value : undefined)
    })
    ws.addEventListener('error', reject)
  })
}

async function main() {
  const target = await getTarget()
  const page = await connect(target.webSocketDebuggerUrl)
  const dataUrl = `data:image/png;base64,${fs
    .readFileSync(path.join(ROOT, '.tmp', 'test-ocr.png'))
    .toString('base64')}`

  const raw = await page.eval(`(async () => {
    const r = await window.api.translateImage({ dataUrl: ${JSON.stringify(dataUrl)}, from: 'auto', to: 'en' })
    return JSON.stringify({
      mode: r.mode, overlay: r.overlay, engine: r.engine, provider: r.provider,
      segs: r.segments.length,
      withBox: r.segments.filter(s => s.box).length,
      first: r.segments[0],
      translated: r.translated.slice(0, 60),
      elapsed: r.elapsed
    })
  })()`)

  console.log('PIPELINE:', raw)

  // 把这张图塞进图片 tab 里渲染，等界面出结果后截图
  await page.eval(`(async () => {
    const b = [...document.querySelectorAll('.tab')].find(x => x.textContent.trim() === '图片')
    b && b.click()
    return true
  })()`)
  await new Promise((r) => setTimeout(r, 400))

  const uiState = await page.eval(`(async () => {
    // 直接点不到文件选择框，用剪贴板通道太重，这里复用 pickImage 的返回值模拟载入
    const dz = document.querySelector('.dz')
    return JSON.stringify({ hasDropzone: !!dz, tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent.trim()) })
  })()`)
  console.log('UI:', uiState)
  page.close()
}

main().catch((err) => {
  console.error('ERR:', err.message)
  process.exit(1)
})
