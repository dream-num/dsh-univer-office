# Unit Comparison Viewer

[English](README.md) | [简体中文](README.zh-CN.md)

`@univer/unit-comparison-viewer` 是一个 React package，用于以只读双栏形式展示 Sheet、Doc、Slide、
Base 或 Board Unit 的比较结果。

package 只消费已完全解码的 `unitData`。它不请求 comparison session、不解码 wire payload、不管理路由
状态，也不创建已经配置好的 Univer runtime；这些职责由宿主提供。

## 使用方式

在 Tailwind CSS 之后导入 package 样式，使 Tailwind v4 扫描 package 源码，并生成 Viewer 使用的
utilities：

```css
@import "tailwindcss";
@import "@univer/unit-comparison-viewer/styles.css";
```

使用 comparison result、已解码 snapshot 和宿主管理的 Univer factory 渲染 Viewer：

```tsx
import { UnitComparisonViewer } from "@univer/unit-comparison-viewer";

<UnitComparisonViewer
  key={`${comparison.result.comparisonId}:${comparison.result.unit.unitId}`}
  comparison={comparison}
  createUniver={createComparisonUniver}
  locale={locale}
  darkMode={darkMode}
/>;
```

`key` 是标准的外部 React lifecycle key，刻意不作为组件 prop。只有整个 comparison session 或 Unit
变化时才应改变它。Sheet 选择和 Slide 页面选择由已经挂载的 Viewer 在内部增量更新。

factory 是适配不同 application preset 或 plugin 的集成边界：

```ts
import type { UnitComparisonUniverFactory } from "@univer/unit-comparison-viewer";

export const createComparisonUniver: UnitComparisonUniverFactory = async (options) => {
  const univer = createAndConfigureUniver({
    container: options.container,
    unitType: options.unitType,
    locale: options.locale,
    darkMode: options.darkMode,
  });

  return {
    univer,
    dispose: () => univer.dispose(),
  };
};
```

宿主 factory 必须为请求的 `unitType` 注册所需渲染 plugin，将其挂载到 `options.container`，并保持
runtime 只读。Viewer 为每个可见侧调用一次 factory，并负责调用 `dispose()`。

可选 props：

- `leftHeaderControl`：渲染在左侧 header 中的宿主 UI，例如 comparison source 选择器。
- `messages`：叠加在 `locale` 所选内置语言包之上的宿主局部文案覆盖。

package 自带与 collaboration viewer 相同的 17 种完整 Viewer 语言包；不支持的 `LocaleType` 回退到
英文。实体名称、属性路径和 schema enum 值来自对应的 Univer History SDK locale，用户内容不会被翻译。
宿主通常不需要传入 `messages`。
