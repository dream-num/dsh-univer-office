# Agent 工具与技能

DSH 的 Tools Consumer 通过 `ctx.univer` 执行领域操作。Skill Provider 将随包 Markdown 注册到 DSH Skill Registry，模型按需加载工作流。实现入口为[工具插件](../../src/host/tools/plugin.ts)和[技能插件](../../src/host/skills/plugin.ts)。

## 工具披露

这些工具默认不参与模型请求：Tools Consumer 以 `when` 条件注册全部 14 个工具，只有当本会话成功加载过 `activationSkills` 之一（默认是 `skills/` 下全部 12 个内置技能）或当前请求头已携带其中任一工具的声明时，该步才披露并允许调用。Tools Consumer 监听成功的 `skill` 工具结果，以及用户直接调用技能后提交的 `user/message`（`source.kind: skill-invocation`）事件。用户调用路径通过可选的 `agents` 注入取得会话当前 Agent，并验证其持有的 Session 与事件来源一致；Agent 销毁时清理内存标记，监听器随 fiber 卸载。技能加载的标记从下一步加入声明；恢复或分叉的会话由请求头中的既有声明兜底，PTC 请求头只含 `run_code`，因此 PTC 会话在内存标记丢失后需要重新加载技能。`skills: false` 或 `activationSkills: []` 表示无条件披露，保持全部工具常驻。

## 执行与审批

每个工具有独立的参数 schema、结果 schema、超时/取消处理和纯 presentation。工具结果必须包含恢复 Client 预览目标所需的结构化文件、worktree 与 unit 标识，并进入 DSH 会话日志。领域失败使用 DSH 可持久化的稳定错误 code，并在模型可见文本中保留 `Error [CODE]`，使 Agent 不必解析自然语言即可选择恢复路径。Client 优先从 `tool/call` 与 `tool/result` 事件恢复目标，不依赖 bash 文本解析。

模型用 `univer_new` 创建空文件，通过 `univer_unit` 或 `univer_import` 在显式 draft worktree 中加入 Unit。`univer_status` 提供文件状态与 Unit 标识，`univer_api` 从随包精确版本的 API Reference 查找 Facade 与方法。涉及已有 Unit 的内容操作使用显式 Unit 标识，Provider 校验工作区及文件路径。各工具契约见[工具定义](../../src/host/tools/definitions)。

`ready` 表示提交审阅，`reopen` 允许继续修改。模型发起 `merge` 或 `discard` 需要用户明确要求，并由 DSH 的 `tools/pre-execute` 流程审批。文件写入、导出、截图和附件的权限在相应操作边界再次验证。

## 技能路由

核心工作流、各 Unit 的创作要求、Embed 与跨 Unit 公式指引由[随包技能](../../skills)维护。工具的执行、取消、超时、结构化结果和卡片展示由工具定义维护。

DSH 自带的 `dsh-office` provider 以 `BUNDLED_SKILL_RANK` 注册 `office`、`office-docx`、`office-xlsx` 与 `office-pptx`，并把 Office 任务导向 python-docx、openpyxl 与 python-pptx。Skill Registry 只按名字去重，同一层内 rank 小者胜出，不同名技能会并列进入模型目录。因此 Skill Provider 以 `BUNDLED_SKILL_RANK - 1` 注册这四个同名路由 Skill，正文只把任务导向 `univer` 与对应 Unit Skill；`office-render`、`office-recalculate` 与 `office-export-pdf` 不覆盖。插件卸载后 DSH 原有技能自动恢复。

工具披露、用户主动调用技能及卸载恢复见[激活测试](../../test/integration/skill-activation.test.ts)和[技能注册测试](../../test/integration/skills.test.ts)。
