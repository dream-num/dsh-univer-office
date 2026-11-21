# SVG 资源库

Provider 使用 `@univerjs-pro/cli-assets` 随包 manifest 创建多 registry 资源库。`univer_resources` 通过 Host 服务列出 registry、检索资源、按 handle 读取 SVG，并可将资源导出供 Slide 等工作流使用。实现见[资源操作](../../src/host/provider/resource-operations.ts)。

## 下载、缓存与导出

Provider 使用 HTTPS 下载器，下载遵循资源超时配置和当前操作的取消信号。缓存位于 Provider 配置的持久目录，工具结果不暴露其根路径。清理缓存返回清除的资源数和字节数。

导出前校验目标目录属于显式工作区，完成后逐一用实际文件路径复核。底层资源库的稳定错误码由 Provider 映射为领域错误。查找、读取、导出和读回验证见[集成测试](../../test/integration/unit-content.test.ts)。
