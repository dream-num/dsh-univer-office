// Current @univerjs-pro/docs-code/list/quote UI packages publish JavaScript
// plugin and locale entrypoints but do not ship the package root/locale .d.ts
// files declared in package.json. Keep this file limited to the constructors
// and locale shapes registered by the gateway viewer.
declare module '@univerjs-pro/docs-code' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsCodePlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-code-ui' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsCodeUIPlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-code-ui/locale/en-US' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}

declare module '@univerjs-pro/docs-code-ui/locale/zh-CN' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}

declare module '@univerjs-pro/docs-list' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsListPlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-list-ui' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsListUIPlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-list-ui/locale/en-US' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}

declare module '@univerjs-pro/docs-list-ui/locale/zh-CN' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}

declare module '@univerjs-pro/docs-quote' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsQuotePlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-quote-ui' {
  import type { Plugin, PluginCtor } from '@univerjs/core'

  export const UniverDocsQuoteUIPlugin: PluginCtor<Plugin>
}

declare module '@univerjs-pro/docs-quote-ui/locale/en-US' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}

declare module '@univerjs-pro/docs-quote-ui/locale/zh-CN' {
  import type { ILanguagePack } from '@univerjs/core'

  const locale: ILanguagePack
  export default locale
}
