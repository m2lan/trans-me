const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  onPopupInit: (cb) => setTimeout(() => cb({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', to: 'zh-CN', from: 'auto' }), 30),
  onPopupResult: (cb) => setTimeout(() => cb({
    original: 'Getting started — press ⌘⇧T to capture any region.',
    translated: '上手指南 —— 按下 ⌘⇧T 即可框选任意区域。',
    provider: 'Bing', engine: 'macOS Vision', elapsed: 1234
  }), 600),
  onPopupProgress: () => () => {},
  resizePopup: (h) => ipcRenderer.send('noop', h),
  copy: async () => true,
  speak: async () => true,
  closePopup: () => {}
})