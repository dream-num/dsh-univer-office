# DSH × Univer 插件架构

状态：已接受
日期：2026-08-17

本文档是本插件实现与重构的架构依据。原型代码只用于验证产品需求，不构成兼容性约束；重构可以删除、改名或重写任意原型实现，但必须保留本文列出的用户功能。

## 1. 决策摘要

本插件采用单 npm 包、多个 Cordis 插件角色的结构：

- `service` 定义稳定的 Univer 领域接口；
- `provider` 实现该接口并拥有状态缓存、文件操作和 worktree 操作；
- `webServer` 把需要浏览器访问的服务能力映射为 Host HTTP API；
- `tools` 把适合模型调用的内容创作能力映射为 DSH 工具；
- `skills` 向 DSH Skill Registry 提供按需加载的 Univer 工作流与 Unit 专项知识；
- `processes/gateway` 负责插件内置 Gateway 进程和 Viewer 资源；
- `workers/unit-content` 是一次性 Unit Content Worker 的子进程入口；
- `client` 负责 DSH 浏览器端的预览、实时 worktree 窗口和用户审阅界面；
- `shared/wire` 只存放 Host 与 Client 共享的纯 JSON 数据类型。

用户只安装本插件即可使用全部功能。全局 `univer` CLI 不属于运行依赖；Unit 的导入、检查、执行和导出由插件内置的一次性 Unit Content Worker 完成。

代码、API 和界面使用具体名称 `Gateway`、`Viewer`、`Unit Content Worker` 和 `artifacts`，不使用含义宽泛的 `runtime` 或 `daemon` 作为本插件领域名称。

## 2. 必须保留的产品功能

- 在 DSH 会话中发现 `.univer` 文件，并为每个文件显示采用统一审阅布局的回合尾部卡片；
- 在 DSH 内以 Viewer 全屏预览文件；
- worktree 创建或更新后显示实时浮动窗口；
- 一个 worktree 改动多个 unit 时，只列出有改动的 unit 并允许切换；
- 会话结束后在最近一次操作各 worktree 的回合末尾为 `draft` 或 `ready` worktree 显示嵌入式审阅面板；
- 后续回合再次操作同一 worktree 时，旧回合保留同一张完整卡片并默认折叠，不回退到旧文件预览卡片或单独历史 header；
- 审阅卡片使用紧凑 header：首行显示 Univer 文件名和右侧的 worktree 名称，次行只显示完整文件路径，状态、折叠和全屏控制位于右侧；桌面端不同生命周期的展开卡片默认总高度约 650px，内嵌完整页面默认折叠左侧边栏，卡片折叠保留已加载页面；全屏时隐藏折叠按钮，Esc 退出全屏；
- draft、ready 状态的提交确认、丢弃与合入当前版本只使用完整 Univer 页面内置操作，卡片外壳不重复提供 action footer；
- worktree 进入 `merged` 或 `discarded` 终态后不再显示浮窗或修改操作，但保留审阅卡片并在完整页面中显示主线；
- 插件按需启动并管理内置 Gateway 和 Viewer；
- 多个 DSH 会话的预览目标与审阅状态相互隔离；
- 中英文界面；
- Univer 文件尚无 Unit 时，Viewer 使用现有空状态布局并显示“空文件”；
- 模型可创建空 `.univer` 文件、管理 worktree 与 Unit、导入 Office 文件、查询 Univer API、修改、检查和导出内容；
- 模型可对 Slide 执行不输出图片的真实布局检查，并把 workspace 内的 SVG 编译并应用到显式 Slide 页面；
- 模型可从内置多 registry 资源库查找、读取并导出 SVG 资源，下载缓存由 Provider 持久管理；
- 模型可把显式 Unit 渲染为 workspace 内 PNG，并在当前模型支持图片输入时以 DSH attachment 回读；Sheet 支持范围，Doc/Slide 支持页面，Slide 支持联系表，Board 支持区域与元素聚焦；
- `ready` 与 `reopen` 属于模型工作流，`merge` 与 `discard` 只在用户明确要求且 DSH 审批通过后执行；

原型的文件布局、类名、HTTP 路径、CSS 类名、bash 命令解析方式和内部数据格式均不需要保留。

## 3. 进程与模块组成

```mermaid
flowchart LR
    Model["Agent / Model"] --> Tools["Tools Consumer"]
    Model --> SkillRegistry["DSH Skill Registry"]
    Skills["Bundled Skill Provider"] --> SkillRegistry
    Browser["DSH Client"] --> WebServer["Host webServer Consumer"]
    Tools --> Service["Univer Service"]
    WebServer --> Service
    Provider["Univer Service Provider"] --> Service
    Provider --> GatewayAdapter["Gateway Adapter"]
    Provider --> UnitContentAdapter["Unit Content Adapter"]
    Provider --> GatewaySupervisor["Gateway Supervisor"]
    GatewaySupervisor --> Gateway["Bundled Gateway process"]
    GatewayAdapter --> Gateway
    UnitContentAdapter --> Worker["Bundled one-shot Unit Content Worker"]
    Worker --> Gateway
    Browser --> Viewer["Bundled Viewer served by Gateway"]
```

根插件是组合入口。它必须由 DSH 配置以裸包名加载，使 DSH 能发现包清单中的 `dsh.client`；根插件再在独立 Cordis fiber 中挂载 Provider、webServer Consumer、Tools Consumer 和可配置的 Skill Provider。

### Host 与 Client 的边界

Host 是可信的 Node.js 进程，负责文件访问、进程管理、Gateway 通信、输入校验和工具执行。Client 是浏览器模块，只能通过 `/univer-api/*` 访问 Host，不读取本地文件、不启动进程，也不持有 Gateway 管理权限。

Viewer 可以直接连接 Gateway 的 HTTP/WebSocket 接口以获得实时内容，但 Viewer URL 必须由 Host 根据已验证的文件和 worktree 生成，Client 不自行拼接文件标识。Client 只可以在这个不透明 URL 上设置纯展示参数，例如把当前 DSH 语言映射为 Viewer 的 `lang` 参数。

## 4. 目录结构

```text
src/
  host/
    index.ts                         # 根组合插件
    config.ts                        # 插件配置及默认值解析
    artifacts/
      paths.ts                       # 随包 Gateway、Viewer、Worker 与原生产物路径
    service/
      univer-service.ts              # Service Definition
      types.ts                       # 服务请求与返回类型
      identifiers.ts                 # branded file/worktree/unit ids
      workspace.ts                   # workspace 路径解析与 realpath 授权
      errors.ts                      # 稳定的领域错误
    provider/
      plugin.ts                      # Service Provider
      gateway-univer-service.ts      # 服务实现
      unit-content-operations.ts     # Unit 内容操作
      render-source-operations.ts    # 截图主 Unit、引用 Unit 与图片资源装配
      render-operations.ts           # browser-backed lint、SVG 编译与截图
      resource-operations.ts         # 内置 SVG registry、缓存与安全导出
      worktree-operations.ts         # worktree 领域操作
      state-cache.ts                 # 有明确失效规则的缓存
    webServer/
      plugin.ts                      # Host HTTP Consumer
      router.ts                      # HTTP 分发和 wire 校验
      session-scope.ts               # 会话与 workspace 授权范围
      routes/
        status.ts
        state.ts
        gateway.ts
        worktree-action.ts
    tools/
      plugin.ts                      # Tools Consumer
      workspace.ts                   # 从 tool exec session 取得 workspace scope
      presentation.ts                # 纯工具卡片呈现函数
      definitions/
        new.ts
        status.ts
        worktree.ts
        unit.ts
        import.ts
        inspect.ts
        execute.ts
        export.ts
        lint.ts
        compile-svg.ts
        screenshot.ts
        api.ts
        resources.ts
    skills/
      plugin.ts                      # bundled lazy Skill Provider
    adapters/
      gateway/
        client.ts
        file-api.ts
        worktree-api.ts
        mapping.ts
      unit-content/
        protocol.ts                  # Unit Content Worker 进程协议
        worker.ts                    # 一次性 worker 启动、取消与结果校验
    processes/
      gateway/
        supervisor.ts                # Gateway 生命周期与并发启动合并
        gateway-process.ts           # spawn、ready、退出和清理
        launcher.ts                  # Gateway 启动参数与环境组装
        protocol.ts                  # 健康检查及进程状态
  workers/
    unit-content/
      entry.ts                       # 一次性无头 Univer 子进程入口
      license.ts                     # Worker 使用的 Univer license
      runtime/                       # 本地 snapshot/reference adapters
  render-machine/                    # 组装 SDK Render Page 的 machine-facing browser entry
  gateway-app/
    gateway-entry.ts                 # Gateway 子进程入口
    transport/http.ts                # 文件、worktree 与 Unit HTTP 控制面
    collab-service.ts                # Gateway 协作领域实现
    contract/                        # Gateway wire types
    univerfile-sqlite/               # `.univer` 持久化
  viewer-app/                        # Viewer browser application
  viewer-support/
    render-preset/                   # Viewer 的 Univer 渲染组合
    importrange-formula/             # Viewer 的 IMPORTRANGE plugin
  client/
    index.tsx                        # dsh.client 入口
    api/
      univer-api.ts                  # 唯一 HTTP 访问层
    conversation/
      univer-turn-definition.ts      # 归约可回放的 Turn 操作与生命周期结果
    hooks/
      use-univer-state.ts
    components/
      preview-card.tsx
      worktree-window.tsx
      review-panel.tsx
      unit-chips.tsx
      univer-dock.tsx
    locales/
      en.ts
      zh.ts
    styles/
      worktree.ts
  shared/
    wire/
      status.ts
      state.ts
      actions.ts
lib/
  index.js                           # gitignored 的 Host 生成入口
  client.js                          # gitignored 的 ModuleLoader Client bundle
  types/                             # gitignored 的类型声明
artifacts/                            # gitignored 的发布运行产物
  viewer/                            # 从 viewer-app 生成
  render-machine/                    # 从 render-machine 生成
  gateway.cjs                        # 从 gateway-app 生成
  unit-content-worker.mjs           # 从 workers/unit-content 生成
test/
  host-smoke.mjs
  client-smoke.mjs
  integration-smoke.mjs
  skills-smoke.mjs
scripts/
  build.mjs
skills/
  univer/SKILL.md                    # 核心工作流与安全规则
  univer-sheet/SKILL.md
  univer-doc/SKILL.md
  univer-slide/SKILL.md
  univer-base/SKILL.md
  univer-board/SKILL.md
  univer-embed/SKILL.md
  univer-cross-unit-formula/SKILL.md
```

当前仍采用单包发布。只有当某一层具备独立版本、独立消费方或明显不同的发布节奏时才拆 npm 包；目录分层本身不是拆包理由。

## 5. 依赖规则

依赖只能沿下列方向发生：

```text
client components -> client hooks -> client api -> shared/wire
webServer consumer -> service <----- tools consumer
                         ^
                         |
                  provider -> adapters -> processes / workers / gateway-app
bundled skill provider -> DSH skill registry
```

具体约束：

1. webServer Consumer 和 Tools Consumer 只能调用 `ctx.univer`，不得直接调用 Gateway、Unit Content Worker、子进程或文件系统。
2. Provider 是唯一可以组合 Gateway、Unit 内容操作和缓存的层。
3. `host/processes/gateway` 只管理 Gateway 进程与资源，不包含 worktree、unit、merge 等业务规则。
4. Client component 不直接 `fetch`；HTTP 访问集中在 `client/api`，轮询和 mutation 状态集中在 hooks。
5. `shared/wire` 不依赖 Node.js、React、Cordis 或上游 Univer 包，且所有值必须可 JSON 序列化。
6. Gateway 与 Worker 的应用源码分别属于 `src/gateway-app` 和 `src/workers/unit-content`。它们通过精确版本 SDK package 构建，不从外部 checkout 同步源码；生成 executable 不入库。
7. Render Machine browser page 使用与 runtime 精确同版本的 `@univer-cli/univer-render-page` 提供页面协议与 render operations，并注入本仓库与 Viewer 共享的 Univer composition；Viewer、render preset 和 IMPORTRANGE plugin 是本仓库的普通源码。仓库不提交上游源码快照目录或预构建 Viewer。
8. Skill Provider 只负责发现与加载包内 Markdown，不调用 Service，也不复制工具 schema。
9. 所有 Cordis 注册通过 effect 生命周期撤销；插件卸载后不得遗留路由、工具、Skill provider、定时器或子进程。

## 6. Service Definition

`UniverService` 是 Host 内部唯一稳定的领域入口。Service Definition 只描述调用方依赖的行为，不暴露 HTTP、Gateway endpoint、worker 协议或子进程对象。

服务能力分为六组：

- File 与状态：创建空 `.univer` 容器，读取 trunk、worktree 与 Unit 状态；
- Collaboration：创建 worktree，执行 ready、reopen、merge 与 discard 生命周期操作；
- Unit Content：在 draft worktree 中创建、移除或导入 Unit，以及检查、执行、导出和读取 machine render snapshot；
- Render：对 Slide snapshot 执行布局检查，把 SVG 编译为 Facade program 并提交到显式 draft worktree，以及为显式 Unit、依赖 Unit 和图片资源装配渲染源并生成 PNG；
- API Reference：查找 API 候选并读取指定 Facade/方法的完整参考。
- Resource Library：列出 registry、按语义搜索、读取 SVG、导出到显式 workspace 目录和清理 Provider-owned 缓存。

所有文件操作都接收显式 workspace scope。Provider 必须将文件解析为绝对路径，并拒绝 scope 外路径。文件 ID、worktree ID 和 unit ID 在服务层使用 branded 类型，不能以无语义的裸字符串跨层传递。

默认值在 Provider 的 `resolve(request)` 阶段产生；执行方法不使用隐藏的 `value ?? default`。可随部署变化的端口、启动超时、轮询间隔和自动启动策略必须来自已校验配置。

## 7. Provider、Gateway 与 Unit Content Worker

Provider 按规范化文件路径维护缓存；同一个插件实例只持有一个 Gateway 进程，多个 workspace 共享该协作进程，但浏览器文件请求必须先绑定 live DSH session 并通过该 session `cwd` 的 realpath 范围校验。Gateway 的进程复用不构成文件授权。并发的 `ensureGateway` 调用共享同一个启动 Promise；启动失败、进程提前退出和插件卸载都必须释放状态并允许安全重试。

Gateway Supervisor 只负责：

- 选择并验证监听端口；
- 启动随包发布、由 `src/gateway-app` 构建的 Gateway；
- 等待健康检查成功；
- 提供 Gateway origin 与 Viewer origin；
- 在所属 Cordis fiber 结束时终止插件启动的进程。

Unit 的导入、检查、执行和导出由 Unit Content Adapter 启动一次性 Unit Content Worker。Worker 连接 Gateway Supervisor 提供的同一个 Gateway，操作完成或取消后退出，不拥有独立持久状态。Gateway 的 worktree 控制面直接提供 Unit 创建与移除端点，并通过 collaboration service 与 lifecycle event 完成操作。写操作只能针对显式 draft worktree；Gateway 是提交结果和 revision 的唯一依据。

Viewer Ribbon 的交互式导入导出使用 Gateway 中逐 `.univer` 隔离的 Universer exchange 协议：`source=1` 上传、异步 import/export task、sign-url 与 artifact content。该协议只挂在 trunk 路径；导入在当前 `.univer` trunk 创建新 Unit 并发布结构化 `unit_added` 事件，导出从 trunk head 物化快照。临时 artifact 和 task 有界、可过期，并随文件 runtime 一起释放。嵌入资源继续使用 `source=3` 且按 Unit/worktree 授权，两类文件协议不得混用。

Gateway 还为 trunk revision 组合 Collaboration SDK History Service 与 Endpoint。Gateway 自己在共享 `.univer` connection 上实现 History database adapter；`history@1` 表是可按 Unit 从 core Unit/changeset 重建的派生索引。文件 runtime 启动时先 reconcile 到 trunk head，再开放 SDK transport。Viewer 只为 trunk Sheet 注册 History Loader；只读审阅不能恢复，worktree、merge preview 和其他 Unit 不呈现历史入口。

它不得复用或终止外部启动的 Gateway。内置 Gateway 默认从 `9080` 启动，端口被占用时逐次加一；只有结构化确认端口占用时才能继续尝试下一端口，其他启动失败必须立即返回。健康检查需要验证 Viewer 身份，不能把任意返回 HTTP 200 的本地服务误认为 Gateway。

## 8. webServer Consumer 与浏览器协议

webServer Consumer 使用 DSH `webServer` 的 prefix route 注册 `/univer-api`。资源如下：

- `GET /univer-api/status`：Gateway 与 Unit 内容能力状态；
- `POST /univer-api/gateway/start`：按需启动插件持有的 Gateway；
- `GET /univer-api/state`：按 `sessionId` 校验当前会话 `cwd` 后返回文件与 worktree 状态；
- `POST /univer-api/worktree-action`：按请求体中的 `sessionId` 校验文件后执行用户发起的 ready、reopen、discard 或 merge。

路径是浏览器协议，不等同于 Service 方法。Router 负责 HTTP method、请求体大小、JSON 和字段校验，route handler 只把已验证请求映射为服务调用。错误返回稳定的错误 code 和可显示消息，不把堆栈、绝对内部资源路径或子进程输出原样暴露给浏览器。

worktree 修改审阅操作必须绑定当前 DSH 会话及其 workspace scope，不能只凭浏览器提交的绝对路径授权。

## 9. Tools Consumer

Tools Consumer 注册面向模型的领域工具，而不是一个透传 CLI 的通用工具：

- `univer_new`
- `univer_status`
- `univer_worktree`
- `univer_unit`
- `univer_import`
- `univer_inspect`
- `univer_execute`
- `univer_export`
- `univer_lint`
- `univer_compile_svg`
- `univer_screenshot`
- `univer_api`
- `univer_resources`

每个工具有独立的参数 schema、结果 schema、超时/取消处理和纯 presentation。工具结果必须包含恢复 Client 预览目标所需的结构化文件、worktree 与 unit 标识，并进入 DSH 会话日志。领域失败使用 DSH 可持久化的稳定错误 code，并在模型可见文本中保留 `Error [CODE]`，使 Agent 不必解析自然语言即可选择恢复路径。Client 优先从 `tool/call` 与 `tool/result` 事件恢复目标，不依赖 bash 文本解析。

`univer_status` 是发现文件状态与显式 Unit ID 的入口。所有内容工具要求显式 Unit ID，所有文件和输出路径都绑定当前 tool exec session 的 workspace，并在 Provider 边界再次验证。`univer_screenshot` 在读取文件前确认 attachment service、PNG 限制与当前模型图片输入能力，生成文件再次经过 workspace realpath 授权，再保存为持久 DSH image attachment；结构化文本保留恢复目标与图片元数据。`univer_resources` 的 cache root 只由 Provider 配置拥有，不向模型暴露；export 目录和每个实际输出文件都必须通过 workspace 授权。`ready` 提交修改等待审阅；同一任务需要继续修改时用 `reopen`。`merge` 与 `discard` 只有在用户明确要求时才可调用，并通过 `tools/pre-execute` 返回审批请求，不能由模型自行决定。

包内 `univer` Skill 描述完整编排顺序，sheet、doc、slide、base 与 board Skill 只在对应 Unit 工作时按需加载，Embed 与跨 Unit 公式各有 Topic Skill。内容以同版本 Univer CLI runtime Skills 为基线：只移除插件未开放的 command，并把 CLI command 调用替换为结构化 DSH Tool 或 Client 自动预览。Slide Skill 要求新页面主动使用 `univer_compile_svg`，结构检查后对每个变更页运行 `univer_lint`，最终逐页运行 `univer_screenshot`；其他 Unit Skill 使用其范围、分页、工作台或画布截图目标。需要图标、Logo、Emoji 或插画时先通过 `univer_resources` 查找和导出。不确定或可能随 SDK 变化的 API 必须通过 `univer_api` 查询。

Client 只解析结构化 `univer_*` 工具事件，不从 bash 命令或自由文本猜测文件与 worktree。

## 10. Client

Client 是状态投影，不拥有 worktree 真相。预览目标来自可回放的会话事件；实时状态来自 Host API；Viewer iframe 负责文档内容的实时展示。

Client 通过 `univerTurnDefinition` 按 `callId` 配对结构化工具调用与结果，并分别归约生命周期、内容写入和读取操作；读取操作不能覆盖同一 Turn 已完成的 ready、reopen、merge 或 discard 转换。统一回合卡片把该投影与 Host `FileState` 组合，按权威状态打开 trunk、worktree 或 merge preview 完整页面；若 Host 明确确认投影中的文件已不存在，则不渲染该卡片，以覆盖 Agent 在同一 Turn 中创建并通过其他工具删除临时文件的场景。

实时浮窗只由 `univer_new`、worktree create/reopen/ready 和内容写入主动拉起，纯 status、inspect、lint、screenshot 与 export 不主动打开窗口。用户保持打开的文件或非终态 worktree 会在下一 Turn 继续显示；用户关闭优先，merged 与 discarded 清除打开意图。

Client 必须满足：

- 会话 ID 与 workspace scope 是所有状态查询的组成部分；
- 轮询在组件卸载、会话切换和页面隐藏时正确停止或降频；
- 同一个文件/worktree 的浮窗状态可去重，但不能跨会话泄漏；
- mutation 期间禁用重复操作，完成后重新获取 Host 状态；
- Viewer URL 的文件、worktree、unit、mode 与 scope 参数视为不透明值；Client 只能设置不改变资源身份和授权范围的展示参数；
- 终态 worktree 在原回合末尾保留审阅卡片，移除修改操作并显示主线完整页面；
- 所有 Turn 使用同一种卡片布局；状态加载失败只显示该布局的不可用状态，不回退旧卡片；
- 卡片不复制 Viewer 已提供的 ready、merge 或 discard 操作；
- UI 文案来自 locale 模块。

## 11. CLI 移除决策

运行路径不包含 CLI adapter，也不探测全局 `univer` executable。`univer_*` 工具直接调用 `ctx.univer`，Provider 再调用 Gateway adapter 或 Unit Content adapter。

当前实现满足以下约束：

1. `univer_new` 只创建空 `.univer` 容器，Unit 由 `univer_unit` 或 `univer_import` 显式加入 draft worktree；
2. `univer_execute` 只写入显式 draft worktree 与 Unit，并由 Gateway revision 确认提交；
3. `univer_inspect` 与 `univer_export` 可读取 trunk 或显式 worktree；
4. `univer_api` 使用包依赖的精确版本 API Reference，不调用外部 CLI；
5. `univer_lint` 只返回布局 coverage 与 findings，不生成或返回图片；
6. `univer_compile_svg` 只读取 session workspace 内的 SVG 与引用资源，并把生成程序提交到显式 draft worktree；
7. `univer_screenshot` 复用随包 Render Machine，显式装配目标 Unit、公式引用 Unit、Embed child Unit 与 Gateway 图片资源，PNG 同时落到授权 workspace 和 DSH attachment；
8. `univer_resources` 复用随包 manifest 与 HTTPS-only resource library，不调用外部 CLI，缓存位置来自已校验配置；
9. Client 只从结构化工具事件恢复预览目标；
10. 全新环境仅安装本插件即可完成创建、导入、修改、检查、布局 lint、SVG 页面编译、截图、资源查找/导出、Office 导出、预览和 worktree 修改审阅。

## 12. 构建与发布

`src` 包含插件发布的所有 application 源码；Viewer application、machine render page、render preset 和 IMPORTRANGE plugin 源码从 `univer-cli` 复制到本仓库后直接维护。`pnpm run build` 生成 Host/Client bundle、Unit Content Worker、Gateway、machine render page 和 Viewer；`lib` 与 `artifacts` 都被 gitignore，并在打包前重新生成。Host 构建为 Node ESM，Client 构建为 DSH ModuleLoader 可加载的浏览器 bundle，Gateway 构建为 Node CJS 子进程，Worker 构建为 Node ESM 子进程，machine render page 与 Viewer 构建为 Vite 静态资产。

发布包包含运行所需的 Gateway、Viewer、Unit Content Worker、Office 转换器、平台依赖、Univer license 与 bundled Skills。Gateway、Worker、Viewer 和 Host 直接使用 manifest 中精确版本的 Univer SDK/API Reference packages；JavaScript SDK 被 bundle，平台原生 package 由包管理器为目标机器安装。发布时只打包从当前源码生成的运行产物。

原生公式引擎、Office 转换器与 SQLite 依赖仍具有平台属性。release workflow 必须在目标平台安装 lockfile 所指定的依赖后构建和测试，不能把一个平台的 `node_modules` 复制为通用发布物。

## 13. 验证策略

测试按边界组织：

- `processes/gateway`：启动合并、ready 超时、提前退出、清理和外部 Gateway 不被终止；
- `provider`：路径 scope、缓存失效、Gateway 映射、worktree 状态与错误；
- `webServer`：method、JSON、字段、会话授权和错误响应；
- `tools`：schema、取消、结构化结果和 presentation；
- `render/resources`：截图依赖装配、页数/像素/attachment 限制、资源下载取消、cache 隔离与 export 路径授权；
- `skills`：发现顺序、按需加载、frontmatter 剥离和发布包收录；
- `client`：事件恢复、轮询生命周期、浮窗交互、unit 切换和审阅 mutation；
- `integration`：无全局 CLI 的全新环境中，仅安装插件完成端到端功能。

发布前至少执行 typecheck、Host/Client build、分层测试、npm pack 内容检查，以及从 pack 产物安装后的集成冒烟。

## 14. 明确不采用的方案

- 不保留 `lib/index.js` 与 `lib/client.js` 的原型内部结构；
- 不继续把 Service、HTTP、进程管理、CLI fallback 和缓存写在一个文件中；
- 不使用 `capability` 作为目录名；DSH 架构中的 capability seam 由这里的 Service Definition、Provider 和 Consumer 共同实现；
- 不使用 `daemon` 作为本插件领域名称；
- 不让用户长期同时安装插件和 CLI；
- 不把 Gateway 业务实现写进 Host Service/Provider；Gateway 保持独立 application 与进程；
- 不在当前阶段仅为目录整齐拆成多个 npm 包；
- 不让模型自行决定 merge 或 discard；显式用户请求仍必须经过 DSH 工具审批。

## 15. 变更规则

后续实现若改变以下任一事项，必须先更新本文并重新评审：

- Service 的责任范围或 Consumer 依赖方向；
- Host、Client、Gateway 与 Unit Content Worker 的信任边界；
- 是否依赖外部 CLI 或外部 Gateway；
- worktree 用户审阅权归属；
- 工具能力与 bundled Skills 的对应关系；
- 源码构建、Viewer 与许可证策略；
- 单包与多包的发布决策。
