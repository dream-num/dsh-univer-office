import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { worktreeId } from '../../service/identifiers.ts'
import { UniverError } from '../../service/errors.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { stripGatewaySuccessEnvelope } from '../normalize.ts'
import { existingToolFile } from '../workspace.ts'

/** Create the agent-safe `univer_worktree` tool definition. */
export function worktreeTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_worktree',
    description:
      'Create or transition an isolated Univer worktree. Actions: create, ready, reopen, merge, or discard. Merge and discard require user approval.',
    timeoutMs,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'ready', 'reopen', 'merge', 'discard'],
        description: 'Lifecycle action.'
      },
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      worktreeId: { type: 'string', description: 'Required for every action except create.' },
      name: { type: 'string', description: 'Optional human-readable name for create.' }
    },
    output: operationOutput,
    async execute(args, exec) {
      const target = await existingToolFile(exec, args.file)
      if (args.action === 'create') {
        return stripGatewaySuccessEnvelope(
          await ctx.univer.worktree(
            {
              action: 'create',
              workspace: target.workspace,
              file: target.path,
              ...(args.name === undefined ? {} : { name: args.name })
            },
            exec.signal
          )
        )
      }
      if (args.worktreeId === undefined || args.worktreeId.length === 0) {
        throw new UniverError(
          `univer_worktree ${args.action} requires worktreeId.`,
          'INVALID_REQUEST'
        )
      }
      return stripGatewaySuccessEnvelope(
        await ctx.univer.worktree(
          {
            action: args.action,
            workspace: target.workspace,
            file: target.path,
            worktreeId: worktreeId(args.worktreeId)
          },
          exec.signal
        )
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle(`worktree ${args.action}`, args.file),
      kind: 'execute'
    })
  })
}
