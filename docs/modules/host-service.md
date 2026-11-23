# Host 服务

DSH 以裸包名挂载根 Cordis 插件，从包清单发现浏览器入口。根插件挂载 Provider 和 webServer，并按配置挂载 Tools 和 Skill Provider，各自的注册与监听随所属 fiber 释放。参见[根插件](../../src/host/index.ts)和[服务定义](../../src/host/service/univer-service.ts)。

## 服务边界

`UniverService` 是 Host 内部唯一稳定的领域入口。Service Definition 只描述调用方依赖的行为，不暴露 HTTP、Gateway endpoint、worker 协议或子进程对象。

服务能力分为六组：

- File 与状态：创建空 `.univer` 容器，读取 trunk、worktree 与 Unit 状态；
- Collaboration：创建 worktree，执行 ready、reopen、merge 与 discard 生命周期操作；
- Unit Content：在 draft worktree 中创建、移除或导入 Unit，以及检查、执行、导出和读取 machine render snapshot；
- Render：对 Slide snapshot 执行布局检查，把 SVG 编译为 Facade program 并提交到显式 draft worktree，以及为显式 Unit、依赖 Unit 和图片资源装配渲染源并生成 PNG 或 PDF；
- API Reference：查找 API 候选并读取指定 Facade/方法的完整参考。
- Resource Library：列出 registry、按语义搜索、读取 SVG、导出到显式 workspace 目录和清理 Provider-owned 缓存。

所有文件操作都接收显式 workspace scope。Provider 必须将文件解析为绝对路径，并拒绝 scope 外路径。文件 ID、worktree ID 和 unit ID 在服务层使用 branded 类型，不能以无语义的裸字符串跨层传递。

工具和会话 HTTP 路由通过 `ctx.univer` 调用服务。Provider 组合 Gateway、Unit 内容操作、资源库和渲染操作，在访问前用工作区与 realpath 校验输入及输出路径。配置在 [Host 配置入口](../../src/host/config.ts) 校验并解析。

## 状态与进程生命周期

Provider 先授权文件，再按文件路径缓存短期的 `FileState` Promise，并发读取共享结果。读取失败移除对应条目，文件或 worktree 变更使缓存失效。Client 从会话 API 获取附带 Viewer URL 的状态。参见[服务实现](../../src/host/provider/gateway-univer-service.ts)和[缓存](../../src/host/provider/state-cache.ts)。

每个插件实例管理一个 Gateway。并发启动共享一个启动操作，启动失败、进程提前退出或插件卸载时释放所有权。多个工作区复用进程，各次工具操作仍须单独授权。

Host 从配置的端口（默认 `9080`）启动随包 Gateway。子进程成功绑定回环端口后，通过本次启动专属的 Node IPC 通道报告实际监听端口。Host 核对端口并验证 Viewer 健康页后才对外提供 origin。复用时再次检查该子进程的 IPC 连接与 Viewer 健康状态。

如果绑定失败且子进程以约定的端口占用退出码结束，Host 将端口加一再试。其他启动错误或超时会结束本次启动并返回失败。两个 Host 即使同时从同一端口启动，也各自持有独立的 Gateway。卸载时 Host 等待自己启动的子进程退出；Host 意外退出时，子进程随 IPC 断开关闭服务。参见[启动协议](../../src/shared/gateway-process-protocol.ts)和[进程管理](../../src/host/processes/gateway/supervisor.ts)。

## 浏览器会话 API

webServer Consumer 使用 DSH `webServer` 的 prefix route 注册 `/univer-api`。资源如下：

- `GET /univer-api/status`：Gateway 与 Unit 内容能力状态；
- `POST /univer-api/gateway/start`：按需启动插件持有的 Gateway；
- `GET /univer-api/state`：按 `sessionId` 校验当前会话 `cwd` 后返回文件与 worktree 状态；
- `POST /univer-api/worktree-action`：按请求体中的 `sessionId` 校验文件后执行用户发起的 ready、reopen、discard 或 merge。

路径是浏览器协议，不等同于 Service 方法。Router 负责 HTTP method、请求体大小、JSON 和字段校验，route handler 只把已验证请求映射为服务调用。错误返回稳定的错误 code 和可显示消息，不把堆栈、绝对内部资源路径或子进程输出原样暴露给浏览器。

`/univer-api/worktree-action` 必须绑定当前 DSH 会话及其 workspace scope，不能只凭浏览器提交的
绝对路径授权。Viewer 内置操作走已通过 DSH 鉴权的 `/uf`，不额外绑定会话范围。

Viewer 文档打开、后续文件 API 和 WebSocket 各自的鉴权范围见 [Viewer 同源部署](../operations/viewer-same-origin.md)。服务与路由验证见 [Host 集成测试](../../test/integration/host.test.ts)，进程启动和回收见 [Gateway 生命周期测试](../../test/integration/gateway-lifecycle.test.ts)。
