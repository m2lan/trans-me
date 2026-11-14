'use strict'

/** 仅用于本地校验渲染层的探针：加载 dist/index.html，截图并输出控制台日志 */
const { contextBridge } = require('electron')

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
