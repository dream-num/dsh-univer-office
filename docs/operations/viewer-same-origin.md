# Viewer 同源部署

浏览器通过 DSH WebServer 打开 Viewer、加载文件和连接协作服务。Gateway 只监听 loopback，远程浏览器与桌面壳均使用 Host 提供的入口。

## 架构

```text
Viewer 文档 → DSH 连接鉴权 → 会话写权限校验 → loopback Gateway
Viewer 文件 API 与 WebSocket → DSH 连接鉴权 → loopback Gateway
模型 → Tools → Host Provider → loopback Gateway
Worker → loopback Gateway
```

DSH WebServer 上由本插件注册以下路由（运行时配置位于 Viewer prefix 内）：

| 路由 | 类型 | 职责 |
| --- | --- | --- |
| `/univer-viewer` | HTTP prefix | Viewer 文档与静态资源，原样转发到 Gateway 同路径 |
| `/univer-viewer/runtime-config` | HTTP GET | 通过 connection 鉴权后返回当前 Host loopback 地址；使用 socket 实际监听端口，禁止缓存，无凭据 |
| `/uf` | HTTP prefix | Gateway 领域 API（snapshot/changeset/upload/authz 等），通过 DSH 鉴权后转发 |
| `/univer-viewer/ws` | 精确路径 upgrade | WebSocket 隧道：`?target=/uf/...` 携带真实上游路径，外层其余 query 参数（端点协议，如 comb 握手的 `sessionTicket`）逐字转发上游 |

DSH WebServer 的 upgrade 注册只支持精确路径，而 Gateway 的 WS 端点路径是动态的
（`/uf/<key>[/worktrees/<id>]/universer-api/comb/connect` 与 `/uf/<key>[/worktrees/<id>]/events`），
因此 Viewer 在代理模式下把两类 WS URL 改写为隧道形式；HTTP `/uf/*` 路径保持原样，
`collaboration-client` 按 `location.origin` 拼出的 URL 无需改动即可命中代理。

## 桌面 WebSocket 地址

普通浏览器使用页面 origin 构建 WS/WSS 隧道地址。`dsh-app:` 页面中的 Viewer 启动时先读取
`/univer-viewer/runtime-config`，验证 `desktopStreamBaseUrl` 是无凭据、无路径/query/hash 的
`http://127.0.0.1:<port>`，再把协作和生命周期连接都指向该 Host 的 `/univer-viewer/ws`。
端口来自当前 HTTP socket，不写死端口或采信请求 Host；桌面壳按当前 Host 地址注入认证 cookie。
配置获取或验证失败时展示启动错误，不回退到无效的 `ws://app`。HTTP 仍使用 `dsh-app:` 转发，
浏览器远程部署始终沿用公开站点地址。此配置独立于 iframe 主页面的桌面 preload/boot 接口。

## 浏览器鉴权与文档范围校验

1. **浏览器身份**：所有 HTTP 路由和 WebSocket upgrade 都注册为 `auth: 'required'`。
   DSH 0.2.3-alpha.2 的 WebServer 在分发前完成来源和身份校验，将已认证的 Peer 传给 handler。
   插件检查 Peer 的生命周期信号。旧版 DSH 调用 handler 时不传 Peer，由插件调用
   `connection.requestRejection(req)` 执行宿主的来源和身份校验，并保留其 401/403 结果。
   若两个入口均不可用或 Peer 已失效，插件返回 401。
2. **文档会话范围**：Viewer 文档请求携带 `?file=<gatewayKey>` 与 `?sessionId=<sid>`，
   代理解码 fileKey 并确认该 live session 对原文件有写权限。`/univer-api` 继续执行
   session/workspace 校验。

后续 `/uf` API 与 WS 隧道只复用 DSH 的浏览器鉴权，不设置或读取插件会话 cookie，也不重复
session/workspace 校验。DSH 桌面壳会删除响应的 Set-Cookie，并把请求 cookie 替换为自身的
鉴权 cookie，因此插件 cookie 不能作为这些请求的前置条件。旧版本残留的插件 cookie 被忽略。

已通过 DSH 鉴权的浏览器可构造 `/uf/<key>` 并访问 Host 进程有权打开的任意 `.univer` 文件，
包括内容写入与 worktree 操作；这同样适用于远程部署。Gateway 自身的业务校验与 comb
一次性 sessionTicket 校验保持不变。sessionId 是文档范围句柄而非身份凭据，本插件不提供
多租户文件权限体系。

## Viewer 产物与前缀

- Viewer 构建以 `base: '/univer-viewer/'` 输出，资源引用与地址栏路径统一带前缀；
- Gateway 以同一前缀挂载静态目录（剥离前缀后由 sirv 伺服），因此代理**原样转发、零改写**；
- Gateway 根路径 `/` 继续伺服同一份产物，直连 Gateway 的既有用法（测试、独立排障）不变。

## fileState 投影

`computeFileState` 生成的 `viewerUrl`/`openUrl`/`worktreeUrl`/`mergeUrl`（含 unit 变体）改为
同源相对路径 `/univer-viewer/?file=<key>`；`gateway` 字段继续返回 loopback origin（模型可见
事实）。`/univer-api/state` 响应在路由层为所有投影 URL 追加 `&sessionId=<sid>`，用于 Viewer
文档首次打开时的会话写权限校验。浏览器
中的审阅卡片、实时浮窗和文件树预览使用这些 URL；`univer_*` 工具不消费
这些 URL。Client 只把 URL 当 opaque，不追加任何非呈现参数。

## 失败模式

- Gateway 不可用（含自动启动失败）：代理返回 502。
- 文档范围拒绝：文档 403（iframe 显示错误）。`/uf` 与 WS upgrade 不读取插件会话 cookie；
  缺失、过期或畸形的旧 cookie 不影响放行，DSH connection 门仍可返回 401/403。
- 隧道上游连接失败：销毁两侧 socket；帧在 upstream OPEN 前缓冲不丢弃；close/error 双向传播；
  插件 unload 时关闭全部桥接连接（quiescence）。隧道不再绑定 DSH 会话生命周期；
  它在客户端或上游关闭、出错及插件卸载时关闭。
- 非法 target（非 `/uf/` 开头）或无效 fileKey：403。静态面的非 GET/HEAD 请求由代理原样转发、
  由 Gateway 静态处理器拒绝。

## 测试

- `test/integration/host.test.ts`：配置面（`viewerBaseUrl` 不存在、投影为相对路径）。
- `test/unit/viewer-transport.test.ts`：浏览器 HTTPS/WSS、桌面真实 Host 地址、协作与生命周期路径、配置缺失及非法地址拒绝。
- `test/integration/viewer-proxy.test.ts`：真实 Gateway + 真实路由 handler：文档范围内 200、不设置
  插件 cookie、范围外文档 403；`/uf` GET 与 descriptor 在无 cookie、只有 DSH cookie、旧的
  外会话或畸形 cookie 下均放行；无 cookie 的 POST 创建 worktree 后读取持久状态；无 cookie
  的 WS 隧道收到真实生命周期事件，comb 的 sessionTicket + HELLO 往返成功，缺少 ticket
  仍被 Gateway 拒绝；HTTP 与 WS 保留 connection 门 401/403，dispose 后隧道客户端被关闭。
  connection 门以桩注入，真实 Host/Origin 与浏览器鉴权语义由 DSH 侧保证。

实现与验证入口见 [webServer 插件](../../src/host/webServer/plugin.ts)、[Viewer 代理](../../src/host/webServer/viewer-proxy.ts)和[集成测试](../../test/integration/viewer-proxy.test.ts)。旧部署的 `viewerBaseUrl` 配置已移除，升级时可删除该项。
