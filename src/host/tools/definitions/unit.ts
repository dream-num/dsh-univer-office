import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { UniverError } from '../../service/errors.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { stripGatewaySuccessEnvelope } from '../normalize.ts'
import { existingToolFile } from '../workspace.ts'

/** Create the `univer_unit` tool definition. */
export function unitTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_unit',
    description:
      'Create or remove a top-level Sheet, Doc, Slide, Base, or Board Unit inside an explicit draft worktree. Use univer_status to list Units.',
    timeoutMs,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'remove'],
        description: 'Unit lifecycle action.'
      },
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      worktreeId: { type: 'string', required: true, description: 'Writable draft worktree id.' },
      kind: {
        type: 'string',
        enum: ['sheet', 'doc', 'slide', 'base', 'board'],
        description: 'Required for create.'
      },
      name: { type: 'string', description: 'Required non-empty Unit name for create.' },
      unitId: { type: 'string', description: 'Required for remove.' }
    },
    output: operationOutput,
    async execute(args, exec) {
      const target = await existingToolFile(exec, args.file)
      if (args.action === 'create') {
        if (args.kind === undefined || args.name === undefined || args.name.length === 0) {
          throw new UniverError(
            'univer_unit create requires kind and a non-empty name.',
            'INVALID_REQUEST'
          )
        }
        return stripGatewaySuccessEnvelope(
          await ctx.univer.unit(
            {
              action: 'create',
              workspace: target.workspace,
              file: target.path,
              worktreeId: worktreeId(args.worktreeId),
              kind: args.kind,
              name: args.name
            },
            exec.signal
          )
        )
      }
      if (args.unitId === undefined || args.unitId.length === 0) {
        throw new UniverError('univer_unit remove requires unitId.', 'INVALID_REQUEST')
      }
      return stripGatewaySuccessEnvelope(
        await ctx.univer.unit(
          {
            action: 'remove',
            workspace: target.workspace,
            file: target.path,
            worktreeId: worktreeId(args.worktreeId),
            unitId: unitId(args.unitId)
          },
          exec.signal
        )
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle(`unit ${args.action}`, args.file),
      kind: 'execute'
    })
  })
}
