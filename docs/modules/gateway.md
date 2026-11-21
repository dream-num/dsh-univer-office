# Gateway 与文档状态

Gateway 在独立的 Node 进程中提供文件、worktree、Unit 和协作服务，确认写入结果及 revision。Host 负责其[进程生命周期](host-service.md)，浏览器通过[同源代理](../operations/viewer-same-origin.md)访问。实现入口为[Gateway 应用](../../src/gateway-app)和[协作服务](../../src/gateway-app/collab-service.ts)。

## Worktree 与协作

Agent 在 draft 中写入，ready 可审阅并可 reopen 回到 draft。merged 与 discarded 为终态。Unit 创建与移除经过 worktree 控制端点，结构变化通过生命周期事件通知客户端。

Gateway 通过 SDK `register(router)` 注册 HTTP/WebSocket Endpoint，连接跟踪保留路由参数，并在打开失败或关闭时释放记录。Worktree Unit 删除保留应用现有流程；SDK 的可撤销移除接口 `setUnitRemoved` 在本地 Adapter 中明确返回 `INVALID_REQUEST`，不写入移除状态或改变文件格式。Gateway 为 SDK collaboration service 注入 `ILogger`：warn/error 始终写入 Gateway stderr，debug/info 仅在 `UNIVER_DSH_GATEWAY_DEBUG=1` 时输出；SDK 内部失败若没有该 logger 只会表现为不可诊断的通用 500。

数据库 Adapter 遵循 SDK 的快照读取契约（`getChangesets`/`getDraftChangesets` 返回裸 changeset 数组，`null` 表示 Unit 不存在）。

所有 payload 列（Adapter 与迁移）共用 `packages/univerfile-sqlite/src/codec/stored-json.ts`：二进制字段编码为与 SDK SQLite Adapter 相同标记的 base64，并在 JSON replacer 中读取 `toJSON` 之前的原值：SDK 的 Rust 物化把 Sheet block 的 `data` 作为 Node `Buffer` 交给 `saveSnapshot`，而 `Buffer#toJSON` 会先于 replacer 把它变成普通对象。

Gateway 中的 Collaboration SDK runtime（trunk Service、Worktree Service、Unit Snapshot Materializer 与 `createUnitRuntime`）统一使用 `execution: { mode: 'in-process' }`。SDK 1.0.4 起默认改为 worker thread，并从 SDK 模块旁加载 `unit-runtime-worker.cjs`；Gateway 打包为单个 CJS，运行时旁边没有该文件，而且按请求创建的 materializer 会为每次调用启动和销毁整个 worker 池。

## 持久化与历史

Gateway 还为 trunk revision 组合 Collaboration SDK History Service 与 Endpoint。Gateway 自己在共享 `.univer` connection 上实现 History database adapter。`history@2` 不再按 revision 派生：每个 Unit 的每个分段保存一条**分段起始**记录（主键 `(unit_id, start_revision)`），`endRevision` 由下一段的起始 revision 计算、不入库，列表按 `startRevision` 降序并以排他的 `beforeRevision` 分页，`hasMore` 只表示页下方仍存在匹配记录。SDK 1.0.0 移除了旧的逐 revision History 读取与重建 API，因此文件 runtime 启动时不再 reconcile 到 trunk head，SDK transport 直接开放。Viewer 为 trunk 的 Sheet、Doc、Slide、Base 与 Board 分别注册官方 History UI；只读审阅可检查历史但不能恢复，可编辑 trunk 视图可显式恢复，worktree 与 merge preview 不呈现历史入口。

Gateway 通过 `@univer/univerfile-sqlite` 的 `openUniverfile()` 打开或新建 `.univer`，得到共用一个连接的 `trunk`、`worktree`、`history`、`assets` 四个 store：前三个满足对应的 SDK 持久化契约并附带 Gateway 需要的查询，`assets` 保存内容寻址的嵌入资产；package 的接口、行为约定和目录职责见 [SQLite 包文档](../../packages/univerfile-sqlite/README.zh-CN.md)。`.univer` 的整体格式由组件版本表与必要表结构共同识别；当前格式为 v3，对应 core=2、worktree=3、assets=1、history=2。v0 为旧表布局，v1/v2 对应升级前的组件组合；未知版本和混合组件组合拒绝打开。正常打开已有文件必须先通过统一升级入口，再构造当前 Adapter。

升级对原文件加锁并备份，在同目录候选文件中完成转换、时间规范化、清理和完整性验证，确认源文件哈希未变后才替换原文件；失败清理候选文件，原文件与备份保持不变。再次打开同一份未变化的文件时复用已有的相同字节备份，不会再写一份新备份。持久化使用 Node 内置的 `node:sqlite`：关闭连接时先 finalize 该连接上的全部语句，再释放文件句柄，因此升级在同一进程内关闭候选连接后直接替换原文件，Windows 上也不需要 helper 进程。替换遇到 `EPERM`、`EBUSY`、`EACCES` 时短暂退避重试，覆盖杀毒或索引服务临时占用文件的情况。Node 22/24 首次加载 `node:sqlite` 时会在 Gateway stderr 打印一条 `ExperimentalWarning`，不影响功能，不做屏蔽。

v2→v3 内部按 Core → Worktree → History 转换，前两步读取旧 History 创建信息后才能移除旧表；转换代码归属 `upgrade/`；当前结构（表、索引与组件版本）只在 `schema/v3.ts` 定义，新建文件和升级候选通过 `schema/install.ts` 建表，打开时由格式识别统一校验，Adapter 假定 schema 已就绪，不再建表或校验。

Unit 与 Worktree Unit 的创建身份取自 SDK 的 `creatorID`/`createdAt`，trunk 接入的 Worktree Unit 继承其创建信息；旧记录缺失创建者时使用 `anonymous`，时间优先保留文件内已有信息。新提交的 changeset 由 Adapter 写入服务器提交时间，payload 的 `createTime` 使用 Unix 秒，数据库时间列使用 Unix 毫秒；迁移同步规范化旧 payload，History 读取无需猜测单位。History 迁移保留旧分段边界，并与 SDK 官方迁移有意不同：缺失的 revision 2 起点会补齐，超过 Core head 的起点会丢弃，某个 Unit 的旧 History 无法转换时只清空该 Unit 的 History，不让整个升级失败。

## Compare 与合入预览

worktree Compare 由 Gateway 创建有界的固定比较会话：右侧始终是路由指定的 draft 或 ready worktree，左侧默认是 trunk，也可选择同一文件中的另一个活跃 worktree。会话在创建时固定两侧 Unit heads，并为每个 Unit 记录 paired、left-only 或 right-only；后续读取只从这些固定 revision 物化最终 snapshot 与 changeset，不随 live head 漂移。Gateway 使用同版本 Univer Pro History 计算产品语义差异，并通过 `/diff` 返回带版本号、分页、筛选、稳定实体身份与产品定位信息的 JSON；新增或删除的整 Unit 使用镜像空侧的 snapshot 比较。任一 live head 变化只把结果标记为 stale，Viewer 必须由用户显式刷新以创建新会话。

merge preview 只对 `ready` worktree 开放。Gateway 调用 Collaboration SDK `evaluateWorktreeUnitMerge`：主干已前进且 OT 成功时，返回把冻结 draft mutations 变到当前 trunk head 后的静态 snapshot；主干未前进，或 Unit 是 worktree 内新建时，改为物化该 worktree head。冲突、已合入和已删除的 Unit 返回错误，不用草稿冒充合并结果。HTTP 返回完整 snapshot；其中的 Sheet blocks 一并返回，Sheet 与 Base 会带上，Doc、Slide、Board 省略。Viewer 只还原引擎数据，并在 Sheet 加载后计算公式。计算超时或触发失败时仍展示已物化的 snapshot，不解析或重放协同 mutation。

固定版本与刷新语义由[比较集成测试](../../test/integration/worktree-comparison.test.ts)覆盖，双栏定位见 [Viewer](viewer.md)。

## Viewer 的 Office 交换

Viewer Ribbon 的交互式导入导出使用 Gateway 中逐 `.univer` 隔离的 Universer exchange 协议：`source=1` 上传、异步 import/export task、sign-url 与 artifact content。该协议只挂在 trunk 路径；导入在当前 `.univer` trunk 创建新 Unit 并发布结构化 `unit_added` 事件，导出从 trunk head 物化快照。

SDK 1.2.0 起 exchange-client 系列包只保留服务与 Facade，不再提供导入导出 UI；`render-preset/import-export` 按 Unit 类型保存 univer-pro `v1.2.0` 示例插件 `custom-import-export`（Sheet、Doc、Slide 的 Ribbon“文件”菜单与 Base 工具栏按钮），仅在传入 `exchangeClientConfig` 时注册在对应 exchange-client 插件之后。

临时 artifact 和 task 有界、可过期，并随文件 runtime 一起释放。嵌入资源继续使用 `source=3` 且按 Unit/worktree 授权，两类文件协议不得混用。docx 导入的兼容模式由 import options 的 `doc.docType`（`traditional`/`modern`）决定：两个导入入口（Unit Content Worker 与该协议）在缺省时都显式解析为 `traditional` 以保留源页面几何，`modern` 是 pageless 语义、会重写页面版面，仅由调用方显式选择；上游 exchange binding 的 serde 缺省值不做兜底依据。
