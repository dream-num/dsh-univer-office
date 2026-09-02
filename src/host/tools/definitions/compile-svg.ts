import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { unitId, worktreeId } from '../../service/identifiers.ts'
import { operationOutput, operationTitle } from '../presentation.ts'
import { existingToolFile, existingToolPath } from '../workspace.ts'

/** Create the `univer_compile_svg` tool definition. */
export function compileSvgTool(ctx: Context, timeoutMs: number) {
  return defineTool({
    name: 'univer_compile_svg',
    description:
      'Compile an SVG with real font metrics and apply it to one explicit Slide page in a draft worktree.',
    timeoutMs,
    parameters: {
      source: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute SVG source path.'
      },
      file: {
        type: 'string',
        required: true,
        description: 'Workspace-relative or absolute target .univer path.'
      },
      worktreeId: { type: 'string', required: true, description: 'Writable draft worktree id.' },
      unitId: {
        type: 'string',
        required: true,
        description: 'Explicit Slide Unit id from univer_status.'
      },
      page: { type: 'integer', required: true, description: '1-based Slide page number.' },
      mode: {
        type: 'string',
        enum: ['replace', 'add'],
        description: 'Replace the page contents by default, or add the SVG as an overlay.'
      }
    },
    output: operationOutput,
    async execute(args, exec) {
      const [target, source] = await Promise.all([
        existingToolFile(exec, args.file),
        existingToolPath(exec, args.source)
      ])
      return ctx.univer.compileSvg(
        {
          workspace: target.workspace,
          file: target.path,
          source: source.path,
          sourceWorkspace: source.workspace,
          worktreeId: worktreeId(args.worktreeId),
          unitId: unitId(args.unitId),
          page: args.page,
          ...(args.mode === undefined ? {} : { mode: args.mode })
        },
        exec.signal
      )
    },
    presentCall: (args) => ({
      card: 'generic',
      title: operationTitle('compile SVG', args.file),
      kind: 'execute'
    })
  })
}
