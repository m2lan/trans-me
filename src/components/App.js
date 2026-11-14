import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from '../vendor/vue.esm-browser.prod.js'
import LangBar from './LangBar.js'
import HistoryPanel from './HistoryPanel.js'
import SettingsModal from './SettingsModal.js'

const LANGS = [
  { code: 'auto', label: '自动检测' },
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'th', label: 'ไทย' }
]

export default defineComponent({
  name: 'App',
  components: { LangBar, HistoryPanel, SettingsModal },
  setup() {
    const isMac = window.api.platform === 'darwin'

    const settings = ref({
      provider: 'auto',
      source: 'auto',
      target: 'zh-CN',
      autoTranslate: true,
      autoCopy: false,
      launchAtLogin: false,
      llm: { baseUrl: '', apiKey: '', model: '', visionModel: '', visionEnabled: true },
      ocr: { useVision: true }
    })
    const meta = ref({ hotkeys: {}, registered: {}, localOcr: false, platform: '', appVersion: '' })
    const history = ref([])
    const favorites = ref([])
    const tab = ref('translate')
    const input = ref('')
    const result = ref({ text: '', provider: '', detected: 'auto', warning: '' })
    const loading = ref(false)
    const error = ref('')
    const toast = ref('')
    const showSettings = ref(false)
    const editorRef = ref(null)

    let seq = 0
    let debounceTimer = null
    let toastTimer = null

    const langLabel = (code) => {
      const hit = LANGS.find((l) => l.code === code)
      return hit ? hit.label : code === 'auto' ? '自动检测' : code
    }

    const detectedLabel = computed(() => {
      const d = result.value.detected
      if (!d || d === 'auto') return ''
      return langLabel(d) === d ? d : langLabel(d)
    })

    const canTranslate = computed(() => input.value.trim().length > 0)

    function cleanError(err) {
      const msg = String((err && err.message) || err || '')
      return msg.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
    }

    function showToast(text) {
      toast.value = text
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => (toast.value = ''), 1800)
    }

    async function refreshState() {
      const state = await window.api.getState()
      history.value = state.history
      favorites.value = state.favorites
    }

    async function runTranslate() {
      const text = input.value.trim()
      if (!text) {
        result.value = { text: '', provider: '', detected: 'auto', warning: '' }
        error.value = ''
        return
      }
      const id = ++seq
      loading.value = true
      error.value = ''
      try {
        const r = await window.api.translate({
          text: input.value,
          from: settings.value.source,
          to: settings.value.target
        })
        if (id !== seq) return
        result.value = r
        if (r.warning) showToast(r.warning)
        refreshState()
      } catch (err) {
        if (id !== seq) return
        error.value = cleanError(err)
        result.value = { text: '', provider: '', detected: 'auto', warning: '' }
      } finally {
        if (id === seq) loading.value = false
      }
    }

    function scheduleTranslate() {
      clearTimeout(debounceTimer)
      if (!settings.value.autoTranslate) return
      if (!input.value.trim()) {
        result.value = { text: '', provider: '', detected: 'auto', warning: '' }
        return
      }
      debounceTimer = setTimeout(runTranslate, 700)
    }

    async function persist(patch) {
      settings.value = await window.api.setSettings(patch)
    }

    function onSource(value) {
      settings.value.source = value
      persist({ source: value })
      if (canTranslate.value) runTranslate()
    }

    function onTarget(value) {
      settings.value.target = value
      persist({ target: value })
      if (canTranslate.value) runTranslate()
    }

    function swap() {
      const detected = result.value.detected
      const from =
        settings.value.source === 'auto'
          ? detected && detected !== 'auto'
            ? detected
            : 'zh-CN'
          : settings.value.source
      settings.value.source = settings.value.target
      settings.value.target = from === 'auto' ? 'zh-CN' : from
      persist({ source: settings.value.source, target: settings.value.target })
      if (canTranslate.value) runTranslate()
    }

    async function copyText(text, tip) {
      if (!text) return
      await window.api.copy(text)
      showToast(tip || '已复制')
    }

    async function speak(text, lang) {
      if (!text) return
      await window.api.speak({ text, lang })
    }

    async function pasteFromClipboard() {
      const text = await window.api.readClipboard()
      if (!text) return showToast('剪贴板是空的')
      input.value = text
      await nextTick()
      runTranslate()
    }

    function clearInput() {
      input.value = ''
      result.value = { text: '', provider: '', detected: 'auto', warning: '' }
      error.value = ''
      if (editorRef.value) editorRef.value.focus()
    }

    const screenshot = () => window.api.startScreenshot()

    function loadHistoryItem(item) {
      tab.value = 'translate'
      input.value = item.original
      result.value = {
        text: item.translated,
        provider: item.provider,
        detected: item.from,
        warning: ''
      }
    }

    async function star(id) {
      favorites.value = await window.api.toggleFavorite(id)
    }

    const targetLangForSpeech = () => settings.value.target

    function sourceLangForSpeech() {
      const s = settings.value.source
      if (s !== 'auto') return s
      return result.value.detected && result.value.detected !== 'auto' ? result.value.detected : 'en'
    }

    function onKeydown(e) {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        runTranslate()
      }
      if (e.key === 'Escape' && showSettings.value) showSettings.value = false
    }

    // 窗口按钮（打包后无系统标题栏，用自绘按钮）
    const win = {
      minimize: () => window.api.window.minimize(),
      maximize: () => window.api.window.maximize(),
      close: () => window.api.window.close()
    }

    onMounted(async () => {
      const data = await window.api.init()
      settings.value = data.settings
      history.value = data.history
      favorites.value = data.favorites
      meta.value = {
        hotkeys: data.hotkeys,
        registered: data.registered,
        localOcr: data.localOcr,
        ocrCapability: data.ocrCapability,
        platform: data.platform,
        appVersion: data.appVersion,
        electron: data.electron
      }

      window.api.onPrefill((payload) => {
        tab.value = 'translate'
        input.value = payload.text
        if (payload.auto) nextTick(runTranslate)
      })
      window.api.onHistoryUpdated(() => refreshState())
      window.addEventListener('keydown', onKeydown)
      await nextTick()
      if (editorRef.value) editorRef.value.focus()
    })

    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onKeydown)
      clearTimeout(debounceTimer)
      clearTimeout(toastTimer)
    })

    watch(input, scheduleTranslate)

    async function onSaveSettings(patch) {
      settings.value = await window.api.setSettings(patch)
      showSettings.value = false
      showToast('设置已保存')
      if (canTranslate.value) runTranslate()
    }

    return {
      LANGS,
      isMac,
      settings,
      meta,
      history,
      favorites,
      tab,
      input,
      result,
      loading,
      error,
      toast,
      showSettings,
      editorRef,
      detectedLabel,
      canTranslate,
      langLabel,
      runTranslate,
      onSource,
      onTarget,
      swap,
      copyText,
      speak,
      pasteFromClipboard,
      clearInput,
      screenshot,
      loadHistoryItem,
      star,
      targetLangForSpeech,
      sourceLangForSpeech,
      onSaveSettings,
      win
    }
  },
  template: `
  <div class="app-shell">
    <header class="titlebar">
      <div class="brand">
        <span class="brand-mark">译</span>
        <span>TransMe</span>
      </div>

      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'translate' }" @click="tab = 'translate'">翻译</button>
        <button class="tab" :class="{ active: tab === 'history' }" @click="tab = 'history'">历史</button>
      </div>

      <div class="spacer"></div>

      <button class="pill-btn primary" title="截图翻译（框选屏幕区域）" @click="screenshot">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 5.5V3.5a1 1 0 011-1h2M14 5.5V3.5a1 1 0 00-1-1h-2M2 10.5v2a1 1 0 001 1h2M14 10.5v2a1 1 0 01-1 1h-2" />
          <path d="M5.2 8h5.6" />
        </svg>
        截图翻译
      </button>

      <button class="icon-btn" title="设置" @click="showSettings = true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 1.6v1.2M8 13.2v1.2M2.6 8H1.4M14.6 8h-1.2M4.2 4.2L3.4 3.4M12.6 12.6l-.8-.8M11.8 4.2l.8-.8M3.4 12.6l.8-.8" />
        </svg>
      </button>

      <div v-if="!isMac" class="win-controls">
        <button class="icon-btn" title="最小化" @click="win.minimize()">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.4"><path d="M3 7h8" /></svg>
        </button>
        <button class="icon-btn" title="最大化" @click="win.maximize()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.2" y="3.2" width="7.6" height="7.6" rx="1" /></svg>
        </button>
        <button class="icon-btn" title="关闭" @click="win.close()">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l6 6M10 4l-6 6" /></svg>
        </button>
      </div>
    </header>

    <template v-if="tab === 'translate'">
      <LangBar
        :source="settings.source"
        :target="settings.target"
        :langs="LANGS"
        @update:source="onSource"
        @update:target="onTarget"
        @swap="swap"
      >
        <span v-if="detectedLabel" class="badge">识别为 {{ detectedLabel }}</span>
        <span v-if="result.provider" class="badge ok">{{ result.provider }}</span>
      </LangBar>

      <div class="workspace">
        <section class="pane">
          <div class="pane-head">
            <span class="label">{{ settings.source === 'auto' ? '原文' : langLabel(settings.source) }}</span>
            <div class="spacer"></div>
            <button class="ghost-btn" :disabled="!input" @click="clearInput">清空</button>
          </div>
          <div class="pane-body">
            <textarea
              ref="editorRef"
              v-model="input"
              class="editor"
              spellcheck="false"
              placeholder="粘贴或输入要翻译的文字…&#10;&#10;· 输入后自动翻译（可在设置里关闭）&#10;· ⌘/Ctrl + Enter 立即翻译&#10;· ⌘⇧D 直接翻译剪贴板内容"
            ></textarea>
          </div>
          <div class="pane-foot">
            <button class="ghost-btn" @click="pasteFromClipboard">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="2.5" width="10" height="11.5" rx="1.6" />
                <path d="M6 2.5V2a1 1 0 011-1h2a1 1 0 011 1v.5" />
              </svg>
              粘贴
            </button>
            <span class="counter">{{ input.length }} 字</span>
            <div class="spacer"></div>
            <button class="translate-btn" :disabled="!canTranslate || loading" @click="runTranslate">
              {{ loading ? '翻译中…' : '翻译' }}
            </button>
          </div>
        </section>

        <section class="pane">
          <div class="pane-head">
            <span class="label">{{ langLabel(settings.target) }}</span>
            <div class="spacer"></div>
            <button class="ghost-btn" :disabled="!result.text" title="朗读译文" @click="speak(result.text, targetLangForSpeech())">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6.2h2.2L8.6 3.6v8.8L5.2 9.8H3z" />
                <path d="M11 5.6a3.2 3.2 0 010 4.8M12.6 3.9a5.6 5.6 0 010 8.2" />
              </svg>
              朗读
            </button>
          </div>

          <div class="pane-body">
            <div v-if="loading" class="skeleton">
              <div class="sk-line" style="width: 82%"></div>
              <div class="sk-line" style="width: 94%"></div>
              <div class="sk-line" style="width: 66%"></div>
            </div>

            <div v-else-if="error" class="empty-state">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5M12 16.2v.3" />
              </svg>
              <div style="max-width: 320px; line-height: 1.6">{{ error }}</div>
              <button class="ghost-btn" @click="runTranslate">重试</button>
            </div>

            <div v-else-if="result.text" class="output-text">{{ result.text }}</div>

            <div v-else class="empty-state">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 6h9M8.5 4v2c0 3.6-2 6.6-4.5 8" />
                <path d="M6 10.5c1.2 2.2 2.9 3.6 5 4.5" />
                <path d="M13.5 20l3.6-9 3.6 9M14.9 16.7h4.4" />
              </svg>
              <div>译文会出现在这里</div>
            </div>
          </div>

          <div class="pane-foot">
            <button class="ghost-btn" :disabled="!result.text" @click="copyText(result.text)">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5" />
                <path d="M10.5 5.5V3.9a1.4 1.4 0 00-1.4-1.4H3.9A1.4 1.4 0 002.5 3.9v5.2a1.4 1.4 0 001.4 1.4h1.6" />
              </svg>
              复制
            </button>
            <button class="ghost-btn" :disabled="!result.text" @click="speak(input, sourceLangForSpeech())">
              朗读原文
            </button>
            <div class="spacer"></div>
            <span v-if="result.text" class="counter">{{ result.text.length }} 字</span>
          </div>
        </section>
      </div>
    </template>

    <HistoryPanel
      v-else
      :items="history"
      :favorites="favorites"
      @select="loadHistoryItem"
      @star="star"
      @copy="(t) => copyText(t, '译文已复制')"
    />

    <SettingsModal
      v-if="showSettings"
      :settings="settings"
      :meta="meta"
      @close="showSettings = false"
      @save="onSaveSettings"
    />

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>`
})
