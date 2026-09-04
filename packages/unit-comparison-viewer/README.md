# Unit Comparison Viewer

[English](README.md) | [简体中文](README.zh-CN.md)

`@univer/unit-comparison-viewer` is a React package for rendering a read-only, side-by-side
comparison of Sheet, Doc, Slide, Base, or Board Units.

The package consumes fully decoded `unitData`. It does not fetch comparison sessions, decode wire
payloads, own route state, or create a configured Univer runtime. The host supplies those concerns.

## Usage

Import the package stylesheet after Tailwind CSS so Tailwind v4 scans the package source and emits
the utilities used by the viewer:

```css
@import "tailwindcss";
@import "@univer/unit-comparison-viewer/styles.css";
```

Render the viewer with the comparison result, decoded snapshots, and a host-owned Univer factory:

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

`key` is the normal external React lifecycle key; it is deliberately not a component prop. Change
it only when the whole comparison session or Unit changes. Sheet selection and Slide page selection
are updated incrementally inside a mounted viewer.

The factory is the integration seam for applications with different presets or plugins:

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

The host factory must register the rendering plugins required for the requested `unitType`, attach
them to `options.container`, and keep the runtime read-only. The viewer creates one factory instance
per visible side and owns calling `dispose()`.

Optional props are:

- `leftHeaderControl`: host UI rendered in the left-side header, such as a comparison-source picker.
- `messages`: partial host wording overrides layered over the built-in locale selected by `locale`.

The package owns complete Viewer message packs for the same 17 locales supported by the
collaboration viewer. It falls back to English for an unsupported `LocaleType`. Entity names,
property paths, and schema enum values come from the matching Univer History SDK locale; user
content is never translated. Hosts normally do not need to pass `messages`.
