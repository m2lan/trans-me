import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from '../vendor/vue.esm-browser.prod.js'

/**
 * 图片翻译面板：拖放 / 浏览文件 / 从剪贴板粘贴 → 识别 → 译文叠加回原图
 * 与 Google 翻译「图片」一致的心智：给张图，直接看结果，不用先框选。
 */
export default defineComponent({
  name: 'ImagePane',
  props: {
    settings: { type: Object, required: true },
    isMac: { type: Boolean, default: false },
    request: { type: Object, default: null } // { dataUrl, from, to, nonce } 来自截图浮窗
  },
  emits: ['toast', 'activate'],
  setup(props, { emit }) {
    const image = ref('')
    const imageName = ref('')
    const loading = ref(false)
    const progress = ref('')
    const error = ref('')
    const result = ref(null)
    const dragging = ref(false)
    const showOverlay = ref(true)
    const imgEl = ref(null)
    const stageEl = ref(null)
    const renderedH = ref(0)
    const boxSize = ref({ w: 0, h: 0 })
    const fitSizes = ref([])
    const activeSeg = ref(-1)
    const paneEl = ref(null)

    let seq = 0
    let resizeObserver = null
    let lastRequestNonce = 0

    const segments = computed(() => (result.value && result.value.segments) || [])
    const hasResult = computed(() => Boolean(result.value && result.value.translated))
    const overlayReady = computed(() => Boolean(result.value && result.value.overlay && renderedH.value > 0))
    const shownImage = computed(() => image.value)
    const holderStyle = computed(() => ({
      width: boxSize.value.w ? `${boxSize.value.w}px` : 'auto',
      height: boxSize.value.h ? `${boxSize.value.h}px` : 'auto'
    }))

    const pct = (v) => `${(v * 100).toFixed(3)}%`

    function boxStyle(seg) {
      if (!seg || !seg.box) return { display: 'none' }
      const idx = segments.value.indexOf(seg)
      const fitted = idx >= 0 ? fitSizes.value[idx] : 0
      const fontSize = fitted || Math.min(36, Math.max(9, seg.box.h * renderedH.value * 0.6))
      return {
        left: pct(seg.box.x),
        top: pct(seg.box.y),
        width: pct(seg.box.w),
        height: pct(seg.box.h),
        fontSize: `${fontSize.toFixed(1)}px`
      }
    }

    /** 按舞台尺寸等比算出图片实际渲染大小，译文框用百分比定位才不会错位 */
    function measure() {
      const stage = stageEl.value
      const img = imgEl.value
      if (!stage || !img) return
      const nw = img.naturalWidth || img.width
      const nh = img.naturalHeight || img.height
      if (!nw || !nh) return
      const availW = Math.max(40, stage.clientWidth - 24)
      const availH = Math.max(40, stage.clientHeight - 24)
      const scale = Math.min(availW / nw, availH / nh)
      boxSize.value = { w: Math.round(nw * scale), h: Math.round(nh * scale) }
      renderedH.value = boxSize.value.h
      computeFits()
    }

    /* 让译文塞进原始文字框：按可用宽高反推字号，避免被裁掉半行 */
    let textCtx = null
    function ctx2d() {
      if (!textCtx) {
        const canvas = document.createElement('canvas')
        textCtx = canvas.getContext('2d')
      }
      return textCtx
    }

    function fitFontSize(text, boxWpx, boxHpx) {
      if (!text) return 12
      const ctx = ctx2d()
      const family = getComputedStyle(document.body).fontFamily || 'sans-serif'
      const pad = 6
      const usableW = Math.max(8, boxWpx - pad)
      let fs = Math.min(36, Math.max(8, boxHpx * 0.62))
      for (let i = 0; i < 5; i++) {
        ctx.font = `400 ${fs}px ${family}`
        const lines = Math.max(1, Math.ceil(ctx.measureText(text).width / usableW))
        const needH = lines * fs * 1.18
        if (needH <= boxHpx) break
        fs = Math.max(7, fs * Math.min(0.94, boxHpx / needH))
        if (fs <= 7) break
      }
      return fs
    }

    function computeFits() {
      const list = segments.value
      if (!list.length || !boxSize.value.w) {
        fitSizes.value = []
        return
      }
      fitSizes.value = list.map((seg) => {
        if (!seg.box) return 0
        return fitFontSize(
          seg.translated || seg.text || '',
          seg.box.w * boxSize.value.w,
          seg.box.h * boxSize.value.h
        )
      })
    }

    function reset() {
      image.value = ''
      imageName.value = ''
      result.value = null
      error.value = ''
      progress.value = ''
      loading.value = false
      renderedH.value = 0
      boxSize.value = { w: 0, h: 0 }
      fitSizes.value = []
      activeSeg.value = -1
    }

    async function runTranslate() {
      if (!image.value) return
      const id = ++seq
      loading.value = true
      error.value = ''
      progress.value = '正在识别图片…'
      const startedAt = Date.now()
      try {
        const r = await window.api.translateImage({
          dataUrl: image.value,
          from: props.settings.source,
          to: props.settings.target
        })
        if (id !== seq) return
        result.value = { ...r, cost: Date.now() - startedAt }
        showOverlay.value = Boolean(r.overlay)
        await nextTick()
        measure()
      } catch (err) {
        if (id !== seq) return
        error.value = String((err && err.message) || err).replace(
          /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
          ''
        )
        result.value = null
      } finally {
        if (id === seq) loading.value = false
        progress.value = ''
      }
    }

    async function loadDataUrl(dataUrl, name) {
      if (!dataUrl) return
      reset()
      image.value = dataUrl
      imageName.value = name || ''
      emit('activate')
      await runTranslate()
    }

    async function pick() {
      try {
        const r = await window.api.pickImage()
        if (r && r.dataUrl) await loadDataUrl(r.dataUrl, r.name)
      } catch (err) {
        emit('toast', String((err && err.message) || err))
      }
    }

    async function paste() {
      try {
        const r = await window.api.pasteImage()
        if (!r || !r.dataUrl) {
          emit('toast', '剪贴板里没有图片')
          return
        }
        await loadDataUrl(r.dataUrl, r.name)
      } catch (err) {
        emit('toast', String((err && err.message) || err))
      }
    }

    function readFile(file) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\//.test(file.type || '')) return reject(new Error('不是图片文件'))
        if (file.size > 24 * 1024 * 1024) return reject(new Error('图片太大（超过 24MB）'))
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
    }

    async function onDrop(e) {
      dragging.value = false
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
      if (!files.length) return
      if (files.length > 1) emit('toast', '一次翻一张，已取第一张')
      try {
        const dataUrl = await readFile(files[0])
        await loadDataUrl(dataUrl, files[0].name)
      } catch (err) {
        emit('toast', err.message)
      }
    }

    function onDragOver(e) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      dragging.value = true
    }

    function onDragLeave() {
      dragging.value = false
    }

    async function copyAll() {
      if (!result.value || !result.value.translated) return
      await window.api.copy(result.value.translated)
      emit('toast', '译文已复制')
    }

    async function copySeg(seg) {
      if (!seg || !seg.translated) return
      await window.api.copy(seg.translated)
      emit('toast', '已复制该行')
    }

    function speak() {
      if (!result.value || !result.value.translated) return
      window.api.speak({ text: result.value.translated, lang: props.settings.target })
    }

    async function onPasteShortcut(e) {
      const mod = window.api.platform === 'darwin' ? e.metaKey : e.ctrlKey
      if (!mod || e.key.toLowerCase() !== 'v') return
      const el = document.activeElement
      const editable = el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
      const visible = paneEl.value && paneEl.value.offsetParent !== null
      // 正在文本框里输入时让文本粘贴照常工作；图片页可见时优先贴图
      if (editable && !visible) return
      e.preventDefault()
      await paste()
    }

    onMounted(() => {
      window.addEventListener('paste', onPasteShortcut)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => measure())
        if (stageEl.value) resizeObserver.observe(stageEl.value)
      }
      if (props.request && props.request.dataUrl) {
        lastRequestNonce = props.request.nonce || 0
        loadDataUrl(props.request.dataUrl, props.request.name)
      }
    })

    onBeforeUnmount(() => {
      window.removeEventListener('paste', onPasteShortcut)
      if (resizeObserver) resizeObserver.disconnect()
    })

    // 截图浮窗带过来的图
    watch(
      () => props.request,
      (req) => {
        if (!req || !req.dataUrl) return
        if ((req.nonce || 0) === lastRequestNonce) return
        lastRequestNonce = req.nonce || 0
        loadDataUrl(req.dataUrl, req.name)
      }
    )

    // 切换目标语言后自动重翻
    watch(
      () => [props.settings.source, props.settings.target].join('|'),
      () => {
        if (image.value && !loading.value && result.value) runTranslate()
      }
    )

    return {
      isMac: props.isMac,
      image,
      imageName,
      loading,
      progress,
      error,
      result,
      dragging,
      showOverlay,
      segments,
      hasResult,
      overlayReady,
      shownImage,
      imgEl,
      stageEl,
      holderStyle,
      renderedH,
      fitSizes,
      activeSeg,
      paneEl,
      boxStyle,
      measure,
      reset,
      runTranslate,
      loadDataUrl,
      pick,
      paste,
      onDrop,
      onDragOver,
      onDragLeave,
      copyAll,
      copySeg,
      speak
    }
  },
  template: `
  <div class="image-pane" ref="paneEl" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">

    <!-- 空状态：拖放 + 两个入口 -->
    <div v-if="!image" class="image-empty" :class="{ 'is-drag': dragging }">
      <div class="dz" @click="pick">
        <svg viewBox="0 0 120 96" class="dz-art" fill="none" aria-hidden="true">
          <path d="M92 74H30a16 16 0 01-2-31.9A22 22 0 0171.5 36 15 15 0 0192 50.4 12 12 0 0192 74z" fill="currentColor" opacity=".16"/>
          <path d="M60 66V34M60 34l-9 9M60 34l9 9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="dz-title">拖放图片到这里</div>
        <div class="dz-sub">网页截图、PDF、视频字幕、菜单、报错弹窗都行</div>
      </div>

      <div class="dz-side">
        <div class="dz-side-title">或选择一个文件</div>
        <button class="btn-primary" @click.stop="pick">浏览文件</button>
        <button class="btn-ghost" @click.stop="paste">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="2.5" width="10" height="11.5" rx="1.6"/>
            <path d="M6 2.5V2a1 1 0 011-1h2a1 1 0 011 1v.5"/>
          </svg>
          从剪贴板粘贴
        </button>
        <div class="dz-note">支持 jpg / jpeg / png / webp<br/>也可以直接按 {{ isMac ? '⌘V' : 'Ctrl+V' }}</div>
      </div>
    </div>

    <!-- 已载入图片 -->
    <div v-else class="image-work">
      <div class="stage" ref="stageEl">
        <div class="img-holder" :style="holderStyle">
          <img ref="imgEl" :src="shownImage" alt="" @load="measure" />

          <template v-if="showOverlay && overlayReady">
            <div
              v-for="(seg, i) in segments"
              :key="i"
              class="ov-box"
              :class="{ hot: activeSeg === i }"
              :style="boxStyle(seg)"
              @mouseenter="activeSeg = i"
              @mouseleave="activeSeg = -1"
            >
              <span>{{ seg.translated }}</span>
            </div>
          </template>

          <div v-if="loading" class="stage-mask">
            <div class="spinner"></div>
            <div class="mask-text">{{ progress || '处理中…' }}</div>
          </div>
        </div>
      </div>

      <aside class="image-side">
        <div class="side-head">
          <span class="side-title">识别与译文</span>
          <div class="spacer"></div>
          <span v-if="result && result.engine" class="badge gray">{{ result.engine }}</span>
        </div>

        <div class="side-body">
          <div v-if="error" class="side-error">
            <div>{{ error }}</div>
            <button class="ghost-btn" @click="runTranslate">重试</button>
          </div>

          <div v-else-if="loading" class="side-loading">
            <div class="sk-line" style="width: 70%"></div>
            <div class="sk-line" style="width: 92%"></div>
            <div class="sk-line" style="width: 58%"></div>
          </div>

          <template v-else-if="hasResult">
            <label v-if="result.overlay" class="ov-toggle">
              <span class="switch" :class="{ on: showOverlay }" @click="showOverlay = !showOverlay"></span>
              <span>译文叠在图上</span>
            </label>

            <div v-if="segments.length" class="seg-list">
              <div
                v-for="(seg, i) in segments"
                :key="i"
                class="seg"
                :class="{ hot: activeSeg === i }"
                @mouseenter="activeSeg = i"
                @mouseleave="activeSeg = -1"
                @click="copySeg(seg)"
                title="点击复制该行译文"
              >
                <div class="seg-src">{{ seg.text }}</div>
                <div class="seg-dst">{{ seg.translated || '—' }}</div>
              </div>
            </div>

            <div v-else class="block-text">{{ result.translated }}</div>
          </template>

          <div v-else class="side-empty">译文会出现在这里</div>
        </div>

        <div class="side-foot">
          <button class="ghost-btn" :disabled="!hasResult" @click="copyAll">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5"/>
              <path d="M10.5 5.5V3.9a1.4 1.4 0 00-1.4-1.4H3.9A1.4 1.4 0 002.5 3.9v5.2a1.4 1.4 0 001.4 1.4h1.6"/>
            </svg>
            复制
          </button>
          <button class="ghost-btn" :disabled="!hasResult" @click="speak">朗读</button>
          <div class="spacer"></div>
          <button class="ghost-btn" @click="reset">换一张</button>
        </div>
      </aside>
    </div>
  </div>`
})
