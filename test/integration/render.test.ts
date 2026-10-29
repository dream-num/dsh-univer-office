import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderBrowserPath } from '../support/browser.ts'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'

const SLIDE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f7f8fb"/><text x="80" y="160" font-family="Arial" font-size="54" fill="#182230">Bundled SVG</text></svg>'

describe('rendering through the bundled render machine', () => {
  let gateway: GatewayHarness
  let worktreeId: string
  let slide: string
  let base: string

  beforeAll(async () => {
    gateway = await startGateway()
    worktreeId = await gateway.createWorktree('render')
    slide = await gateway.createUnit(worktreeId, 'slide', 'Rendered')
    base = await gateway.createUnit(worktreeId, 'base', 'Tasks')
    const source = join(gateway.workspace, 'slide.svg')
    await writeFile(source, SLIDE_SVG)
    const compiled = await gateway.service.compileSvg({
      ...gateway.scoped,
      source,
      sourceWorkspace: gateway.workspace,
      worktreeId,
      unitId: slide,
      page: 1
    })
    expect(compiled.result?.execution?.committed).toBe(true)
  })

  afterAll(async () => {
    await gateway?.dispose()
  })

  it('captures Slide pages and a contact sheet as non-empty PNG files', async () => {
    const screenshot = await gateway.service.screenshotUnit({
      ...gateway.scoped,
      worktreeId,
      unitId: slide,
      output: join(gateway.workspace, 'screenshots'),
      outputWorkspace: gateway.workspace,
      target: { kind: 'paged-unit', pages: [1], contactSheet: {}, scale: 1 }
    })
    expect(screenshot.operation).toBe('screenshot')
    expect(screenshot.result.images).toHaveLength(2)
    for (const image of screenshot.result.images) {
      expect(image.mediaType).toBe('image/png')
      expect(image.data.length).toBeGreaterThan(0)
      expect((await stat(image.path)).size).toBeGreaterThan(0)
    }
  })

  // An explicitly configured browser must reach the render runtime and capture exactly like
  // auto-detection (issue #64).
  it('passes browserExecutablePath through to the render runtime (#64)', async () => {
    const explicit = gateway.createService({ browserExecutablePath: await renderBrowserPath() })
    const scoped = {
      workspace: gateway.workspace,
      file: join(gateway.workspace, 'explicit.univer')
    }
    const created = await explicit.newFile(scoped)
    expect(created).toMatchObject({ ok: true, result: { created: true } })
    const worktree = await explicit.worktree({ ...scoped, action: 'create', name: 'explicit' })
    const explicitWorktreeId = worktree.result?.worktreeId
    const unit = await explicit.unit({
      ...scoped,
      action: 'create',
      worktreeId: explicitWorktreeId,
      kind: 'sheet',
      name: 'Explicit'
    })
    const screenshot = await explicit.screenshotUnit({
      ...scoped,
      worktreeId: explicitWorktreeId,
      unitId: unit.result?.unitId,
      output: join(gateway.workspace, 'explicit-screenshots'),
      outputWorkspace: gateway.workspace,
      target: { kind: 'unit-viewport', scale: 1 }
    })
    expect(screenshot.operation).toBe('screenshot')
    expect(screenshot.result.images.length).toBeGreaterThanOrEqual(1)
    for (const image of screenshot.result.images) {
      expect(image.mediaType).toBe('image/png')
      expect(image.data.length).toBeGreaterThan(0)
      expect((await stat(image.path)).size).toBeGreaterThan(0)
    }
  })

  // The durable attachment ref must describe the stored object. A normalizing attachment store
  // re-encodes the renderer's PNG, so every field of `image` must come from the store's
  // reference — a ref that claims the renderer's mediaType makes session replay fail
  // permanently with ATTACHMENT_CORRUPT (issue #67).
  it('persists the attachment store reference verbatim from the screenshot tool (#67)', async () => {
    const refs: any[] = []
    const context = new Context()
    try {
      await context.plugin(SystemPrompt)
      await context.plugin(ToolRuntime)
      context.provide('attachments', {
        imageLimits: {
          mediaTypes: ['image/png'],
          maxImageBytes: 64 * 1024 * 1024,
          maxMessageImageBytes: 128 * 1024 * 1024
        },
        // The durable object is re-encoded, so the reference describes a WebP object with
        // store-probed dimensions that differ from the renderer's declared PNG facts.
        async saveImages(inputs: Array<{ data: Uint8Array; name: string }>) {
          return inputs.map((input) => {
            const ref = {
              attachmentId: `sha256:${createHash('sha256').update(input.data).digest('hex')}`,
              mediaType: 'image/webp',
              bytes: input.data.byteLength,
              width: 1234,
              height: 567,
              name: input.name
            }
            refs.push(ref)
            return ref
          })
        }
      })
      context.provide('llm', {
        async resolveModelInfo() {
          return { inputModalities: ['image'] }
        }
      })
      await context.plugin(gateway.plugin, { gatewayPort: gateway.port, skills: false })
      const result = await context.tools.execute({
        signal: new AbortController().signal,
        callId: ToolCallId('integration-screenshot'),
        name: 'univer_screenshot',
        arguments: {
          file: gateway.file,
          unitId: slide,
          worktreeId,
          output: 'screenshots-tool',
          pages: [1]
        },
        // A minimal agent owner: the tool reads only the workspace and the model's modalities.
        agent: {
          ctx: context,
          options: { provider: 'integration', model: 'vision' },
          session: {
            header: { cwd: gateway.workspace },
            requestHeader() {
              return { config: { provider: 'integration', model: 'vision' } }
            }
          }
        } as never
      })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      const payload = JSON.parse(
        result.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('')
      )
      const [image] = payload.result.images
      const [ref] = refs
      expect(ref).toBeDefined()
      expect(image.image).toEqual(ref)
      // Outer screenshot facts stay the renderer's declaration.
      expect(image.mediaType).toBe('image/png')
      const blocks: any[] = result.content.filter((block: any) => block.type === 'image')
      expect(blocks).toHaveLength(payload.result.images.length)
      for (const block of blocks) expect(block.attachment).toEqual(ref)
    } finally {
      await context.fiber.dispose()
    }
  })

  it('prints a Slide Unit to a real PDF', async () => {
    const output = join(gateway.workspace, 'rendered.pdf')
    const printed = await gateway.service.printUnitPdf({
      ...gateway.scoped,
      worktreeId,
      unitId: slide,
      output,
      outputWorkspace: gateway.workspace
    })
    expect(printed.operation).toBe('print-pdf')
    expect(printed.result).toMatchObject({ unitId: slide, unitType: 'slide', pageCount: 1, output })
    const bytes = await readFile(output)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('rejects PDF printing for Base Units', async () => {
    await expect(
      gateway.service.printUnitPdf({
        ...gateway.scoped,
        worktreeId,
        unitId: base,
        output: join(gateway.workspace, 'base.pdf'),
        outputWorkspace: gateway.workspace
      })
    ).rejects.toMatchObject({ code: 'UNIT_PRINT_PDF_TYPE_UNSUPPORTED' })
  })
})
