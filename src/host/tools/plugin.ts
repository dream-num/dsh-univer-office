import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ResolvedConfig } from '../config.ts'
import type {} from '../service/univer-service.ts'
import { apiTool } from './definitions/api.ts'
import { compileSvgTool } from './definitions/compile-svg.ts'
import { executeTool } from './definitions/execute.ts'
import { exportTool } from './definitions/export.ts'
import { importTool } from './definitions/import.ts'
import { inspectTool } from './definitions/inspect.ts'
import { lintTool } from './definitions/lint.ts'
import { printPdfTool } from './definitions/print-pdf.ts'
import { newTool } from './definitions/new.ts'
import { resourcesTool } from './definitions/resources.ts'
import { screenshotTool } from './definitions/screenshot.ts'
import { statusTool } from './definitions/status.ts'
import { unitTool } from './definitions/unit.ts'
import { worktreeTool } from './definitions/worktree.ts'
import { withUniverErrorContent } from './presentation.ts'

export const inject = ['univer', 'tools']
export const name = 'univer-tools'

/**
 * Every model-facing tool this plugin registers. A step admits the whole set together once a
 * listed skill has loaded, so this list is the disclosure unit rather than a per-tool switch.
 */
const UNIVER_TOOL_NAMES: readonly string[] = [
  'univer_new',
  'univer_status',
  'univer_worktree',
  'univer_unit',
  'univer_import',
  'univer_inspect',
  'univer_execute',
  'univer_export',
  'univer_lint',
  'univer_compile_svg',
  'univer_screenshot',
  'univer_print_pdf',
  'univer_api',
  'univer_resources'
]

/**
 * Step-time disclosure condition shared by every `univer_*` tool. The tools stay registered but
 * undeclared until this session loads one of the configured skills or an earlier step already
 * declared them, so a deployment whose task never touches Univer pays no schema tokens for them.
 *
 * Successful `skill` results and committed user skill invocations mark the owning agent. The mark
 * takes effect on the next step because the current step's admission is already sealed.
 * Loads that predate this process (resume, fork) are recovered from the request header, which
 * carries the declarations for native executors. A PTC request header carries only `run_code`, so
 * a PTC agent that lost the in-memory mark loads a listed skill again.
 *
 * @param ctx - registration scope; the listeners belong to the current fiber.
 * @param config - validated activation skills and the bundled-skill switch.
 * @returns the `when` condition for every registered tool, or `undefined` when they stay
 *   unconditional: a disabled skill bundle can never load a listed skill, and an empty list
 *   means always disclose, so both keep the pre-#159 registrations.
 */
function activationGate(
  ctx: Context,
  config: ResolvedConfig
): ((context: { readonly agent: Agent }) => boolean) | undefined {
  const skills = new Set(config.activationSkills)
  // A disabled skill bundle can never load a listed skill, and an empty list means always on.
  if (!config.skills || skills.size === 0) return undefined
  const marked = new WeakSet<Agent>()
  ctx.on('tools/result', (exec, result) => {
    if (exec.agent === undefined || exec.name !== 'skill' || result.isError) return
    const args: unknown = exec.arguments
    if (typeof args !== 'object' || args === null || !('name' in args)) return
    const skill: unknown = args.name
    if (typeof skill === 'string' && skills.has(skill)) marked.add(exec.agent)
  })
  ctx.inject(['agents'], (agentCtx) => {
    agentCtx.on('session/event', (session, event) => {
      if (
        event.type !== 'user/message' ||
        event.data.source.kind !== 'skill-invocation' ||
        !skills.has(event.data.source.name)
      )
        return
      const agent = agentCtx.agents.get(session.id)
      // An event from a replaced Session must not activate its current Agent.
      if (agent?.session === session) marked.add(agent)
    })
    agentCtx.on('agent/disposed', ({ agent }) => {
      marked.delete(agent)
    })
  })
  return ({ agent }) =>
    marked.has(agent) ||
    agent.session
      .requestHeader?.()
      ?.tools?.some((tool) => UNIVER_TOOL_NAMES.includes(tool.name)) === true
}

/** Register model-facing domain tools over `ctx.univer`. */
export function apply(ctx: Context, config: ResolvedConfig): void {
  const when = activationGate(ctx, config)
  const registration: { when?: NonNullable<typeof when> } = when === undefined ? {} : { when }
  const gatewayReadTimeoutMs = config.gatewayStartupTimeoutMs + config.gatewayRequestTimeoutMs
  const gatewayWriteTimeoutMs = config.gatewayStartupTimeoutMs + config.gatewayMutationTimeoutMs
  const unitContentTimeoutMs = config.gatewayStartupTimeoutMs + config.unitContentOperationTimeoutMs
  const screenshotTimeoutMs = config.gatewayStartupTimeoutMs + config.screenshotOperationTimeoutMs
  const printPdfTimeoutMs = config.gatewayStartupTimeoutMs + config.printPdfOperationTimeoutMs
  ctx.tools.register(withUniverErrorContent(newTool(ctx, gatewayWriteTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(statusTool(ctx, gatewayReadTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(worktreeTool(ctx, gatewayWriteTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(unitTool(ctx, gatewayWriteTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(importTool(ctx, unitContentTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(inspectTool(ctx, unitContentTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(executeTool(ctx, unitContentTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(exportTool(ctx, unitContentTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(lintTool(ctx, unitContentTimeoutMs)), registration)
  ctx.tools.register(withUniverErrorContent(printPdfTool(ctx, printPdfTimeoutMs)), registration)
  ctx.tools.register(
    withUniverErrorContent(compileSvgTool(ctx, unitContentTimeoutMs)),
    registration
  )
  // A screenshot result must durably reference image bytes; advertise the tool only while
  // the deployment has an attachment store, and keep the execution-time re-check defensive.
  ctx.inject(['attachments'], (imageCtx) => {
    imageCtx.tools.register(
      withUniverErrorContent(screenshotTool(imageCtx, screenshotTimeoutMs)),
      registration
    )
  })
  ctx.tools.register(withUniverErrorContent(apiTool(ctx)), registration)
  ctx.tools.register(
    withUniverErrorContent(resourcesTool(ctx, config.resourceOperationTimeoutMs)),
    registration
  )
  ctx.on('tools/pre-execute', (exec, next) => {
    if (exec.name !== 'univer_worktree' || !isRecord(exec.arguments)) return next()
    const action = exec.arguments.action
    if (action !== 'merge' && action !== 'discard') return next()
    return Promise.resolve({
      kind: 'ask',
      reason:
        action === 'merge'
          ? 'Merging publishes the selected Univer worktree into trunk.'
          : 'Discarding permanently removes the selected Univer worktree changes.'
    })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
