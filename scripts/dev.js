'use strict'

/**
 * 开发脚本：先构建渲染层，再启动 Electron
 */
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const root = path.join(__dirname, '..')

function resolveElectron() {
  const pkg = path.join(root, 'node_modules', 'electron')
  try {
    const rel = fs.readFileSync(path.join(pkg, 'path.txt'), 'utf8').trim()
    const bin = path.join(pkg, 'dist', rel)
    if (fs.existsSync(bin)) return bin
  } catch {
    /* 回退到 .bin */
  }
  return path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron')
}

execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { cwd: root, stdio: 'inherit' })

const child = spawn(resolveElectron(), ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', TRANSME_DEVTOOLS: process.env.TRANSME_DEVTOOLS || '' }
})

child.on('exit', (code) => process.exit(code || 0))
process.on('SIGINT', () => child.kill('SIGTERM'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
