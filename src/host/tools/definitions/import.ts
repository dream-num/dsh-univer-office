import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { UniverError } from '../../service/errors.ts'
import { worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { stripGatewaySuccessEnvelope } from '../normalize.ts'
import { existingToolFile, existingToolPath } from '../workspace.ts'

/** Create the `univer_import` tool definition. */
export function importTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_import',
    description:
      'Import an xlsx, csv, tsv, docx, or pptx file as a new Unit inside an explicit draft worktree.',
    timeoutMs,
    parameters: {
      source: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute Office source path.'
      },
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute target .univer path.'
      },
      worktreeId: { type: 'string', required: true, description: 'Writable draft worktree id.' },
      name: { type: 'string', required: true, description: 'Name for the imported Unit.' }
    },
    output: operationOutput,
    async execute(args, exec) {
      if (args.name.trim().length === 0) {
        throw new UniverError('univer_import requires a non-empty Unit name.', 'INVALID_REQUEST')
      }
      const [target, source] = await Promise.all([
        existingToolFile(exec, args.file),
        existingToolPath(exec, args.source)
      ])
      return stripGatewaySuccessEnvelope(
        await ctx.univer.importUnitContent(
          {
            workspace: target.workspace,
            file: target.path,
            sourceWorkspace: source.workspace,
            source: source.path,
            worktreeId: worktreeId(args.worktreeId),
            name: args.name
          },
          exec.signal
        )
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('import', args.file),
      kind: 'execute'
    })
  })
}
