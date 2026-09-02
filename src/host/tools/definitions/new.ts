import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { operationOutput, operationTitle } from '../presentation.ts'
import { newToolFile } from '../workspace.ts'

/** Create the `univer_new` tool definition. */
export function newTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_new',
    description:
      'Create a new empty .univer file in the current workspace. This never overwrites an existing file and does not create an implicit Unit.',
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
      const target = await newToolFile(exec, args.file)
      return ctx.univer.newFile({ workspace: target.workspace, file: target.path }, exec.signal)
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('new', args.file),
      kind: 'execute'
    })
  })
}
