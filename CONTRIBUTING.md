# 参与贡献

欢迎 PR 与 issue。这个项目刻意做得**很轻**——没有打包框架、没有 UI 组件库、没有状态管理库，改起来直观，也希望新增代码保持这一点。

## 环境

- Node.js 18+（开发时用的是 20 / 22）
- macOS 12+ 或 Windows 10+
- **不需要 Xcode**：macOS 的 OCR 走 `osascript` 调系统 Vision，不编译原生二进制

```bash
npm install
npm run dev        # 构建渲染层 + 启动 Electron
```

改动渲染层后重启 `npm run dev` 即可（没有 HMR，构建一次几百毫秒）。

## 项目约定（重要，别踩）

1. **不用 Vite、不用 `.vue` 单文件组件。** 渲染层是纯 JS + 模板字符串，由 `scripts/build.js`（esbuild）直接打包。新增组件请照着 `src/components/*.js` 的写法，Vue 从 `src/vendor/vue.esm-browser.prod.js` 引入。
2. **不加运行时依赖。** 现在运行时依赖为零（Electron 自带的能力已够用），加库前请先开 issue 说明必要性。
3. **代码风格**：2 空格缩进、单引号、不加分号、CommonJS（`require`/`module.exports`）。提交前可用 `node --check <file>` 自查语法。
4. **界面文案用中文**，代码注释也用中文，保持一致。

## 想加一条翻译通道？

打开 `electron/translate.js`：

- 免费接口：写一个 `async function xxxTranslate(text, from, to)`，返回译文字符串，然后加进 `FREE_CHAIN` 数组。按数组顺序自动降级，越靠前优先级越高。
- 大模型接口：只要兼容 OpenAI 的 `/chat/completions`，用户自己填 baseUrl + Key 就能用，不需要改代码。

语言代码统一走文件里的映射表（`zh-CN` / `ja` / `ko` / `th` / `en` …），各通道的内部写法在各自函数里转换。

## 想加一条 OCR 通道？

打开 `electron/ocr.js`，参考 `recognizeCloud()`（DeepSeek 云端）与 `recognizeLocal()`（系统 OCR）的签名，然后在 `electron/main.js` 的截图流水线里按优先级插入。流水线目前是：

```
云端 OCR → 视觉模型直译 → 本地离线 OCR
```

每一级失败都会自动往下退，新增通道请保持这个「失败不阻塞」的语义，并在设置面板加对应开关（`src/components/SettingsModal.js`）。

## 自测

仓库里 `test/` 下的脚本是开发时用的探针，不依赖测试框架：

```bash
# 在模拟 Electron 环境里渲染界面并截图到 .tmp/
node scripts/build.js && \
  env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/probe.js --no-sandbox

# 配置读写
./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/store-check.js --no-sandbox
```

`test/drive.js`、`test/verify-pack.js` 用 CDP 驱动真实运行的应用做端到端验证，需要应用带 `--remote-debugging-port` 启动，脚本里改成对应端口即可。

提交 PR 前请至少确认：

- `node scripts/build.js --min` 无报错
- `npm run dev` 能起，主窗口 / 浮窗 / 遮罩渲染正常
- 改到主进程 IPC 时，`electron/preload.js` 与渲染层调用两侧同步更新

## 提交与 PR

- 提交信息用 `type: 说明`，类型参考 `feat` / `fix` / `docs` / `refactor` / `chore` / `perf`
- 一个 PR 只做一件事，界面改动请附截图
- 修 bug 请说明复现步骤；新功能请说明适用场景
- 打包脚本（`scripts/pack-mac.js`）改动会影响发布产物，请在 PR 里注明测试过的系统

## 行为准则

技术讨论就事论事。不接受针对个人的攻击、歧视性言论，也不接受把项目用于违反当地法规的用途。
