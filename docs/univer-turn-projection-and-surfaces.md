# Univer Turn 投影与预览界面设计

状态：已实施

日期：2026-08-18

本文记录回合级 Univer 操作投影、实时浮窗和回合尾部卡片的已实施设计。稳定的当前行为同时归入架构文档与双语 README。

## 1. 目标

- 从可回放的结构化会话事件中恢复每个 Turn 对 `.univer` 文件执行的全部操作及其状态变化；
- 卡片与浮窗共享同一份 Turn 投影，不各自猜测工具语义；
- 所有回合尾部展示统一使用当前审阅卡片布局，不再回退旧文件预览卡片或单独的历史 header；
- 生命周期操作、内容写入和读取操作分开归约，避免用最后一次工具调用覆盖真实结果；
- 浮窗只在明确的创建或修改时机主动拉起，同时延续用户在上一轮保持打开的非终态 worktree；
- Host `FileState` 始终是 worktree 当前状态与 Viewer URL 的权威来源。

## 2. 事实来源与职责

### 2.1 `UniverTurnProjection`

新增专门的 Conversation Definition，以纯 reducer 方式消费当前 Turn 的 `turn/start`、`tool/call` 与 `tool/result` 事件。它不访问 HTTP、不依赖 React、不生成 Viewer URL，也不持有用户界面打开状态。

投影按文件记录：

- 工具名和 worktree action；
- 操作顺序和执行阶段；
- 文件、worktree 与 Unit 标识；
- 操作属于创建、生命周期转换、内容写入还是读取；
- 成功操作对本 Turn outcome 造成的语义变化；
- 失败操作，但失败不提交成功的状态转换。

建议的数据形状为：

```ts
interface UniverTurnProjection {
  readonly turn: number
  readonly files: readonly UniverTurnFileProjection[]
}

interface UniverTurnFileProjection {
  readonly file: string
  readonly operations: readonly UniverTurnOperation[]
  readonly outcome: UniverTurnOutcome
}

interface UniverTurnOperation {
  readonly tool: UniverOperationKind
  readonly action?: string
  readonly worktreeId?: string
  readonly unitId?: string
  readonly phase: 'pending' | 'succeeded' | 'failed'
}

interface UniverTurnOutcome {
  readonly primaryWorktreeId: string | null
  readonly lifecycle: 'trunk' | 'draft' | 'ready' | 'merged' | 'discarded' | 'unchanged'
  readonly preferredUnitId?: string
  readonly changedContent: boolean
}
```

工具结构化结果必须补齐稳定恢复上述事实所需的标识。Client 不解析自由文本或 bash 输出。

### 2.2 Host `FileState`

Host 状态查询继续提供：

- worktree 当前真实状态；
- changed Units；
- Trunk、worktree 和 merge preview 的不透明 Viewer URL。

轮询得到的完整 `FileState` 不写入历史 Turn。Turn 投影记录当时发生的操作事实，`FileState` 校准文件现在的真实状态，两者不能混为一种状态。

### 2.3 展示模型

卡片和浮窗分别使用纯派生器：

```text
UniverTurnProjection + FileState
                ├── deriveUniverCardModel
                └── deriveUniverFloatingWindowModel
```

卡片模型面向完整 Turn 的稳定结果；浮窗模型面向正在运行 Turn 的增量操作。浮窗当前停留的 scope 不反向修改 Turn outcome。

## 3. Turn 操作归约

不能用最后一次工具调用直接决定展示。操作分为以下类别独立归约。

### 3.1 生命周期操作

同一 worktree 的成功生命周期操作按发生顺序转换：

| 操作 | Turn outcome |
| --- | --- |
| `worktree create` | 选择返回的 worktree，进入 `draft` |
| `worktree reopen` | 选择该 worktree，进入 `draft` |
| `worktree ready` | 选择该 worktree，进入 `ready` |
| `worktree merge` | 记录该 worktree 已合入，展示 Trunk |
| `worktree discard` | 记录该 worktree 已丢弃，展示 Trunk |

只有后续成功的生命周期操作可以改变已有生命周期结论。

### 3.2 内容写入

以下操作选择其显式 worktree、标记内容发生变化，并记录优先 Unit；它们不覆盖已经成功产生的 `ready`、`merged` 或 `discarded` 结论：

- `univer_execute`；
- `univer_import`；
- `univer_unit create/remove`；
- `univer_compile_svg`。

Host 返回的最终 worktree 状态仍可校准投影预期。例如投影选择了一个 worktree，而 Host 已返回 `ready`，卡片应展示 merge preview。

### 3.3 读取操作

`univer_status`、`univer_inspect`、`univer_lint` 和 `univer_export` 不覆盖已有生命周期或主要 worktree，只补充 scope、优先 Unit 和操作记录。

如果整个 Turn 只有读取操作：

- 显式携带 `worktreeId` 时展示该 worktree 的当前状态；
- 没有 `worktreeId` 时展示 Trunk；
- 涉及多个 worktree 时，最后一个显式读取 scope 只决定 Viewer 的默认读取目标，不产生生命周期转换。

因此 `ready -> inspect -> status` 的 Turn outcome 仍为 `ready`；`inspect` 可以决定优先 Unit，`status` 不能把卡片切回普通 Trunk 预览。

## 4. 统一回合尾部卡片

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

状态加载失败时不得回退旧卡片。一般网络、Gateway 或授权失败仍使用同一卡片表达加载中或不可用；若 Host 以结构化 `INVALID_FILE_PATH` 明确确认文件已不存在，则不渲染卡片。这覆盖 Agent 在同一 Turn 中创建临时 `.univer`、完成排查后再通过 Bash 删除的场景，避免留下永久加载卡片。历史 Turn 也使用同一组件和布局，默认折叠；其 worktree 状态可由当前 `FileState` 校准。若历史卡片允许展开，Viewer 表达的是当前状态，不能表述为历史内容快照。

## 5. 实时浮窗

### 5.1 主动拉起

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

### 5.2 跨 Turn 延续

浮窗控制器显式保存用户保持打开的目标，不再通过扫描整个 Session 的所有文件和 worktree 间接推断：

```ts
interface UniverFloatingWindowState {
  readonly openFiles: ReadonlySet<string>
  readonly openWorktrees: ReadonlyMap<string, {
    readonly file: string
    readonly lastStatus: WorktreeStatus
  }>
}
```

上一轮结束时浮窗可以停止渲染，但保留打开意图。下一轮开始后重新查询对应文件状态：

- `draft` 或 `ready` worktree 继续打开；
- `merged` 或 `discarded` worktree 清除打开意图，不再出现；
- 查询暂时失败时保留打开意图并等待重试，不能把失败当作终态；
- `univer_new` 拉起的文件浮窗在没有 worktree 时可继续展示 Trunk；后续创建 worktree 时原位升级到该 worktree。

用户手动关闭优先于自动延续。关闭后清除对应打开意图，下一轮不自动恢复；新的 `new`、创建、写入、`reopen` 或 `ready` 操作可以再次拉起。读取操作不能推翻用户的关闭决定。

同一 Turn 中同一文件最多保留一个浮窗。新的明确写入或生命周期 scope 更新现有浮窗，不为同一文件叠加多个窗口。

## 6. 组件边界

目标职责如下：

```text
会话结构化事件
      ↓
univerTurnDefinition
      ↓
UniverTurnProjection ───────────────┐
      │                             │
      │                       Host FileState
      │                             │
      ├── FloatingWindowController ─┤
      │          ↓                  │
      │    Worktree/File Window     │
      │                             │
      └── deriveUniverCardModel ────┘
                 ↓
          UnifiedUniverCard
```

- `univerTurnDefinition`：捕获和归约可回放的 Turn 操作；
- `FileState` hook：读取当前权威协作状态；
- `FloatingWindowController`：管理主动拉起、跨 Turn 打开意图、用户关闭和终态清理；
- card model 派生器：把 Turn 事实与当前状态转换为稳定展示模型；
- 卡片和浮窗组件：只按模型渲染，不扫描其他 Turn、不推断工具语义、不直接请求 HTTP。

## 7. 必须覆盖的验证场景

- `ready -> inspect -> status` 仍展示 merge preview；
- `ready -> reopen -> execute` 展示 draft worktree；
- `ready -> merge -> status` 展示 Trunk 和已合入状态；
- `univer_new` 在执行期间拉起文件浮窗，成功后展示空文件 Trunk；
- 读取操作不会主动拉起已关闭浮窗；
- 上一轮保持打开的 `draft` 或 `ready` worktree 在下一轮继续显示；
- 用户手动关闭后，下一轮不会仅因读取操作恢复；
- 新写入、`reopen` 或 `ready` 可以重新拉起已关闭浮窗；
- `merged` 与 `discarded` 清除跨 Turn 打开意图；
- 状态查询失败不会清除打开意图，也不会回退旧卡片；
- Host 明确确认文件不存在时不渲染对应的回合卡片；
- 多会话的 Turn 投影、轮询状态和浮窗打开意图互不泄漏；
- 历史 Turn 使用统一卡片布局，不出现旧预览卡片或单独历史 header；
- 卡片不渲染 Viewer 已经提供的重复提交、丢弃或合入 footer。
