'use strict'

/** 通过 CDP 驱动真实运行中的应用，验证输入 → IPC → 翻译 → 渲染全链路 */
const PORT = 9333

async function getTarget() {
  for (let i = 0; i < 40; i++) {
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
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(ev.data)
      if (data.id && pending.has(data.id)) {
        const { res, rej } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) rej(new Error(JSON.stringify(data.error)))
        else res(data.result?.result?.value)
      }
    })
    ws.addEventListener('error', (e) => reject(new Error('WS error ' + e.message)))
  })
}

async function main() {
  const target = await getTarget()
  const cdp = await connect(target.webSocketDebuggerUrl)

  const boot = await cdp.eval(`JSON.stringify({
    hasApi: typeof window.api === 'object',
    panes: document.querySelectorAll('.pane').length,
    langs: [...document.querySelectorAll('.lang-select select')].map(s => s.value),
    placeholder: document.querySelector('textarea')?.placeholder?.slice(0, 12)
  })`)
  console.log('BOOT', boot)

  const fill = await cdp.eval(`(async () => {
    const ta = document.querySelector('textarea')
    ta.value = 'Screenshot translation beats opening a web page every single time.'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 2500))
    return JSON.stringify({
      output: (document.querySelector('.output-text')?.textContent || '').trim().slice(0, 80),
      badge: (document.querySelector('.badge.ok')?.textContent || '').trim(),
      loading: !!document.querySelector('.skeleton')
    })
  })()`)
  console.log('TRANSLATE', fill)

  const historyCount = await cdp.eval(`(async () => {
    const s = await window.api.getState()
    return JSON.stringify({ count: s.history.length, last: (s.history[0]?.translated || '').slice(0, 40) })
  })()`)
  console.log('HISTORY', historyCount)

  const tts = await cdp.eval(`window.api.speak({ text: '测试朗读', lang: 'zh-CN' }).then(r => 'tts:' + r)`)
  console.log('TTS', tts)

  const settings = await cdp.eval(`(async () => {
    const s = await window.api.setSettings({ target: 'ja' })
    await window.api.setSettings({ target: 'zh-CN' })
    return 'settings-ok:' + (s.target || '')
  })()`)
  console.log('SETTINGS', settings)

  cdp.close()
}

main().catch((e) => {
  console.log('DRIVER_ERR', e.message)
  process.exit(1)
})
