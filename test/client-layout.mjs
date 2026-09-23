// Source-level browser layout regression. jsdom smoke separately checks the
// built Client Consumer; this test needs a real top layer and iframe lifecycle.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { launch } from 'puppeteer-core'
import { resolveUniverRenderBrowser } from '@univer-cli/univer-render-runtime'

const root = fileURLToPath(new URL('../', import.meta.url))
const bundle = await build({
  stdin: {
    contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { ReviewPanel } from './src/client/components/review-panel.tsx'
      import { worktreeStyles } from './src/client/styles/worktree.ts'
      const style = document.createElement('style')
      style.textContent = worktreeStyles
      document.head.append(style)
      const root = createRoot(document.getElementById('root'))
      window.unmountReview = () => root.unmount()
      root.render(React.createElement(React.StrictMode, null,
        React.createElement(ReviewPanel, {
          file: 'example.univer', worktreeId: null, preferredUnitId: null,
          historical: false, viewerLocale: 'en-US', t: key => key,
          state: {ok: true, file: 'example.univer', gateway: null,
            gatewayRunning: true, viewerUrl: '/frame', worktrees: []}
        })))
    `,
    resolveDir: root,
    loader: 'tsx'
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife'
})
const cases = [
  '',
  'contain:layout',
  'contain:paint',
  'contain:size layout;height:24px',
  'transform:translateY(0)',
  'filter:blur(0px)',
  'container-type:inline-size'
]
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  if (url.pathname === '/bundle.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(bundle.outputFiles[0].text)
    return
  }
  response.setHeader('Content-Type', 'text/html')
  if (url.pathname === '/frame') {
    response.end('<button id="focus">Viewer focus target</button>')
    return
  }
  const ancestor = cases[Number(url.searchParams.get('case'))] ?? ''
  response.end(`<!doctype html><style>
    body{margin:0;padding:0 40px;font:14px system-ui}
    #root{width:600px;${ancestor}}
    .spacer{height:600px}
    </style><div class="spacer"></div><div id="root"></div>
    <div class="spacer"></div><script src="/bundle.js"></script>`)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  const resolution = await resolveUniverRenderBrowser()
  assert.equal(resolution.status, 'found', 'a browser is required for layout validation')
  browser = await launch({ executablePath: resolution.executablePath, headless: true })
  for (const [index, ancestor] of cases.entries()) {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1280, height: 900 })
      await page.goto(`http://127.0.0.1:${server.address().port}/?case=${index}`)
      await page.waitForSelector('.uvf_panelFrame')
      await page.waitForFunction(() =>
        document.querySelector('iframe').contentDocument?.querySelector('#focus')
      )
      await page.evaluate(() => {
        window.scrollTo(0, 400)
        window.reviewFrame = document.querySelector('iframe')
        window.reviewFrame.contentWindow.continuityToken = 'preserved'
      })
      const before = await page.evaluate(() => ({
        scroll: window.scrollY,
        height: document.querySelector('.uvf_panel').getBoundingClientRect().height
      }))
      // Programmatic click also covers deliberately tiny/clipped ancestors.
      await page.$eval('[data-panel-action=fullscreen]', (button) => button.click())
      await page.waitForSelector('.uvf_panel:modal')
      const fullscreen = await page.evaluate(() => {
        const bounds = document.querySelector('.uvf_panel').getBoundingClientRect()
        return {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
          placeholder: document.querySelector('.uvf_panelPlaceholder').getBoundingClientRect()
            .height,
          scroll: window.scrollY
        }
      })
      assert.deepEqual(
        fullscreen,
        {
          width: 1260,
          height: 880,
          x: 10,
          y: 10,
          placeholder: before.height,
          scroll: before.scroll
        },
        ancestor || 'normal ancestor'
      )
      // Esc must work while focus is inside the Viewer, not just in its header.
      const frame = await (await page.$('iframe')).contentFrame()
      await frame.click('#focus')
      await page.keyboard.press('Escape')
      await page.waitForSelector('.uvf_panel:not(.uvf_panel_fullscreen)')
      assert.equal(await page.$eval('.uvf_panel', (panel) => panel.matches(':modal')), false)
      assert.equal(await page.evaluate(() => window.scrollY), before.scroll)
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('iframe') === window.reviewFrame &&
            window.reviewFrame.contentWindow.continuityToken === 'preserved'
        ),
        true,
        'fullscreen must not remount or reload the Viewer'
      )
      await page.$eval('[data-panel-action=fullscreen]', (button) => button.click())
      await page.waitForSelector('.uvf_panel:modal')
      await page.$eval('[data-panel-action=fullscreen]', (button) => button.click())
      await page.waitForSelector('.uvf_panel:not(.uvf_panel_fullscreen)')
      await page.$eval('[data-panel-action=fullscreen]', (button) => button.click())
      await page.waitForSelector('.uvf_panel:modal')
      await page.evaluate(() => window.unmountReview())
      assert.equal(await page.$('.uvf_panel, .uvf_panelPlaceholder, :modal'), null)
    } finally {
      await page.close()
    }
  }
  console.log(`client layout OK (${cases.length} ancestor styles, iframe continuity, Esc, cleanup)`)
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
