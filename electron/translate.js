'use strict'

/**
 * 翻译引擎：双通道
 *  - free : 公开免费接口，按 Bing → Google → MyMemory 顺序自动降级
 *  - llm  : OpenAI 兼容的 Chat Completions（DeepSeek / 通义 / Moonshot / 本地 Ollama…）
 */

const LANG_NAME = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  th: 'ไทย'
}

const CODE_MAP = {
  bing: { 'zh-CN': 'zh-Hans', en: 'en', ja: 'ja', ko: 'ko', th: 'th' },
  google: { 'zh-CN': 'zh-CN', en: 'en', ja: 'ja', ko: 'ko', th: 'th' },
  mymemory: { 'zh-CN': 'zh-CN', en: 'en', ja: 'ja-JP', ko: 'ko-KR', th: 'th-TH' }
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const MAX_CHUNK = 1500

function normalizeLang(code) {
  if (!code) return 'auto'
  const c = String(code).toLowerCase()
  if (c.startsWith('zh')) return 'zh-CN'
  if (c.startsWith('en')) return 'en'
  if (c.startsWith('ja')) return 'ja'
  if (c.startsWith('ko')) return 'ko'
  if (c.startsWith('th')) return 'th'
  return code
}

/** 按段落 / 句子切分，避免超出接口长度限制 */
function chunkText(text, limit = MAX_CHUNK) {
  if (text.length <= limit) return [text]
  const out = []
  let buf = ''
  const push = () => {
    if (buf.trim()) out.push(buf)
    buf = ''
  }
  const units = text.split(/(?<=[\n。！？!?；;])/)
  for (const u of units) {
    if (u.length > limit) {
      push()
      for (let i = 0; i < u.length; i += limit) out.push(u.slice(i, i + limit))
      continue
    }
    if ((buf + u).length > limit) push()
    buf += u
  }
  push()
  return out.length ? out : [text]
}

async function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------- Bing 网页版 ------------------------------ */

const BING_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let bingWeb = { ig: '', token: '', key: '', host: 'https://cn.bing.com', exp: 0 }

async function refreshBingWeb() {
  const hosts = ['https://cn.bing.com', 'https://www.bing.com']
  let lastError = null
  for (const host of hosts) {
    try {
      const res = await withTimeout(
        fetch(`${host}/translator`, { headers: { 'User-Agent': BING_UA } }),
        10000,
        'Bing 网页'
      )
      if (!res.ok) throw new Error(`状态 ${res.status}`)
      const html = await res.text()
      const ig = /IG:"([^"]+)"/.exec(html)?.[1]
      const helper = /params_AbusePreventionHelper\s*=\s*(\[[^\]]*\])/.exec(html)?.[1]
      if (!ig || !helper) throw new Error('未取到会话令牌')
      const arr = JSON.parse(helper)
      bingWeb = {
        ig,
        host,
        // 注意：Bing 的 token / key 与数组顺序相反
        token: String(arr[1]),
        key: String(arr[0]),
        exp: Date.now() + 8 * 60 * 1000
      }
      return bingWeb
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`Bing 会话建立失败（${lastError?.message || '未知'}）`)
}

function bingWebCode(lang) {
  if (lang === 'auto') return 'auto-detect'
  return CODE_MAP.bing[lang] || lang
}

async function bingWebTranslate(text, from, to, retry = true) {
  if (!bingWeb.ig || Date.now() > bingWeb.exp) await refreshBingWeb()
  const body = new URLSearchParams({
    fromLang: bingWebCode(from),
    to: CODE_MAP.bing[to] || to,
    text,
    token: bingWeb.token,
    key: bingWeb.key
  })
  const res = await withTimeout(
    fetch(`${bingWeb.host}/ttranslatev3?isVertical=1&&IG=${bingWeb.ig}&IID=translator.5028.1`, {
      method: 'POST',
      headers: {
        'User-Agent': BING_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${bingWeb.host}/translator`
      },
      body: body.toString()
    }),
    15000,
    'Bing 网页翻译'
  )
  const raw = await res.text()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('Bing 返回内容异常')
  }
  if (data?.statusCode === 205 || data?.statusCode === 401) {
    if (retry) {
      bingWeb.ig = ''
      return bingWebTranslate(text, from, to, false)
    }
    throw new Error('Bing 会话失效')
  }
  const item = Array.isArray(data) ? data[0] : null
  const translated = item?.translations?.[0]?.text
  if (!translated) throw new Error('Bing 未返回译文')
  return {
    text: translated,
    detected: normalizeLang(item.detectedLanguage?.language)
  }
}

/* ---------------------------------- Bing ---------------------------------- */

let bingToken = { value: '', exp: 0 }

async function getBingToken() {
  if (bingToken.value && Date.now() < bingToken.exp) return bingToken.value
  const res = await withTimeout(
    fetch('https://edge.microsoft.com/translate/auth', {
      headers: { 'User-Agent': UA }
    }),
    8000,
    'Bing 鉴权'
  )
  if (!res.ok) throw new Error(`Bing 鉴权失败 ${res.status}`)
  const token = (await res.text()).trim()
  if (!token) throw new Error('Bing 鉴权返回为空')
  // JWT 有效期 10 分钟，这里保守取 8 分钟
  bingToken = { value: token, exp: Date.now() + 8 * 60 * 1000 }
  return token
}

async function bingTranslate(text, from, to) {
  const token = await getBingToken()
  const params = new URLSearchParams({ 'api-version': '3.0', to: CODE_MAP.bing[to] || to })
  if (from !== 'auto') params.set('from', CODE_MAP.bing[from] || from)
  const res = await withTimeout(
    fetch(`https://api-edge.cognitive.microsofttranslator.com/translate?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': UA
      },
      body: JSON.stringify([{ Text: text }])
    }),
    15000,
    'Bing 翻译'
  )
  if (!res.ok) throw new Error(`Bing 翻译失败 ${res.status}`)
  const data = await res.json()
  const item = Array.isArray(data) ? data[0] : null
  if (!item?.translations?.[0]?.text) throw new Error('Bing 返回结构异常')
  return {
    text: item.translations[0].text,
    detected: normalizeLang(item.detectedLanguage?.language)
  }
}

/* --------------------------------- Google --------------------------------- */

async function googleTranslate(text, from, to) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from === 'auto' ? 'auto' : CODE_MAP.google[from] || from,
    tl: CODE_MAP.google[to] || to,
    dt: 't',
    q: text
  })
  const res = await withTimeout(
    fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
      headers: { 'User-Agent': UA }
    }),
    12000,
    'Google 翻译'
  )
  if (!res.ok) throw new Error(`Google 翻译失败 ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data?.[0])) throw new Error('Google 返回结构异常')
  const text2 = data[0].map((seg) => seg?.[0] || '').join('')
  return { text: text2, detected: normalizeLang(data[2]) }
}

/* -------------------------------- MyMemory -------------------------------- */

async function mymemoryTranslate(text, from, to) {
  const src = from === 'auto' ? 'zh-CN' : CODE_MAP.mymemory[from] || from
  const params = new URLSearchParams({
    q: text,
    langpair: `${src}|${CODE_MAP.mymemory[to] || to}`
  })
  const res = await withTimeout(
    fetch(`https://api.mymemory.translated.net/get?${params}`, { headers: { 'User-Agent': UA } }),
    12000,
    'MyMemory 翻译'
  )
  if (!res.ok) throw new Error(`MyMemory 翻译失败 ${res.status}`)
  const data = await res.json()
  const t = data?.responseData?.translatedText
  if (!t || /MYMEMORY WARNING/i.test(t)) throw new Error('MyMemory 配额或语言不支持')
  return { text: t, detected: from }
}

const FREE_CHAIN = [
  { name: 'bing-web', label: 'Bing', run: bingWebTranslate },
  { name: 'bing-api', label: 'Bing API', run: bingTranslate },
  { name: 'google', label: 'Google', run: googleTranslate },
  { name: 'mymemory', label: 'MyMemory', run: mymemoryTranslate }
]

async function translateFree(text, from, to) {
  const pieces = chunkText(text, 1200)
  const errors = []
  for (const provider of FREE_CHAIN) {
    try {
      const parts = []
      let detected = from
      for (const piece of pieces) {
        const r = await provider.run(piece, from, to)
        parts.push(r.text)
        if (r.detected && r.detected !== 'auto') detected = r.detected
      }
      return { text: parts.join(''), detected, provider: provider.label }
    } catch (err) {
      errors.push(`${provider.label}: ${err.message}`)
    }
  }
  throw new Error(`免费接口均不可用（${errors.join('；')}）`)
}

/* ----------------------------------- LLM ---------------------------------- */

function buildSystemPrompt(target, source) {
  const t = LANG_NAME[target] || target
  const s = source === 'auto' ? '自动识别到的语言' : LANG_NAME[source] || source
  return [
    `你是一个专业翻译引擎，把${s}的内容翻译成${t}。`,
    '规则：',
    '1. 只输出译文本身，不要解释、不要加引号、不要重复原文、不要输出“翻译：”之类前缀。',
    '2. 保留原文的换行、编号、列表、标点结构与 Markdown 格式。',
    '3. 专业术语保持准确，人名、品牌、代码、变量名、URL 原样保留。',
    '4. 如果原文已经是目标语言，则输出润色后的同语言文本。',
    '5. 语气自然，符合目标语言母语者的表达习惯，不要翻译腔。'
  ].join('\n')
}

async function llmChat({ messages, llm, temperature = 0.2, maxTokens = 4096 }) {
  const base = (llm.baseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('未配置 API 地址')
  if (!llm.apiKey && !/localhost|127\.0\.0\.1/.test(base)) throw new Error('未配置 API Key')
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
  const headers = { 'Content-Type': 'application/json' }
  if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`
  const res = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: llm.model || 'deepseek-flash',
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      })
    }),
    60000,
    '大模型请求'
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`大模型接口 ${res.status}：${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('大模型返回为空')
  return String(content).trim()
}

async function translateLLM(text, from, to, llm) {
  const pieces = chunkText(text, 4000)
  const parts = []
  for (const piece of pieces) {
    parts.push(
      await llmChat({
        llm,
        messages: [
          { role: 'system', content: buildSystemPrompt(to, from) },
          { role: 'user', content: piece }
        ]
      })
    )
  }
  return { text: parts.join('\n'), detected: from, provider: `LLM · ${llm.model || ''}`.trim() }
}

/* -------------------------- 图片直译（视觉模型） -------------------------- */

function stripDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  return m ? { mime: m[1], base64: m[2] } : null
}

async function translateImageWithVision(dataUrl, from, to, llm) {
  const parsed = stripDataUrl(dataUrl)
  if (!parsed) throw new Error('图片数据无效')
  const target = LANG_NAME[to] || to
  const content = await llmChat({
    llm: { ...llm, model: llm.visionModel || llm.model },
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          '你是 OCR + 翻译引擎。识别图片里的所有文字，并翻译成目标语言。' +
          '严格输出 JSON，不要 Markdown 代码块，格式：{"original":"识别到的原文","translation":"译文"}。' +
          '保留原文换行；若图片中已经是目标语言，original 与 translation 相同。'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `目标语言：${target}` },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  })
  let original = ''
  let translation = content
  const jsonText = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(jsonText.slice(jsonText.indexOf('{'), jsonText.lastIndexOf('}') + 1))
    original = obj.original || ''
    translation = obj.translation || content
  } catch {
    /* 非 JSON 时直接把整段当译文 */
  }
  return { text: translation, original, detected: from, provider: '视觉模型', viaVision: true }
}

/* --------------------------------- 对外入口 -------------------------------- */

function resolveMode(settings, explicit) {
  if (explicit === 'free' || explicit === 'llm') return explicit
  const pref = settings?.provider || 'auto'
  if (pref === 'auto') {
    return settings?.llm?.apiKey || /localhost|127\.0\.0\.1/.test(settings?.llm?.baseUrl || '')
      ? 'llm'
      : 'free'
  }
  return pref
}

async function translateText({ text, from = 'auto', to = 'zh-CN', settings = {}, mode }) {
  const clean = String(text ?? '').replace(/\r\n/g, '\n')
  if (!clean.trim()) return { text: '', provider: '', detected: from, empty: true }

  const use = resolveMode(settings, mode)

  if (use === 'llm') {
    try {
      return await translateLLM(clean, from, to, settings.llm || {})
    } catch (err) {
      const free = await translateFree(clean, from, to).catch(() => null)
      if (free) return { ...free, warning: `大模型失败，已用免费接口：${err.message}` }
      throw err
    }
  }
  return translateFree(clean, from, to)
}

module.exports = {
  LANG_NAME,
  normalizeLang,
  chunkText,
  translateText,
  translateFree,
  translateImageWithVision
}
