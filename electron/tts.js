'use strict'

const { spawn } = require('node:child_process')

let current = null

const MAC_VOICES = {
  'zh-CN': 'Tingting',
  en: 'Samantha',
  ja: 'Kyoko',
  ko: 'Yuna',
  th: 'Kanya'
}

function stop() {
  if (current) {
    try {
      current.kill()
    } catch {
      /* ignore */
    }
    current = null
  }
}

function clean(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .slice(0, 1200)
}

function speakMac(text, lang) {
  const voice = MAC_VOICES[lang]
  const args = voice ? ['-v', voice, text] : [text]
  return new Promise((resolve) => {
    const child = spawn('say', args, { stdio: 'ignore' })
    current = child
    child.on('error', () => {
      // 语音包不存在时退回系统默认音色
      const fallback = spawn('say', [text], { stdio: 'ignore' })
      current = fallback
      fallback.on('close', () => resolve(true))
    })
    child.on('close', () => {
      if (current === child) current = null
      resolve(true)
    })
  })
}

function speakWindows(text, lang) {
  const cultureMap = { 'zh-CN': 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', th: 'th-TH' }
  const culture = cultureMap[lang] || 'zh-CN'
  const script = `
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Speech
$text = [Console]::In.ReadToEnd()
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoiceByHints('NotSet','NotSet',0,[System.Globalization.CultureInfo]::new('${culture}')) } catch {}
$s.Speak($text)
`
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true
    })
    current = child
    child.stdin.write(text)
    child.stdin.end()
    child.on('error', () => resolve(false))
    child.on('close', () => {
      if (current === child) current = null
      resolve(true)
    })
  })
}

async function speak({ text, lang = 'zh-CN' }) {
  stop()
  const payload = clean(text)
  if (!payload) return false
  if (process.platform === 'darwin') return speakMac(payload, lang)
  if (process.platform === 'win32') return speakWindows(payload, lang)
  return false
}

module.exports = { speak, stop }
