# univerfile-sqlite

[English](README.md) | [简体中文](README.zh-CN.md)

univerfile（`.univer`）是本地优先的 Univer 文档容器。一个 SQLite 文件保存一组 Sheet、Doc、Slide、Base 与 Board
Unit，以及每个 Unit 的修订历史、在合并前与 trunk 隔离的 Worktree 草稿，和内容引用的嵌入资产。应用通常在本机
进程中基于本 package 运行 Collaboration SDK 的各个 Service，即可使用修订、History、Worktree 与合并，数据始终是一个可以复制、备份和移动的文件。Univer CLI 与 DSH 的 Univer Office 插件都是这样，由本地
Gateway 承载这些 Service。

`@univer/univerfile-sqlite` 通过 Node 内置的 `node:sqlite` 把 `.univer` 文件存储在 SQLite 中。它拥有当前
schema，识别并升级旧格式，并向 Collaboration SDK 各 Service 提供持久化所用的 store。

## 用法

```ts
import { openUniverfile } from '@univer/univerfile-sqlite'

const file = openUniverfile(path) // 或 openUniverfile(path, { create: true })
try {
  new UniverCollabService({ dbAdapter: file.trunk, runtime, logger })
  // file.worktree、file.history、file.assets 用法相同
} finally {
  await file.close()
}
```

`openUniverfile` 返回当前格式（v3）的文件，否则抛出 `UniverfileError`。打开旧文件时先升级，结果记录在
`file.upgrade`。`:memory:` 总是新建内存文件。

句柄按功能模块提供 store，与 Collaboration SDK 的划分一致：

| Store      | Interface                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------- |
| `trunk`    | `IDatabaseAdapter`，外加 `listUnits()`、`listUnitRecords()`、`listSnapshotRevisions()` 与 `deleteSnapshots()` |
| `worktree` | `IWorktreeDatabaseAdapter`，外加 `listWorktrees()`、`listWorktreeUnits()`、`listDeletedUnits()`、`deleteUnit()` 与 `deleteWorktree()` |
| `history`  | `IHistoryDatabaseAdapter`                                                                     |
| `assets`   | 内容寻址的嵌入资产：`store()`、`open()` 与 `publishWorktreeAssets()`                              |

SDK Service 调用契约方法，应用直接调用扩展方法。本地文件不支持 SDK 的可撤销移除 `setUnitRemoved`，它返回
`INVALID_REQUEST`；从 Worktree 移除 Unit 使用 `worktree.deleteUnit()`。应用 metadata 通过 SDK 调用的
`customData` 传给 store，键为 `UNIVERFILE_UNIT_METADATA_KEY`、`UNIVERFILE_WORKTREE_METADATA_KEY` 与
`UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY`。

## 维护操作

每个操作单独执行后文件仍然有效；组合哪些操作、按什么顺序执行由应用决定。

| 操作                                        | 效果                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `copyUniverfile(source, target)`            | 通过只读连接写出一致的副本；不升级源文件，`target` 必须不存在                              |
| `worktree.deleteWorktree(id)`               | 删除 Worktree 及其 Unit、changeset、seed、merge artifact、作用域内资产，以及不再被引用的 blob；拒绝合并中的 Worktree |
| `trunk.listSnapshotRevisions()`             | 列出每个 Unit（含已软删的）已存快照的 revision                                            |
| `trunk.deleteSnapshots(unitId, revisions)`  | 删除快照及只被它们引用的 Sheet block；changeset 保留，所有 revision 仍可读取；最早的快照不能删 |
| `file.verify()`                             | 检查完整性与外键，读回所有 Unit 和 Worktree，并校验每个资产的摘要                          |
| `file.vacuum()`                             | 重建文件以回收已删除行占用的空间                                                          |

## 行为约定

- 同一句柄的所有 store 共用一个 SQLite 连接。同一进程内同一路径只保留一个句柄。
- `close()` 先 finalize 全部语句再关闭连接；resolve 之后文件可以立即改名或删除，Windows 上也一样。
- 多个进程同时打开同一文件时，读写由 SQLite 文件锁协调（等待写入方最多 5 秒），升级由 `.upgrade.lock`
  目录协调，只有一个进程执行升级。
- 升级先只读识别格式，在文件旁写一份逐字节相同的备份，在副本上转换并校验，确认源文件未变化后再替换。替换前任何
  失败都保持源文件不变并保留备份。再次打开同一份未变化的文件时复用已有备份。
- Node 22 与 24 首次加载 `node:sqlite` 时会在 stderr 打印 `ExperimentalWarning`，不影响功能；package 不修改
  进程的 warning 处理。

## 格式

| 格式 | core | worktree | assets   | history  |
| ---- | ---- | -------- | -------- | -------- |
| v0   | 无组件版本表 | | |                     |
| v1   | 1    | 1        | 1 或缺失 | 1 或缺失 |
| v2   | 1    | 2        | 1        | 1 或缺失 |
| v3   | 2    | 3        | 1        | 2        |

当前格式为 v3。未知组件、未知版本与混合组合以 `UNSUPPORTED_SCHEMA` 拒绝。

## 目录

| 目录       | 职责                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `driver/`  | `node:sqlite` 连接与事务；整个 package 中只有它 import 驱动                    |
| `codec/`   | payload 列的 JSON 编解码，包括二进制字段                                      |
| `schema/`  | 当前表、索引与组件版本的唯一定义                                              |
| `stores/`  | 当前格式文件上的读写，不建表                                                  |
| `upgrade/` | 所有与旧格式相关的内容：识别、reader、备份、锁、校验与替换                      |

依赖从 `open.ts` 沿上表向下：`upgrade/` 基于 `schema/`，并通过 `stores/` 校验结果；`stores/` 使用
`driver/` 与 `codec/`；`schema/` 只描述当前格式。

## 开发

```sh
pnpm --filter @univer/univerfile-sqlite test
pnpm --filter @univer/univerfile-sqlite typecheck
```

测试只通过 `openUniverfile` 打开文件。`test/fixtures/` 存放已发布 CLI 写出的各旧格式文件；需要精确或损坏内容的
用例由 `test/support/legacy.ts` 基于冻结的 schema 构造。每个 fixture 的来源记录在 `test/fixtures/README.md`。
