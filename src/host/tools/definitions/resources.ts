import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { UniverError } from '../../service/errors.ts'
import type { UniverResourceResult } from '../../service/types.ts'
import { newToolPath } from '../workspace.ts'

const resourceOutput = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' as const, required: true, const: true },
      operation: { type: 'string' as const, required: true, const: 'resources' },
      result: { type: 'json' as const, required: true }
    }
  },
  render: (_args: unknown, value: UniverResourceResult): ContentBlock[] => [
    { type: 'text', text: JSON.stringify(value) }
  ]
} as const

/** Create the bundled SVG resource-library tool. */
export function resourcesTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_resources',
    description:
      'Discover, read, export, and cache bundled SVG resources. Use find before read or export; resource handles are stable within the bundled manifest.',
    timeoutMs,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['registries', 'find', 'read', 'export', 'clear-cache'],
        description: 'Resource-library operation.'
      },
      queries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Non-empty search terms for find.'
      },
      registries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional registry IDs that constrain find.'
      },
      limit: { type: 'integer', description: 'Optional positive total result limit for find.' },
      handle: { type: 'string', description: 'One resource handle for read.' },
      handles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Resource handles for export.'
      },
      output: { type: 'string', description: 'Workspace-relative or absolute export directory.' }
    },
    output: resourceOutput,
    async execute(args, exec) {
      if (args.action === 'registries' || args.action === 'clear-cache') {
        return ctx.univer.resources({ action: args.action }, exec.signal)
      }
      if (args.action === 'find') {
        const queries = nonEmptyList(args.queries, 'queries', 'find')
        if (args.registries?.some((registry) => registry.trim().length === 0)) {
          throw invalid('find registries must be non-empty strings.')
        }
        if (args.limit !== undefined && args.limit < 1) {
          throw invalid('find limit must be a positive integer.')
        }
        return ctx.univer.resources(
          {
            action: 'find',
            queries,
            ...(args.registries === undefined ? {} : { registries: args.registries }),
            ...(args.limit === undefined ? {} : { limit: args.limit })
          },
          exec.signal
        )
      }
      if (args.action === 'read') {
        const handle = nonEmpty(args.handle, 'read requires one non-empty handle.')
        return ctx.univer.resources({ action: 'read', handle }, exec.signal)
      }
      const handles = nonEmptyList(args.handles, 'handles', 'export')
      const outputArg = nonEmpty(args.output, 'export requires a non-empty output directory.')
      const output = await newToolPath(exec, outputArg)
      return ctx.univer.resources(
        {
          action: 'export',
          handles,
          output: output.path,
          outputWorkspace: output.workspace
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Univer resources: ${args.action}`,
      kind: args.action === 'export' || args.action === 'clear-cache' ? 'execute' : 'read',
      ...(args.output === undefined ? {} : { locations: [{ path: args.output }] })
    })
  })
}

function nonEmpty(value: string | undefined, message: string): string {
  if (value === undefined || value.trim().length === 0) throw invalid(message)
  return value
}

function nonEmptyList(
  value: readonly string[] | undefined,
  name: string,
  action: string
): readonly string[] {
  if (value === undefined || value.length === 0 || value.some((item) => item.trim().length === 0)) {
    throw invalid(`${action} requires at least one non-empty ${name} value.`)
  }
  return value
}

function invalid(message: string): UniverError {
  return new UniverError(message, 'RESOURCE_INPUT_INVALID')
}
