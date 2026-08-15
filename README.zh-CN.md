# DSH × Univer 插件

[English](README.md) · [中文](README.zh-CN.md)

在 DeepSeek Harness 应用内直接预览 Univer 表格：跑过 univer 命令的回合会自动出现预览卡片，点击即在应用内全屏展开 —— 无需浏览器、无需手动起服务。

```
┌────────────────────────────────────────┐
│ 📊 销售表格.univer  [wt-xxx]  [展开预览 ▾] │  ← 回合尾部卡片
│ /Users/.../销售表格.univer              │
└────────────────────────────────────────┘
```

## 功能

- **回合尾部预览卡片** —— 回合内 bash 调用中出现过 `.univer` 文件的，回合结束后自动出现预览卡片（支持 `--worktree`）。
- **应用内全屏预览** —— 点卡片在应用内 iframe 中打开表格；✕ / 遮罩 / Esc 关闭。
- **daemon 管理** —— 绿点 = daemon 运行中；黄点 = 未运行，点击自动启动。
- **多会话并行** —— 各会话显示各自回合的卡片。
- **双语界面** —— 卡片跟随应用语言（中/英）。

## 环境要求

- macOS（或 Linux）+ 已安装 DeepSeek Harness
- 建议安装 [univer-cli](https://github.com/dream-num/univer-cli)：`npm i -g univer-cli`；未安装时插件仍可安装，需要时会提示

## 安装

本包是一个标准 [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md)：声明了 `dsh.bundle` 并自带 `cordis.patch.yml`，可通过标准 loader 安装：

### 从 git 安装

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-plugin
```

> npm 发布计划稍后进行；在此之前请使用 git 或本地 checkout 安装。

### 从本地 checkout 安装（开发用）

```sh
dsh plugin --profile web add /path/to/dsh-univer-plugin
```

> profile 首次使用会自动初始化；`dsh` 会把该 bundle 追加到 `dsh.profile.bundles`，pnpm 链接包后，loader 自动应用插件的 `cordis.patch.yml` 层。可用 `dsh --profile web --dump-config` 验证（应能看到 `# == @univer-cli/dsh-univer-plugin` 层）。

### 备用：一键安装脚本（无 dsh CLI 时）

无法运行 `dsh` CLI 时，可使用便利安装脚本：

```sh
bash install.sh
```

macOS zip 用户可直接双击 `install.command`（见 `packaging/INSTALL.txt`）。

任何方式安装后：在 DeepSeek Harness 窗口按 **Cmd+R / Ctrl+R** 刷新。

## 使用

1. 在会话里跑 univer 命令（`univer new/import/execute/inspect/...`）
2. 回合结束后，回合尾部自动出现预览卡片
3. 点卡片 → 应用内全屏预览
4. daemon 未运行时卡片上显示黄色圆点，点击即可自动启动

## 卸载

```sh
univer-dsh uninstall
```

或手动删除：删除 `~/.dsh/profiles/node_modules/@univer-cli/dsh-univer-plugin` 及 `cordis.patch.yml` 中对应条目。

## 结构

本插件是双半 DSH 插件：

- **node 半**（`lib/index.js`）—— 声明了 `dsh.client` 的包；提供 `univer` 服务与宿主的 `/univer-api/*` 回路路由（status / ensure-daemon）。
- **client 半**（`lib/client.js`）—— 挂载 `conversation.chat.turnTail` slot：扫描回合内 bash 调用中的 `.univer` 目标并渲染预览卡片与全屏遮罩。

## 开发

`dist/` 与归档产物（`univer-dsh-plugin.zip`、`*.tgz`）是**生成物**——已加入 `.gitignore`，不入库。源文件在 `lib/`、`package.json`、`README*.md`、`cordis.patch.yml`、`install.sh` 与 `packaging/`。修改源文件后重建产物：

```sh
bash scripts/build-dist.sh
```

该脚本会重新生成 `dist/univer/`（发布包内容）、npm tarball `dist/univer-cli-dsh-univer-plugin-<version>.tgz` 与 zip 分发包 `univer-dsh-plugin.zip`（包内容 + 来自 `packaging/` 的 `install.command` + `INSTALL*.txt`）。

发布：`npm publish`（遵循 `files` 白名单）；zip/tgz 挂到 GitHub Release 供终端用户下载。

## 预留的 npm 包名

无 scope 的裸名 [`dsh-univer-plugin`](https://www.npmjs.com/package/dsh-univer-plugin) 已由本项目预留，用于防 typosquatting（恶意仿冒）——`redirects/dsh-univer-plugin/` 存放占位包（deprecated，指向官方包名），不含任何代码。**请始终安装官方包：**

```sh
dsh plugin --profile web add github:dream-num/dsh-univer-plugin   # npm 发布前
dsh plugin --profile web add @univer-cli/dsh-univer-plugin        # npm 发布后
```

## 元数据

- **Topic**：[`dsh-plugin`](https://github.com/topics/dsh-plugin)
- **Bundle manifest**：`dsh.bundle.patch` → `./cordis.patch.yml`
- **Client manifest**：`dsh.client`（`platform: "web"` + `inject`）

## 许可

[Apache-2.0](LICENSE)
