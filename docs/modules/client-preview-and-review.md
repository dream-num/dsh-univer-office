# Client 预览与审阅

DSH Client 在文件树、会话审阅卡片和实时浮窗中嵌入 Viewer。Client 根据工具事件选择要展示的目标，根据 Host 返回的当前文件状态显示页面。页面内的编辑、版本导航和比较由 [Viewer](viewer.md) 负责。

## 会话事实与当前状态

[univerTurnDefinition](../../src/client/conversation/univer-turn-definition.ts) 消费 `turn/start`、`tool/call` 和 `tool/result`，按 callId 配对调用与结果，按文件保存有序的操作、执行阶段及文件、worktree、Unit 标识。失败结果保留在回合记录中，成功结果参与 outcome 归约。

[PreviewCard](../../src/client/components/preview-card.tsx) 读取所属回合的操作，从 [useUniverStates](../../src/client/hooks/use-univer-state.ts) 查询会话工作区中的 `FileState`。它提供当前 worktree 状态、changed Units 和授权后的 Viewer URL。实时状态与历史回合记录分别维护。HTTP 集中在 Client API 层，组件使用 hooks 查询或变更状态。

## 回合如何选择展示目标

同一 worktree 的成功生命周期操作按发生顺序转换：

| 操作 | Turn outcome |
| --- | --- |
| `worktree create` | 选择返回的 worktree，进入 `draft` |
| `worktree reopen` | 选择该 worktree，进入 `draft` |
| `worktree ready` | 选择该 worktree，进入 `ready` |
| `worktree merge` | 记录该 worktree 已合入，展示 Trunk |
| `worktree discard` | 记录该 worktree 已丢弃，展示 Trunk |

只有后续成功的生命周期操作可以改变已有生命周期结论。

### 内容写入

以下操作选择其显式 worktree、标记内容发生变化，并记录优先 Unit；它们不覆盖已经成功产生的 `ready`、`merged` 或 `discarded` 结论：

- `univer_execute`；
- `univer_import`；
- `univer_unit create/remove`；
- `univer_compile_svg`。

Host 返回的最终 worktree 状态仍可校准投影预期。例如投影选择了一个 worktree，而 Host 已返回 `ready`，卡片应展示 merge preview。

### 读取操作

`univer_status`、检查、导出、布局检查、截图及 PDF 打印均为读取操作。只有读取时，第一个成功读取中明确指定的 worktree 成为展示目标；都未指定时展示主线。一次成功读取可以更新优先展示的 Unit。例如 `ready → inspect → status` 仍指向 ready worktree，Host 当前状态决定实际页面。

## 审阅卡片

每个 `Turn + file` 渲染一张统一卡片。卡片沿用当前审阅卡片布局：

- header 中显示文件名、worktree 名称、完整文件路径、状态、全屏和折叠控制；
- body 中显示 changed Unit chips 和完整 Univer Viewer；
- 不增加外部操作摘要、scope chips 或底部 action footer；
- 提交、丢弃和合入操作全部使用 Univer Viewer 内置按钮。

Viewer 选择由投影 scope 与权威状态共同决定：

| scope / 权威状态 | Viewer |
| --- | --- |
| Trunk | 当前版本 |
| `draft` | worktree 页面 |
| `ready` | merge preview 页面 |
| `merged` | 合入后的当前版本 |
| `discarded` | 未受该修改影响的当前版本 |
| 加载中 | 同一卡片布局内的加载状态 |
| worktree 不可用 | 同一卡片布局内的不可用状态 |

状态加载失败时不得回退旧卡片。一般网络、Gateway 或授权失败仍使用同一卡片表达加载中或不可用；若 Host 以结构化 `INVALID_FILE_PATH` 明确确认文件已不存在，则不渲染卡片。这覆盖 Agent 在同一 Turn 中创建临时 `.univer`、完成排查后再通过 Bash 删除的场景，避免留下永久加载卡片。历史 Turn 也使用同一组件和布局，其 worktree 状态可由当前 `FileState` 校准。历史卡片展开后，Viewer 表达的是当前状态，不能表述为历史内容快照。

### 默认展开与全屏

每个挂载的 Viewer 都是一个独立的协作客户端。同一页面里多个 Viewer 连接同一文件时，会出现多个协作光标、修订号暴涨，以及拼音输入的预输入被打断后写进正文。因此卡片按以下规则控制 Viewer 的数量：

- 只有会话中最近一个渲染卡片的 Turn，其卡片默认展开；更早 Turn 的卡片都是历史卡片，默认折叠。没有 Univer 文件的 Turn（例如纯对话）不参与比较，因此不会让已展开的卡片折叠。
- 折叠的卡片不挂载 Viewer iframe，展开时才加载，再次折叠时卸载。重新展开会重新加载 Viewer。
- 卡片在用户眼前变成历史卡片时自动折叠；全屏中的卡片例外，保持展开，避免用户正在阅读的 Viewer 被卸载。用户手动展开的历史卡片保持展开，直到用户自己折叠。
- 同一 Turn 内同一文件只有一张卡片，所以默认状态下每个文件最多只有一个 Viewer，且数量不随对话轮次增长。用户手动展开多张历史卡片时，同一文件仍可能同时存在多个 Viewer，当前不做限制。

审阅卡片平时使用文档流中的非模态 dialog，全屏时通过 `showModal()` 进入浏览器 top layer，避免对话祖先的 containment、transform 或裁剪限制。切换不迁移 DOM 或重载 Viewer iframe，原位置保留等高占位；退出或卸载时撤销模态状态与键盘监听。Esc 同时监听 Host 与同源 Viewer，已被 Viewer 消费的按键不用于退出全屏。

桌面端展开的卡片默认高度约 650px。文件路径、文件名、worktree、状态和全屏控件位于 header，嵌入页面默认折叠左侧边栏；全屏期间可用 Esc 退出。终态 worktree 保留在所属回合，展示主线完整页面。

## 实时浮窗

浮窗只在以下当前 Turn 操作出现时主动拉起：

- `univer_new`：立即为文件拉起浮窗；创建完成后展示 Trunk，执行期间展示同一浮窗的加载状态；
- `univer_worktree create`：成功取得 `worktreeId` 后展示 draft worktree；
- `univer_worktree reopen`：展示 draft worktree；
- `univer_execute`；
- `univer_import`；
- `univer_unit create/remove`；
- `univer_compile_svg`；
- `univer_worktree ready`：展示或切换到 merge preview。

以下操作不主动拉起已关闭或尚未出现的浮窗：

- `univer_status`；
- `univer_inspect`；
- `univer_lint`；
- `univer_export`。

`merge` 与 `discard` 不主动拉起已关闭浮窗。若对应浮窗原本打开，则在 Host 确认终态后关闭。

### 关闭与跨回合延续的交互约定

上一轮结束时浮窗可以停止渲染，但保留打开意图。下一轮开始后重新查询对应文件状态：

- `draft` 或 `ready` worktree 继续打开；
- `merged` 或 `discarded` worktree 清除打开意图，不再出现；
- 查询暂时失败时保留打开意图并等待重试，不能把失败当作终态；
- `univer_new` 拉起的文件浮窗在没有 worktree 时可继续展示 Trunk；后续创建 worktree 时原位升级到该 worktree。

用户手动关闭优先于自动延续。关闭后清除对应打开意图，下一轮不自动恢复；新的 `new`、创建、写入、`reopen` 或 `ready` 操作可以再次拉起。读取操作不能推翻用户的关闭决定。

同一 Turn 中同一文件最多保留一个浮窗。新的明确写入或生命周期 scope 更新现有浮窗，不为同一文件叠加多个窗口。

当前 [UniverDock](../../src/client/components/univer-dock.tsx) 按会话挂载，按文件保存打开的目标，并用组件内的 callId 集合识别已处理的操作。它只在会话运行且实时预览开启时显示窗口和轮询状态。重新挂载时会再次扫描会话历史，旧调用可能重开已关闭的窗口；Host 报告文件或 worktree 已消失时，浮窗也可能残留。相关偏差见 [#153](https://github.com/dream-num/dsh-univer-office/issues/153)。

## 设置与文件树

展示配置按运行时能力兼容两种 DSH 契约：旧版 Host 使用 `settings.register` 注册 `univer-office` 命名空间，Client 通过 `settingsScope.bind` 订阅；0.1.7-alpha.1 起 Host 从根插件 `Config` 的 `volatile` 字段派生表单，Client 通过 `configForms.get` 读取 bundle patch 拥有的 `univer` entry。该 entry id 必须与 `cordis.patch.yml` 一致。Host schema 使用序列化的 `volatile` metadata，兼容没有 `.volatile()` builder 的旧 schemastery；新版 Host 不再调用已移除的 `settings.register`。Client 共享最小读写接口，处理新版写入返回 `false` 和网络异常，保存失败时保留 draft 并恢复保存按钮。旧版独立设置文档与新版 profile 存储不同，本插件不迁移旧配置；升级后可能需要重新设置偏好。

两种契约均拥有两个相互独立的布尔偏好，默认均开启且实时生效：`autoOpenLivePreview` 控制实时浮窗及其轮询，`conversationReviewCards` 控制回合尾部审阅卡片是否渲染。Settings 服务或对应 Client 设置表面缺席时，Client 保持默认开启，不让可选设置能力阻塞预览与审阅注册；任一偏好关闭只移除它自己的表面，不影响另一者，也不影响文件树按需预览。偏好投影把 `loading` 解析为全关，避免被关闭的表面在持久值到达前闪现；而设置文档加载失败时保持产品默认，因为「读不到设置」不是用户的决定。设置卡片的一份 draft 按字段累计、一次保存提交，因此两个开关可以分别覆盖与恢复默认。

文件树按需预览是浮窗之外的第二条入口：它不由任何 `univer_*` 操作触发，而是让 `.univer` 地址交给 Viewer 渲染。DSH 右栏按地址认领标签类型，排序规则是**档位（`extension` > `builtin` > `fallback`）→ 命中模式字符串长度 → 注册顺序**，因此本插件按宿主形态注册两条路径，任一时刻只有一条生效：

- **DSH 原生右栏**：`ctx.sidebarRightTabs.register` 注册自己的 tab 类型（自有 kind、`patterns: ['*.univer']`、`extension` 档、`canOpen` 只接受 session 作用域地址），正文注册在 keyed seat `sidebar.right.pane.tab`，通过 `useTabInfo().tab.contentId` 取得资源地址。地址语法（`dsh-resource://file/…`）由本包镜像实现：客户端 bundle 的 purity gate 禁止 value-import 未列出的 `@deepseek-ai/*` 包，生态做法同样是本地镜像。
- **`dsh-better-sidebar`（可选）**：该插件以自有 editor 类型在**同档**用整地址模式 `dsh-resource://file/**` 接管文件地址。同档比模式长度，它的模式更长，所以在它存在时永远赢下 claim，地址进入它的 `matchFileViewer` 注册表；本插件因此在那里注册文件预览器（`fetchStrategy: 'none'`，声明 `.univer` 扩展名）。若缺这条注册，`.univer` 会落到它的 catch-all code viewer，即二进制当文本渲染。

两条路径互不依赖：没有 `sidebarRightTabs` 时原生注册被跳过，没有 `betterSidebar` 时预览器注册被跳过，两者都不阻塞其余 Client 表面。两条路径共用同一个预览正文组件，因此加载态、Host 明确确认文件不存在、Gateway 未运行、Viewer 目标解析只实现一次。预览器声明 `fetchStrategy: 'none'`，因为 `.univer` 是二进制容器：任何按字节读取的策略都会落到通用下载面板，而 Viewer URL 只能由 Host 授权后投影。它复用回合卡片的同一份 `FileState` 轮询解析 Viewer 目标，以主线 URL 打开完整 Viewer，版本切换与 worktree 审阅统一由 Viewer 管理，外层不再维护版本选择或重复提供切换控件。完整 Viewer 首次打开未指定 worktree 或 Unit 的文件链接时，若主线没有 Unit，则按 worktree 列表顺序进入第一个 draft 或 ready worktree；没有活跃 worktree 时保留空状态，显式目标与 embedded scope 不受此默认导航影响；`useGatewayStatus` 额外暴露 Gateway 阶段，使未运行的 Gateway 变成可操作的启动入口而不是永久加载态。

Client 显式注入 `uiConversation` 后才注册回合定义；旧版 `settingsScope` 与新版 `configForms` 作为可选子 fiber 注入。缺少任一设置服务不得阻塞主 Client 激活，迟加载后订阅偏好，卸载时撤销订阅。

## 验证

[回合归约测试](../../test/unit/client/univer-turn.test.ts)覆盖操作顺序与文件标识；[Client 集成测试](../../test/integration/client)覆盖会话状态、偏好、关闭和后续事件；[浏览器布局测试](../../test/e2e/client-layout.test.ts)覆盖浮窗、全屏、Esc 与 iframe 生命周期。
