import { defineComponent, reactive, ref, computed } from '../vendor/vue.esm-browser.prod.js'

export default defineComponent({
  name: 'SettingsModal',
  props: {
    settings: { type: Object, required: true },
    meta: { type: Object, default: () => ({}) }
  },
  emits: ['close', 'save'],
  setup(props, { emit }) {
    const isMac = window.api.platform === 'darwin'

    const form = reactive({
      provider: props.settings.provider || 'auto',
      autoTranslate: props.settings.autoTranslate !== false,
      autoCopy: !!props.settings.autoCopy,
      launchAtLogin: !!props.settings.launchAtLogin,
      llm: { ...props.settings.llm },
      ocr: { ...props.settings.ocr }
    })

    const testing = ref(false)
    const testResult = ref('')
    const testError = ref('')

    const hasKey = computed(
      () => !!form.llm.apiKey || /localhost|127\.0\.0\.1/.test(form.llm.baseUrl || '')
    )

    function formatAccel(acc) {
      if (!acc) return '—'
      if (!isMac) return acc.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')
      return acc
        .replace('CommandOrControl', '⌘')
        .replace('Shift', '⇧')
        .replace('Alt', '⌥')
        .replace(/\+/g, ' ')
    }

    const engineLabel = computed(() => {
      if (form.provider === 'free') return '仅免费接口'
      if (form.provider === 'llm') return '仅大模型'
      return hasKey.value ? '自动 · 大模型优先' : '自动 · 免费接口'
    })

    async function test() {
      testing.value = true
      testResult.value = ''
      testError.value = ''
      try {
        const r = await window.api.testEngine({
          mode: form.provider === 'auto' ? undefined : form.provider
        })
        testResult.value = r.text + '（' + r.provider + '）'
      } catch (err) {
        testError.value = String(err && err.message ? err.message : err).replace(
          /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
          ''
        )
      } finally {
        testing.value = false
      }
    }

    function save() {
      emit('save', {
        provider: form.provider,
        autoTranslate: form.autoTranslate,
        autoCopy: form.autoCopy,
        launchAtLogin: form.launchAtLogin,
        llm: { ...form.llm },
        ocr: { ...form.ocr }
      })
    }

    const openDataDir = () => window.api.openUserData()

    return {
      isMac,
      form,
      testing,
      testResult,
      testError,
      hasKey,
      engineLabel,
      formatAccel,
      test,
      save,
      openDataDir,
      emit
    }
  },
  template: `
  <div class="overlay-mask" @mousedown.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">设置</div>
        <div class="spacer"></div>
        <button class="icon-btn" @click="emit('close')">
          <svg width="15" height="15" viewBox="0 0 14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
            <path d="M4 4l6 6M10 4l-6 6" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="section-title">翻译通道</div>

        <div class="field">
          <div class="field-label">引擎模式 <span class="badge">{{ engineLabel }}</span></div>
          <select v-model="form.provider" class="select-input">
            <option value="auto">自动（配了 Key 走大模型，否则走免费接口）</option>
            <option value="free">仅免费接口（无需 Key）</option>
            <option value="llm">仅大模型（术语更准，需要 Key）</option>
          </select>
          <div class="field-hint">
            免费接口按 Bing → Bing API → Google → MyMemory 自动重试，无需配置但受第三方服务波动影响。
          </div>
        </div>

        <div class="field">
          <div class="field-label">API 地址（OpenAI 兼容）</div>
          <input v-model="form.llm.baseUrl" class="text-input" placeholder="https://api.deepseek.com" spellcheck="false" />
          <div class="field-hint">
            DeepSeek 填 https://api.deepseek.com（不用加 /v1）；通义千问 / Moonshot / OpenAI 填各自地址；本地 Ollama 填 http://localhost:11434/v1
          </div>
        </div>

        <div class="field">
          <div class="field-label">API Key</div>
          <input v-model="form.llm.apiKey" class="text-input" type="password" placeholder="sk-…" spellcheck="false" />
        </div>

        <div class="row-2">
          <div class="field">
            <div class="field-label">文本模型</div>
            <input v-model="form.llm.model" class="text-input" placeholder="deepseek-flash" spellcheck="false" />
            <div class="field-hint">deepseek-chat 已于 2026/7/24 下线，请用 deepseek-flash</div>
          </div>
          <div class="field">
            <div class="field-label">视觉模型（截图直译）</div>
            <input v-model="form.llm.visionModel" class="text-input" placeholder="留空则复用文本模型" spellcheck="false" />
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px">
          <button class="pill-btn" :disabled="testing" @click="test">
            {{ testing ? '测试中…' : '测试连通性' }}
          </button>
          <span v-if="testResult" style="font-size: 12px; color: #0f8a44">{{ testResult }}</span>
          <span v-if="testError" style="font-size: 12px; color: #c2410c">{{ testError }}</span>
        </div>

        <div class="section-title">截图识别</div>

        <div class="toggle-row">
          <div>
            <div class="toggle-text">云端 OCR（优先）<span class="badge">DeepSeek</span></div>
            <div class="toggle-sub">先识别文字再翻译，中英日韩泰全覆盖，1.5 元/千页；需上面填 DeepSeek Key，失败自动退回下面两个通道</div>
          </div>
          <div
            class="switch"
            :class="{ on: form.ocr.remote !== false }"
            @click="form.ocr.remote = form.ocr.remote === false"
          ></div>
        </div>

        <div class="toggle-row">
          <div>
            <div class="toggle-text">视觉模型直译（备用）</div>
            <div class="toggle-sub">截图直接交给视觉模型出译文，排版与语义最好；云端 OCR 不可用时使用</div>
          </div>
          <div class="switch" :class="{ on: form.ocr.useVision }" @click="form.ocr.useVision = !form.ocr.useVision"></div>
        </div>

        <div class="toggle-row">
          <div>
            <div class="toggle-text">本地 OCR 引擎（兜底）</div>
            <div class="toggle-sub">
              {{ meta.localOcr ? (isMac ? 'macOS Vision 已就绪（离线、免费）' : 'Windows 系统 OCR 已就绪') : '不可用：当前平台不支持本地 OCR' }}
              <template v-if="meta.ocrCapability && meta.ocrCapability.languages && meta.ocrCapability.languages.length">
                · 可识别 {{ meta.ocrCapability.languages.join(' / ') }}
              </template>
            </div>
          </div>
          <span class="badge" :class="meta.localOcr ? 'ok' : 'warn'">{{ meta.localOcr ? '可用' : '不可用' }}</span>
        </div>

        <div class="section-title">行为</div>

        <div class="toggle-row">
          <div class="toggle-text">输入后自动翻译</div>
          <div class="switch" :class="{ on: form.autoTranslate }" @click="form.autoTranslate = !form.autoTranslate"></div>
        </div>

        <div class="toggle-row">
          <div class="toggle-text">截图翻译后自动复制译文</div>
          <div class="switch" :class="{ on: form.autoCopy }" @click="form.autoCopy = !form.autoCopy"></div>
        </div>

        <div class="toggle-row">
          <div class="toggle-text">开机自动启动</div>
          <div class="switch" :class="{ on: form.launchAtLogin }" @click="form.launchAtLogin = !form.launchAtLogin"></div>
        </div>

        <div class="section-title">快捷键</div>

        <div class="hotkey-row">
          <span>截图翻译</span>
          <span class="kbd">{{ formatAccel(meta.hotkeys && meta.hotkeys.screenshot) }}</span>
        </div>
        <div class="hotkey-row">
          <span>翻译剪贴板内容</span>
          <span class="kbd">{{ formatAccel(meta.hotkeys && meta.hotkeys.clipboard) }}</span>
        </div>
        <div class="hotkey-row">
          <span>显示 / 隐藏主窗口</span>
          <span class="kbd">{{ formatAccel(meta.hotkeys && meta.hotkeys.toggleMain) }}</span>
        </div>

        <div class="section-title">关于</div>
        <div class="hotkey-row">
          <span>版本</span>
          <span style="font-size: 12px; color: var(--text-3)">v{{ meta.appVersion }} · Electron {{ meta.electron }}</span>
        </div>
        <div class="hotkey-row">
          <span>数据目录（设置与历史）</span>
          <button class="ghost-btn" @click="openDataDir">打开</button>
        </div>
      </div>

      <div class="modal-foot">
        <button class="pill-btn" @click="emit('close')">取消</button>
        <button class="pill-btn primary" @click="save">保存</button>
      </div>
    </div>
  </div>`
})
