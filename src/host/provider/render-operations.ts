import { readFileSync, realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  compileSvgToFacade,
  isSvgFacadeError,
  wrapSlideScript,
  type SvgLineMeasureInput,
  type SvgLineMeasureRun,
  type SvgTextMeasurer
} from '@univer-cli/svg-facade'
import { createUnitLayoutLint, isUnitLayoutLintError } from '@univer-cli/unit-layout-lint'
import {
  createUnitScreenshot,
  isUnitScreenshotError,
  type ScreenshotImage,
  type UnitScreenshotInput
} from '@univer-cli/unit-screenshot'
import {
  createUniverRenderRuntime,
  isUniverRenderError,
  UNIVER_RENDER_BROWSER_ENV_VAR,
  type UniverRenderRuntime,
  type UniverRenderUnit,
  type UniverSlideLayoutRuntime,
  type UniverTextMeasureRuntime
} from '@univer-cli/univer-render-runtime'
import type { IDocumentData } from '@univerjs/core'
import { RENDER_MACHINE_ROOT } from '../artifacts/paths.ts'
import type {
  JsonValue,
  ScreenshotServiceImage,
  ScreenshotTarget,
  UniverUnitKind
} from '../service/types.ts'
import { UniverError } from '../service/errors.ts'
import { UNIVER_LICENSE } from '../../workers/unit-content/license.ts'

type MachineRuntime = UniverRenderRuntime & UniverSlideLayoutRuntime & UniverTextMeasureRuntime

interface RenderSource {
  readonly unitType: UniverUnitKind
  readonly unitData: { [key: string]: JsonValue }
}

/** SVG compilation result before the generated program is executed. */
export interface CompiledSvgProgram {
  readonly code: string
  readonly lints: readonly string[]
  readonly mode: 'replace' | 'add'
  readonly page: number
  readonly textMeasure: JsonValue
  readonly viewport: { readonly width: number; readonly height: number }
  readonly warnings: readonly string[]
}

/** Browser-backed layout and authoring operations owned by the Service Provider. */
export class RenderOperations {
  /** Analyze one Slide snapshot without producing image output. */
  async lint(
    source: RenderSource,
    pages: readonly (number | string)[] | undefined,
    signal?: AbortSignal
  ): Promise<JsonValue> {
    if (source.unitType !== 'slide') {
      throw new UniverError(
        `Unit is ${source.unitType}; layout lint requires a Slide Unit.`,
        'UNIT_LAYOUT_LINT_TYPE_UNSUPPORTED'
      )
    }
    const runtime = await this.openRuntime(signal)
    try {
      const report = await createUnitLayoutLint({ runtime }).lint({
        unitType: 'slide',
        unitData: source.unitData as never,
        ...(pages === undefined ? {} : { pages }),
        ...(signal === undefined ? {} : { signal })
      })
      return report as unknown as JsonValue
    } catch (error) {
      throw renderError(error)
    } finally {
      await runtime.close()
    }
  }

  /** Render one Unit snapshot to PNG files and return attachment-ready bytes. */
  async screenshot(input: {
    readonly source: UniverRenderUnit
    readonly output: string
    readonly maxPages: number
    readonly maxPixels: number
    readonly target?: ScreenshotTarget
    readonly signal?: AbortSignal
  }): Promise<{
    readonly unitId: string
    readonly unitType: UniverUnitKind
    readonly images: readonly ScreenshotServiceImage[]
  }> {
    const runtime = await this.openRuntime(input.signal)
    try {
      const screenshot = createUnitScreenshot({
        runtime,
        limits: { maxPages: input.maxPages, maxPixels: input.maxPixels }
      })
      const result = await screenshot.capture(
        captureInput(input.source, input.target, input.signal)
      )
      const images = await writeScreenshotImages(result.images, input.output, input.signal)
      return { unitId: result.unitId, unitType: result.unitType, images }
    } catch (error) {
      throw renderError(error)
    } finally {
      await runtime.close()
    }
  }

  /** Compile an authorized SVG into a program for one explicit Slide page. */
  async compileSvg(input: {
    readonly source: string
    readonly workspace: string
    readonly page: number
    readonly mode?: 'replace' | 'add'
    readonly signal?: AbortSignal
  }): Promise<CompiledSvgProgram> {
    const runtime = await this.openRuntime(input.signal)
    try {
      const svg = await readFile(input.source, 'utf8')
      const compiled = await compileSvgToFacade(svg, {
        assetResolver: assetResolver(input.workspace, input.source),
        textMeasurer: textMeasurer(runtime, input.signal)
      })
      const mode = input.mode ?? 'replace'
      return {
        code: wrapSlideScript(compiled.code, { page: input.page, mode, ...compiled.viewport }),
        lints: compiled.lints,
        mode,
        page: input.page,
        textMeasure: compiled.textMeasure as unknown as JsonValue,
        viewport: compiled.viewport,
        warnings: compiled.warnings
      }
    } catch (error) {
      throw renderError(error)
    } finally {
      await runtime.close()
    }
  }

  private async openRuntime(signal?: AbortSignal): Promise<MachineRuntime> {
    try {
      return await createUniverRenderRuntime({
        renderPageRoot: RENDER_MACHINE_ROOT,
        env: process.env,
        license: process.env.UNIVER_LICENSE?.trim() || UNIVER_LICENSE,
        ...(signal === undefined ? {} : { signal })
      })
    } catch (error) {
      throw renderError(error)
    }
  }
}

function captureInput(
  source: UniverRenderUnit,
  target: ScreenshotTarget | undefined,
  signal: AbortSignal | undefined
): UnitScreenshotInput {
  const common = signal === undefined ? source : { ...source, signal }
  if (target === undefined) return common
  if (source.unitType === 'sheet' && target.kind === 'sheet-range') {
    return { ...source, target, ...(signal === undefined ? {} : { signal }) }
  }
  if (target.kind === 'paged-unit') {
    if (source.unitType === 'doc') {
      if (target.contactSheet !== undefined || !isNumericPages(target.pages)) {
        throw new UniverError(
          'Doc screenshots accept numeric pages and no contact sheet.',
          'SCREENSHOT_TARGET_INVALID'
        )
      }
      return {
        ...source,
        target: {
          kind: 'doc-pages',
          ...(target.pages === undefined ? {} : { pages: target.pages }),
          ...(target.scale === undefined ? {} : { scale: target.scale })
        },
        ...(signal === undefined ? {} : { signal })
      }
    }
    if (source.unitType === 'slide') {
      return {
        ...source,
        target: {
          kind: 'slide-pages',
          ...(target.pages === undefined ? {} : { pages: target.pages }),
          ...(target.contactSheet === undefined ? {} : { contactSheet: target.contactSheet }),
          ...(target.scale === undefined ? {} : { scale: target.scale })
        },
        ...(signal === undefined ? {} : { signal })
      }
    }
  }
  if (source.unitType === 'board' && target.kind === 'board-content') {
    return { ...source, target, ...(signal === undefined ? {} : { signal }) }
  }
  if (target.kind === 'unit-viewport') {
    if (source.unitType === 'sheet') {
      return {
        ...source,
        target: { kind: 'sheet-viewport', scale: target.scale },
        ...(signal === undefined ? {} : { signal })
      }
    }
    if (source.unitType === 'doc') {
      return {
        ...source,
        target: { kind: 'doc-pages', scale: target.scale },
        ...(signal === undefined ? {} : { signal })
      }
    }
    if (source.unitType === 'slide') {
      return {
        ...source,
        target: { kind: 'slide-pages', scale: target.scale },
        ...(signal === undefined ? {} : { signal })
      }
    }
    if (source.unitType === 'base') {
      return {
        ...source,
        target: { kind: 'base-view', scale: target.scale },
        ...(signal === undefined ? {} : { signal })
      }
    }
    return {
      ...source,
      target: { kind: 'board-content', scale: target.scale },
      ...(signal === undefined ? {} : { signal })
    }
  }
  throw new UniverError(
    `${target.kind} screenshot target is invalid for ${source.unitType}.`,
    'SCREENSHOT_TARGET_INVALID'
  )
}

function isNumericPages(
  pages: readonly (number | string)[] | undefined
): pages is readonly number[] | undefined {
  return pages === undefined || pages.every((page) => typeof page === 'number')
}

async function writeScreenshotImages(
  images: readonly ScreenshotImage[],
  output: string,
  signal?: AbortSignal
): Promise<readonly ScreenshotServiceImage[]> {
  try {
    signal?.throwIfAborted()
    await mkdir(output, { recursive: true })
    return await Promise.all(
      images.map(async (image) => {
        signal?.throwIfAborted()
        if (basename(image.name) !== image.name) {
          throw new UniverError(
            `Unsafe screenshot image name: ${image.name}`,
            'SCREENSHOT_OUTPUT_INVALID'
          )
        }
        const path = resolve(output, image.name)
        await writeFile(path, image.bytes, signal === undefined ? undefined : { signal })
        signal?.throwIfAborted()
        return {
          data: Buffer.from(image.bytes).toString('base64'),
          height: image.height,
          mediaType: image.mediaType,
          name: image.name,
          path,
          width: image.width,
          metadata: screenshotMetadata(image)
        }
      })
    )
  } catch (error) {
    if (error instanceof UniverError) throw error
    throw new UniverError('Failed to write screenshot PNG files.', 'SCREENSHOT_WRITE_FAILED', {
      cause: error
    })
  }
}

function screenshotMetadata(image: ScreenshotImage): JsonValue {
  return {
    ...(image.boardSelector === undefined
      ? {}
      : { boardSelector: image.boardSelector as unknown as JsonValue }),
    ...(image.contentBounds === undefined
      ? {}
      : { contentBounds: image.contentBounds as unknown as JsonValue }),
    ...(image.layoutAnalysis === undefined
      ? {}
      : { layoutAnalysis: image.layoutAnalysis as unknown as JsonValue }),
    ...(image.padding === undefined ? {} : { padding: image.padding }),
    ...(image.page === undefined ? {} : { page: image.page }),
    ...(image.pageId === undefined ? {} : { pageId: image.pageId }),
    ...(image.range === undefined ? {} : { range: image.range }),
    ...(image.role === undefined ? {} : { role: image.role }),
    ...(image.scale === undefined ? {} : { scale: image.scale }),
    ...(image.sheetName === undefined ? {} : { sheetName: image.sheetName }),
    ...(image.tiles === undefined ? {} : { tiles: image.tiles })
  }
}

function assetResolver(
  workspace: string,
  source: string
): (href: string) => { readonly bytes: Uint8Array } {
  return (href) => {
    let path: string
    try {
      path = realpathSync(isAbsolute(href) ? href : resolve(dirname(source), href))
    } catch (error) {
      throw new UniverError(
        `Cannot read SVG asset ${JSON.stringify(href)}.`,
        'SVG_ASSET_READ_FAILED',
        { cause: error }
      )
    }
    const fromWorkspace = relative(workspace, path)
    if (
      fromWorkspace === '..' ||
      fromWorkspace.startsWith(`..${sep}`) ||
      isAbsolute(fromWorkspace)
    ) {
      throw new UniverError(
        `SVG asset ${JSON.stringify(href)} is outside the session workspace.`,
        'SESSION_SCOPE_DENIED'
      )
    }
    try {
      return { bytes: readFileSync(path) }
    } catch (error) {
      throw new UniverError(
        `Cannot read SVG asset ${JSON.stringify(href)}.`,
        'SVG_ASSET_READ_FAILED',
        { cause: error }
      )
    }
  }
}

function textMeasurer(runtime: UniverTextMeasureRuntime, signal?: AbortSignal): SvgTextMeasurer {
  return {
    source: 'browser-render-runtime',
    async measureLine(input) {
      const metrics = await runtime.measureText({
        doc: textMeasureDocument(input),
        ...(signal === undefined ? {} : { signal })
      })
      return {
        ascent: metrics.firstLineAscent,
        descent: metrics.firstLineDescent,
        width: metrics.actualWidth
      }
    }
  }
}

function textMeasureDocument(input: SvgLineMeasureInput): IDocumentData {
  const dataStream = input.runs.map((run) => run.text).join('')
  let offset = 0
  const textRuns = input.runs.map((run) => {
    const st = offset
    offset += run.text.length
    return { st, ed: offset, ts: runStyle(run) }
  })
  return {
    id: 'svg-facade-measure',
    body: {
      dataStream: `${dataStream}\r\n`,
      textRuns,
      paragraphs: [{ startIndex: dataStream.length, paragraphId: 'svg-facade-measure-p0' }]
    },
    documentStyle: {
      pageSize: { width: 1_000_000, height: 1_000_000 },
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0
    }
  }
}

function runStyle(run: SvgLineMeasureRun): Record<string, unknown> {
  return {
    fs: run.fontSizePx * 0.75,
    ...(run.bold ? { bl: 1 } : {}),
    ...(run.italic ? { it: 1 } : {}),
    ...(run.fontFamily === undefined ? {} : { ff: run.fontFamily })
  }
}

function renderError(error: unknown): Error {
  if (error instanceof UniverError) return error
  if (isUniverRenderError(error)) {
    const message =
      error.code === 'BROWSER_UNAVAILABLE'
        ? `${error.message}; install Chrome/Chromium or set ${UNIVER_RENDER_BROWSER_ENV_VAR}`
        : error.message
    return new UniverError(message, `UNIVER_RENDER_${error.code}`, { cause: error })
  }
  if (isUnitLayoutLintError(error)) {
    return new UniverError(error.message, `UNIT_LAYOUT_LINT_${error.code}`, { cause: error })
  }
  if (isUnitScreenshotError(error)) {
    return new UniverError(error.message, `SCREENSHOT_${error.code}`, { cause: error })
  }
  if (isSvgFacadeError(error)) {
    return new UniverError(error.message, `SVG_FACADE_${error.code}`, { cause: error })
  }
  return error instanceof Error ? error : new Error(String(error))
}
