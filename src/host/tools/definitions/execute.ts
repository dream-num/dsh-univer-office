import type { FileScope } from '../../service/session-file-scope.ts'
import type { ExecutionSource } from '../../service/types.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { UniverError } from '../../service/errors.ts'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { resolveWritableUniverPath, resolveReadableFile } from '../../service/workspace.ts'
import { toolFileScope } from '../workspace.ts'

/** Create the `univer_execute` tool definition. */
export function executeTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_execute',
    description:
      'Execute Univer Facade JavaScript and commit mutations to a draft agent worktree. Use code only for a small snippet and codeFile for multiline or reusable code. Provide exactly one source. Explicitly return readback values; bare expressions and console.log do not populate value. Read-only code creates no revision.',
    timeoutMs,
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      code: {
        type: 'string',
        description:
          'Inline Facade code; use codeFile for multiline code. Mutually exclusive with codeFile.'
      },
      codeFile: {
        type: 'string',
        description:
          'Workspace-relative or absolute multiline Facade JavaScript body file. Mutually exclusive with code.'
      },
      worktreeId: { type: 'string', required: true, description: 'Writable agent worktree id.' },
      unitId: { type: 'string', required: true, description: 'Target unit id.' }
    },
    output: operationOutput,
    async execute(args, exec) {
      const scope = toolFileScope(ctx, exec)
      const target = await resolveWritableUniverPath(scope, args.file)
      const source = await resolveExecutionCode(scope, args.code, args.codeFile)
      return ctx.univer.executeUnitContent(
        {
          workspace: target.workspace,
          file: target.path,
          ...source,
          worktreeId: worktreeId(args.worktreeId),
          unitId: unitId(args.unitId)
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('execute', args.file),
      kind: 'execute'
    })
  })
}

async function resolveExecutionCode(
  scope: FileScope,
  code: string | undefined,
  codeFile: string | undefined
): Promise<ExecutionSource> {
  if ((code === undefined) === (codeFile === undefined)) {
    throw new UniverError('Provide exactly one of code or codeFile.', 'INVALID_EXECUTION_SOURCE')
  }
  if (code !== undefined) return { code }
  if (codeFile === undefined) {
    throw new UniverError('codeFile is required when code is omitted.', 'INVALID_EXECUTION_SOURCE')
  }
  const source = await resolveReadableFile(scope, codeFile)
  return { codeFile: source.path }
}
