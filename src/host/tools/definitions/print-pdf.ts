import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { existingToolFile, newToolPath } from '../workspace.ts'

/** Create the `univer_print_pdf` tool definition. */
export function printPdfTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_print_pdf',
    description:
      'Print one explicit Sheet, Doc, Slide, or Board Unit from trunk or a worktree to a workspace PDF file. Base Units are not printable.',
    timeoutMs,
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .univer path.'
      },
      output: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute .pdf output file path.'
      },
      unitId: {
        type: 'string',
        required: true,
        description: 'Explicit Unit id from univer_status.'
      },
      worktreeId: {
        type: 'string',
        description: 'Optional worktree scope; omit to print trunk.'
      }
    },
    output: operationOutput,
    async execute(args, exec) {
      const [target, output] = await Promise.all([
        existingToolFile(exec, args.file),
        newToolPath(exec, args.output)
      ])
      return ctx.univer.printUnitPdf(
        {
          workspace: target.workspace,
          file: target.path,
          outputWorkspace: output.workspace,
          output: output.path,
          unitId: unitId(args.unitId),
          ...(args.worktreeId === undefined ? {} : { worktreeId: worktreeId(args.worktreeId) })
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('print PDF', args.file),
      kind: 'execute',
      locations: [{ path: args.output }]
    })
  })
}
