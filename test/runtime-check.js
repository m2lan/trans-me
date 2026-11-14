'use strict'

/**
 * 校验 Electron 主进程运行时是否具备 FormData/Blob/fetch，
 * 并用无效 Key 打一次真实 OCR 接口，确认上传链路在 Electron 里也能走通。
 */
const { app } = require('electron')

app.whenReady().then(async () => {
  console.log('Electron', process.versions.electron, '/ Node', process.versions.node)
  console.log('typeof fetch   =', typeof fetch)
  console.log('typeof FormData=', typeof FormData)
  console.log('typeof Blob    =', typeof Blob)

  const { recognizeCloud, ocrEndpoint } = require('../electron/ocr')
  console.log('endpoint       =', ocrEndpoint('https://api.deepseek.com'))

  try {
    const r = await recognizeCloud('.tmp/test-ocr.png', {
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-invalid-probe-key'
    })
    console.log('结果 =', JSON.stringify(r).slice(0, 160))
  } catch (err) {
    console.log('错误 =', err.message)
  }
  app.exit(0)
})
