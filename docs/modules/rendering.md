# 渲染与输出

Provider 在 Host 侧装配输入，Render Machine 在独立的无头浏览器页面中运行。页面与 Viewer 共享 Univer 插件组合，使用同版本的 `@univer-cli/univer-render-page` 协议。参见[渲染操作](../../src/host/provider/render-operations.ts)、[渲染源装配](../../src/host/provider/render-source-operations.ts)和[页面入口](../../src/render-machine/main.ts)。

## 从快照到输出

Provider 授权目标文件和输出路径，通过 [Unit 内容模块](unit-content.md)取得目标快照。截图和 PDF 还要装配公式引用 Unit、Embed child Unit 和 Gateway 中的图片资源。Host 按配置解析浏览器、超时和输出限制，操作完成或取消时释放浏览器资源。

| 操作 | 输入与可验证的结果 |
| --- | --- |
| Slide 布局检查 | 对指定页面执行真实布局，返回覆盖情况和发现的问题。 |
| Slide SVG 编译 | 读取工作区内的 SVG 及引用资源，编译成 Facade 程序，再由 Provider 对显式 draft worktree 的目标页面提交修改。 |
| PNG 截图 | 支持 Sheet 范围、Doc/Slide 页面、Slide 联系表及 Board 区域与元素聚焦。限制页数和像素，PNG 写入授权工作区。 |
| PDF 打印 | 对 Sheet、Doc、Slide 或 Board 生成 PDF，输出到授权工作区。 |

## 附件与验证

截图工具检查模型的图片输入能力、DSH attachment 服务和输出限制。读取 PNG 前再次校验实际输出路径，结构化结果保留文件与图片元数据。只有确实检查了图片才可报告视觉验证；结构回读与 Slide 布局检查各自验证数据和布局。端到端行为见[渲染集成测试](../../test/integration/render.test.ts)。
