import '@univer/render-preset/styles'
import '@univerjs-pro/collaboration-client-ui/lib/index.css'
import './styles.css'
import './prism-global'

import { WorktreeServerHttpError } from '@univer/collab-gateway-contract'
import type { ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { applyDocumentAppearance, resolveAppearance, setAppearance } from './appearance'
import { readLocation } from './core/config'
import { applyDocumentLang, resolveLang, setLang, t } from './i18n'
import { App } from './ui/app'
import { BootCard, FatalNotice } from './ui/boot'

await setLang(resolveLang())
applyDocumentLang()
setAppearance(resolveAppearance())
applyDocumentAppearance()

const root = document.getElementById('app')
if (!root) {
  throw new Error('missing #app root')
}

function mount(node: HTMLElement, view: ReactElement): void {
  flushSync(() => {
    createRoot(node).render(view)
  })
}

const loc = readLocation()
const selectedFile = loc.gatewayFileKey ?? loc.univerfile

if (selectedFile === null) {
  // No file in the URL: do NOT silently open one. Tell the user what to do.
  mount(
    root,
    <BootCard
      title={t().boot.noFileTitle}
      body={t().boot.noFileBody}
      pre="?file=/tmp/ucb-demo.univer"
      hint={t().boot.noFileHint}
    />
  )
} else {
  const app =
    loc.gatewayFileKey !== null
      ? App.sameOriginGateway(
          root,
          loc.gatewayFileKey,
          loc.worktreeId,
          loc.unitId,
          loc.scope,
          loc.editable,
          loc.mode
        )
      : new App(
          root,
          location.origin,
          selectedFile,
          loc.worktreeId,
          loc.unitId,
          loc.scope,
          loc.editable,
          loc.mode
        )
  app.start().catch((error: unknown) => {
    if (error instanceof WorktreeServerHttpError && error.status === 404) {
      // Missing univerfile: the service never auto-creates one, so tell the user to create it first.
      mount(
        root,
        <BootCard
          tone="warn"
          title={t().boot.notFoundTitle}
          body={t().boot.notFoundBody}
          pre={selectedFile}
          hint={t().boot.notFoundHint(`univer new ${selectedFile}`)}
        />
      )
      return
    }
    const host = document.createElement('div')
    root.append(host)
    mount(host, <FatalNotice text={t().boot.fatal(String(error))} />)
    // oxlint-disable-next-line no-console -- boot failure must surface in devtools
    console.error(error)
  })
}
