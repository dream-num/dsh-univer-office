import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { sessionFileScope } from '../service/session-file-scope.ts'

/** All paths in one tool call share the policy in effect when the tool began. */
export function toolFileScope(ctx: Context, exec: ToolRunContext) {
  return sessionFileScope(exec.agent?.session, ctx.get('sandboxPolicy'))
}
