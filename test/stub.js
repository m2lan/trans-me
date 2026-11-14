'use strict'

/** 仅用于本地校验渲染层的探针：加载 dist/index.html，截图并输出控制台日志 */
const { contextBridge } = require('electron')

// 探针用的示例图片：沙箱化的 preload 不能 require('fs')，由主进程通过启动参数传入
let demoImage = ''
for (const arg of process.argv) {
  if (arg.startsWith('--demo-image=')) demoImage = arg.slice('--demo-image='.length)
}

const demoResult = {
  mode: 'overlay',
  overlay: true,
  provider: 'Bing',
  engine: 'macOS Vision',
  elapsed: 1800,
  text: '翻译测试：这是一段中文文字。\nHello world, this is a test.\n乙h(专(、亍又卜不寸。',
  translated: 'Translation test: this is a piece of Chinese text.\nHello world, this is a test.\nYi h (special (, but it does not exist.',
  segments: [
    {
      text: '翻译测试：这是一段中文文字。',
      translated: 'Translation test: this is a piece of Chinese text.',
      box: { x: 0.0423, y: 0.2233, w: 0.4982, h: 0.1083 }
    },
    {
      text: 'Hello world, this is a test.',
      translated: 'Hello world, this is a test.',
      box: { x: 0.043, y: 0.421, w: 0.436, h: 0.1 }
    },
    {
      text: '乙h(专(、亍又卜不寸。',
      translated: 'Yi h (special (, but it does not exist.',
      box: { x: 0.045, y: 0.598, w: 0.426, h: 0.106 }
    }
  ]
}

let openImageCb = null
let progressCb = null

const settings = {
  provider: 'auto',
  source: 'auto',
  target: 'zh-CN',
  autoTranslate: true,
  autoCopy: false,
  launchAtLogin: false,
  llm: { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-demo', model: 'deepseek-flash', visionModel: '', visionEnabled: true },
  ocr: { useVision: true, remote: true }
}

const history = [
  {
    id: '1',
    source: 'screenshot',
    from: 'en',
    to: 'zh-CN',
    original: 'Getting started with TransMe — press ⌘⇧T to capture any region of the screen.',
    translated: 'TransMe 上手指南 —— 按下 ⌘⇧T 即可框选屏幕任意区域。',
    provider: 'Bing',
    createdAt: Date.now() - 120000
  },
  {
    id: '2',
    source: 'text',
    from: 'zh-CN',
    to: 'en',
    original: '截图翻译比打开网页舒服太多了。',
    translated: 'Translating screenshots is far more comfortable than opening a web page.',
    provider: 'Bing',
    createdAt: Date.now() - 3600000
  }
]

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  init: async () => ({
    settings,
    history,
    favorites: [history[1]],
    localOcr: true,
    ocrCapability: { available: true, languages: ['zh-CN', 'en'], engine: 'macOS Vision' },
    hotkeys: {
      screenshot: 'CommandOrControl+Shift+T',
      clipboard: 'CommandOrControl+Shift+D',
      toggleMain: 'CommandOrControl+Shift+Space'
    },
    registered: { screenshot: true, clipboard: true, toggleMain: true },
    appVersion: '1.0.0',
    electron: process.versions.electron,
    platform3: 'darwin'
  }),
  translate: async () => ({ text: '示例译文', provider: 'Bing', detected: 'en' }),
  setSettings: async (p) => ({ ...settings, ...p }),
  getState: async () => ({ settings, history, favorites: [] }),
  toggleFavorite: async () => [],
  clearHistory: async () => [],
  removeHistory: async () => [],
  readClipboard: async () => '',
  copy: async () => true,
  speak: async () => true,
  stopSpeak: async () => true,
  startScreenshot: () => {},
  onPrefill: () => () => {},
  onHistoryUpdated: () => () => {},

  // 图片翻译
  pickImage: async () => (demoImage ? { dataUrl: demoImage, name: 'test-ocr.png' } : null),
  pasteImage: async () => (demoImage ? { dataUrl: demoImage, name: '剪贴板图片' } : null),
  translateImage: async (payload) => {
    progressCb && progressCb({ message: '正在翻译 3 行…' })
    return demoResult
  },
  onImageProgress: (cb) => {
    progressCb = cb
    return () => {}
  },
  onOpenImage: (cb) => {
    openImageCb = cb
    return () => {}
  },
  openImageInMain: () => {},
  __emitOpenImage: (payload) =>
    openImageCb && openImageCb({ ...(payload || {}), dataUrl: (payload && payload.dataUrl) || demoImage }),
  overlayImage: () => {},
  overlayReady: () => {},
  onOverlayInit: () => () => {},
  selectRegion: () => {},
  cancelOverlay: () => {},
  onPopupInit: () => () => {},
  onPopupResult: () => () => {},
  onPopupProgress: () => () => {},
  resizePopup: () => {},
  closePopup: () => {},
  window: { minimize: () => {}, maximize: () => {}, close: () => {} },
  openExternal: async () => {},
  openScreenPermission: async () => {},
  openUserData: async () => {},
  testEngine: async () => ({ text: '这是一只敏捷的棕色狐狸。', provider: 'Bing' })
})
