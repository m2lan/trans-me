'use strict'

/**
 * 校验配置读写链路：默认值 → 局部更新（ocr.remote / llm.model）→ 落盘 → 重启后仍保留。
 * 用独立 user-data-dir 跑，避免污染真实设置。
 */
const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.setPath('userData', path.join(__dirname, '..', '.tmp', 'ud-store-test'))

app.whenReady().then(() => {
  const store = require('../electron/store')

  const initial = store.getState().settings
  console.log('DEFAULT llm.baseUrl =', initial.llm.baseUrl)
  console.log('DEFAULT llm.model   =', initial.llm.model)
  console.log('DEFAULT ocr         =', JSON.stringify(initial.ocr))

  // 模拟设置弹窗保存时只带 ocr.remote，不应冲掉 useVision
  store.setSettings({ ocr: { remote: false } })
  console.log('AFTER patch ocr     =', JSON.stringify(store.getState().settings.ocr))

  store.setSettings({ llm: { model: 'deepseek-flash', apiKey: 'sk-test' } })
  const saved = store.getState().settings
  console.log('AFTER patch llm     =', saved.llm.model, '/ baseUrl 保留 =', saved.llm.baseUrl)

  const onDisk = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'store.json'), 'utf8'))
  console.log('ON DISK ocr.remote  =', onDisk.settings.ocr.remote, '/ ocr.useVision =', onDisk.settings.ocr.useVision)
  console.log('ON DISK llm.model   =', onDisk.settings.llm.model)
  app.exit(0)
})
