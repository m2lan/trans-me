# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-11-14

### 新增

- **云端 OCR 通道**：接入 DeepSeek `POST /v1/tools/ocr`，截图先识别文字再翻译，中英日韩泰全覆盖，按页计费（1.5 元/千页）
- 截图识别改为**三级降级**：云端 OCR → 视觉模型直译 → 本地离线 OCR，逐级回退，设置面板可分别开关
- 设置面板新增「云端 OCR（优先）」开关
- 应用图标（AppKit 绘制渐变圆角 + 「译」），打包产物不再使用 Electron 默认图标
- 社交预览图与生成脚本 `scripts/make-social.js`

### 变更

- 默认文本模型改为 `deepseek-flash`（`deepseek-chat` 已于 2026/7/24 下线）
- 默认 API 地址改为 `https://api.deepseek.com`（官方不需要 `/v1` 后缀）
- 打包改用 `scripts/pack-mac.js` 直接组装 `.app` + `hdiutil` 出 dmg，不再依赖 electron-builder 的 `app-builder` 二进制
- `pack-mac.js` 支持自动定位 Electron 运行时、按当前架构命名 dmg，可在 CI 上运行

### 修复

- OCR 返回文本中的版面标记（`<｜ref｜>…<｜/ref｜><｜box｜>…<｜/box｜>`）会被当作正文翻译，现已剥离
- 截图裁剪后及时释放图像内存
- 设置弹窗分组间距过密

## [1.0.0] - 2026-11-14

### 新增

- 文本翻译：输入即译，支持中 / 英 / 日 / 韩 / 泰，自动识别源语言
- 截图翻译：全局快捷键 → 全屏框选 → OCR → 结果浮窗
- 划词 / 剪贴板翻译、历史记录与收藏、系统 TTS 朗读
- 双通道引擎：内置免费通道（Bing 网页版 → Bing API → Google → MyMemory 自动降级）+ 任意 OpenAI 兼容大模型
- 本地离线 OCR：macOS Vision（`osascript` 桥接，免编译）、Windows `Windows.Media.Ocr`
- 全局快捷键、托盘、深色界面、设置面板
- macOS 打包流程与 dmg 产物

[1.1.0]: https://github.com/m2lan/trans-me/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/m2lan/trans-me/releases/tag/v1.0.0
