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
      import { WorktreeWindow } from './src/client/components/worktree-window.tsx'
      import { worktreeStyles } from './src/client/styles/worktree.ts'
      const style = document.createElement('style')
      style.textContent = worktreeStyles
      document.head.append(style)
      const root = createRoot(document.getElementById('root'))
      window.unmountReview = () => root.unmount()
      const floating = new URLSearchParams(location.search).has('floating')
      root.render(React.createElement(React.StrictMode, null,
        React.createElement(floating ? WorktreeWindow : ReviewPanel, {
          file: 'example.univer', worktreeId: null, preferredUnitId: null,
          stackIndex: 0, onDismiss: () => root.unmount(),
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
].map((ancestor) => ({ ancestor, clearance: 0, width: 1280 }))
const titlebarCases = [
  { clearance: 0, width: 1280 },
  { clearance: 40, width: 1280 },
  { clearance: 42, width: 1280 },
  { clearance: 48, width: 1280 },
  { clearance: 40, width: 600 }
]
cases.push(...titlebarCases.slice(1).map((entry) => ({ ancestor: '', ...entry })))
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
  const { ancestor, clearance } = cases[Number(url.searchParams.get('case'))] ?? cases[0]
  const top = Number(url.searchParams.get('clearance') ?? clearance)
  response.end(`<!doctype html><style>
    ${top === 0 ? '' : `html{--dsh-windows-titlebar-height:${top}px;--dsh-frame-top-clearance:var(--dsh-windows-titlebar-height)}`}
    *{box-sizing:border-box}
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
  browser = await launch({
    executablePath: resolution.executablePath,
    headless: true,
    // The same flags integration-smoke uses: the launch must succeed where the suite runs as root,
    // because the browser's own sandbox is unavailable there.
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  })
  for (const [index, { ancestor, clearance, width }] of cases.entries()) {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width, height: 900 })
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
      const gutter = width <= 680 ? 4 : 10
      assert.deepEqual(
        fullscreen,
        {
          width: width - gutter * 2,
          height: 900 - gutter * 2 - clearance,
          x: gutter,
          y: gutter + clearance,
          placeholder: before.height,
          scroll: before.scroll
        },
        `${ancestor || 'normal ancestor'}, clearance ${clearance}, width ${width}`
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
  for (const { clearance, width } of titlebarCases) {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width, height: 900 })
      await page.goto(`http://127.0.0.1:${server.address().port}/?floating&clearance=${clearance}`)
      await page.waitForSelector('.uvf_win')
      const bounds = () =>
        page.$eval('.uvf_win', (element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        })
      const minimumY = clearance + 12
      const waitForY = (expected) =>
        page.waitForFunction(
          (y) => document.querySelector('.uvf_win').getBoundingClientRect().y === y,
          {},
          expected
        )
      assert.equal((await bounds()).y, minimumY, 'initial title bar clearance')
      // Move below the strip, then drag back up past the viewport edge.
      const start = await bounds()
      await page.mouse.move(start.x + 70, start.y + 20)
      await page.mouse.down()
      await page.mouse.move(start.x + 70, start.y + 100)
      await page.mouse.up()
      await waitForY(minimumY + 80)
      const moved = await bounds()
      assert.equal(moved.y, minimumY + 80)
      await page.mouse.move(moved.x + 70, moved.y + 20)
      await page.mouse.down()
      await page.mouse.move(moved.x + 70, 0)
      await page.mouse.up()
      await waitForY(minimumY)
      assert.equal((await bounds()).y, minimumY, 'drag stays below title bar')
      const north = await page.$('[data-direction=n]')
      const handle = await north.boundingBox()
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2, 0)
      await page.mouse.up()
      await waitForY(minimumY)
      assert.equal((await bounds()).y, minimumY, 'north resize stays below title bar')
      await page.click('[data-window-action=maximize]')
      await page.waitForSelector('.uvf_win_max')
      assert.deepEqual(await bounds(), {
        x: 12,
        y: minimumY,
        width: width - 24,
        height: 900 - minimumY - 12
      })
      await page.click('[data-window-action=maximize]')
      await page.waitForSelector('.uvf_win:not(.uvf_win_max)')
      await page.setViewport({ width, height: 320 })
      await page.waitForFunction(
        () => document.querySelector('.uvf_win').getBoundingClientRect().bottom <= 308
      )
      const resized = await bounds()
      assert.equal(resized.y, minimumY)
      assert.ok(resized.y + resized.height <= 308, 'short viewport keeps the bottom gutter')
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--dsh-frame-top-clearance', '64px')
        window.dispatchEvent(new Event('resize'))
      })
      await page.waitForFunction(
        () => document.querySelector('.uvf_win').getBoundingClientRect().y === 76
      )
      const adjusted = await bounds()
      assert.ok(adjusted.y + adjusted.height <= 308, 'changed clearance refits the window')
      await page.click('[data-window-action=close]')
      await page.waitForSelector('.uvf_win', { hidden: true })
      assert.equal(await page.$('.uvf_win'), null)
    } finally {
      await page.close()
    }
  }
  console.log(
    `client layout OK (${cases.length} review cases, ${titlebarCases.length} floating cases, iframe continuity, Esc, cleanup)`
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
