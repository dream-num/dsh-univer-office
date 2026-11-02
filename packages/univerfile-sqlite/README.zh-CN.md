# univerfile-sqlite

[English](README.md) | [简体中文](README.zh-CN.md)

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
| `trunk`    | `IDatabaseAdapter`，外加 `listUnits()` 与 `listUnitRecords()`                                  |
| `worktree` | `IWorktreeDatabaseAdapter`，外加 `listWorktrees()`、`listWorktreeUnits()`、`listDeletedUnits()` 与 `deleteUnit()` |
| `history`  | `IHistoryDatabaseAdapter`                                                                     |
| `assets`   | 内容寻址的嵌入资产：`store()`、`open()` 与 `publishWorktreeAssets()`                              |

SDK Service 调用契约方法，应用直接调用扩展方法。本地文件不支持 SDK 的可撤销移除 `setUnitRemoved`，它返回
`INVALID_REQUEST`；从 Worktree 移除 Unit 使用 `worktree.deleteUnit()`。应用 metadata 通过 SDK 调用的
`customData` 传给 store，键为 `UNIVERFILE_UNIT_METADATA_KEY`、`UNIVERFILE_WORKTREE_METADATA_KEY` 与
`UNIVERFILE_WORKTREE_CHANGE_METADATA_KEY`。

## 行为约定

- 同一句柄的所有 store 共用一个 SQLite 连接。同一进程内同一路径只保留一个句柄。
- `close()` 先 finalize 全部语句再关闭连接；resolve 之后文件可以立即改名或删除，Windows 上也一样。
- 多个进程同时打开同一文件时，读写由 SQLite 文件锁协调（等待写入方最多 5 秒），升级由 `.upgrade.lock`
  目录协调，只有一个进程执行升级。
- 升级先只读识别格式，在文件旁写一份逐字节相同的备份，在副本上转换并校验，确认源文件未变化后再替换。替换前任何
  失败都保持源文件不变并保留备份。再次打开同一份未变化的文件时复用已有备份。
- Node 22 与 24 加载 `node:sqlite` 时会打印 `ExperimentalWarning`。package 不修改进程的 warning 处理；需要
  隐藏时用 `--disable-warning=ExperimentalWarning` 启动进程。

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

测试只通过 `openUniverfile` 打开文件。`test/support/legacy.ts` 基于 `test/fixtures/` 中冻结的 schema
构造旧格式文件。
