'use strict'

/** 菜单栏小面板探针用的假 API */
const { contextBridge } = require('electron')

const settings = { source: 'auto', target: 'zh-CN', provider: 'auto' }

const samples = {
  'hello': '你好',
  'Good morning, how are you today?': '早上好，你今天怎么样？'
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  init: async () => ({ settings, history: [], favorites: [] }),
  translate: async ({ text }) => {
    await new Promise((r) => setTimeout(r, 260))
    return {
      text: samples[text] || `【译文】${text}`,
      provider: 'Bing',
      detected: 'en'
    }
  },
  setSettings: async (p) => Object.assign(settings, p),
  getState: async () => ({ settings, history: [], favorites: [] }),
  copy: async () => true,
  speak: async () => true,
  startScreenshot: () => {},
  tray: {
    hide: () => {},
    resize: (h) => {
      window.__lastHeight = h
    },
    openMain: () => {},
    onShown: (cb) => {
      window.__onShown = cb
      return () => {}
    }
  }
})
