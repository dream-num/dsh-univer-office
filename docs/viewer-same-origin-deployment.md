# Viewer 同源部署设计（spec）

状态：已实现（本文档描述当前实现）。

## 背景

Gateway 固定监听 loopback 是刻意的进程隔离设计，但过去浏览器可见的 Viewer URL 直接复用这个
loopback origin，导致浏览器与 DSH 不同机时预览全部失效（#61）。过渡方案 `viewerBaseUrl`（#68）
把 Viewer origin 交给部署方反代投影，但要求部署方额外配置转发并自行承担访问控制。

本设计把 Viewer 面整体搬进 DSH WebServer origin：浏览器流量统一走 DSH 已有入口，复用 DSH 的
浏览器鉴权（`connection` 服务）与会话范围检查，`viewerBaseUrl` 随之删除。Gateway 保持只监听
loopback，Host/Worker 内部流量不变。

## 架构

```text
浏览器 → DSH WebServer 插件路由 → connection 信任门 → 会话范围检查 → loopback Gateway
模型/Provider/Worker → loopback Gateway（不变）
```

DSH WebServer 上由本插件注册三个路由：

| 路由 | 类型 | 职责 |
| --- | --- | --- |
| `/univer-viewer` | HTTP prefix | Viewer 文档与静态资源，原样转发到 Gateway 同路径 |
| `/uf` | HTTP prefix | Gateway 领域 API（snapshot/changeset/upload/authz 等），逐请求校验范围后转发 |
| `/univer-viewer/ws` | 精确路径 upgrade | WebSocket 隧道：`?target=/uf/...` 携带真实上游路径，外层其余 query 参数（端点协议，如 comb 握手的 `sessionTicket`）逐字转发上游 |

DSH WebServer 的 upgrade 注册只支持精确路径，而 Gateway 的 WS 端点路径是动态的
（`/uf/<key>[/worktrees/<id>]/universer-api/comb/connect` 与 `/uf/<key>[/worktrees/<id>]/events`），
因此 Viewer 在代理模式下把两类 WS URL 改写为隧道形式；HTTP `/uf/*` 路径保持原样，
`collaboration-client` 按 `location.origin` 拼出的 URL 无需改动即可命中代理。

## 两层鉴权

1. **浏览器身份（`connection` 服务）**：每个路由（含 upgrade）先调
   `connection.requestRejection(req)`——返回 403 表示 Host/Origin fence（`trustedHosts`、
   DNS rebinding 防护）拒绝，401 表示 DSH 浏览器鉴权（launch token → `dsh-auth-*` 签名
   cookie）未通过。`browserAuth` 关闭的 loopback 部署自动放行，语义与 connection 自身一致。
   `/univer-api` 同样补装此门（此前只有会话范围检查，没有浏览器身份门）。
2. **会话范围（既有 `resolveAuthorizedFile`）**：Viewer 文档请求携带 `?file=<gatewayKey>` 与
   `?sessionId=<sid>`，代理解码 fileKey 并确认该路径落在该 live session 的 `cwd` 内，随后以
   `Set-Cookie: univer-viewer-sessions=<sid 集合>` 绑定（HttpOnly、SameSite=Strict、Path=/、
   Max-Age 7d、保留最近 8 个会话，文档每次加载续期）。`/uf` 与 WS 隧道逐请求从 cookie 取
   sessionId，对目标 fileKey 重复同一范围检查。

明确不解决的问题：sessionId 在第一层门内是范围句柄而非身份凭据，持有他人 sessionId 的已认证
浏览器可以命名该会话——这与 `/univer-api` 的既有模型一致，浏览器↔会话的绑定由 DSH Shell 负责，
本插件不做多租户权限体系。

## Viewer 产物与前缀

- Viewer 构建以 `base: '/univer-viewer/'` 输出，资源引用与地址栏路径统一带前缀；
- Gateway 以同一前缀挂载静态目录（剥离前缀后由 sirv 伺服），因此代理**原样转发、零改写**；
- Gateway 根路径 `/` 继续伺服同一份产物，直连 Gateway 的既有用法（测试、独立排障）不变。

## fileState 投影

`computeFileState` 生成的 `viewerUrl`/`openUrl`/`worktreeUrl`/`mergeUrl`（含 unit 变体）改为
同源相对路径 `/univer-viewer/?file=<key>`；`gateway` 字段继续返回 loopback origin（模型可见
事实）。`/univer-api/state` 响应在路由层为所有投影 URL 追加 `&sessionId=<sid>`——浏览器
（review-panel、worktree-window 的 iframe）是该状态的唯一消费者；`univer_*` 工具不消费
这些 URL。Client 只把 URL 当 opaque，不追加任何非呈现参数。

## `viewerBaseUrl` 移除

同源方案落地后该配置失去指涉物：插件自己的转发缝就在 DSH origin 上，不存在第二个可达地址。
配置项、schema、校验与文档全部删除；`#68` 的价值是过渡期解锁 #61，部署方升级后删除该配置行
即可（保留不报错，仅被忽略）。

## 失败模式

- Gateway 不可用（含自动启动失败）：代理返回 502。
- 范围拒绝：文档 403（iframe 显示错误），`/uf` 与 WS upgrade 403；cookie 中含畸形段时按空范围
  处理（fail-closed），不会抛入调用方。
- 隧道上游连接失败：销毁两侧 socket；帧在 upstream OPEN 前缓冲不丢弃；close/error 双向传播；
  插件 unload 时关闭全部桥接连接（quiescence）。桥接每 5 分钟复检一次绑定的会话，全部失效
  即关闭（会话结束后的存活上界为一个复检周期）。
- 非法 target（非 `/uf/` 开头）或无效 fileKey：403。静态面的非 GET/HEAD 请求由代理原样转发、
  由 Gateway 静态处理器拒绝。
- 已知限制：两个标签页并发首开不同会话的 Viewer 时，cookie 以最后写入者为准，被逐出方的后续
  `/uf` 请求会 403，刷新该标签页即恢复。

## 测试

- `test/host-smoke.mjs`：配置面（`viewerBaseUrl` 不存在、投影为相对路径）。
- `test/integration-smoke.mjs`：真实 Gateway + 真实路由 handler：connection 门 401/放行、
  文档 200 + Set-Cookie、范围外文件 403、畸形 cookie fail-closed、`/uf` GET 200 / 无 cookie 403、
  WS 隧道 open + 事件帧到达、dispose 后隧道客户端被关闭。connection 门以桩注入（真实 fence 的
  trustedHosts/cookie 语义由 DSH 侧保证）。
