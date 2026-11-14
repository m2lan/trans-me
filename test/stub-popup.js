const { contextBridge, ipcRenderer } = require('electron')
let thumb = ''
for (const arg of process.argv) {
  if (arg.startsWith('--thumb=')) thumb = arg.slice('--thumb='.length)
}
contextBridge.exposeInMainWorld('api', {
  onPopupInit: (cb) => setTimeout(() => cb({ image: thumb, to: 'zh-CN', from: 'auto' }), 40),
  onPopupResult: (cb) => setTimeout(() => cb({
    original: 'TransMe is a lightweight translator for macOS and Windows. Press the shortcut to capture any region of the screen.',
    translated: 'TransMe 是一款适用于 macOS 和 Windows 的轻量级翻译器。按下快捷键即可捕捉屏幕上的任意区域。',
    provider: 'Bing', engine: 'macOS Vision', elapsed: 1284
  }), 700),
  onPopupProgress: () => () => {},
  resizePopup: (h) => ipcRenderer.send('noop', h),
  copy: async () => true,
  speak: async () => true,
  closePopup: () => {}
})