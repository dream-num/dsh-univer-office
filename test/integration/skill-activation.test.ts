import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import {
  mountAgentLoopTestDependencies,
  mountAgentLoopTestHarness
} from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SkillRegistry } from '@deepseek-ai/dsh-skill'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import { expect, it, onTestFinished } from 'vitest'
import { importHostBundle } from '../support/paths.ts'

const TOOL_NAMES = [
  'univer_api',
  'univer_compile_svg',
  'univer_execute',
  'univer_export',
  'univer_import',
  'univer_inspect',
  'univer_lint',
  'univer_new',
  'univer_print_pdf',
  'univer_resources',
  'univer_screenshot',
  'univer_status',
  'univer_unit',
  'univer_worktree'
]

// Skill loading, admission and session events run through the production AgentLoop.
class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Done' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function harness(univerFirst = false, activationSkills?: string[]) {
  const ctx = new Context()
  const cwd = await mkdtemp(join(tmpdir(), 'univer-skill-activation-'))
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(cwd, { recursive: true, force: true })
  })
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  const loop = await mountAgentLoopTestHarness(ctx)
  await ctx.plugin(SkillRegistry)
  ctx.skills.register({
    name: 'other',
    source: 'runtime',
    description: 'Other',
    content: 'Other instructions'
  })
  // The attachment boundary only makes screenshot registration available; no images are rendered.
  ctx.provide('attachments', {
    imageLimits: {
      mediaTypes: ['image/png'],
      maxImageBytes: 10_000_000,
      maxMessageImageBytes: 20_000_000
    }
  })
  const plugin = await importHostBundle()
  if (!univerFirst) await ctx.plugin(ToolSkill)
  const fiber = await ctx.plugin(plugin, {
    telemetry: false,
    ...(activationSkills === undefined ? {} : { activationSkills })
  })
  if (univerFirst) await ctx.plugin(ToolSkill)
  const adapter = new RecordingAdapter()
  ctx.llm.registerAdapter(['fixture'], adapter)
  const createAgent = () =>
    loop.create(SessionId(randomUUID()), { provider: 'fixture', model: 'fixture' }, { cwd })
  const agent = await createAgent()
  return { ctx, agent, adapter, fiber, plugin, createAgent }
}

async function turn(agent: Agent, text = 'Continue'): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

function toolNames(request: GenerateOptions | undefined): string[] {
  return (
    request?.tools
      ?.map((tool) => tool.name)
      .filter((name) => name.startsWith('univer_'))
      .toSorted() ?? []
  )
}

async function admitted(ctx: Context, agent: Agent): Promise<string[]> {
  const toolSet = await ctx.tools.resolve({
    agent,
    modelSelection: { provider: 'fixture', model: 'fixture' },
    signal: new AbortController().signal
  })
  try {
    return ctx.tools
      .schemas(agent, toolSet)
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('univer_'))
      .toSorted()
  } finally {
    toolSet.dispose()
  }
}

it.each(['univer', 'univer-sheet', 'office-xlsx'])(
  'declares all tools on the next request after /%s without a model skill call (#159)',
  async (name) => {
    const { agent, adapter } = await harness()
    await turn(agent, `/${name}`)
    expect(
      agent.session
        .snapshotEvents()
        .some(
          (event) =>
            event.type === 'user/message' &&
            event.data.source.kind === 'skill-invocation' &&
            event.data.source.name === name
        )
    ).toBe(true)
    expect(toolNames(adapter.requests[0])).toEqual([])
    await turn(agent)
    expect(adapter.requests).toHaveLength(2)
    expect(toolNames(adapter.requests[1])).toEqual(TOOL_NAMES)
    expect(agent.session.snapshotEvents().some((event) => event.type === 'tool/call')).toBe(false)
  }
)

it('handles a skill provider mounted after Univer and isolates other agents (#159)', async () => {
  const { ctx, agent, createAgent, adapter } = await harness(true)
  const other = await createAgent()
  await turn(agent, '/univer')
  expect(await admitted(ctx, other)).toEqual([])
  await turn(agent)
  expect(toolNames(adapter.requests[1])).toEqual(TOOL_NAMES)
})

it.each(['/other', '/missing-skill', 'Please discuss Univer'])(
  'keeps tools hidden for %s (#159)',
  async (text) => {
    const { agent, adapter } = await harness()
    await turn(agent, text)
    await turn(agent)
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests.map(toolNames)).toEqual([[], []])
  }
)

it('ignores skill events from a different Session with the same ID (#159)', async () => {
  const { ctx, agent } = await harness()
  const stale = Session.create(agent.session.id)
  const event = stale.append(
    'user/message',
    createUserMessage({
      content: [{ type: 'text', text: 'Univer instructions' }],
      source: { kind: 'skill-invocation', name: 'univer', form: 'instructions' }
    }),
    { surfaceOp: 'append' }
  )
  ctx.emit('session/event', stale, event)
  expect(await admitted(ctx, agent)).toEqual([])
  agent.session.append('user/message', event.data, { surfaceOp: 'append' })
  expect(await admitted(ctx, agent)).toEqual(TOOL_NAMES)
})

it('only activates on configured user-invoked skills (#159)', async () => {
  const { ctx, agent } = await harness(false, ['univer-sheet'])
  await turn(agent, '/univer')
  expect(await admitted(ctx, agent)).toEqual([])
  await turn(agent, '/univer-sheet')
  expect(await admitted(ctx, agent)).toEqual(TOOL_NAMES)
})

it('removes tools and activation listeners on unload and can activate again after reload (#159)', async () => {
  const { ctx, agent, fiber, plugin } = await harness()
  await turn(agent, '/univer')
  expect(await admitted(ctx, agent)).toEqual(TOOL_NAMES)
  await fiber.dispose()
  expect(await admitted(ctx, agent)).toEqual([])
  await turn(agent, '/univer')
  await ctx.plugin(plugin, { telemetry: false })
  expect(await admitted(ctx, agent)).toEqual([])
  await turn(agent, '/univer')
  expect(await admitted(ctx, agent)).toEqual(TOOL_NAMES)
})
