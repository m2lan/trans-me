'use strict'

const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/** 打包后 native 资源位于 app.asar.unpacked，需修正路径 */
function unpacked(...segs) {
  const base = __dirname.includes('app.asar') ? __dirname.replace('app.asar', 'app.asar.unpacked') : __dirname
  return path.join(base, ...segs)
}

function run(cmd, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve(stdout)
    })
  })
}

function parsePayload(stdout) {
  const raw = String(stdout || '').trim()
  const last = raw.split('\n').filter(Boolean).pop() || ''
  let payload
  try {
    payload = JSON.parse(last)
  } catch {
    throw new Error('OCR 输出解析失败')
  }
  if (payload.error) throw new Error(payload.error)

  const source = Array.isArray(payload.lines) ? payload.lines : []
  const lines = source.map((l) => (typeof l === 'string' ? { text: l } : l || {}))

  // 归一化文字框（0~1，左上角原点）；有的平台给像素坐标，按图片尺寸折算
  const imgW = Number(payload.width) || 0
  const imgH = Number(payload.height) || 0
  const normalizeBox = (box) => {
    if (!box || typeof box !== 'object') return null
    let { x, y, w, h } = box
    if ([x, y, w, h].some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null
    // 像素坐标：x 超出 1 且已知图片宽度
    if (x > 1 && imgW > 0) {
      x /= imgW
      w /= imgW
    }
    if (y > 1 && imgH > 0) {
      y /= imgH
      h /= imgH
    }
    if (w <= 0 || h <= 0) return null
    const clamp = (v) => Math.min(1, Math.max(0, v))
    return {
      x: clamp(x),
      y: clamp(y),
      w: clamp(Math.min(w, 1 - clamp(x))),
      h: clamp(Math.min(h, 1 - clamp(y)))
    }
  }

  const segments = lines
    .map((l) => ({ text: String(l.text || '').trim(), box: normalizeBox(l.box) }))
    .filter((l) => l.text)

  const text = payload.text ? String(payload.text).trim() : segments.map((l) => l.text).join('\n')
  return { text, lines, segments, imageSize: { width: imgW, height: imgH } }
}

/* ------------------------------- macOS -------------------------------- */

async function ocrMac(imagePath) {
  const script = unpacked('..', 'native', 'ocr-mac.js')
  if (!fs.existsSync(script)) throw new Error('macOS OCR 脚本缺失')
  const stdout = await run('osascript', ['-l', 'JavaScript', script, imagePath], 30000)
  const parsed = parsePayload(stdout)
  return { ...parsed, engine: 'macOS Vision' }
}

/** macOS 12 只支持中英，13+ 起支持日韩 */
function macLanguages() {
  const major = Number(String(require('node:os').release()).split('.')[0])
  if (major >= 23) return ['zh-CN', 'en', 'ja', 'ko'] // macOS 14+
  if (major >= 21) return ['zh-CN', 'en'] // macOS 12~13
  return ['zh-CN', 'en']
}

/* ------------------------------- Windows ------------------------------- */

async function ocrWindows(imagePath) {
  const script = unpacked('..', 'native', 'ocr-windows.ps1')
  if (!fs.existsSync(script)) throw new Error('Windows OCR 脚本缺失')
  const stdout = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Path', imagePath],
    45000
  )
  const parsed = parsePayload(stdout)
  return { ...parsed, engine: 'Windows OCR' }
}

/**
 * 本地离线 OCR，返回 { text, lines, engine, languages }
 */
async function recognizeText(imagePath) {
  if (process.platform === 'darwin') return ocrMac(imagePath)
  if (process.platform === 'win32') return ocrWindows(imagePath)
  throw new Error(`当前平台（${process.platform}）暂不支持本地 OCR`)
}

/* ---------------------------- DeepSeek 云端 OCR --------------------------- */

/**
 * OCR 接口地址。官方 base_url 是 https://api.deepseek.com，
 * 接口固定为 /v1/tools/ocr；用户填了带 /v1 的地址也能自动纠正。
 */
function ocrEndpoint(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('未配置 API 地址')
  if (/\/v1\/tools\/ocr$/.test(base)) return base
  if (/\/v1$/.test(base)) return `${base}/tools/ocr`
  return `${base}/v1/tools/ocr`
}

/** 只有 DeepSeek 官方地址提供 /v1/tools/ocr，其它 OpenAI 兼容服务没有这个接口 */
function cloudOcrAvailable(llm) {
  if (!llm || !llm.apiKey) return false
  const base = String(llm.baseUrl || '')
  return /api\.deepseek\.com/i.test(base) || /\/v1\/tools\/ocr$/.test(base)
}

/**
 * 逐页识别的结果里混着版面标记，例如
 * <｜ref｜>标题<｜/ref｜><｜box｜>[[52, 40, 948, 96]]<｜/box｜>
 * 翻译前必须清掉，否则会把坐标当正文翻出去。
 */
function stripOcrMarkers(input) {
  return String(input || '')
    .replace(/<｜box｜>\s*\[\[[^\]]*\]\]\s*<｜\/box｜>/g, '')
    .replace(/<｜[^｜\n]{0,40}｜>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 从带版面标记的 OCR 文本里拆出「文字 + 位置框」。
 * 标记形如：<｜ref｜>标题<｜/ref｜><｜box｜>[[52, 40, 948, 96]]<｜/box｜>
 * 坐标是 0~1000 的归一化值，换算成 0~1 供前端叠加译文。
 */
function parseCloudSegments(rawText) {
  const raw = String(rawText || '')
  const segments = []
  const re = /<｜ref｜>([\s\S]*?)<｜\/ref｜>\s*<｜box｜>\s*\[\[([^\]]+)\]\]\s*<｜\/box｜>/g
  let m
  while ((m = re.exec(raw))) {
    const text = stripOcrMarkers(m[1])
    if (!text) continue
    const nums = m[2].split(',').map((v) => Number(String(v).trim()))
    let box = null
    if (nums.length >= 4 && nums.every((n) => Number.isFinite(n))) {
      const [x1, y1, x2, y2] = nums
      // 0~1000 归一化（也可能直接是 0~1）
      const unit = Math.max(x2, y2) > 1.5 ? 1000 : 1
      const x = x1 / unit
      const y = y1 / unit
      const w = (x2 - x1) / unit
      const h = (y2 - y1) / unit
      if (x >= -0.02 && y >= -0.02 && w > 0 && h > 0 && x < 1 && y < 1) {
        box = {
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y)),
          w: Math.min(0.98, w),
          h: Math.min(0.98, h)
        }
      }
    }
    segments.push({ text, box })
  }
  if (segments.length) return segments

  // 没有标记（例如 text_recognition 模式只回纯文本）就按行拆，不带位置框
  return stripOcrMarkers(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, box: null }))
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
}

/**
 * 云端 OCR：图片/PDF 上传 → 按页返回文字。
 * purpose=text_recognition 时图片逐页识别；计费 1.5 元/千页。
 * @returns {Promise<{text:string, pages:number, truncated:boolean, engine:string}>}
 */
async function recognizeCloud(filePath, { baseUrl, apiKey, purpose = 'text_recognition', timeout = 180000 } = {}) {
  if (!apiKey) throw new Error('未配置 API Key，云端 OCR 不可用')
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('当前运行时缺少 FormData/Blob，无法上传图片')
  }
  if (!fs.existsSync(filePath)) throw new Error('待识别文件不存在')
  const url = ocrEndpoint(baseUrl)
  const buf = fs.readFileSync(filePath)

  const form = new FormData()
  form.append('purpose', purpose)
  form.append(
    'file',
    new Blob([buf], { type: MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream' }),
    path.basename(filePath)
  )

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: ctrl.signal
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('云端 OCR 超时')
    throw new Error(`云端 OCR 请求失败：${err.message}`)
  } finally {
    clearTimeout(timer)
  }

  // 响应体前面会补换行保活，去掉后按 JSON 解析
  const raw = (await res.text()).trim()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`云端 OCR 返回异常（HTTP ${res.status}）`)
  }
  if (data && data.error) throw new Error(`云端 OCR：${data.error.message || '识别失败'}`)
  if (!res.ok) throw new Error(`云端 OCR HTTP ${res.status}：${raw.slice(0, 160)}`)

  const pages = Array.isArray(data.pages) ? data.pages : []
  const joined = pages.map((p) => p.text || '').join('\n')
  const text = stripOcrMarkers(joined)
  return {
    text,
    segments: parseCloudSegments(joined),
    pages: pages.length,
    truncated: pages.some((p) => p.finish_reason === 'length'),
    engine: 'DeepSeek OCR'
  }
}

/** 本地 OCR 能力描述，供界面提示 */
function ocrCapability() {
  if (process.platform === 'darwin') {
    return { available: true, languages: macLanguages(), engine: 'macOS Vision' }
  }
  if (process.platform === 'win32') {
    return { available: true, languages: ['zh-CN', 'en', 'ja', 'ko', 'th'], engine: 'Windows OCR' }
  }
  return { available: false, languages: [], engine: '' }
}

function localOcrAvailable() {
  return ocrCapability().available
}

module.exports = {
  recognizeText,
  localOcrAvailable,
  ocrCapability,
  recognizeCloud,
  cloudOcrAvailable,
  stripOcrMarkers,
  parseCloudSegments,
  ocrEndpoint,
  unpacked
}
