# 产品遥测

产品遥测是 best-effort 的匿名活跃与卸载统计，只用于看趋势，不用于精确计量。发布包不声明 `postinstall`，以兼容 DSH profile 的依赖构建脚本审批策略。遥测绝不影响插件启动或卸载：所有失败静默吞掉，发送有 5 秒超时，无重试、无队列、无锁。

- 事件共三个，统一经 `lib/build-info.json` 中写死的 Univer 代理 endpoint 上报（版本与 commit 也取自该文件），客户端不持有任何分析平台凭证。发送只发生在安装后的插件激活与卸载钩子，开发 checkout 不会触发任何发送；`test/integration/telemetry.test.ts` 断言构建产物中的 endpoint 等于写死地址，防止回归为静默构建。运行时显式设置 `UNIVER_TELEMETRY_ENDPOINT`（含空值）优先于写死值，用作测试重定向与应急开关。服务端 allowlist 必须先于带 endpoint 的构建部署，否则事件会被整包拒绝且因 at-most-once 永久丢失；
- `dsh_plugin_activated`（Host 激活，每安装身份一次）、`dsh_plugin_daily_active`（Host 激活时检查，每安装身份每本地日一次）、`dsh_plugin_uninstall_hook`（包 uninstall，不去重，因为 state 跨重装存活，一次性标记会掩盖后续卸载）；
- payload 只允许 `distinctId`（随机 UUID）、事件名与白名单属性（package name/version、build commit、platform、arch、Node major version、event source、state schema version），禁止路径、workspace、session、文件内容与环境变量。服务端代理对未知键整包拒绝；
- 去重只在本机 state（`$DSH_HOME/telemetry/dsh-univer-office/state.json`，沿用 `config.ts` 的 `DSH_HOME` 约定）中做，先落盘标记再发送（at-most-once：崩溃宁可丢事件不重发，标记写失败时同样放弃发送）；并发启动的毫秒级竞态接受偶发双发；
- `telemetry: false` 配置由 Host 同步写入 state 的 `disabled` 标记，使拿不到 Cordis 配置的卸载 hook 发送同样停用，这也是空 endpoint 下唯一会创建 state 的路径；`DO_NOT_TRACK` 非空在所有入口直接短路；
- 发送只发生在 Host 进程（fire-and-forget，不注册资源、不阻塞激活与卸载）与 `scripts/telemetry-entry.mjs` 启动的 detached 子进程中；Client、Viewer、Gateway 与 Worker 不发送遥测。

实现见 [Host 遥测](../../src/host/telemetry)和[卸载入口](../../scripts/telemetry-entry.mjs)。事件白名单、禁用条件和生命周期打包由[遥测集成测试](../../test/integration/telemetry.test.ts)覆盖。
