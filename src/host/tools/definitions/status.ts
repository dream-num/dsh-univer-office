import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { existingToolFile } from '../workspace.ts'

/** Create the `univer_status` tool definition. */
export function statusTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_status',
    description:
      'List trunk Units and worktrees for a .univer file, or inspect one worktree scope. Call this before choosing unitId or continuing prior work.',
    timeoutMs,
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      worktreeId: {
        type: 'string',
        description: 'Optional worktree whose Units should be returned.'
      },
      unitId: { type: 'string', description: 'Optional Unit filter.' }
    },
    output: operationOutput,
    async execute(args, exec) {
      const target = await existingToolFile(exec, args.file)
      return ctx.univer.status(
        {
          workspace: target.workspace,
          file: target.path,
          ...(args.worktreeId === undefined ? {} : { worktreeId: worktreeId(args.worktreeId) }),
          ...(args.unitId === undefined ? {} : { unitId: unitId(args.unitId) })
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('status', args.file),
      kind: 'read'
    })
  })
}
