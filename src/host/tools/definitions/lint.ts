import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { UniverError } from '../../service/errors.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { existingToolFile } from '../workspace.ts'

/** Create the `univer_lint` tool definition. */
export function lintTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_lint',
    description:
      'Analyze Slide text layout for off-page content, escaped containers, and text overlap without producing screenshots.',
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
        description: 'Explicit Slide Unit id from univer_status.'
      },
      worktreeId: { type: 'string', description: 'Optional worktree scope; omit to lint trunk.' },
      pages: {
        type: 'array',
        items: { oneOf: [{ type: 'integer' }, { type: 'string' }] },
        description: 'Optional 1-based page numbers or page IDs. Omit to lint every page.'
      }
    },
    output: operationOutput,
    async execute(args, exec) {
      const target = await existingToolFile(exec, args.file)
      const pages = args.pages?.map((selector) => {
        if (typeof selector === 'number') return selector
        const value = selector.trim()
        if (value.length === 0)
          throw new UniverError('univer_lint page selectors must be non-empty.', 'INVALID_REQUEST')
        return /^\d+$/u.test(value) ? Number(value) : value
      })
      return ctx.univer.lintUnitLayout(
        {
          workspace: target.workspace,
          file: target.path,
          unitId: unitId(args.unitId),
          ...(args.worktreeId === undefined ? {} : { worktreeId: worktreeId(args.worktreeId) }),
          ...(pages === undefined ? {} : { pages })
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('lint', args.file),
      kind: 'read'
    })
  })
}
