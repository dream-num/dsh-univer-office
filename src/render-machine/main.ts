import { mountUniverRenderPage } from '@univer-cli/univer-render-page'
import '@univer/render-preset/styles'
import '@univer/render-preset/facades'
import { LocaleType, Univer } from '@univerjs/core'
import { TEST_LICENSE, ViewAssetIoOwner, registerViewRendering } from '@univer/render-preset'
import { CONTENT_EN_US } from '@univer/render-preset/machine-locale'

const container = document.querySelector<HTMLElement>('#app')
if (container === null) throw new Error('render page requires an #app container')

// The SDK owns the page protocol and render operations; this application injects the same
// content composition as Viewer so custom IMPORTRANGE and embedded Unit behavior stay aligned.
await mountUniverRenderPage({
  container,
  createUniver: ({ license }) => {
    const univer = new Univer({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: CONTENT_EN_US }
    })
    registerViewRendering(univer, {
      container: 'app',
      assetIoOwner: ViewAssetIoOwner.Local,
      license: license ?? TEST_LICENSE,
      workbenchChrome: 'visible'
    })
    return univer
  }
})
