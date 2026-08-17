# DeepSeek Harness (DSH) × Univer 插件

> **在 DeepSeek Harness 中创建、检查、编辑和审阅 Univer 文件。**

[English](README.md) · [中文](README.zh-CN.md)

在 DeepSeek Harness（简称 DSH）应用内直接创建并预览 Univer 办公文件（表格、文档、幻灯片、Base）。回合使用结构化 `univer_*` 工具后会自动出现预览卡片，点击即可在应用内全屏展开；worktree 编辑显示实时浮窗，会话结束后的审阅也留在会话内完成。

```
┌────────────────────────────────────────┐
│ 📊 销售表格.univer  [wt-xxx]  [展开预览 ▾] │  ← 回合尾部卡片
│ /Users/.../销售表格.univer              │
└────────────────────────────────────────┘

┌──────────────────────────────┐
│ ● agent-draft · 销售表格     │  ← 实时浮窗（draft worktree）
│ [修改中]  [−] [⤢] [✕]        │
│ ┌──────────────────────────┐ │
│ │   实时 worktree Viewer   │ │     点击标题栏放大，
│ │   （只读 · 实时同步）     │ │     可拖拽 / 折叠 / 关闭
│ └──────────────────────────┘ │
└──────────────────────────────┘

┌────────────────────────────────────────┐
│ 🧾 合并预览「agent-draft」  [待确认] ▾  │  ← 会话结束合并面板
│ ┌────────────────────────────────────┐ │
│ │   合并预览页面（内嵌）              │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## 功能

- **回合尾部预览卡片** —— 使用结构化 `univer_*` 工具的回合结束后自动出现预览卡片。
- **应用内全屏预览** —— 点卡片在应用内 iframe 中打开表格；✕ / 遮罩 / Esc 关闭。
- **实时浮窗** —— agent 创建或更新 worktree 后，**右上角**弹出小浮窗，内嵌只读实时 worktree 页面；修改会实时出现在浮窗里。一个 worktree 改动多个 unit（如表格+PPT）时，浮窗与审阅面板顶部的 **unit 切换 chips** 只列出有变动的单元（＋新增 / ✎修改 / －删除 / ⚠冲突），未变动的单元不显示；默认打开第一个变动单元。
- **浮窗交互** —— 拖深色标题栏移动；点击标题栏（未拖动）即放大；`−` 折叠成只剩标题条，`⤢` 最大化，**拖右下角调整大小**，`✕` 关闭（worktree 状态变化后自动重新出现）。
- **ready + 会话结束 → 自动关闭并嵌入合并页** —— 会话转入空闲后，所有**非终态** worktree 自动进入会话下方的审阅 dock：`ready` 显示合并预览（`scope=mergePreview`）+ 恢复编辑 / 丢弃 / 合入当前版本按钮；**`draft` 也进入 dock**，显示实时页面 + 提交确认 / 丢弃按钮（agent 忘了提交确认也能直接审阅）。会话仍在运行时，非终态 worktree 在右上角浮窗显示。**merge 或 discard 之后（终态）不再显示任何浮窗或面板。**
- **内置 Gateway 管理** —— 插件自带协作 Gateway 与 Viewer；绿点 = 运行中，黄点 = 未运行，点击即可启动插件持有的 Gateway。
- **多会话并行** —— 各会话显示各自回合的卡片、浮窗与合并面板。
- **双语界面** —— 卡片跟随应用语言（中/英）。

## 环境要求

- 当前已提交及预构建原生产物要求 Apple Silicon macOS + DeepSeek Harness
- 不需要全局安装 Univer CLI。插件内置 Gateway、Viewer、无头 Unit Content Worker、Office 转换器、Univer license 与当前平台的原生依赖，并注册 `univer_create`、`univer_inspect`、`univer_execute`、`univer_export` 和 `univer_worktree`。
- 同步脚本可在 Linux x64/arm64 与 Windows x64 目标环境生成对应原生产物；这些平台的分平台发布流程尚未建立。

## 安装

本包是一个标准 [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md)：声明了 `dsh.bundle` 并自带 `cordis.patch.yml`，可通过标准 loader 安装：

### 从 git 安装

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-office
```

### 从 npm 安装

```sh
dsh plugin --profile web add dsh-univer-office
```

### 从本地 checkout 安装（开发用）

```sh
dsh plugin --profile web add /path/to/dsh-univer-office
```

> profile 首次使用会自动初始化；`dsh` 会把该 bundle 追加到 `dsh.profile.bundles`，pnpm 链接包后，loader 自动应用插件的 `cordis.patch.yml` 层。可用 `dsh --profile web --dump-config` 验证（应能看到 `# == dsh-univer-office` 层）。

### 备用：一键安装脚本（无 dsh CLI 时）

无法运行 `dsh` CLI 时，可使用便利安装脚本：

```sh
pnpm install
bash install.sh
```

源码 checkout 安装器会复制已安装的 Gateway 依赖。macOS zip 已包含这些依赖，可直接双击 `install.command`（见 `packaging/INSTALL.txt`）。

任何方式安装后：在 DeepSeek Harness 窗口按 **Cmd+R / Ctrl+R** 刷新。

## 使用

1. 让 agent 使用 `univer_*` 领域工具
2. 回合结束后，回合尾部自动出现预览卡片
3. 点卡片 → 应用内全屏预览
4. 创建 worktree → 角落弹出实时浮窗，agent 的每次修改实时可见
5. 在审阅面板提交修改等待确认；会话结束后浮窗自动关闭，合并预览嵌入会话下方
6. 内置 Gateway 未运行时卡片上显示黄色圆点，点击即可启动 Gateway

## 卸载

```sh
univer-dsh uninstall
```

或手动删除：删除 `~/.dsh/profiles/node_modules/dsh-univer-office` 及 `cordis.patch.yml` 中对应条目。

## 结构

本项目是一个可安装的 DSH bundle，内部由多个 Cordis 角色组成：

- Host 根插件组合 Univer Service Provider、webServer Consumer 和 Tools Consumer；
- Consumer 只调用 `ctx.univer`，不会直接访问 Gateway、CLI、子进程或文件系统；
- `host/webServer` 提供 `GET /univer-api/status`、`POST /univer-api/gateway/start`、`GET /univer-api/state` 和 `POST /univer-api/worktree-action`；
- Tools Consumer 注册领域工具，不提供通用 CLI 透传；
- `host/processes/gateway` 管理内置 Gateway 进程和 Viewer 资源；`host/adapters/unit-content` 为 inspect、execute、export 启动来自 `workers/unit-content` 的一次性 Unit Content Worker；
- Client 从持久化工具事件恢复结构化目标，通过统一 API 层轮询状态，再由预览、实时浮窗和审阅组件渲染。

`src/` 是插件手写源码，`lib/index.js`、`lib/client.js` 和 `lib/types/` 均由构建生成；vendored 上游源码与生成产物分别位于 `vendor/collaboration` 和 `vendor/unit-content`。目录、依赖方向和信任边界见[架构决策](docs/architecture.md)。

## 开发

`dist/` 与归档产物（`univer-dsh-plugin.zip`、`*.tgz`）是**生成物**——已加入 `.gitignore`，不入库。`vendor/collaboration/artifacts/` 与 `vendor/unit-content/artifacts/` 需要版本化并随包发布。先构建并测试源码：

```sh
pnpm run build
pnpm run test
```

然后重建发布产物：

```sh
bash scripts/build-dist.sh
```

从 Univer CLI checkout 同步 Gateway、Viewer 与协作源码快照：

```sh
npm run sync:collaboration -- /path/to/univer-cli
```

同步 Unit Content Worker、内嵌 Univer development credential 与当前平台原生依赖：

```sh
UNIVER_CLI_SOURCE=/path/to/univer-cli npm run sync:unit-content
```

该脚本会重新生成 `dist/univer/`（发布包内容）、npm tarball `dist/univer-office-<version>.tgz` 与 zip 分发包 `univer-dsh-plugin.zip`（包内容 + 来自 `packaging/` 的 `install.command` + `INSTALL*.txt`）。

单独运行冒烟测试：

```sh
node test/host-smoke.mjs
node test/client-smoke.mjs
npm run test:integration
```

发布：`npm publish`（遵循 `files` 白名单）；zip/tgz 挂到 GitHub Release 供终端用户下载。

## 预留的 npm 包名

以下无 scope 的裸名已由本项目预留，用于防 typosquatting（恶意仿冒）——`redirects/<name>/` 各目录存放占位包（deprecated，指向官方包名），不含任何代码：

- [`dsh-univer-plugin`](https://www.npmjs.com/package/dsh-univer-plugin)
- `dsh-univer-office-suite`
- `dsh-univer-suite`
- `univer-office-suite`
- `univer-office`

**请始终安装官方包：**

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-office   # 从 git
dsh plugin --profile web add dsh-univer-office                    # 从 npm
```

## 元数据

- **Topic**：[`dsh-plugin`](https://github.com/topics/dsh-plugin)
- **Bundle manifest**：`dsh.bundle.patch` → `./cordis.patch.yml`
- **Client manifest**：`dsh.client`（`platform: "web"` + `inject`）

## 许可

[Apache-2.0](LICENSE)
