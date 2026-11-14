'use strict'

const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const FILE = () => path.join(app.getPath('userData'), 'store.json')

const DEFAULT_STATE = {
  settings: {
    provider: 'auto', // auto | free | llm
    llm: {
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-flash',
      visionModel: '',
      visionEnabled: true
    },
    // useVision：图片直译；remote：DeepSeek 云端 OCR（1.5 元/千页，支持日韩泰）
    ocr: { useVision: true, remote: true },
    source: 'auto',
    target: 'zh-CN',
    autoTranslate: true,
    autoCopy: false,
    launchAtLogin: false,
    hideOnBlur: false
  },
  history: [],
  favorites: []
}

let cache = null

function clone(v) {
  return JSON.parse(JSON.stringify(v))
}

function read() {
  if (cache) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8'))
    cache = {
      settings: { ...clone(DEFAULT_STATE.settings), ...(raw.settings || {}), llm: { ...DEFAULT_STATE.settings.llm, ...(raw.settings?.llm || {}) }, ocr: { ...DEFAULT_STATE.settings.ocr, ...(raw.settings?.ocr || {}) } },
      history: Array.isArray(raw.history) ? raw.history : [],
      favorites: Array.isArray(raw.favorites) ? raw.favorites : []
    }
  } catch {
    cache = clone(DEFAULT_STATE)
  }
  return cache
}

function write() {
  const data = read()
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error('[store] 写入失败', err.message)
  }
}

function getState() {
  return clone(read())
}

function setSettings(patch) {
  const state = read()
  state.settings = {
    ...state.settings,
    ...patch,
    llm: { ...state.settings.llm, ...(patch.llm || {}) },
    ocr: { ...state.settings.ocr, ...(patch.ocr || {}) }
  }
  write()
  return clone(state.settings)
}

function addHistory(item) {
  const state = read()
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: item.source || 'text',
    from: item.from || 'auto',
    to: item.to || 'zh-CN',
    original: String(item.original || '').slice(0, 8000),
    translated: String(item.translated || '').slice(0, 8000),
    provider: item.provider || '',
    createdAt: Date.now()
  }
  const last = state.history[0]
  if (last && last.original === entry.original && last.to === entry.to && last.translated === entry.translated) {
    return clone(entry)
  }
  state.history.unshift(entry)
  if (state.history.length > 300) state.history.length = 300
  write()
  return clone(entry)
}

function removeHistory(id) {
  const state = read()
  state.history = state.history.filter((h) => h.id !== id)
  write()
  return clone(state.history)
}

function clearHistory() {
  const state = read()
  state.history = []
  write()
  return []
}

function toggleFavorite(id) {
  const state = read()
  const existing = state.favorites.find((f) => f.id === id)
  if (existing) {
    state.favorites = state.favorites.filter((f) => f.id !== id)
  } else {
    const item = state.history.find((h) => h.id === id)
    if (item) state.favorites.unshift({ ...item })
  }
  write()
  return clone(state.favorites)
}

module.exports = {
  getState,
  setSettings,
  addHistory,
  removeHistory,
  clearHistory,
  toggleFavorite,
  DEFAULT_STATE
}
