const api = window.api
const wrapEl = document.getElementById('wrap')
const LANG_NAME = { 'zh-CN': '中文', en: 'English', ja: '日本語', ko: '한국어', th: 'ไทย' }

let state = {
  image: '',
  from: 'auto',
  to: 'zh-CN',
  status: '正在识别文字…',
  original: '',
  translated: '',
  provider: '',
  engine: '',
  elapsed: 0,
  error: ''
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function headHtml() {
  const badge = state.translated && state.provider
    ? `<span class="badge">${esc(state.provider)}</span>`
    : `<span class="badge gray">${esc(LANG_NAME[state.to] || state.to)}</span>`
  return `
    <div class="head">
      <span class="dot"></span>
      <span class="title">翻译</span>
      ${badge}
      <div class="spacer"></div>
      <button class="icon-btn" data-act="close" title="关闭">
        <svg width="13" height="13" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none">
          <path d="M4 4l6 6M10 4l-6 6"/>
        </svg>
      </button>
    </div>`
}

function render() {
  if (state.error) {
    wrapEl.innerHTML = `${headHtml()}
      <div class="body">
        <div class="error">${esc(state.error)}</div>
        <div class="hintline">可以重新框选，或在设置里改用大模型 / 检查免费接口网络。</div>
      </div>`
  } else if (state.translated) {
    wrapEl.innerHTML = `${headHtml()}
      <div class="body">
        <div class="text">${esc(state.translated)}</div>
        ${
          state.original
            ? `<details class="original">
                 <summary>
                   <svg width="9" height="9" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"><path d="M4 2l3 3-3 3"/></svg>
                   原文
                 </summary>
                 <p>${esc(state.original)}</p>
               </details>`
            : ''
        }
      </div>
      <div class="foot">
        <button data-act="copy">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5"/><path d="M10.5 5.5V3.9a1.4 1.4 0 00-1.4-1.4H3.9A1.4 1.4 0 002.5 3.9v5.2a1.4 1.4 0 001.4 1.4h1.6"/></svg>
          复制
        </button>
        <button data-act="speak">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.2h2.2L8.6 3.6v8.8L5.2 9.8H3z"/><path d="M11 5.6a3.2 3.2 0 010 4.8"/></svg>
          朗读
        </button>
        <button data-act="open" title="在主窗口里查看大图与逐行对照">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5H13.5V6.5"/><path d="M13 3L8.5 7.5"/><path d="M12.5 10v2.5a1 1 0 01-1 1H3.5a1 1 0 01-1-1V4.5a1 1 0 011-1H6"/></svg>
          大图
        </button>
        <span class="meta">${esc(state.engine)}${state.elapsed ? ` · ${(state.elapsed / 1000).toFixed(1)}s` : ''}</span>
      </div>`
  } else {
    wrapEl.innerHTML = `${headHtml()}
      <div class="body">
        <div class="loading">
          ${state.image ? `<img class="thumb" src="${state.image}" alt="" />` : ''}
          <div class="loading-main">
            <div class="status"><span class="spinner"></span><span>${esc(state.status)}</span></div>
            <div class="sk" style="width: 78%"></div>
            <div class="sk" style="width: 92%"></div>
          </div>
        </div>
      </div>`
  }
  fit()
}

let fitTimer = null
function fit() {
  clearTimeout(fitTimer)
  fitTimer = setTimeout(() => {
    const h = Math.ceil(wrapEl.getBoundingClientRect().height) + 28
    api.resizePopup(h)
  }, 16)
}

wrapEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]')
  if (!btn) return
  const act = btn.dataset.act
  if (act === 'close') api.closePopup()
  if (act === 'copy') {
    await api.copy(state.translated)
    btn.lastChild.textContent = ' 已复制'
    setTimeout(() => (btn.lastChild.textContent = ' 复制'), 1200)
  }
  if (act === 'speak') api.speak({ text: state.translated, lang: state.to })
  if (act === 'open') {
    api.openImageInMain({ dataUrl: state.image, from: state.from, to: state.to })
    api.closePopup()
  }
})

wrapEl.addEventListener('toggle', () => fit(), true)

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.closePopup()
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && state.translated) {
    const sel = window.getSelection()?.toString()
    if (!sel) {
      api.copy(state.translated)
      e.preventDefault()
    }
  }
})

if (api?.onPopupInit) {
  api.onPopupInit((payload) => {
    state = {
      ...state,
      image: payload.image || '',
      from: payload.from || 'auto',
      to: payload.to || 'zh-CN',
      status: '正在识别文字…',
      error: '',
      translated: '',
      original: ''
    }
    render()
  })

  api.onPopupProgress(({ message }) => {
    state.status = message
    render()
  })

  api.onPopupResult((payload) => {
    if (payload.error) {
      state.error = payload.error
      state.translated = ''
    } else {
      state.original = payload.original || ''
      state.translated = payload.translated || ''
      state.provider = payload.provider || ''
      state.engine = payload.engine || ''
      state.elapsed = payload.elapsed || 0
      state.error = ''
    }
    render()
    fit()
  })
}

render()
