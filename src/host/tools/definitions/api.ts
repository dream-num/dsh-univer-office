import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { UniverError } from '../../service/errors.ts'
import { apiOutput } from '../presentation.ts'

/** Create the `univer_api` tool definition. */
export function apiTool(ctx: Context) {
  return defineTool({
    name: 'univer_api',
    description:
      'Look up the bundled, version-matched Univer Facade API. Use find when no relevant class or API label is known. Use show for a known class, type, or exact Class.member API label; to inspect APIs on a known class, show the class itself. Find is case-insensitive. Each query runs independently and returns its own matches: queries are never combined as AND, and find does not interpret intent.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['find', 'show'],
        description:
          'find discovers unknown class or API labels; show documents a known class, type, or exact Class.member label. Show a known class to inspect its APIs.'
      },
      queries: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description:
          'For find, API-name keywords or identifier fragments such as conditionalFormat. For show, known class, type, or exact Class.member labels such as FRange or FRange.setValue. Find queries are case-insensitive and independent, not AND terms.'
      },
      unit: {
        type: 'string',
        enum: ['sheet', 'doc', 'slide', 'base', 'board'],
        description: 'Optional find-only Unit filter; shared APIs remain included.'
      },
      limit: {
        type: 'integer',
        description: 'Find-only maximum matches per query. Prefer 10 or fewer.'
      }
    },
    output: apiOutput,
    execute(args) {
      if (args.queries.length === 0 || args.queries.some((query) => query.trim().length === 0)) {
        throw new UniverError(
          'univer_api requires at least one non-empty query.',
          'INVALID_REQUEST'
        )
      }
      if (args.action === 'show')
        return ctx.univer.apiReference({ action: 'show', queries: args.queries })
      if (args.limit !== undefined && args.limit < 1) {
        throw new UniverError('univer_api limit must be a positive integer.', 'INVALID_REQUEST')
      }
      return ctx.univer.apiReference({
        action: 'find',
        queries: args.queries,
        ...(args.unit === undefined ? {} : { unit: args.unit }),
        ...(args.limit === undefined ? {} : { limit: args.limit })
      })
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Univer API ${args.action}: ${args.queries.join(', ')}`,
      kind: 'read'
    })
  })
}
