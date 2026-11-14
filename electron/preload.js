'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const subscribe = (channel) => (cb) => {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  init: () => ipcRenderer.invoke('app:init'),
  translate: (payload) => ipcRenderer.invoke('translate:text', payload),

  setSettings: (patch) => ipcRenderer.invoke('store:set-settings', patch),
  getState: () => ipcRenderer.invoke('store:get'),
  toggleFavorite: (id) => ipcRenderer.invoke('store:toggle-favorite', id),
  clearHistory: () => ipcRenderer.invoke('store:clear-history'),
  removeHistory: (id) => ipcRenderer.invoke('store:remove-history', id),

  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),

  speak: (payload) => ipcRenderer.invoke('tts:speak', payload),
  stopSpeak: () => ipcRenderer.invoke('tts:stop'),

  startScreenshot: () => ipcRenderer.send('screen:start'),
  onPrefill: subscribe('app:prefill'),
  onHistoryUpdated: subscribe('app:history-updated'),

  // 图片翻译（拖图 / 上传 / 粘贴）
  pickImage: () => ipcRenderer.invoke('image:pick'),
  pasteImage: () => ipcRenderer.invoke('image:paste'),
  translateImage: (payload) => ipcRenderer.invoke('image:translate', payload),
  onImageProgress: subscribe('image:progress'),
  onOpenImage: subscribe('app:open-image'),
  openImageInMain: (payload) => ipcRenderer.send('image:open-in-main', payload),

  // 截图遮罩层
  testEngine: (payload) => ipcRenderer.invoke('app:test-engine', payload),

  overlayImage: () => ipcRenderer.send('overlay:request-image'),
  overlayReady: () => ipcRenderer.send('overlay:ready'),
  onOverlayInit: subscribe('overlay:init'),
  selectRegion: (rect) => ipcRenderer.send('overlay:select', rect),
  cancelOverlay: () => ipcRenderer.send('overlay:cancel'),

  // 结果浮窗
  onPopupInit: subscribe('popup:init'),
  onPopupResult: subscribe('popup:result'),
  onPopupProgress: subscribe('popup:progress'),
  resizePopup: (height) => ipcRenderer.send('popup:resize', height),
  closePopup: () => ipcRenderer.send('popup:close'),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openScreenPermission: () => ipcRenderer.invoke('app:open-screen-permission'),
  openUserData: () => ipcRenderer.invoke('app:open-userdata')
})
