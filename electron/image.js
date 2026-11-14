'use strict'

/**
 * 图片翻译流水线（拖图 / 上传 / 粘贴 都走这里）
 *
 * 图片 → OCR（本地 Vision 优先带位置框 / 云端 / 视觉模型）→ 逐行翻译
 * → 返回 { segments:[{text, translated, box}], translated, ... }
 * box 是归一化坐标（0~1，左上角原点），前端据此把译文叠回原图位置。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { recognizeText, recognizeCloud, localOcrAvailable, cloudOcrAvailable } = require('./ocr')
const { translateText, translateImageWithVision } = require('./translate')

const TMP = () => path.join(os.tmpdir(), 'transme')

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tif'
}

/** dataURL → 临时文件，返回路径；调用方负责删除 */
function writeTempImage(dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || ''))
  if (!m) throw new Error('图片数据格式不正确')
  const ext = EXT_BY_MIME[m[1].toLowerCase()] || 'png'
  fs.mkdirSync(TMP(), { recursive: true })
  const file = path.join(TMP(), `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`)
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
  return file
}

/** 限制并发地跑一批任务 */
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return out
}

/* ------------------------------- OCR ------------------------------- */

/**
 * 识别图片文字，返回带位置框的分段。
 * 顺序：云端 OCR（配了 Key 且开启）→ 本地离线 OCR → 视觉模型直译（只出整段译文）
 */
async function recognizeSegments(file, settings, onProgress) {
  const failures = []

  const cloudPossible =
    settings.ocr?.remote !== false && settings.provider !== 'free' && cloudOcrAvailable(settings.llm)

  if (cloudPossible) {
    try {
      onProgress?.('云端 OCR 识别中…')
      const r = await recognizeCloud(file, { baseUrl: settings.llm.baseUrl, apiKey: settings.llm.apiKey })
      if (r.segments?.length) {
        return {
          segments: r.segments,
          engine: r.engine,
          imageSize: null,
          hasBoxes: r.segments.some((s) => s.box)
        }
      }
      failures.push('云端 OCR 未识别到文字')
    } catch (err) {
      failures.push(`云端 OCR：${err.message}`)
    }
  }

  if (localOcrAvailable()) {
    try {
      onProgress?.('本地 OCR 识别中…')
      const r = await recognizeText(file)
      if (r.segments?.length) {
        return {
          segments: r.segments,
          engine: r.engine,
          imageSize: r.imageSize,
          hasBoxes: r.segments.some((s) => s.box)
        }
      }
      failures.push('本地 OCR 未识别到文字')
    } catch (err) {
      failures.push(`本地 OCR：${err.message}`)
    }
  }

  return { segments: [], engine: '', imageSize: null, hasBoxes: false, failures }
}

/* ----------------------------- 逐行翻译 ---------------------------- */

/**
 * 整段先翻一次（省调用、上下文连贯），行数对不上再逐行补。
 * 返回 { parts: string[] | null, block: string, provider, detected }
 */
async function translateLines(texts, from, to, settings, detectedHint) {
  const whole = texts.join('\n')
  const first = await translateText({ text: whole, from, to, settings })
  const block = String(first.text || '').trim()
  const detected = first.detected || detectedHint || 'auto'

  const split = block
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  if (split.length === texts.length) {
    return { parts: split, block, provider: first.provider, detected }
  }

  // 行数不一致：逐行翻（少量行时才值得，避免打爆接口）
  if (texts.length > 1 && texts.length <= 40) {
    const parts = await mapLimit(texts, 4, async (t) => {
      try {
        const r = await translateText({ text: t, from: detected === 'auto' ? 'auto' : detected, to, settings })
        return String(r.text || '').trim()
      } catch {
        return ''
      }
    })
    const filled = parts.filter(Boolean).length
    if (filled >= Math.ceil(texts.length * 0.6)) {
      return { parts, block, provider: first.provider, detected }
    }
  }

  return { parts: null, block, provider: first.provider, detected }
}

/* ----------------------------- 对外入口 ---------------------------- */

/**
 * @param {object} opts
 * @param {string} opts.dataUrl  图片 dataURL
 * @param {string} opts.from     源语言
 * @param {string} opts.to       目标语言
 * @param {object} opts.settings 设置
 * @param {(msg:string)=>void} [opts.onProgress]
 */
async function translateImage({ dataUrl, from = 'auto', to = 'zh-CN', settings = {}, onProgress }) {
  const started = Date.now()
  const file = writeTempImage(dataUrl)
  let recognized
  try {
    recognized = await recognizeSegments(file, settings, onProgress)
  } finally {
    fs.unlink(file, () => {})
  }

  if (!recognized.segments.length) {
    // 本地/云端都没结果，最后试视觉模型直译（只有整段译文，没有位置框）
    const visionPossible =
      settings.ocr?.useVision !== false &&
      settings.llm?.visionEnabled !== false &&
      (settings.llm?.apiKey || /localhost|127\.0\.0\.1/.test(settings.llm?.baseUrl || '')) &&
      settings.provider !== 'free'
    if (visionPossible) {
      onProgress?.('视觉模型直译中…')
      const r = await translateImageWithVision(dataUrl, from, to, settings.llm)
      return {
        mode: 'block',
        segments: [],
        text: r.original || '',
        translated: r.text || '',
        provider: '视觉模型',
        engine: 'Vision LLM',
        overlay: false,
        elapsed: Date.now() - started
      }
    }
    const detail = (recognized.failures || []).join('；')
    throw new Error(
      detail
        ? `没有识别到文字（${detail}）。换张清晰一点的图，或在设置里配置云端 OCR / 视觉模型。`
        : '没有识别到文字，换张清晰一点的图试试'
    )
  }

  const segments = recognized.segments
  onProgress?.(`正在翻译 ${segments.length} 行…`)

  const { parts, block, provider, detected } = await translateLines(
    segments.map((s) => s.text),
    from,
    to,
    settings
  )

  const result = segments.map((s, i) => ({
    text: s.text,
    translated: parts ? parts[i] || '' : '',
    box: s.box || null
  }))

  const overlay = Boolean(recognized.hasBoxes && parts && result.every((s) => s.box))

  return {
    mode: overlay ? 'overlay' : 'text',
    segments: result,
    text: segments.map((s) => s.text).join('\n'),
    translated: parts ? result.map((s) => s.translated).join('\n') : block,
    provider,
    engine: recognized.engine,
    detected,
    imageSize: recognized.imageSize,
    overlay,
    elapsed: Date.now() - started
  }
}

module.exports = { translateImage, writeTempImage, recognizeSegments, translateLines }
