'use strict'

/**
 * 渲染层构建：esbuild 打包 + 静态资源拷贝（不依赖 Vite）
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'src')
const dist = path.join(root, 'dist')
const assets = path.join(dist, 'assets')

const STATIC = ['index.html', 'overlay.html', 'popup.html', 'styles.css', 'overlay.css', 'popup.css']

async function build() {
  let esbuild
  try {
    esbuild = require('esbuild')
  } catch {
    console.error('[build] 缺少 esbuild，请先执行 npm install')
    process.exit(1)
  }

  fs.mkdirSync(assets, { recursive: true })

  await esbuild.build({
    entryPoints: {
      app: path.join(src, 'main.js'),
      overlay: path.join(src, 'overlay.js'),
      popup: path.join(src, 'popup.js')
    },
    bundle: true,
    outdir: assets,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    minify: process.argv.includes('--min'),
    legalComments: 'none',
    logLevel: 'warning'
  })

  for (const file of STATIC) {
    fs.copyFileSync(path.join(src, file), path.join(dist, file))
  }

  console.log('[build] 渲染层构建完成 → dist/')
}

build().catch((err) => {
  console.error('[build] 失败：', err.message)
  process.exit(1)
})
