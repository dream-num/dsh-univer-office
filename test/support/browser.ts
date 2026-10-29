import { resolveUniverRenderBrowser } from '@univer-cli/univer-render-runtime'
import { launch, type Browser } from 'puppeteer-core'

/** Executable of the render browser the bundled runtime would use on this machine. */
export async function renderBrowserPath(): Promise<string> {
  const resolution = await resolveUniverRenderBrowser()
  if (resolution.status !== 'found') {
    throw new Error(`render browser was not found: ${JSON.stringify(resolution)}`)
  }
  return resolution.executablePath
}

/** Headless render browser for source-level and Viewer browser tests. */
export async function launchRenderBrowser(): Promise<Browser> {
  return launch({
    executablePath: await renderBrowserPath(),
    headless: true,
    // CI containers run as root, where the browser's own sandbox is unavailable.
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  })
}
