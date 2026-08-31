import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { UniverError } from '../../service/errors.ts'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { existingToolFile } from '../workspace.ts'

/** Create the `univer_inspect` tool definition. */
export function inspectTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_inspect',
    description: 'Inspect structured Univer content. Sheet accepts an optional range; Base and Board default to selector-free overviews; elementId reads one Board element by exact id.',
    timeoutMs,
    parameters: {
      file: { type: 'string', required: true, description: 'Workspace-relative or absolute .univer path.' },
      elementId: { type: 'string', description: 'Exact Board element id for type-specific detail.' },
      unitId: { type: 'string', required: true, description: 'Explicit target Unit id from univer_status.' },
      range: { type: 'string', description: 'Optional unit range such as Sheet1!A1:D20.' },
      worktreeId: { type: 'string', description: 'Optional worktree scope; omit to inspect trunk.' },
    },
    output: operationOutput,
    async execute(args, exec) {
      if (args.range !== undefined && args.elementId !== undefined) {
        throw new UniverError('Provide at most one of range or elementId.', 'INSPECTION_INPUT_INVALID')
      }
      const target = await existingToolFile(exec, args.file)
      return ctx.univer.inspectUnitContent({
        workspace: target.workspace,
        file: target.path,
        ...args.elementId === undefined ? {} : { elementId: args.elementId },
        unitId: unitId(args.unitId),
        ...args.range === undefined ? {} : { range: args.range },
        ...args.worktreeId === undefined ? {} : { worktreeId: worktreeId(args.worktreeId) },
      }, exec.signal)
    },
    presentCall: (args) => ({ card: 'generic', title: operationTitle('inspect', args.file), kind: 'read' }),
  })
}
