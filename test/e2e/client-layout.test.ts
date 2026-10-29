// Source-level browser layout regression for the review card and floating window. The built
// Client test in jsdom covers the Consumer; this needs a real top layer and iframe lifecycle.
import { createServer, type Server } from 'node:http'
import { build } from 'esbuild'
import type { Browser, Page } from 'puppeteer-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRenderBrowser } from '../support/browser.ts'
import { closeServer, listen } from '../support/net.ts'
import { repoPath } from '../support/paths.ts'

declare global {
  interface Window {
    reviewFrame?: HTMLIFrameElement & { contentWindow: Window & { continuityToken?: string } }
    unmountReview(): void
  }
}

interface LayoutCase {
  readonly ancestor: string
  readonly clearance: number
  readonly width: number
}

const ANCESTORS = [
  '',
  'contain:layout',
  'contain:paint',
  'contain:size layout;height:24px',
  'transform:translateY(0)',
  'filter:blur(0px)',
  'container-type:inline-size'
]
const TITLEBARS = [
  { clearance: 0, width: 1280 },
  { clearance: 40, width: 1280 },
  { clearance: 42, width: 1280 },
  { clearance: 48, width: 1280 },
  { clearance: 40, width: 600 }
]
const REVIEW_CASES: LayoutCase[] = [
  ...ANCESTORS.map((ancestor) => ({ ancestor, clearance: 0, width: 1280 })),
  ...TITLEBARS.slice(1).map((entry) => ({ ancestor: '', ...entry }))
]

describe('review and window layout in a real browser', () => {
  let server: Server
  let origin: string
  let browser: Browser

  beforeAll(async () => {
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
        resolveDir: repoPath(),
        loader: 'tsx'
      },
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife'
    })
    const script = bundle.outputFiles[0]!.text
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === '/bundle.js') {
        response.setHeader('Content-Type', 'text/javascript')
        response.end(script)
        return
      }
      response.setHeader('Content-Type', 'text/html')
      if (url.pathname === '/frame') {
        response.end('<button id="focus">Viewer focus target</button>')
        return
      }
      const ancestor = url.searchParams.get('ancestor') ?? ''
      const clearance = Number(url.searchParams.get('clearance') ?? 0)
      response.end(`<!doctype html><style>
        ${clearance === 0 ? '' : `html{--dsh-windows-titlebar-height:${clearance}px;--dsh-frame-top-clearance:var(--dsh-windows-titlebar-height)}`}
        *{box-sizing:border-box}
        body{margin:0;padding:0 40px;font:14px system-ui}
        #root{width:600px;${ancestor}}
        .spacer{height:600px}
        </style><div class="spacer"></div><div id="root"></div>
        <div class="spacer"></div><script src="/bundle.js"></script>`)
    })
    origin = `http://127.0.0.1:${await listen(server)}`
    browser = await launchRenderBrowser()
  })

  afterAll(async () => {
    await browser?.close()
    if (server !== undefined) await closeServer(server)
  })

  const open = async (query: Record<string, string | number>, width: number): Promise<Page> => {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)])
    )
    await page.goto(`${origin}/?${search}`)
    return page
  }

  it.each(REVIEW_CASES)(
    'escapes ancestor "$ancestor" for fullscreen below a $clearance px title bar at $width px',
    async ({ ancestor, clearance, width }) => {
      const page = await open({ ancestor, clearance }, width)
      try {
        await page.waitForSelector('.uvf_panelFrame')
        await page.waitForFunction(
          () => document.querySelector('iframe')?.contentDocument?.querySelector('#focus') != null
        )
        await page.evaluate(() => {
          window.scrollTo(0, 400)
          window.reviewFrame = document.querySelector('iframe') as Window['reviewFrame']
          window.reviewFrame!.contentWindow.continuityToken = 'preserved'
        })
        const before = await page.evaluate(() => ({
          scroll: window.scrollY,
          height: document.querySelector('.uvf_panel')!.getBoundingClientRect().height
        }))
        // A programmatic click also covers deliberately tiny or clipped ancestors.
        await page.$eval('[data-panel-action=fullscreen]', (button) =>
          (button as HTMLElement).click()
        )
        await page.waitForSelector('.uvf_panel:modal')
        const fullscreen = await page.evaluate(() => {
          const bounds = document.querySelector('.uvf_panel')!.getBoundingClientRect()
          return {
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y,
            placeholder: document.querySelector('.uvf_panelPlaceholder')!.getBoundingClientRect()
              .height,
            scroll: window.scrollY
          }
        })
        const gutter = width <= 680 ? 4 : 10
        expect(fullscreen).toEqual({
          width: width - gutter * 2,
          height: 900 - gutter * 2 - clearance,
          x: gutter,
          y: gutter + clearance,
          placeholder: before.height,
          scroll: before.scroll
        })

        // Esc must work while focus is inside the Viewer, not just in its header.
        const frame = await (await page.$('iframe'))!.contentFrame()
        await frame!.click('#focus')
        await page.keyboard.press('Escape')
        await page.waitForSelector('.uvf_panel:not(.uvf_panel_fullscreen)')
        expect(await page.$eval('.uvf_panel', (panel) => panel.matches(':modal'))).toBe(false)
        expect(await page.evaluate(() => window.scrollY)).toBe(before.scroll)
        expect(
          await page.evaluate(
            () =>
              document.querySelector('iframe') === window.reviewFrame &&
              window.reviewFrame?.contentWindow.continuityToken === 'preserved'
          ),
          'fullscreen must not remount or reload the Viewer'
        ).toBe(true)

        const toggle = () =>
          page.$eval('[data-panel-action=fullscreen]', (button) => (button as HTMLElement).click())
        await toggle()
        await page.waitForSelector('.uvf_panel:modal')
        await toggle()
        await page.waitForSelector('.uvf_panel:not(.uvf_panel_fullscreen)')
        await toggle()
        await page.waitForSelector('.uvf_panel:modal')
        await page.evaluate(() => window.unmountReview())
        expect(await page.$('.uvf_panel, .uvf_panelPlaceholder, :modal')).toBeNull()
      } finally {
        await page.close()
      }
    }
  )

  it.each(TITLEBARS)(
    'keeps the floating window below a $clearance px title bar at $width px',
    async ({ clearance, width }) => {
      const page = await open({ floating: '', clearance }, width)
      try {
        await page.waitForSelector('.uvf_win')
        const bounds = () =>
          page.$eval('.uvf_win', (element) => {
            const rect = element.getBoundingClientRect()
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          })
        const minimumY = clearance + 12
        const waitForY = (expected: number) =>
          page.waitForFunction(
            (y) => document.querySelector('.uvf_win')!.getBoundingClientRect().y === y,
            {},
            expected
          )
        expect((await bounds()).y, 'initial title bar clearance').toBe(minimumY)

        // Move below the strip, then drag back up past the viewport edge.
        const start = await bounds()
        await page.mouse.move(start.x + 70, start.y + 20)
        await page.mouse.down()
        await page.mouse.move(start.x + 70, start.y + 100)
        await page.mouse.up()
        await waitForY(minimumY + 80)
        const moved = await bounds()
        expect(moved.y).toBe(minimumY + 80)
        await page.mouse.move(moved.x + 70, moved.y + 20)
        await page.mouse.down()
        await page.mouse.move(moved.x + 70, 0)
        await page.mouse.up()
        await waitForY(minimumY)
        expect((await bounds()).y, 'drag stays below title bar').toBe(minimumY)

        const handle = (await (await page.$('[data-direction=n]'))!.boundingBox())!
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.mouse.down()
        await page.mouse.move(handle.x + handle.width / 2, 0)
        await page.mouse.up()
        await waitForY(minimumY)
        expect((await bounds()).y, 'north resize stays below title bar').toBe(minimumY)

        await page.click('[data-window-action=maximize]')
        await page.waitForSelector('.uvf_win_max')
        expect(await bounds()).toEqual({
          x: 12,
          y: minimumY,
          width: width - 24,
          height: 900 - minimumY - 12
        })
        await page.click('[data-window-action=maximize]')
        await page.waitForSelector('.uvf_win:not(.uvf_win_max)')

        await page.setViewport({ width, height: 320 })
        await page.waitForFunction(
          () => document.querySelector('.uvf_win')!.getBoundingClientRect().bottom <= 308
        )
        const resized = await bounds()
        expect(resized.y).toBe(minimumY)
        expect(
          resized.y + resized.height,
          'short viewport keeps the bottom gutter'
        ).toBeLessThanOrEqual(308)

        await page.evaluate(() => {
          document.documentElement.style.setProperty('--dsh-frame-top-clearance', '64px')
          window.dispatchEvent(new Event('resize'))
        })
        await page.waitForFunction(
          () => document.querySelector('.uvf_win')!.getBoundingClientRect().y === 76
        )
        const adjusted = await bounds()
        expect(
          adjusted.y + adjusted.height,
          'changed clearance refits the window'
        ).toBeLessThanOrEqual(308)

        await page.click('[data-window-action=close]')
        await page.waitForSelector('.uvf_win', { hidden: true })
        expect(await page.$('.uvf_win')).toBeNull()
      } finally {
        await page.close()
      }
    }
  )
})
