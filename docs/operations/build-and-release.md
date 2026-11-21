# 构建与发布

插件以一个 npm 包交付，Host、Client、Gateway、两类 Worker、Render Machine 和 Viewer 分别构建。开发命令与改动对应的验证范围见[仓库开发规则](../../AGENTS.md)。

## 构建产物

| 应用 | 运行产物 |
| --- | --- |
| DSH Host 与 Client | `lib/index.js`（Node ESM）、`lib/client.js`（DSH ModuleLoader） |
| Gateway | `artifacts/gateway.cjs` |
| 两类内容 Worker | `artifacts/unit-content-worker.mjs`、`artifacts/collaboration-runtime-worker.mjs` 与共享的 `artifacts/worker-chunks/`。池化 Worker 的 bootstrap 位于 `lib/worker-child.mjs` |
| Viewer 与 Render Machine | `artifacts/viewer/` 与 `artifacts/render-machine/` 下的 Vite 静态资源 |
| 遥测 | `lib/telemetry-entry.js` 与包含版本、构建 commit、endpoint 的 `lib/build-info.json` |

应用及共享渲染预设均从本仓库源码构建。Viewer、Render Machine、render preset 与 IMPORTRANGE 插件最初取自 `univer-cli`；交互式导入导出 UI 源自 univer-pro `v1.2.0` 的 `custom-import-export` 示例，按本仓库的依赖注入约定维护。`packages/unit-comparison-viewer` 与 CLI、Workspace 中的副本保持行为一致，并适配本仓库的 React 18 Host。

发布包包含运行所需的 Gateway、Viewer、Unit Content Worker、Collaboration Runtime Worker、Office 转换器、平台依赖、Univer license 与 bundled Skills。Gateway、Worker、Viewer 和 Host 直接使用 manifest 中精确版本的 Univer SDK/API Reference packages；JavaScript SDK 被 bundle，平台原生 package 由包管理器为目标机器安装。发布时只打包从当前源码生成的运行产物。

## SDK 与原生依赖

`@univerjs/`、`@univerjs-pro/`、`@univer-cli/` 前缀的 SDK 依赖是一个跨应用兼容契约，用 `pnpm update:univer-sdk --sdk_version <精确版本>` 统一升级为同一精确版本，升级后 pnpm-workspace.yaml `overrides` 不得残留任何 SDK 条目。`@univerjs/icons`、`@univerjs-pro/cli-assets`、`@univerjs-pro/doc-typst-native-binding` 按自身发布节奏声明精确版本。`@univerjs-pro/engine-formula-rust-binding` 与 `@univerjs-pro/exchange-node-binding` 是上游依赖树中的传递绑定包：本仓库任何 package.json 都不得声明它们，源码也不直接 import；bundle 内联两个 wrapper 的代码，绑定包保持 external。发布物以 dsh 的 pnpm 安装为前提（隔离布局下插件 bundle 无法解析传递依赖），因此打包时由 `scripts/inject-runtime-bindings.mjs` 把绑定包按安装树解析到的实际版本写入 dist manifest 的 dependencies，并与 pnpm store 中 wrapper 的声明交叉校验；该差异由打包生成，不入库。

构建与发布脚本一律按包名操作、动态读取解析后的实际版本，不写死版本号。开发工作区用 pnpm `publicHoistPattern` 把绑定包提升到根 `node_modules`：bundle 内联了 wrapper 代码，运行时 `require(binding)` 从仓库根解析。`test/integration/gateway-lifecycle.test.ts` 对仓库 manifest 断言零绑定包声明，对已安装包断言绑定包已作为直接依赖注入。

原生公式引擎与 Office 转换器仍具有平台属性；`.univer` 使用 Node 内置的 `node:sqlite`，不再随包携带 SQLite 原生依赖。release workflow 必须在目标平台安装 lockfile 所指定的依赖后构建和测试，不能把一个平台的 `node_modules` 复制为通用发布物。

## License

Univer 凭据分两处：浏览器侧（Viewer、machine render page）只需 License，放在 `render-preset/license.ts`；Node 侧放在 `src/shared/univer-license.ts`，Web SDK 渲染只取 License，Collaboration SDK（`UniverCollabService`）与 Exchange（`configureExchange`）同时需要 License 与 licenseKey。Gateway 与 Worker 子进程只继承固定的环境变量白名单，因此凭据显式传入 SDK，不依赖 SDK 自己读取 `UNIVER_LICENSE`/`UNIVER_LICENSE_KEY`；独立运行时可用这两个环境变量成对替换内置凭据。Gateway 在 `startServer` 时配置一次 Exchange，Worker 每个进程配置一次。轮换 License 时两个文件必须同步更新。

## 发布验证

发布前至少执行 typecheck、Host/Client build、分层测试、npm pack 内容检查，以及从 pack 产物安装后的集成冒烟。

打包脚本从当前源码生成产物，并在发布包中保留 `docs/` 的目录结构。跨仓库共享包的同步范围和 SDK 升级规则见 [AGENTS.md](../../AGENTS.md)。
