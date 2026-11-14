<div align="center">

# TransMe

**截图即译 · 划词即译 · 中英日韩泰互译** — macOS / Windows 桌面翻译工具，不用再打开网页

<p>
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-2f6bf0?style=flat-square">
  <img alt="electron" src="https://img.shields.io/badge/Electron-33-47848f?style=flat-square&logo=electron&logoColor=white">
  <img alt="vue" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-3c9?style=flat-square">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/m2lan/trans-me/ci.yml?style=flat-square&label=CI">
  <img alt="release" src="https://img.shields.io/github/v/release/m2lan/trans-me?style=flat-square&color=2f6bf0">
  <img alt="stars" src="https://img.shields.io/github/stars/m2lan/trans-me?style=flat-square&color=2f6bf0">
  <img alt="last commit" src="https://img.shields.io/github/last-commit/m2lan/trans-me?style=flat-square&color=888">
</p>

<img src="docs/social-preview.jpg" alt="TransMe 截图翻译" width="100%">

</div>

---

## 为什么又一个翻译工具

网页翻译每次都要切浏览器、粘贴、等广告；装过的客户端要么收费、要么只做文本不做截图，要么把「截图翻译」做成付费会员功能。

TransMe 想解决的就三件事：

- **不离开当前窗口** —— 把图片**拖进窗口 / ⌘V 粘贴 / 选文件**，译文直接叠回原图对应的文字位置；也可以一键框选屏幕区域
- **开箱即用** —— 不填任何 API Key 也能用，内置免费通道；想更准再挂自己的大模型
- **不联网也能干活** —— 中英图片走系统自带的离线 OCR，不耗 token、不上传图片

## 功能

| 能力 | 说明 |
| --- | --- |
| **菜单栏快捷翻译** | 菜单栏一个图标，点一下就能输入翻译，任意屏幕 / 全屏应用里都能用；关掉主窗口也还在 |
| **图片翻译** | 拖进来 / ⌘V 粘贴 / 选文件，译文**叠回原图对应位置**，右侧逐行对照；支持 jpg / png / webp |
| **截图翻译** | 全局快捷键 → 全屏框选 → 浮窗出结果，可一键「大图」带进图片翻译继续看 |
| **文本翻译** | 左侧输入即自动翻译（可关），支持中 / 英 / 日 / 韩 / 泰，自动识别源语言 |
| **剪贴板翻译** | 复制任意文本后按快捷键，主窗口直接出译文 |
| **历史与收藏** | 本地保存最近 300 条，可搜索、可收藏、一键回填 |
| **朗读** | 调用系统 TTS 朗读原文 / 译文 |
| **双通道翻译** | 内置免费通道开箱即用；填 API Key 后自动优先大模型（推荐 `deepseek-flash`） |
| **三通道 OCR** | 云端 OCR → 本地离线 OCR → 视觉模型直译，逐级降级，日 / 韩 / 泰图片也能识别 |
| **纯本地存储** | 历史与设置只写本机 `userData`，无账号、无云端同步、无埋点 |

<p align="center">
  <img src="docs/image.png" alt="图片翻译：译文叠在图上，右侧逐行对照" width="88%">
</p>

<p align="center">
  <img src="docs/translate.png" alt="文本翻译主界面" width="88%">
</p>

<p align="center">
  <img src="docs/popup.png" width="46%" alt="截图翻译结果浮窗">
  <img src="docs/overlay.png" width="46%" alt="全屏框选遮罩">
</p>

<p align="center">
  <img src="docs/history.png" width="46%" alt="历史记录与收藏">
  <img src="docs/settings.png" width="46%" alt="设置面板">
</p>

## 菜单栏快捷翻译（macOS / Windows 托盘）

macOS 菜单栏（Windows 是任务栏托盘）常驻一个「文A」图标，点一下弹出小面板，**不用切窗口、不用找 Dock**：

<p align="center">
  <img src="docs/tray.png" alt="菜单栏小面板：输入即译" width="420">
</p>

- 弹出即聚焦输入框，打完按回车（或等 0.6 秒自动翻）就出译文，`Esc` 收起
- 语言、复制、朗读、截图翻译都在面板里；点「打开主界面」进完整界面
- 贴着菜单栏图标出现，**在哪个屏幕点就出现在哪个屏幕**，全屏应用上也盖得住
- 关闭主窗口只是收起来，应用继续驻留菜单栏；退出走托盘右键菜单 → 「退出 TransMe」
- 右键菜单还有：输入翻译 / 打开主界面 / 截图翻译 / 打开设置 / 退出

## 图片翻译（推荐用法）

切到「图片」页，三种入口都行：

| 入口 | 操作 |
| --- | --- |
| 拖放 | 把图片从 Finder / 资源管理器拖进窗口 |
| 粘贴 | `⌘V` / `Ctrl+V`，截图工具、微信、浏览器复制来的图都可以 |
| 选文件 | 点「浏览文件」，支持 jpg / jpeg / png / webp |

识别完成后：

- 译文按**原文字的位置**叠在图上，白色底块覆盖原文；不想看叠加就关掉右侧那个开关
- 右侧是逐行对照（原文在上、译文在下），点任意一行复制该行译文
- 字号按原文字框自动收缩，长句不会被裁掉半行

截图翻译（`⌘⇧T`）适合「屏幕上正在看的东西」；图片翻译适合「手上已经有一张图」，不用先截图再框选。浮窗里的「大图」按钮可以把刚截的图直接带进图片翻译页继续看。

## 快捷键

| 操作 | macOS | Windows |
| --- | --- | --- |
| 截图翻译 | `⌘ ⇧ T` | `Ctrl Shift T` |
| 翻译剪贴板内容 | `⌘ ⇧ D` | `Ctrl Shift D` |
| 显示 / 隐藏主窗口 | `⌘ ⇧ Space` | `Ctrl Shift Space` |
| 菜单栏快速翻译 | 点菜单栏图标 | 点托盘图标 |
| 立即翻译 | `⌘ Enter` | `Ctrl Enter` |

快捷键被其他软件占用时注册会失败，设置面板会明确提示。

## 下载安装

| 平台 | 安装方式 |
| --- | --- |
| macOS | 到 [Releases](https://github.com/m2lan/trans-me/releases) 下载 `TransMe-1.1.0-x64.dmg`，双击挂载后拖进「应用程序」 |
| Windows | 仓库暂未提供预编译包，按下方「打包」自行执行 `npm run build:win` 生成安装程序 |

macOS 版本未做 Apple 公证，首次打开若提示「无法验证开发者」，右键 → 打开，或在「系统设置 → 隐私与安全性」里点「仍要打开」。

首次使用截图翻译，系统会申请**屏幕录制**权限：系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 TransMe → **重启应用**（系统限制，必须重启才生效）。

## 快速开始

需要 Node.js 18+。

```bash
git clone https://github.com/m2lan/trans-me.git
cd trans-me
npm install        # 安装 electron / electron-builder / esbuild
npm run dev        # 构建渲染层并启动应用
```

## 打包

```bash
# 本机打包（推荐，不依赖 electron-builder）
npm run pack:mac    # → release/mac/TransMe.app + release/TransMe-1.1.0-x64.dmg

# electron-builder 通道
npm run build:mac   # 生成 release/TransMe-1.1.0.dmg（x64 + arm64）
npm run build:win   # 生成 release/TransMe-1.1.0-setup.exe
```

`scripts/pack-mac.js` 直接用 Electron 发行版组装：复制运行时 → 改 Info.plist 与辅助进程名 → 写入应用代码 → ad-hoc 签名 → `hdiutil` 出 dmg。产物不带 quarantine 属性，双击即可运行。

图标由 `npm run icon` 生成（AppKit 绘制 → `build/icon.icns`），社交预览图由 `npm run social` 生成。

Windows 安装包建议在 Windows 上执行 `npm run build:win`；在 macOS 上交叉构建需要额外安装 wine，稳定性一般。打包配置见 `electron-builder.yml`（`identity: null` 表示不签名，分发给他人的话建议自行签名 / 公证）。

## 翻译通道

设置 → 翻译通道有三种模式：

1. **自动（默认）**：填了 API Key 就走大模型，没填走免费接口。
2. **仅免费接口**：无需任何配置。按 `Bing 网页版 → Bing API → Google → MyMemory` 顺序自动重试，任一成功即返回。
3. **仅大模型**：术语最准，适合专业内容。

免费通道实测：Bing 网页版（`cn.bing.com`）在国内可直连，且带 LLM 增强，质量优于传统机翻；Google 需要网络可达才生效；MyMemory 作为兜底，长文本受配额限制。因此**免费通道适合随手用，长期高频建议填 Key**。

大模型填任何 OpenAI 兼容接口即可（以 DeepSeek 为例）：

```
API 地址  https://api.deepseek.com
API Key   sk-xxxx
文本模型  deepseek-flash
视觉模型  （可留空，留空复用文本模型）
```

> `deepseek-chat` 已于 2026/7/24 下线，请使用 `deepseek-flash`（即 DeepSeek-V4.1-Flash）。DeepSeek 的 base_url 不需要加 `/v1`。

本地 Ollama 填 `http://localhost:11434/v1`，此时不需要 Key。

**DeepSeek 成本参考**（`deepseek-flash`，元/百万 token，空闲 / 高峰）：

| 项目 | 空闲时段 | 高峰时段 |
| --- | --- | --- |
| 输入（缓存命中） | 0.02 | 0.04 |
| 输入（缓存未命中） | 1 | 2 |
| 输出 | 4 | 8 |

高峰指周一至周五 9:00–12:00、14:00–18:00，其余时间（含周末）半价。实测折算：一次 300 字文本翻译约 **0.0012 元**，一次截图翻译（含 OCR）约 **0.0022 元**，每天 200 次翻译 + 50 张截图约 **0.35 元**。

## 截图识别（OCR）

按优先级自动降级，设置里可分别开关：

<img src="docs/ocr.png" width="72%" alt="截图识别的三条通道">

1. **云端 OCR（优先）**：走 DeepSeek `POST /v1/tools/ocr`，先识别文字再翻译。中英日韩泰全覆盖，按页计费 **1.5 元/千页**（一张截图 0.0015 元）。仅当 API 地址是 DeepSeek 且填了 Key 时启用。
2. **视觉模型直译**（备用）：截图直接交给视觉模型，返回原文 + 译文，排版与语义最好。
3. **本地离线 OCR**（兜底）：
   - macOS：调用系统 Vision 框架（通过 `osascript` 的 ObjC 桥接，无需编译、无需装 Xcode）。
   - Windows：调用系统 `Windows.Media.Ocr`，需要系统装有对应语言包（设置 → 时间和语言 → 语言 → 添加语言功能）。

能力差异（实测）：

| 系统 | 本地 OCR 支持语种 |
| --- | --- |
| macOS 12~13 | 中文（简/繁）、英文 |
| macOS 14+ | 中文、英文、日文、韩文 |
| Windows 10/11 | 取决于已安装的语言包，通常中英日韩齐备 |

因此在 macOS 12/13 上要识别日 / 韩 / 泰截图，请开启云端 OCR 或配置视觉模型。

## 目录结构

```
electron/          主进程
  main.js          窗口、截图遮罩、结果浮窗、全局快捷键
  preload.js       渲染层 API 桥
  translate.js     翻译引擎（Bing / Google / MyMemory / LLM / 视觉模型）
  image.js         图片翻译流水线（图片 → OCR 分段 → 逐行翻译）
  ocr.js           OCR 调度（DeepSeek 云端 OCR / macOS Vision / Windows OCR）
  tts.js           系统朗读
  store.js         设置与历史（userData/store.json）
src/               渲染层（Vue 3，无构建框架，esbuild 直接打包）
  components/      App / LangBar / ImagePane / HistoryPanel / SettingsModal
  vendor/          Vue 运行时（打包进产物，无需联网）
  overlay.*        截图框选遮罩
  popup.*          翻译结果浮窗
  tray.*           菜单栏小面板（点图标输入的迷你翻译窗）
native/
  ocr-mac.js       macOS Vision OCR（JXA）
  ocr-windows.ps1  Windows OCR（WinRT）
scripts/
  build.js         esbuild 打包渲染层
  dev.js           构建 + 启动 Electron
  pack-mac.js      组装 .app 并出 dmg
test/              探针与端到端校验脚本（CDP 驱动真实应用）
```

## 常见问题

<details>
<summary><b>截图翻译没反应 / 黑屏？</b></summary>

macOS 需要在「隐私与安全性 → 屏幕录制」里授权并**重启应用**。多显示器时截图只覆盖鼠标所在那块屏幕，先把鼠标移到目标屏再按快捷键。
</details>

<details>
<summary><b>免费通道偶发失败？</b></summary>

免费通道依赖第三方公开接口，服务端改版时会短时失效，下次会自动切下一条。长期高频使用建议在设置里填自己的 API Key。
</details>

<details>
<summary><b>不填 Key 能识别日 / 韩 / 泰截图吗？</b></summary>

取决于系统：macOS 14+ 与 Windows（装有对应语言包）可以用本地 OCR；macOS 12/13 的系统 Vision 只有中英文，需要开云端 OCR 或视觉模型。
</details>

<details>
<summary><b>支持 Linux 吗？</b></summary>

代码上窗口与快捷键是跨平台的，截图与 OCR 依赖平台能力（macOS Vision / Windows WinRT）。Linux 需要另接截图与 OCR 后端，目前未适配。
</details>

<details>
<summary><b>会把我翻译的内容上传到哪里？</b></summary>

历史与设置只存本机。文本会发给你选择的翻译通道（免费接口或你自己配置的大模型）；中英截图走本地 OCR 时不发图，只有开启云端 OCR / 视觉模型才会把截图传给对应服务商。
</details>

<details>
<summary><b>支持划词即译（选中文本直接出译文）吗？</b></summary>

当前是「复制后按快捷键」，不监听鼠标选区（避免常驻钩子影响其他应用）。需要的话可以提 issue。
</details>

## 已知限制

- 截图只覆盖鼠标所在的那块屏幕，多显示器需要移动鼠标到目标屏再按快捷键。
- 免费通道依赖第三方接口，服务端改版时可能短时失效，不影响大模型通道。
- 未做术语库 / 文档翻译（PDF 整篇），当前定位是「随手翻译」。
- 未接入 OCR 之外的版式还原（表格、公式会按纯文本顺序输出）。

## 参与贡献

欢迎 issue 与 PR，提交前请先看 [CONTRIBUTING.md](CONTRIBUTING.md)。版本变更见 [CHANGELOG.md](CHANGELOG.md)。

如果这个工具帮你省了时间，点个 ⭐ 是最直接的鼓励。

## License

[MIT](LICENSE) © 2026 m2lan

---

<div align="center">

### English

**TransMe** is a lightweight desktop translator for macOS and Windows. Press a shortcut, drag over anything on screen — web pages, PDFs, subtitles, images, error dialogs — and get the translation in a floating window. Text translation via clipboard or typing, Chinese / English / Japanese / Korean / Thai, with offline OCR (macOS Vision, Windows.Media.Ocr) and optional cloud OCR or any OpenAI-compatible LLM. Built with Electron + Vue 3, no account, everything stored locally.

*Keywords: screen translation, screenshot translator, image translator, OCR translation, clip text translator, deepseek translator, offline OCR.*

</div>
