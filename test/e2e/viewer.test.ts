// The built Viewer, served by a real Gateway, driven through the render browser.
import type { Browser, Page } from 'puppeteer-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchRenderBrowser } from '../support/browser.ts'
import {
  populateTrunk,
  startGateway,
  type GatewayHarness,
  type PopulatedTrunk
} from '../support/gateway.ts'

describe('built Viewer', () => {
  let gateway: GatewayHarness
  let trunk: PopulatedTrunk
  let worktreeId: string
  let browser: Browser

  beforeAll(async () => {
    gateway = await startGateway()
    trunk = await populateTrunk(gateway)
    worktreeId = await gateway.createWorktree('compare in Viewer')
    const edit = await gateway.execute(
      worktreeId,
      trunk.sheet,
      'workbook.getActiveSheet().getRange("C3").setValue("worktree diff"); return "compared";'
    )
    expect(edit.committed).toBe(true)
    browser = await launchRenderBrowser()
  })

  afterAll(async () => {
    await browser?.close()
    await gateway?.dispose()
  })

  // [Unit, menu label shown without opening, History open operation]
  const historyCases = [
    ['Sheet', 'sheet', 'Edit History', null],
    ['Doc', 'doc', 'Version history', 'docs-history-ui.operation.open'],
    ['Slide', 'slide', 'Version history', 'slides-history-ui.operation.open'],
    ['Base', 'base', 'Version history', 'bases-history-ui.operation.open'],
    ['Board', 'board', null, 'boards-history-ui.operation.open']
  ] as const

  it.each(historyCases)(
    'exposes History UI for a trunk %s Unit',
    async (_kind, key, label, open) => {
      await withPage(browser, async (page) => {
        await page.goto(
          `${gateway.origin}/?file=${encodeURIComponent(gateway.fileKey)}&mode=embedded&scope=trunk&unit=${encodeURIComponent(trunk[key])}&editable=false&lang=en-US`,
          { waitUntil: 'domcontentloaded' }
        )
        if (open !== null) {
          await page.waitForFunction(() => window.univerAPI !== undefined)
          const opened = await page.evaluate(
            (operation) => window.univerAPI?.executeCommand(operation),
            open
          )
          expect(opened, `${open} accepted`).toBe(true)
        }
        if (label === null) {
          // The Board History panel has no text label; it shows as the History overlay layer.
          await page.waitForFunction(() =>
            [...document.querySelectorAll('div')].some(
              (element) => element.style.zIndex === '49' && element.style.display === 'block'
            )
          )
        } else {
          await page.waitForFunction(
            (expected) => document.documentElement.innerHTML.includes(expected),
            {},
            label
          )
        }
      })
    }
  )

  it.each([1440, 1130, 960, 800, 680, 560, 480])(
    'keeps the worktree topbar in one unified flow at %ipx',
    async (width) => {
      await withPage(browser, async (page) => {
        await openWorktree(page)
        await page.setViewport({ width, height: 720, deviceScaleFactor: 1 })
        const layout = await measureWorktreeTopbar(page, width)
        expect(layout).toMatchObject({ overflow: false, overlap: false, previewAboveView: false })
        expect(layout.switcherWidth).toBeLessThanOrEqual(220)
        if (width === 1440) {
          expect(layout.height).toBeLessThanOrEqual(64)
          expect(Math.abs(layout.centerOffset)).toBeLessThanOrEqual(1)
        }
      })
    }
  )

  it('opens worktree Compare without clearing the Viewer', async () => {
    await withPage(browser, async (page, messages) => {
      await openWorktree(page)
      await page.click(COMPARE_TOGGLE)
      await page.waitForSelector('[data-unit-comparison-viewer="true"]')
      await page.waitForSelector('[data-testid="comparison-source-title"]')
      // Scroll sync can run after the comparison shell mounts, once a pane viewport scrolls and
      // the peer sheet has not reached Rendered yet. Stay past that window.
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      const survivor = await page.evaluate(() => ({
        appChildren: document.getElementById('app')?.childElementCount ?? 0,
        comparison: document.querySelector('[data-unit-comparison-viewer="true"]') !== null
      }))
      expect(survivor.appChildren).toBeGreaterThan(0)
      expect(survivor.comparison).toBe(true)
      expect(
        messages.filter(
          (message) => message.startsWith('pageerror:') && message.includes('[redi]:')
        )
      ).toEqual([])
    })
  })

  const COMPARE_TOGGLE = '[data-testid="view-diff-center"] [aria-label="Compare"]'

  async function openWorktree(page: Page): Promise<void> {
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 })
    await page.goto(
      `${gateway.origin}/?file=${encodeURIComponent(gateway.fileKey)}&worktree=${encodeURIComponent(worktreeId)}&unit=${encodeURIComponent(trunk.sheet)}&sidebar=collapsed&lang=en-US`,
      { waitUntil: 'domcontentloaded' }
    )
    await page.waitForSelector(COMPARE_TOGGLE)
    await page.waitForFunction(
      () =>
        window.univerAPI !== undefined &&
        [...document.querySelectorAll('.overlay')].every(
          (element) => getComputedStyle(element).display === 'none'
        )
    )
  }
})

declare global {
  interface Window {
    univerAPI?: { executeCommand(id: string): Promise<boolean> }
  }
}

/** Run with a fresh page; failures carry the browser console, page errors, and HTTP errors. */
async function withPage(
  browser: Browser,
  body: (page: Page, messages: string[]) => Promise<void>
): Promise<void> {
  const page = await browser.newPage()
  const messages: string[] = []
  page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => messages.push(`pageerror: ${String(error)}`))
  page.on('response', (response) => {
    if (response.status() >= 400) messages.push(`response: ${response.status()} ${response.url()}`)
  })
  page.setDefaultTimeout(20_000)
  try {
    await body(page, messages)
  } catch (error) {
    throw new Error(`${String(error)}; browser messages=${JSON.stringify(messages)}`, {
      cause: error
    })
  } finally {
    await page.close()
  }
}

/** Measure after ResizeObserver and React settle the header mode for the new viewport. */
async function measureWorktreeTopbar(page: Page, width: number) {
  return page.evaluate(async (width) => {
    const measure = () => {
      const topbar = document.querySelector('.topbar')
      const title = document.querySelector('[data-testid="worktree-title"]')
      const switcher = document.querySelector('[data-testid="view-diff-center"]')
      const actions = document.querySelector('[data-testid="worktree-actions"]')
      if (topbar === null || title === null || switcher === null || actions === null) {
        throw new Error('worktree topbar controls are missing')
      }
      const topbarRect = topbar.getBoundingClientRect()
      const titleRect = title.getBoundingClientRect()
      const switcherRect = switcher.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()
      const outside = (rect: DOMRect) =>
        rect.left < topbarRect.left - 1 || rect.right > topbarRect.right + 1
      const controls = [...topbar.querySelectorAll('button')].map((element) =>
        element.getBoundingClientRect()
      )
      const preview = topbar.querySelector('[data-header-preview]')?.getBoundingClientRect()
      return {
        centerOffset:
          switcherRect.left + switcherRect.width / 2 - topbarRect.left - topbarRect.width / 2,
        previewAboveView:
          preview !== undefined &&
          preview.top + preview.height / 2 < switcherRect.top + switcherRect.height / 2 - 1,
        overlap: controls.some((a, i) =>
          controls
            .slice(i + 1)
            .some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            )
        ),
        height: topbarRect.height,
        overflow:
          document.documentElement.scrollWidth > document.documentElement.clientWidth ||
          [titleRect, switcherRect, actionsRect, ...controls].some(outside),
        switcherWidth: switcherRect.width
      }
    }
    let stableFrames = 0
    let layout = measure()
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      layout = measure()
      const fits =
        !layout.overflow &&
        !layout.overlap &&
        !layout.previewAboveView &&
        layout.switcherWidth <= 220 &&
        (width !== 1440 || (layout.height <= 64 && Math.abs(layout.centerOffset) <= 1))
      stableFrames = fits ? stableFrames + 1 : 0
      if (stableFrames >= 3) return layout
    }
    return layout
  }, width)
}
