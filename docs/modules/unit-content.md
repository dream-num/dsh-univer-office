# Unit 内容与 Worker

Provider 先确定文件、worktree、Unit 和类型，再把检查、执行、渲染快照读取或格式转换分派给 Worker。Worker 使用 Host 提供的 loopback Gateway 地址取得内容。参见[内容操作](../../src/host/provider/unit-content-operations.ts)和[进程适配器](../../src/host/adapters/unit-content)。

## 池化执行

Unit 的检查、执行和 render-source 读取（lint、截图与 PDF 打印的数据来源）由 Unit Content Adapter 从 `@univer-cli/univer-collaboration-runtime-pool` 取得 keyed lease。Key 由 Gateway origin、文件路径、trunk/worktree scope、Unit ID 与 Unit type 组成；每个 key 对应独立的 Unit runtime 和 Univer 实例。Pool 按 SDK 默认值在每个 Worker 子进程中承载最多 10 个 runtime。Worker 加载 `artifacts/collaboration-runtime-worker.mjs` 并通过与一次性 Worker 相同的 server backend 连接 Gateway。Pool 的 bootstrap `worker-child.mjs` 按其模块位置查找，因此构建把它复制到 `lib/index.js` 旁。

- 每次使用先 pull 再执行。Gateway 始终是内容与 revision 的唯一依据，缓存的 runtime 不构成授权或内容真相。
- 缓存容量由 `unitContentRuntimeMaxEntries` 控制（默认 50），按 Unit runtime 计数。满员时淘汰最久未用的空闲 runtime；全部忙碌时，获取新 key 会返回 `COLLABORATION_POOL_CAPACITY_EXCEEDED`。runtime 空闲超过 `unitContentRuntimeIdleTtlMs`（默认 5 分钟）后回收，Worker 的最后一个 runtime 关闭后进程退出。将容量设为 `0` 时所有操作回到一次性 Worker。
- 操作成功后释放 lease 供复用；操作失败或取消时，Host 使该 Unit 的 lease 失效，下次操作从 Gateway 重新加载。Worker 崩溃或请求超时导致进程终止时，同进程的其他 runtime 也会丢失尚未提交的修改，已确认的 revision 保存在 Gateway 中。
- Host 不主动驱逐 runtime：merge/discard 或 Unit remove 后不再使用的 runtime 由空闲超时或 LRU 回收。Provider 卸载时先关闭 pool，再停止 Gateway。
- Pool 忽略子进程 stdio，因此池化 Worker 的失败只以结构化错误码与消息返回，不再附带 stderr 诊断。

`univer_inspect` 支持主线或显式 worktree，可读取 Sheet 范围、Doc/Slide 结构、Base 概览和 Board 元素详情。`univer_execute` 只向显式 draft worktree 中的 Unit 写入，以 Gateway 确认的 revision 判断提交结果。

## Office 导入与导出

工具导入时，一次性 Unit Content Worker 将源文件转换为快照，Provider 再通过 Gateway 在目标 draft worktree 创建 Unit。导出时，Worker 加载指定主线或 worktree 的 Unit 并写出目标文件。Worker 在完成或取消后退出。

CSV/TSV 每个文件对应一张工作表或 Base 数据表。Worker 在已拉取的 Unit 快照中解析 `worksheetId` 或 `tableId`。只有一张表时自动选取，多张表时要求指定 ID。选择失败时在写入目标文件前返回错误。

Doc/DOCX、Sheet/XLSX 和 Slide/PPTX 的 Unit 导出共用 Exchange 的 `files.load` 解析当前 Unit 的 UUID 资源；URL 图片沿用 Collaboration Exchange Service 的透明占位图策略。Base 和 CSV/TSV 不传资源回调。Worker 从当前文件和 worktree（或 trunk）的 `universer-api/file/<id>/content?source=3&assign=<unitId>` 取回字节；Ribbon 的 trunk Unit 导出直接调用相同的 Gateway 资产读取逻辑。Gateway 按资产所属 Unit 和 worktree 可见性校验读取。上传的 JSON 快照不获得本地资产读取权限。

Viewer 内交互式导入导出使用 [Gateway 的 trunk exchange 协议](gateway.md)。工具路径的行为验证见 [Unit 内容测试](../../test/integration/unit-content.test.ts)和[格式往返测试](../../test/integration/exchange.test.ts)。
