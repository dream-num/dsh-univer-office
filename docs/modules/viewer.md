# Viewer

Viewer 是在浏览器中运行的协作客户端。DSH Client 将 Host 授权的 URL 交给 iframe，Viewer 选择 Unit、加载对应内容并处理页面内的审阅操作。浏览器传输见[同源部署](../operations/viewer-same-origin.md)，卡片和浮窗的挂载时机见[Client 预览与审阅](client-preview-and-review.md)。

## 主线、worktree 与合入预览

主线和 worktree 视图加载实时 Unit。worktree 内容以只读方式展示；主线的编辑权限由当前模式、待审 worktree 和显式编辑选择决定。ready worktree 的合入预览加载 Gateway 物化的静态快照。完整页面打开文件且未指定 Unit 或 worktree 时，如果主线为空，会尝试第一个活跃 worktree；没有可显示的内容时使用空状态。参见[Viewer 导航](../../src/viewer-app/ui/app.tsx)和[内容加载](../../src/viewer-app/core/viewer.ts)。

## 比较、历史与文件操作

Viewer 与 `IMPORTRANGE` 公式通过 `@univerjs-pro/resources` 解析资源引用并识别 Sheet 区域和 Base 表选择器。共享渲染预设使用同一包的 `IAttachmentIoService` 配置 Base 附件读写。

Viewer 内的 Compare 是 Gateway 的只读 Consumer，不扩大 Client 权限。DSH Client 仍只投影 Host 授权后的不透明 Viewer URL；Viewer 使用该 URL 已绑定的文件和 worktree 创建固定比较会话，并把同一个 `/diff` 语义结果交给差异列表、双栏渲染和定位行为。

比较页展示 Sheet、Doc、Slide、Base、Board 的语义差异和定位。源版本变更时用户可显式刷新比较会话。比较会话与 History 数据由 [Gateway](gateway.md) 提供，双栏展示由[比较组件](../../packages/unit-comparison-viewer/README.zh-CN.md)维护。主线支持查看 Unit 历史，恢复操作依赖可编辑视图。主线 Ribbon 的 Office 导入导出和 Base 工具栏操作使用 Gateway 的 exchange 服务。

## 嵌入时的键盘焦点

每个嵌入的 Viewer 有独立的 Univer 实例。后台 Sheet 初始化单元格编辑器时应保留宿主输入焦点，用户进入 Viewer 后仍能选中单元格并直接键入。[共享渲染预设](../../src/viewer-support/render-preset/index.ts)根据 iframe 的焦点切换 SDK 的自动聚焦标志，实例销毁时解除监听。实际输入、编辑与 Compare 的浏览器验证见 [Viewer 测试](../../test/e2e/viewer.test.ts)。
