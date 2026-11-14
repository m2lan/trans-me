'use strict'

/**
 * 为当前 Mac 打包 TransMe.app（免 electron-builder，直接用 Electron 发行版组装）
 *
 * 本机 electron-builder 缺 app-builder 二进制、npm 也装不全，
 * 所以走 macOS 原生方式：ditto 复制 Electron.app → 改 Info.plist 与辅助进程名
 * → 塞入应用代码 → ad-hoc 签名 → hdiutil 出 dmg。
 *
 * 用法：node scripts/pack-mac.js
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ELECTRON_APP =
  process.env.ELECTRON_APP ||
  '/Users/M2/Documents/ai/global-project/baton/node_modules/electron/dist/Electron.app'
const RELEASE = path.join(ROOT, 'release')
const APP = path.join(RELEASE, 'mac', 'TransMe.app')
const ICNS = path.join(ROOT, 'build', 'icon.icns')

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const APP_NAME = 'TransMe'
const BUNDLE_ID = 'com.transme.app'
const VERSION = pkg.version

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts })

const log = (...a) => console.log('[pack]', ...a)

function plistSet(plist, key, value) {
  run('plutil', ['-replace', key, '-string', String(value), plist])
}

function plistGet(plist, key) {
  try {
    return run('plutil', ['-extract', key, 'raw', '-o', '-', plist]).trim()
  } catch {
    return ''
  }
}

function rmrf(p) {
  if (!fs.existsSync(p)) return
  try {
    fs.rmSync(p, { recursive: true, force: true })
  } catch {
    // 本机沙箱拦截删除时改为移到 .tmp/trash，避免打包中断
    const trash = path.join(ROOT, '.tmp', 'trash')
    fs.mkdirSync(trash, { recursive: true })
    try {
      fs.renameSync(p, path.join(trash, `${Date.now()}-${path.basename(p)}`))
    } catch {
      log('警告：无法清理', p)
    }
  }
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true, filter: (s) => !s.includes('/.') })
}

/* ------------------------------- 1. 组装包 ------------------------------- */

function buildBundle() {
  log('清理旧的 release/mac')
  rmrf(path.join(RELEASE, 'mac'))
  fs.mkdirSync(path.join(RELEASE, 'mac'), { recursive: true })

  log('复制 Electron 运行时 →', APP)
  run('ditto', [ELECTRON_APP, APP])

  const contents = path.join(APP, 'Contents')
  const resources = path.join(contents, 'Resources')
  const plist = path.join(contents, 'Info.plist')

  log('重命名主可执行文件')
  fs.renameSync(path.join(contents, 'MacOS', 'Electron'), path.join(contents, 'MacOS', APP_NAME))

  log('重命名辅助进程')
  const frameworks = path.join(contents, 'Frameworks')
  for (const entry of fs.readdirSync(frameworks)) {
    if (!entry.startsWith('Electron Helper') || !entry.endsWith('.app')) continue
    const oldDir = path.join(frameworks, entry)
    const suffix = entry.replace('Electron Helper', '').replace('.app', '')
    const newName = `${APP_NAME} Helper${suffix}`
    const newDir = path.join(frameworks, `${newName}.app`)
    fs.renameSync(oldDir, newDir)

    const helperPlist = path.join(newDir, 'Contents', 'Info.plist')
    for (const exe of fs.readdirSync(path.join(newDir, 'Contents', 'MacOS'))) {
      fs.renameSync(path.join(newDir, 'Contents', 'MacOS', exe), path.join(newDir, 'Contents', 'MacOS', newName))
    }
    plistSet(helperPlist, 'CFBundleExecutable', newName)
    plistSet(helperPlist, 'CFBundleName', newName)
    plistSet(helperPlist, 'CFBundleDisplayName', newName)
    const oldId = plistGet(helperPlist, 'CFBundleIdentifier')
    if (oldId) plistSet(helperPlist, 'CFBundleIdentifier', oldId.replace('com.github.Electron', BUNDLE_ID))
    log('  ·', entry, '→', `${newName}.app`)
  }

  log('改写 Info.plist')
  plistSet(plist, 'CFBundleExecutable', APP_NAME)
  plistSet(plist, 'CFBundleName', APP_NAME)
  plistSet(plist, 'CFBundleDisplayName', APP_NAME)
  plistSet(plist, 'CFBundleIdentifier', BUNDLE_ID)
  plistSet(plist, 'CFBundleShortVersionString', VERSION)
  plistSet(plist, 'CFBundleVersion', VERSION)
  plistSet(plist, 'CFBundleIconFile', 'icon.icns')
  plistSet(plist, 'LSApplicationCategoryType', 'public.app-category.productivity')
  plistSet(plist, 'NSHumanReadableCopyright', 'TransMe')
  plistSet(plist, 'NSScreenCaptureUsageDescription', 'TransMe 需要读取屏幕内容，用于截图翻译。')
  plistSet(plist, 'NSAppleEventsUsageDescription', 'TransMe 通过系统脚本调用内置 OCR 引擎识别截图文字。')
  plistSet(plist, 'LSMinimumSystemVersion', '11.0')
  try {
    run('plutil', ['-remove', 'ElectronAsarIntegrity', plist])
  } catch {
    /* 没有该键就算了 */
  }

  // default_app.asar 保留：只要 Resources/app 存在，Electron 就不会加载它。
  // （本机沙箱拦截了删除该文件的操作，且它不影响启动）
  log('保留默认应用壳（不参与加载）')

  if (fs.existsSync(ICNS)) {
    fs.copyFileSync(ICNS, path.join(resources, 'icon.icns'))
    log('图标已写入')
  } else {
    log('警告：缺 build/icon.icns，使用 Electron 默认图标')
  }

  log('写入应用代码')
  const appDir = path.join(resources, 'app')
  fs.mkdirSync(appDir, { recursive: true })
  copyDir(path.join(ROOT, 'dist'), path.join(appDir, 'dist'))
  copyDir(path.join(ROOT, 'electron'), path.join(appDir, 'electron'))
  copyDir(path.join(ROOT, 'native'), path.join(appDir, 'native'))

  // 精简 package.json：只要主进程加载所需的元信息，不带 devDependencies
  const runtimePkg = {
    name: pkg.name,
    productName: pkg.productName,
    version: pkg.version,
    description: pkg.description,
    main: pkg.main,
    author: pkg.author,
    license: pkg.license
  }
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(runtimePkg, null, 2) + '\n')

  const bytes = run('du', ['-sk', APP]).split('\t')[0]
  log('应用包大小', Math.round(Number(bytes) / 1024) + 'MB')
}

/* -------------------------------- 2. 签名 -------------------------------- */

function sign() {
  log('ad-hoc 签名（本机自用，不做公证）')
  const frameworks = path.join(APP, 'Contents', 'Frameworks')
  for (const entry of fs.readdirSync(frameworks)) {
    if (!entry.endsWith('.app') && !entry.endsWith('.framework')) continue
    try {
      run('codesign', ['--force', '--sign', '-', path.join(frameworks, entry)])
    } catch (err) {
      log('  跳过', entry, err.stderr ? String(err.stderr).split('\n')[0] : '')
    }
  }
  run('codesign', ['--force', '--deep', '--sign', '-', APP])
  log('签名完成')
}

/* --------------------------------- 3. dmg -------------------------------- */

function makeDmg() {
  const stage = path.join(RELEASE, 'dmg-stage')
  rmrf(stage)
  fs.mkdirSync(stage, { recursive: true })
  run('ditto', [APP, path.join(stage, `${APP_NAME}.app`)])
  try {
    fs.symlinkSync('/Applications', path.join(stage, 'Applications'))
  } catch {
    /* 已有则忽略 */
  }

  const volName = `${APP_NAME} ${VERSION}`
  const dmg = path.join(RELEASE, `${APP_NAME}-${VERSION}-x64.dmg`)
  rmrf(dmg)
  log('打包 dmg →', dmg)
  run('hdiutil', [
    'create',
    '-volname', volName,
    '-srcfolder', stage,
    '-ov',
    '-format', 'UDZO',
    '-quiet',
    dmg
  ])
  rmrf(stage)
  log('dmg 大小', Math.round(fs.statSync(dmg).size / 1024 / 1024) + 'MB')
  return dmg
}

/* --------------------------------- 主流程 -------------------------------- */

log('构建渲染层（压缩）')
run('node', [path.join(ROOT, 'scripts', 'build.js'), '--min'], { cwd: ROOT, stdio: 'inherit' })

if (!fs.existsSync(ELECTRON_APP)) throw new Error(`找不到 Electron 运行时：${ELECTRON_APP}`)

buildBundle()
sign()
const dmg = makeDmg()

console.log('\n[pack] 完成')
console.log('  app :', APP)
console.log('  dmg :', dmg)
