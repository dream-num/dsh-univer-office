# DSH × Univer Office

> 让 DeepSeek Harness 直接创建、编辑、检查和交付表格、文档、幻灯片、多维表格与画布。

[English](README.md) · 简体中文

[![npm](https://img.shields.io/npm/v/dsh-univer-office)](https://www.npmjs.com/package/dsh-univer-office)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-339933?logo=node.js&logoColor=white)](package.json)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

`dsh-univer-office` 是 DeepSeek Harness（DSH）的 Univer 办公插件。告诉 Agent 你想要什么，它可以创建和编辑电子表格、文档、演示文稿、多维表格与画布，也可以处理现有的 Excel、Word 和 PowerPoint 文件。所有修改都会经过校验，并留在会话中供你预览、确认或放弃。

安装后直接用自然语言描述目标即可。Agent 会完成创建、编辑和校验，你可以在会话中实时查看过程、审阅结果，并把电子表格导出为 Excel（`.xlsx`），或按需交付 Word（`.docx`）和 PowerPoint（`.pptx`）文件。

## 看看实际效果

下面的电子表格由 Agent 根据自然语言要求创建，并在同一个会话中继续添加条件格式和图表。完成后可以直接预览、继续修改、合入当前版本或丢弃。

![在 DSH 会话中审阅带条件格式和图表的电子表格](docs/assets/readme/chart-and-formatting.png)

> **可以直接交付 Excel 文件：** 审阅完成后，让 Agent 将电子表格导出为 `.xlsx`，即可使用 Excel、WPS Office 等常见办公软件继续打开和编辑。

<details>
<summary>查看从提出需求到审阅结果的完整过程</summary>

### 1. 用自然语言描述任务

![要求 Agent 创建班级成绩表](docs/assets/readme/spreadsheet-request.png)

### 2. 修改过程中实时查看结果

![Agent 工作时显示实时电子表格浮窗](docs/assets/readme/live-worktree.png)

### 3. 在会话中确认或放弃修改

![任务完成后的电子表格审阅卡片](docs/assets/readme/review-result.png)

</details>

### 从一句话生成可交付的演示文稿

Agent 可以根据主题、受众、页数、内容结构和视觉要求生成完整演示文稿，在制作过程中逐页检查内容与布局，并把结果留在会话中审阅。

![在 DSH 会话中审阅冒泡排序教学演示文稿](docs/assets/readme/presentation-review.png)

> **可以直接交付 PowerPoint 文件：** 审阅完成后，让 Agent 将演示文稿导出为 `.pptx`，即可使用 PowerPoint、WPS Office 等常见办公软件继续播放和编辑。

<details>
<summary>查看演示文稿从需求到成品的制作过程</summary>

#### 1. 说明主题、受众和页面要求

![要求 Agent 创建冒泡排序教学演示文稿](docs/assets/readme/presentation-request.png)

#### 2. 制作过程中实时查看和校验页面

![Agent 制作演示文稿时显示实时预览窗口](docs/assets/readme/presentation-live.png)

</details>

## 你可以让它做什么

- **分析和制作表格**：读取或创建 Excel 数据，清洗字段，编写公式，设置格式、数据验证和条件格式，创建表格、图表、透视表、筛选器、迷你图与图片，最后导出为 `.xlsx`、`.csv` 或 `.tsv`。
- **撰写和排版文档**：创建段落、富文本、列表、任务、表格、图片、图表、页眉页脚、分页与页面布局。
- **创建和修改演示文稿**：从大纲生成整套幻灯片，重设计指定页面，编辑文字、形状、图片、表格、图表与转场，并检查越界、溢出和文本重叠。
- **搭建多维表格**：创建表、字段、记录和视图，使用公式字段、筛选、排序、分组及 Sheet 数据引用。
- **绘制可编辑画布**：创建形状、文本、连接线、图片、原生图表和流程图，并检查连接关系与布局。
- **组合多种内容**：一个 `.univer` 文件可以同时包含 Sheet、Doc、Slide、多维表格（Base）和 Board；公式或嵌入内容可以引用同一文件中的其他 Unit。
- **处理 Office 文件**：导入 `.xlsx`、`.csv`、`.tsv`、`.docx`、`.pptx`，修改后按对应格式导出。
- **安全审阅 Agent 修改**：所有写入先进入独立 worktree。你可以实时预览差异，在会话末尾选择合并或丢弃，不会让 Agent 直接覆盖当前版本。

### 试试这些任务

```text
帮我做一个简单的工资计算表，包含员工、基本工资、奖金、扣款、应发工资和实发工资，自动计算汇总结果。

帮我做一个冒泡排序的幻灯片课件，用 6 页讲清楚原理、逐轮比较过程、伪代码和复杂度，每页完成布局检查。

帮我创建一份正式的项目周报文档，包含执行摘要、本周进展、风险表、下周计划和页眉页脚，最后导出 docx。

创建一个客户跟进多维表格，包含公司、联系人、阶段、预计金额和下次行动，并提供按阶段分组的视图。

在同一个 .univer 文件里创建销售数据 Sheet 和汇报 Slide，让 Slide 图表引用 Sheet 数据。
```

## 能力一览

| 内容类型 | 创建与编辑 | 校验与审阅 | 导入 | 导出 |
| --- | --- | --- | --- | --- |
| Sheet | 单元格、公式、样式、表格、图表、透视表、筛选、验证、图片等 | 结构化范围检查、公式重算、范围/工作簿截图、实时预览 | `.xlsx` `.csv` `.tsv` | `.xlsx` `.csv` `.tsv` |
| Doc | 段落、富文本、列表、任务、表格、图片、图表、页眉页脚、分页 | 文档结构回读、逐页截图、实时预览 | `.docx` | `.docx` |
| Slide | 页面、文字、形状、图片、表格、图表、SVG 布局、转场 | 结构检查、文字越界/溢出/重叠检查、逐页/联系表截图、实时预览 | `.pptx` | `.pptx` |
| 多维表格（Base） | 表、字段、记录、视图、公式字段、筛选、排序、分组 | Facade 数据回读、工作台截图、实时预览 | — | `.xlsx` `.csv` `.tsv` |
| Board | 形状、文字、连接线、图片、原生图表、自动布线 | 元素与连接关系分析、全局/区域/元素截图、实时预览 | — | — |

所有类型都支持在隔离 worktree 中编辑、提交审阅、重新打开、合并或丢弃。多维表格和 Board 当前通过 Facade 回读完成结构校验；Board 暂不支持文件导出。

## 3 分钟上手

### 1. 安装插件

如果 DSH 正在运行，先在启动它的终端按 **Ctrl+C** 停止进程。运行中可以执行安装命令，但当前 DSH 进程不会自动加载新插件。

从 npm 安装插件：

```sh
dsh plugin --profile web add dsh-univer-office
```

安装完成后重新启动 DSH：

```sh
dsh web
```

DSH 启动成功后，在已有的 DeepSeek Harness 浏览器页面按 **Cmd+R / Ctrl+R** 刷新。

### 2. 直接描述结果

```text
创建 reports/q2-review.univer。读取 data/q2-sales.xlsx，生成一个带汇总指标、月度趋势和地区排名的管理看板。
```

Agent 会自动选择对应 Skills 和 `univer_*` 工具。通常会依次创建文件与 worktree、导入或创建 Unit、修改内容、回读校验，然后把 worktree 标记为待确认。

### 3. 在会话中审阅

- 新建 `.univer` 文件、创建或重开 worktree、写入内容以及提交确认时，右上角实时浮窗会同步显示结果；上一轮保持打开的非终态 worktree 会在下一轮继续显示。
- 每个被操作且在回合结束时仍存在的 `.univer` 文件都使用统一的回合卡片，可折叠或在应用内全屏打开；历史回合保留同款卡片并默认折叠。过程中创建后又删除的临时文件不显示卡片。
- 提交、合并和丢弃使用卡片内完整 Univer 页面提供的操作，不在卡片外重复显示按钮。

## 工作方式

一个 `.univer` 文件是可组合的办公容器，其中可以放置多个不同类型的 Unit。插件把 Agent 的每次任务放入独立 worktree：

```text
你的要求
   ↓
按需加载 Univer Skill
   ↓
在 draft worktree 中创建 / 导入 / 编辑
   ↓
结构回读 + 公式重算 + 布局检查 + PNG 截图验收
   ↓
实时预览与会话内审阅
   ↓
继续修改 / 合并 / 丢弃
```

只有 `merge` 和 `discard` 会结束 worktree，且两者都需要用户明确授权和 DSH 审批。`ready` 只是提交审阅，不会修改主线。

## 内置工具

日常使用不需要手动调用工具；DSH 会根据任务自动选择。下面的列表可以帮助你理解插件的覆盖范围。

| 工具 | 作用 |
| --- | --- |
| `univer_new` | 创建空 `.univer` 文件，不覆盖已有文件 |
| `univer_status` | 查看主线与 worktree 中的 Unit 和状态 |
| `univer_worktree` | 创建、提交、重开、合并或丢弃隔离 worktree |
| `univer_unit` | 创建或删除 Sheet、Doc、Slide、多维表格（Base）、Board Unit |
| `univer_import` | 把 Office 文件导入为新 Unit |
| `univer_inspect` | 读取文档结构或指定 Sheet 范围 |
| `univer_execute` | 执行精确 Univer Facade API 读取或修改 |
| `univer_export` | 导出 Sheet、Doc、Slide 或多维表格 |
| `univer_lint` | 检查 Slide 文字越界、溢出和重叠 |
| `univer_compile_svg` | 用真实字体度量把 SVG 编译到指定 Slide 页面 |
| `univer_screenshot` | 把 Sheet、Doc、Slide、多维表格或 Board 渲染为 PNG，并把图片返回给支持视觉输入的模型 |
| `univer_api` | 按意图检索插件实际包含的 Univer Facade API |
| `univer_resources` | 查找、读取和导出内置 SVG 图标、Logo、Emoji 与插画资源，并管理下载缓存 |

插件还包含 8 个版本匹配、按需加载的 Skills：核心编排、Sheet、Doc、Slide、多维表格（Base）、Board、Embed 和跨 Unit 公式。

## 预览与审阅体验

- **实时 Univer 窗口**：新建文件或创建、重开、写入和提交 worktree 时主动显示，可拖动、缩放、折叠和全屏；保持打开的非终态 worktree 会跨回合延续。
- **统一回合卡片**：每个被操作且当前仍存在的 `.univer` 文件都有独立的完整 Univer 卡片；纯读取不会覆盖同一回合已经发生的 worktree 生命周期结果，已删除的临时文件不会留下加载卡片。
- **历史审阅**：`draft`、`ready`、合并和丢弃结果都使用同款卡片保留在原回合，历史卡片默认折叠。
- **多会话隔离**：每个 DSH 会话只展示属于自己的窗口、卡片和审阅状态。
- **中英文界面**：插件外壳和已打开的 Viewer 跟随 DSH 的界面语言。
- **Viewer 导入、导出与打印**：实时 trunk Viewer 可通过 Univer Ribbon 把 Office 文件导入为当前 `.univer` 中的新 Unit，导出 Sheet、Doc、Slide 或多维表格，并打印受支持的 Unit。只读 Sheet 中不提供保护和打印。worktree 和 merge preview 不开放导入导出；其他受支持的 Unit 仍可打印，Board 仅提供打印。
- **Sheet 版本历史**：实时 trunk Sheet 可在 Ribbon 中查看按提交时间聚合的历史版本。只读审阅只能查看，可编辑 trunk 可以由用户显式恢复；worktree 和 merge preview 不显示这项能力。

## 要求与限制

- DeepSeek Harness，以及 Node.js `>=22.19.0`。
- Slide 布局检查、SVG 真实文字度量和 PNG 截图需要本机 Chrome/Chromium；也可以通过 `UNIVER_RENDER_BROWSER` 指定浏览器路径。
- 截图只在当前模型路由声明支持图片输入时执行。它会把 PNG 保存到会话 workspace 的显式输出目录并作为模型可见附件返回；结构回读、Slide lint 与截图仍各自验证不同事实，最终结果也可在实时 Viewer 中人工复核。
- Slide 的母版、版式页和演讲者备注不在当前编辑范围内。
- Board 的思维导图、表格、墨迹和高级编辑，以及 Board 文件导出尚未开放。

## 配置

默认配置适合本地使用：Gateway 会在首次读取文件状态时从端口 `9080` 启动；若该端口被占用，则依次尝试 `9081`、`9082`。如需定制，可在 bundle 的 Cordis 配置层设置：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `gatewayPort` | `9080` | 内置 Gateway 的起始本地端口；被占用时逐次加一 |
| `autoStartGateway` | `true` | 首次访问时自动启动 Gateway |
| `gatewayStartupTimeoutMs` | `10000` | Gateway 启动超时 |
| `gatewayRequestTimeoutMs` | `3000` | 状态读取超时 |
| `gatewayMutationTimeoutMs` | `60000` | Gateway 写操作超时 |
| `unitContentOperationTimeoutMs` | `120000` | 导入、导出、检查和执行超时 |
| `screenshotOperationTimeoutMs` | `120000` | 一次浏览器截图操作的总超时 |
| `screenshotMaxPages` | `30` | 一次 Doc 或 Slide 截图最多渲染的页数 |
| `screenshotMaxPixels` | `16777216` | 每张截图允许的最大像素数 |
| `resourceCacheRoot` | `$DSH_HOME/cache/dsh-univer-office/resources` | 下载 SVG 资源的持久缓存目录；未设置 `DSH_HOME` 时使用 `~/.dsh` |
| `resourceDownloadTimeoutMs` | `15000` | 单个 SVG 资源下载超时 |
| `resourceOperationTimeoutMs` | `120000` | 一次资源库工具操作的总超时 |
| `tools` | `true` | 注册 `univer_*` 工具 |
| `skills` | `true` | 注册内置 Univer Skills |

其余缓存与提交确认选项见 [`src/host/config.ts`](src/host/config.ts)。

## 卸载

```sh
dsh plugin --profile web remove dsh-univer-office
```

## 开发

本项目是一个标准 [DSH bundle](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md)。Host 组合 Univer Service Provider、Tools Consumer、webServer Consumer 和 Skill Provider；插件自带 Gateway、Viewer、无头 Unit Content Worker 与 Slide render machine。依赖方向和运行时边界见[架构文档](docs/architecture.md)。

```sh
pnpm install
pnpm run build
pnpm run test
```

构建 npm tarball 和 zip 发布包：

```sh
bash scripts/build-dist.sh
```

`lib/`、`artifacts/`、`dist/`、`*.tgz` 和 `univer-dsh-plugin.zip` 都是生成物，不提交到仓库。

## 官方包名

请只安装 `dsh-univer-office`。以下相似名称是本项目为防止仿冒而保留的 deprecated npm 占位包，不包含插件代码：

- `dsh-univer-plugin`
- `dsh-univer-office-suite`
- `dsh-univer-suite`
- `univer-office-suite`
- `univer-office`

## 许可

[Apache-2.0](LICENSE)
