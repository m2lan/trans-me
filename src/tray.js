/**
 * 菜单栏小面板：点一下就能输入翻译，不用切窗口
 * 复用主进程的 translate / settings / tts / clipboard 通道
 */
const api = window.api
const panel = document.getElementById('panel')

const LANGS = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'th', label: 'ไทย' }
]

const state = {
  settings: { source: 'auto', target: 'zh-CN' },
  src: '',
  out: '',
  provider: '',
  detected: 'auto',
  busy: false,
  error: ''
}

let seq = 0
let debounceTimer = null
let fitTimer = null
let copiedAt = 0

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const isMac = api.platform === 'darwin'
const MOD = isMac ? '⌘' : 'Ctrl+'

function options(current) {
  return LANGS.map(
    (l) => `<option value="${l.code}"${l.code === current ? ' selected' : ''}>${esc(l.label)}</option>`
  ).join('')
}

/* ------------------------------ 骨架 ------------------------------ */

function render() {
  panel.innerHTML = `
    <div class="head">
      <span class="mark">译</span>
      <span class="name">TransMe</span>
      <div class="spacer"></div>
      <button class="icon-btn" data-act="main" title="打开主界面">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.2" y="3" width="11.6" height="10" rx="1.8"/>
          <path d="M2.2 6.2h11.6"/>
        </svg>
      </button>
    </div>

    <div class="langs">
      <select id="from">${options(state.settings.source)}</select>
      <button class="swap" data-act="swap" title="互换语言">⇄</button>
      <select id="to">${options(state.settings.target)}</select>
    </div>

    <div class="input-wrap">
      <textarea id="src" spellcheck="false" placeholder="输入或粘贴要翻译的文字"></textarea>
      <div class="hintline">${isMac ? '⌘↵' : 'Ctrl+Enter'} 翻译 · ${isMac ? '⌘C' : 'Ctrl+C'} 复制译文 · Esc 收起</div>
    </div>

    <div class="out" id="out" hidden></div>

    <div class="bar">
      <button data-act="screenshot">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 5.5V3.5a1 1 0 011-1h2M14 5.5V3.5a1 1 0 00-1-1h-2M2 10.5v2a1 1 0 001 1h2M14 10.5v2a1 1 0 01-1 1h-2"/>
        </svg>
        截图翻译
      </button>
      <button data-act="main">打开主界面</button>
      <span class="grow"></span>
      <span class="kbd">${MOD}⇧Space</span>
    </div>
  `

  const ta = document.getElementById('src')
  ta.value = state.src
  ta.addEventListener('input', (e) => {
    state.src = e.target.value
    schedule()
  })
  ta.addEventListener('keydown', onKeydown)

  document.getElementById('from').addEventListener('change', (e) => setLang('source', e.target.value))
  document.getElementById('to').addEventListener('change', (e) => setLang('target', e.target.value))

  focusInput()
  updateOut()
}

function focusInput() {
  const ta = document.getElementById('src')
  if (!ta) return
  ta.focus()
  const len = ta.value.length
  ta.setSelectionRange(len, len)
}

/* ------------------------------ 译文区 ------------------------------ */

function updateOut() {
  const box = document.getElementById('out')
  if (!box) return
  const show = Boolean(state.out || state.busy || state.error)

  if (!show) {
    box.hidden = true
    box.innerHTML = ''
    fit()
    return
  }

  box.hidden = false
  if (state.busy && !state.out) {
    box.innerHTML = `<div class="out-text loading">翻译中…</div>`
  } else if (state.error) {
    box.innerHTML = `<div class="out-text loading">${esc(state.error)}</div>`
  } else {
    box.innerHTML = `
      <div class="out-text">${esc(state.out)}</div>
      <div class="out-foot">
        <button data-act="copy">${copiedAt ? '已复制' : '复制'}</button>
        <button data-act="speak">朗读</button>
        <span class="meta">${esc(state.provider)}${
          state.detected && state.detected !== 'auto' ? ' · ' + esc(state.detected) : ''
        }</span>
      </div>`
  }
  fit()
}

function fit() {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    const h = Math.ceil(document.body.scrollHeight) + 4
    api.tray.resize(h)
  }, 16)
}

/* ------------------------------ 交互 ------------------------------ */

async function setLang(key, value) {
  state.settings = { ...state.settings, [key]: value }
  await api.setSettings({ [key]: value })
  if (state.src.trim()) run()
}

function schedule() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (state.src.trim()) run()
    else {
      state.out = ''
      state.error = ''
      updateOut()
    }
  }, 650)
}

async function run() {
  const text = state.src.trim()
  if (!text) return
  const id = ++seq
  state.busy = true
  state.error = ''
  updateOut()
  try {
    const r = await api.translate({ text, from: state.settings.source, to: state.settings.target })
    if (id !== seq) return
    state.out = r.text || ''
    state.provider = r.provider || ''
    state.detected = r.detected || 'auto'
  } catch (err) {
    if (id !== seq) return
    state.out = ''
    state.error = String((err && err.message) || err).replace(
      /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
      ''
    )
  } finally {
    if (id === seq) {
      state.busy = false
      updateOut()
    }
  }
}

function swap() {
  const detected = state.detected && state.detected !== 'auto' ? state.detected : null
  const nextSource = state.settings.target
  const nextTarget = state.settings.source === 'auto' ? detected || 'zh-CN' : state.settings.source
  state.settings = { source: nextSource, target: nextTarget }
  api.setSettings({ source: nextSource, target: nextTarget })

  const from = document.getElementById('from')
  const to = document.getElementById('to')
  if (from) from.value = nextSource
  if (to) to.value = nextTarget

  if (state.src.trim()) run()
  else updateOut()
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    api.tray.hide()
    return
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    run()
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    run()
  }
}

panel.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]')
  if (!btn) return
  const act = btn.dataset.act

  if (act === 'main') {
    api.tray.openMain()
    api.tray.hide()
  }
  if (act === 'screenshot') {
    api.tray.hide()
    setTimeout(() => api.startScreenshot(), 140)
  }
  if (act === 'swap') swap()
  if (act === 'copy') {
    if (!state.out) return
    await api.copy(state.out)
    copiedAt = Date.now()
    updateOut()
    setTimeout(() => {
      copiedAt = 0
      updateOut()
    }, 1100)
  }
  if (act === 'speak') {
    if (!state.out) return
    api.speak({ text: state.out, lang: state.settings.target })
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.tray.hide()
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && state.out) {
    const sel = window.getSelection()?.toString()
    if (!sel) {
      api.copy(state.out)
      e.preventDefault()
    }
  }
})

window.addEventListener('focus', focusInput)

if (api.tray && api.tray.onShown) {
  api.tray.onShown(() => {
    focusInput()
    const ta = document.getElementById('src')
    if (ta) ta.select()
    fit()
  })
}

api.init().then((data) => {
  state.settings = data.settings
  render()
})
