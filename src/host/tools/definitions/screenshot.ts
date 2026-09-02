import { Buffer } from 'node:buffer'
import type { Context } from '@deepseek-ai/cordis'
import { AttachmentError, AttachmentId, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue, ScreenshotTarget } from '../../service/types.ts'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { UniverError } from '../../service/errors.ts'
import { operationTitle } from '../presentation.ts'
import { existingToolFile, newToolPath } from '../workspace.ts'

type ScreenshotToolImage = {
  path: string
  name: string
  mediaType: 'image/png'
  width: number
  height: number
  metadata: JsonValue
  image: {
    attachmentId: string
    mediaType: 'image/png'
    bytes: number
    width: number
    height: number
    name?: string
  }
}

type ScreenshotToolValue = {
  ok: true
  operation: 'screenshot'
  file: string
  result: {
    unitId: string
    unitType: string
    images: ScreenshotToolImage[]
  }
}

/** Create the model-visible screenshot tool with durable DSH image attachments. */
export function screenshotTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_screenshot',
    description:
      'Render one explicit Sheet, Doc, Slide, Base, or Board Unit to PNG files and return the images for visual verification.',
    timeoutMs,
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      unitId: {
        type: 'string',
        required: true,
        description: 'Explicit Unit id from univer_status.'
      },
      worktreeId: {
        type: 'string',
        description: 'Optional worktree scope; omit to capture trunk.'
      },
      output: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute output directory for PNG files.'
      },
      sheetName: { type: 'string', description: 'Sheet name used with range.' },
      range: { type: 'string', description: 'Sheet A1 range such as B2:H40.' },
      pages: {
        type: 'array',
        items: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
        description: 'Doc numeric pages or Slide page numbers/IDs. Omit to capture every page.'
      },
      contactSheet: { type: 'boolean', description: 'Also create one Slide contact sheet.' },
      tileColumns: {
        type: 'integer',
        description: 'Contact-sheet grid columns; requires contactSheet and tileRows.'
      },
      tileRows: {
        type: 'integer',
        description: 'Contact-sheet grid rows; requires contactSheet and tileColumns.'
      },
      region: {
        type: 'object',
        additionalProperties: false,
        properties: {
          left: { type: 'number', required: true },
          top: { type: 'number', required: true },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true }
        },
        description: 'Optional Board region to capture.'
      },
      elementIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional Board element IDs to capture.'
      },
      padding: {
        type: 'number',
        description: 'Board content padding; requires region or elementIds.'
      },
      scale: { type: 'number', description: 'Render scale from 0.1 to 4 for any Unit.' }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, const: true },
          operation: { type: 'string', required: true, const: 'screenshot' },
          file: { type: 'string', required: true },
          result: { type: 'json', required: true }
        }
      },
      render: (_args, value: ScreenshotToolValue): ContentBlock[] => [
        { type: 'text', text: JSON.stringify(value) },
        ...value.result.images.map((item) => ({
          type: 'image' as const,
          attachment: imageRef(item.image)
        }))
      ]
    },
    async execute(args, exec): Promise<ScreenshotToolValue> {
      const attachments = ctx.get('attachments')
      if (attachments === undefined) {
        throw new UniverError(
          'Screenshot requires the DSH attachment service.',
          'SCREENSHOT_ATTACHMENTS_UNAVAILABLE'
        )
      }
      if (!attachments.imageLimits.mediaTypes.includes('image/png')) {
        throw new UniverError(
          'This deployment does not accept PNG attachments.',
          'SCREENSHOT_MEDIA_TYPE_UNAVAILABLE'
        )
      }
      await assertImageCapableRoute(ctx, exec, args.file)
      const [target, output] = await Promise.all([
        existingToolFile(exec, args.file),
        newToolPath(exec, args.output)
      ])
      const captured = await ctx.univer.screenshotUnit(
        {
          workspace: target.workspace,
          file: target.path,
          unitId: unitId(args.unitId),
          outputWorkspace: output.workspace,
          output: output.path,
          ...(args.worktreeId === undefined ? {} : { worktreeId: worktreeId(args.worktreeId) }),
          ...screenshotTarget(args)
        },
        exec.signal
      )
      const decoded = captured.result.images.map((item) => ({
        item,
        bytes: Buffer.from(item.data, 'base64')
      }))
      const totalBytes = decoded.reduce((sum, item) => sum + item.bytes.byteLength, 0)
      const byteLimit = attachments.imageLimits.maxMessageImageBytes
      if (totalBytes > byteLimit) {
        throw new UniverError(
          `Screenshot images total ${String(totalBytes)} bytes, over the attachment limit ${String(byteLimit)}. Capture fewer pages or a smaller range.`,
          'SCREENSHOT_ATTACHMENT_LIMIT_EXCEEDED'
        )
      }
      for (const item of decoded) {
        if (item.bytes.byteLength > attachments.imageLimits.maxImageBytes) {
          throw new UniverError(
            `Screenshot ${item.item.name} is over the per-image attachment limit. Capture a smaller target.`,
            'SCREENSHOT_ATTACHMENT_LIMIT_EXCEEDED'
          )
        }
      }
      exec.signal.throwIfAborted()
      let refs: readonly ImageAttachmentRef[]
      try {
        refs = await attachments.saveImages(
          decoded.map(({ item, bytes }) => ({
            data: bytes,
            mediaType: item.mediaType,
            name: item.name
          }))
        )
      } catch (error) {
        if (!(error instanceof AttachmentError)) throw error
        throw new UniverError(error.message, `SCREENSHOT_ATTACHMENT_${error.code}`, {
          cause: error
        })
      }
      exec.signal.throwIfAborted()
      const images = decoded.map(({ item }, index): ScreenshotToolImage => {
        const ref = refs[index]
        if (ref === undefined) {
          throw new UniverError(
            'Attachment service returned an incomplete image batch.',
            'SCREENSHOT_ATTACHMENT_RESULT_INVALID'
          )
        }
        return {
          path: item.path,
          name: item.name,
          mediaType: item.mediaType,
          width: item.width,
          height: item.height,
          metadata: item.metadata,
          image: {
            attachmentId: ref.attachmentId,
            mediaType: item.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            ...(ref.name === undefined ? {} : { name: ref.name })
          }
        }
      })
      return {
        ok: true,
        operation: 'screenshot',
        file: captured.file,
        result: {
          unitId: captured.result.unitId,
          unitType: captured.result.unitType,
          images
        }
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('screenshot', args.file),
      kind: 'read',
      locations: [{ path: args.output }]
    })
  })
}

function screenshotTarget(args: {
  readonly sheetName?: string
  readonly range?: string
  readonly pages?: readonly (number | string)[]
  readonly contactSheet?: boolean
  readonly tileColumns?: number
  readonly tileRows?: number
  readonly region?: {
    readonly left: number
    readonly top: number
    readonly width: number
    readonly height: number
  }
  readonly elementIds?: readonly string[]
  readonly padding?: number
  readonly scale?: number
}): { readonly target?: ScreenshotTarget } {
  const usesSheet = args.sheetName !== undefined || args.range !== undefined
  const usesSlide =
    args.pages !== undefined ||
    args.contactSheet === true ||
    args.tileColumns !== undefined ||
    args.tileRows !== undefined
  const usesBoard =
    args.region !== undefined || args.elementIds !== undefined || args.padding !== undefined
  if ([usesSheet, usesSlide, usesBoard].filter(Boolean).length > 1) {
    throw new UniverError(
      'Sheet, paged-Unit, and Board screenshot selectors cannot be combined.',
      'SCREENSHOT_INPUT_INVALID'
    )
  }
  if (args.scale !== undefined && (args.scale < 0.1 || args.scale > 4)) {
    throw new UniverError('Screenshot scale must be between 0.1 and 4.', 'SCREENSHOT_INPUT_INVALID')
  }
  if (usesSheet) {
    if (args.range === undefined || args.range.trim().length === 0) {
      throw new UniverError('sheetName requires a non-empty range.', 'SCREENSHOT_INPUT_INVALID')
    }
    return {
      target: {
        kind: 'sheet-range',
        range: args.range,
        ...(args.sheetName === undefined ? {} : { sheetName: args.sheetName }),
        ...(args.scale === undefined ? {} : { scale: args.scale })
      }
    }
  }
  if (usesSlide) {
    const hasColumns = args.tileColumns !== undefined
    const hasRows = args.tileRows !== undefined
    if (hasColumns !== hasRows || (hasColumns && args.contactSheet !== true)) {
      throw new UniverError(
        'tileColumns and tileRows must be provided together with contactSheet.',
        'SCREENSHOT_INPUT_INVALID'
      )
    }
    const tile =
      args.tileColumns === undefined || args.tileRows === undefined
        ? undefined
        : { columns: args.tileColumns, rows: args.tileRows }
    return {
      target: {
        kind: 'paged-unit',
        ...(args.pages === undefined ? {} : { pages: args.pages }),
        ...(args.contactSheet === true ? { contactSheet: tile === undefined ? {} : { tile } } : {}),
        ...(args.scale === undefined ? {} : { scale: args.scale })
      }
    }
  }
  if (usesBoard) {
    return {
      target: {
        kind: 'board-content',
        ...(args.region === undefined ? {} : { region: args.region }),
        ...(args.elementIds === undefined ? {} : { elementIds: args.elementIds }),
        ...(args.padding === undefined ? {} : { padding: args.padding }),
        ...(args.scale === undefined ? {} : { scale: args.scale })
      }
    }
  }
  if (args.scale !== undefined) return { target: { kind: 'unit-viewport', scale: args.scale } }
  return {}
}

async function assertImageCapableRoute(
  ctx: Context,
  exec: {
    readonly agent?: {
      readonly session: {
        requestHeader():
          | { readonly config?: { readonly provider?: string; readonly model?: string } }
          | undefined
      }
      readonly options: { readonly provider?: string; readonly model?: string }
    }
    readonly signal: AbortSignal
  },
  file: string
): Promise<void> {
  const routed = exec.agent?.session.requestHeader()?.config
  const provider = routed?.provider ?? exec.agent?.options.provider
  const model = routed?.model ?? exec.agent?.options.model
  const llm = ctx.get('llm')
  if (provider === undefined || model === undefined || llm === undefined) {
    throw new UniverError(
      `Cannot screenshot ${file}: the current model route could not be resolved.`,
      'SCREENSHOT_MODEL_ROUTE_UNAVAILABLE'
    )
  }
  const active = await llm.resolveModelInfo(provider, model, exec.signal)
  if (active.inputModalities === undefined || !active.inputModalities.includes('image')) {
    throw new UniverError(
      `Cannot screenshot ${file}: model ${model} does not declare image input.`,
      'SCREENSHOT_MODEL_NOT_IMAGE_CAPABLE'
    )
  }
}

function imageRef(image: ScreenshotToolImage['image']): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...(image.name === undefined ? {} : { name: image.name })
  }
}
