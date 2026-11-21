import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { operationOutput, operationTitle } from '../presentation.ts'
import { resolveNewUniverPath } from '../../service/workspace.ts'
import { toolFileScope } from '../workspace.ts'

/** Create the `univer_new` tool definition. */
export function newTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_new',
    description:
      'Create a new empty .univer file at a session-writable path. This never overwrites an existing file and does not create an implicit Unit.',
    timeoutMs,
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute output path ending in .univer.'
      }
    },
    output: operationOutput,
    async execute(args, exec) {
      const scope = toolFileScope(ctx, exec)
      const target = await resolveNewUniverPath(scope, args.file)
      return ctx.univer.newFile({ workspace: target.workspace, file: target.path }, exec.signal)
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('new', args.file),
      kind: 'execute'
    })
  })
}
