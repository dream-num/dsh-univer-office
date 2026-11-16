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

  it('persists draft edits and resumes a ready worktree through Continue editing', async () => {
    await withPage(browser, async (page) => {
      page.on('dialog', (dialog) => void dialog.accept())
      await openWorktree(page)
      const edit = async (value: string): Promise<void> => {
        await page.evaluate(async (text) => {
          const api = window.univerAPI!
          api.getActiveWorkbook().getActiveSheet().getRange('D4').setValue(text)
          await api.getCollaboration().flush()
        }, value)
      }
      await edit('user draft edit')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => Boolean(window.univerAPI?.getActiveWorkbook()))
      expect(
        await page.evaluate(() =>
          window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('D4').getValue()
        )
      ).toBe('user draft edit')
      await page.click('::-p-text(Submit for confirmation)')
      await page.waitForSelector('[data-slot="dialog-content"]')
      await page.click('[data-slot="dialog-content"] button:last-child')
      await page.waitForSelector('[data-slot="dialog-content"]', { hidden: true })
      const continueButton = '::-p-text(Continue editing)'
      await page.waitForSelector(continueButton)
      await page.waitForFunction(
        () =>
          Boolean(window.univerAPI?.getActiveWorkbook()) &&
          [...document.querySelectorAll('.overlay')].every(
            (element) => getComputedStyle(element).display === 'none'
          )
      )
      await page.waitForSelector('[data-testid="sheet-readonly-status"]')
      await browser
        .defaultBrowserContext()
        .overridePermissions(gateway.origin, [
          'clipboard-read',
          'clipboard-write',
          'clipboard-sanitized-write'
        ])
      await sheetCanvasPosition(page)
      expect(
        await page.evaluate(() => {
          const workbook = window.univerAPI!.getActiveWorkbook()
          workbook.setEditable(true)
          const permissions = workbook.getWorkbookPermission()
          return {
            editable: permissions.getPoint('WorkbookEdit'),
            copy: permissions.getPoint('WorkbookCopy'),
            print: permissions.getPoint('WorkbookPrint'),
            export: permissions.getPoint('WorkbookExport')
          }
        })
      ).toEqual({ editable: false, copy: true, print: true, export: true })
      const valuesBefore = await page.evaluate(() =>
        window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('A1:F8').getValues()
      )
      const assertReadOnly = async (): Promise<void> => {
        await page.waitForFunction(() => {
          const toast = document.getElementById('toast')
          return (
            toast?.textContent?.includes('Click Continue editing') &&
            !toast.classList.contains('opacity-0')
          )
        })
        expect(
          await page.evaluate(() => ({
            values: window
              .univerAPI!.getActiveWorkbook()
              .getActiveSheet()
              .getRange('A1:F8')
              .getValues(),
            pending: window.univerAPI!.getCollaboration().hasWritePending()
          }))
        ).toEqual({ values: valuesBefore, pending: false })
        await page.waitForFunction(() =>
          document.getElementById('toast')?.classList.contains('opacity-0')
        )
      }
      await page
        .locator('canvas[id^="univer-sheet-main-canvas_"]')
        .click({ offset: { x: 85, y: 32 }, count: 2 })
      await page.keyboard.type('blocked typing')
      await assertReadOnly()
      await page.keyboard.press('F2')
      await assertReadOnly()
      await page.keyboard.press('Backspace')
      await assertReadOnly()
      await page.keyboard.press('Delete')
      await assertReadOnly()
      await page
        .locator('[data-u-comp="formula-editor"] canvas')
        .filter((canvas) => canvas.getBoundingClientRect().width > 0)
        .click({ count: 2 })
      await page.keyboard.type('blocked formula')
      await assertReadOnly()
      await page
        .locator('canvas[id^="univer-sheet-main-canvas_"]')
        .click({ offset: { x: 85, y: 32 } })
      const modifier = await page.evaluate(() =>
        navigator.platform.includes('Mac') ? 'Meta' : 'Control'
      )
      await page.evaluate(() => navigator.clipboard.writeText('blocked paste'))
      await page.keyboard.down(modifier)
      await page.keyboard.press('V')
      await page.keyboard.up(modifier)
      await assertReadOnly()
      await page.evaluate(() =>
        window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('D4').activate()
      )
      await page.keyboard.down(modifier)
      await page.keyboard.press('C')
      await page.keyboard.up(modifier)
      await page.waitForFunction(async () =>
        (await navigator.clipboard.readText()).includes('user draft edit')
      )
      expect(
        await page.evaluate(() => document.getElementById('toast')?.classList.contains('opacity-0'))
      ).toBe(true)
      // Navigation inputs must remain usable without producing an editing warning.
      await page.locator('input[value="D4"]').fill('E6')
      await page.keyboard.press('Enter')
      expect(
        await page.evaluate(() => document.getElementById('toast')?.classList.contains('opacity-0'))
      ).toBe(true)
      const columnWidth = await page.evaluate(() =>
        window.univerAPI!.getActiveWorkbook().getActiveSheet().getColumnWidth(0)
      )
      const dragCanvas = await sheetCanvasPosition(page)
      const columnEdge = dragCanvas.x - 85 + 46 + columnWidth
      const headerY = dragCanvas.y - 32 + 10
      await page.mouse.move(columnEdge, headerY)
      await page.mouse.down()
      await page.mouse.move(columnEdge + 60, headerY, { steps: 12 })
      await page.mouse.up()
      expect(
        await page.evaluate(() =>
          window.univerAPI!.getActiveWorkbook().getActiveSheet().getColumnWidth(0)
        )
      ).toBe(columnWidth)
      expect(
        await page.evaluate(() => window.univerAPI!.getCollaboration().hasWritePending())
      ).toBe(false)
      // The same operation opens the cell editor for typing, double-click and F2.
      expect(
        await page.evaluate(() =>
          window.univerAPI!.executeCommand('sheet.operation.set-cell-edit-visible', {
            visible: true,
            eventType: 3
          })
        )
      ).toBe(false)
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll('[role="dialog"]')]
            .filter((element) => element.checkVisibility())
            .map((element) => element.textContent)
        )
      ).toEqual([])
      await page.setRequestInterception(true)
      let rejectReopen = true
      page.on('request', (request) => {
        if (rejectReopen && request.url().endsWith('/reopen')) {
          rejectReopen = false
          void request.respond({ status: 503, body: 'temporarily unavailable' })
        } else {
          void request.continue()
        }
      })
      await page.click(continueButton)
      await page.waitForSelector('::-p-text(Failed to resume editing)')
      expect(await page.$(continueButton)).not.toBeNull()
      const status = await gateway.service.status({ ...gateway.scoped, worktreeId })
      expect(status.result.selectedWorktree.status).toBe('ready')
      await page.click(COMPARE_TOGGLE)
      await page.waitForSelector('[data-unit-comparison-viewer="true"]')
      await page.click(continueButton)
      await page.waitForFunction(
        () =>
          document.querySelector('[data-unit-comparison-viewer="true"]') === null &&
          Boolean(window.univerAPI?.getActiveWorkbook()) &&
          !document.body.textContent?.includes('Continue editing')
      )
      const editableCanvas = await sheetCanvasPosition(page)
      await page.mouse.click(editableCanvas.x, editableCanvas.y)
      await page.evaluate(() =>
        window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('E5').activate()
      )
      await page.keyboard.type('resumed user edit')
      await page.keyboard.press('Enter')
      await page.evaluate(() => window.univerAPI!.getCollaboration().flush())
      expect(
        await page.evaluate(() =>
          window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('E5').getValue()
        )
      ).toBe('resumed user edit')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => Boolean(window.univerAPI?.getActiveWorkbook()))
      expect(
        await page.evaluate(() =>
          window.univerAPI!.getActiveWorkbook().getActiveSheet().getRange('E5').getValue()
        )
      ).toBe('resumed user edit')
    })
  })

  it('keeps a read-only Sheet live when remote collaboration updates arrive', async () => {
    await withPage(browser, async (page) => {
      await page.goto(
        `${gateway.origin}/?file=${encodeURIComponent(gateway.fileKey)}&mode=embedded&scope=trunk&unit=${encodeURIComponent(trunk.sheet)}&editable=false&lang=en-US`
      )
      await page.waitForFunction(() => Boolean(window.univerAPI?.getActiveWorkbook()))
      const remoteWorktree = await gateway.createWorktree('remote update to read-only viewer')
      expect(
        (
          await gateway.execute(
            remoteWorktree,
            trunk.sheet,
            'workbook.getActiveSheet().getRange("F6").setValue("remote update"); return "ok";'
          )
        ).committed
      ).toBe(true)
      await gateway.transition(remoteWorktree, 'ready', 'ready')
      await gateway.transition(remoteWorktree, 'merge', 'merged')
      await page.waitForFunction(
        () =>
          window.univerAPI?.getActiveWorkbook().getActiveSheet().getRange('F6').getValue() ===
          'remote update'
      )
      expect(
        await page.evaluate(() => window.univerAPI!.getCollaboration().hasWritePending())
      ).toBe(false)
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
    univerAPI?: {
      executeCommand(id: string, params?: Record<string, unknown>): Promise<boolean>
      getActiveWorkbook(): {
        setEditable(editable: boolean): void
        getWorkbookPermission(): { getPoint(point: string): boolean }
        getActiveSheet(): {
          getColumnWidth(column: number): number
          getRange(range: string): {
            setValue(value: string): void
            getValue(): unknown
            getValues(): unknown[][]
            activate(): void
          }
        }
      }
      getCollaboration(): { flush(): Promise<void>; hasWritePending(): boolean }
    }
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

/** Select a real cell in the main worksheet canvas, excluding formula and hidden editor canvases. */
async function sheetCanvasPosition(page: Page): Promise<{ x: number; y: number }> {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('canvas')].some((canvas) => {
      const rect = canvas.getBoundingClientRect()
      return rect.width > 200 && rect.height > 100
    })
  )
  return page.evaluate(() => {
    const rect = [...document.querySelectorAll('canvas')]
      .map((canvas) => canvas.getBoundingClientRect())
      .find((bounds) => bounds.width > 200 && bounds.height > 100)
    if (!rect) throw new Error('Worksheet canvas is not visible')
    return { x: rect.x + 85, y: rect.y + 32 }
  })
}
