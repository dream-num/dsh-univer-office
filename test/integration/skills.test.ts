import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { prepareContentExecutionProgram } from '@univer-cli/content-execution'
import { beforeAll, describe, expect, it } from 'vitest'
import { importHostBundle, repoPath } from '../support/paths.ts'

const BUNDLED = [
  'office',
  'office-docx',
  'office-pptx',
  'office-xlsx',
  'univer',
  'univer-base',
  'univer-board',
  'univer-cross-unit-formula',
  'univer-doc',
  'univer-embed',
  'univer-sheet',
  'univer-slide'
]

describe('bundled skills', () => {
  let skills: any
  const skill = async (name: string): Promise<any> => {
    const loaded = await skills.get(name)
    expect(loaded, name).toBeDefined()
    return loaded
  }

  beforeAll(async () => {
    const plugin = await importHostBundle()
    const ctx = new Context()
    new SkillRegistry(ctx)
    plugin.apply(ctx, { tools: false, skills: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    skills = ctx.skills
  })

  it('lists the twelve lazy bundled skills with frontmatter descriptions', async () => {
    const listed = await skills.list()
    expect(listed.map((entry: any) => entry.name)).toEqual(BUNDLED)
    for (const entry of listed) {
      const source = await readFile(repoPath('skills', entry.name, 'SKILL.md'), 'utf8')
      expect(entry.description, entry.name).toBe(source.match(/^description: (.+)$/m)?.[1])
    }
  })

  it('loads the core skill body without frontmatter, with failure recovery guidance', async () => {
    const core = await skill('univer')
    expect(core.content.startsWith('---')).toBe(false)
    for (const text of [
      'univer_status',
      'univer_screenshot',
      'univer_print_pdf',
      'univer_resources',
      'await import("node:fs/promises")',
      'codeFile',
      '- Base: `base`',
      'Do not wait for the user to name a tool',
      'A class is known: use `show` on the class to inspect its APIs',
      'Each query is searched independently',
      'Error [CODE]: message'
    ]) {
      expect(core.content).toContain(text)
    }
  })

  it('carries proactive generation guidance in the Slide skill', async () => {
    const slide = await skill('univer-slide')
    expect(slide.description).toContain('Use proactively')
    for (const text of [
      'univer_compile_svg',
      'univer_lint',
      'univer_screenshot',
      'univer_resources',
      'A new Slide Unit already contains one empty page'
    ]) {
      expect(slide.content).toContain(text)
    }
  })

  it('documents the current injected handle and authoring contracts in the Base skill', async () => {
    const base = await skill('univer-base')
    for (const text of [
      'FBaseTableField',
      'FBaseTableRecord',
      'FBaseTableView',
      'there is no `addFields` method',
      'selected `FBase` as `base`',
      'bindings are reserved and must not be redeclared',
      'A new Base already contains `Table 1`',
      'explicitly `return` record values'
    ]) {
      expect(base.content).toContain(text)
    }
    expect(base.content).not.toContain('const base =')
    // Every Base example must compile as a Unit content program.
    for (const code of base.content.matchAll(/```js\n([\s\S]*?)```/g)) {
      expect(() =>
        prepareContentExecutionProgram({ code: code[1], unitId: 'base-example', unitType: 'base' })
      ).not.toThrow()
    }
  })

  it('links every Board reference file from the Board skill', async () => {
    const board = await skill('univer-board')
    expect(board.resourceBase?.kind).toBe('directory')
    const linked = await readLinkedReferences(board.resourceBase.path, board.content)
    const files = (await readdir(join(board.resourceBase.path, 'references'))).map(
      (name) => `references/${name}`
    )
    expect([...linked.keys()].toSorted()).toEqual(files.toSorted())
    expect(linked.size).toBe(10)
  })

  it.each(['univer-base', 'univer-board', 'univer-doc', 'univer-sheet', 'univer-slide'])(
    'carries current screenshot verification guidance in %s',
    async (name) => {
      const unit = await skill(name)
      expect(unit.content).toContain('univer_screenshot')
      expect(unit.content).not.toContain('Screenshot evidence is unavailable')
      expect(unit.content).not.toContain(
        'Screenshot generation and pixel comparison are unavailable'
      )
    }
  )

  it.each([
    {
      name: 'univer-board',
      owner: 'FBoard.newChart',
      insert: 'await board.insertChart(info)',
      read: 'board.getCharts()',
      stale: ['board.charts', 'FBoardCharts', 'setData(values).commit()']
    },
    {
      name: 'univer-doc',
      owner: 'FDocument.newChart',
      insert: 'await doc.insertChart(info)',
      read: 'doc.getCharts()',
      stale: [
        'doc.charts',
        'FDocumentCharts',
        'univerAPI.Enum.DocChartInsertAnchorKind',
        'setData(values).commit()'
      ]
    },
    {
      name: 'univer-slide',
      owner: 'FSlide',
      insert: 'await slide.insertChart(info)',
      read: 'slide.getCharts()',
      stale: ['slide.charts', 'FSlideCharts', 'setData(values).commit()']
    }
  ])('uses the current Chart Facade contract in $name', async (contract) => {
    const unit = await skill(contract.name)
    for (const api of contract.stale) expect(unit.content).not.toContain(api)
    // The Board skill keeps its chart guide in linked reference files.
    const content =
      contract.name === 'univer-board'
        ? [
            unit.content,
            ...(await readLinkedReferences(unit.resourceBase.path, unit.content)).values()
          ].join('\n')
        : unit.content
    for (const text of [
      contract.owner,
      contract.insert,
      contract.read,
      'chart.setDataSource(values)',
      'await chart.remove()'
    ]) {
      expect(content).toContain(text)
    }
  })

  it.each(['univer-embed', 'univer-cross-unit-formula'])('loads topic skill %s', async (name) => {
    expect((await skill(name)).content).toContain('univer_execute')
  })

  it.each([
    { name: 'office-docx', unit: 'univer-doc', writer: 'python-docx' },
    { name: 'office-xlsx', unit: 'univer-sheet', writer: 'openpyxl' },
    { name: 'office-pptx', unit: 'univer-slide', writer: 'python-pptx' }
  ])('routes $name to Univer instead of $writer', async ({ name, unit, writer }) => {
    const route = await skill(name)
    for (const text of ['`univer`', `\`${unit}\``, 'univer_import', 'univer_export']) {
      expect(route.content).toContain(text)
    }
    expect(route.content).toContain(`Do not use ${writer}`)
  })
})

describe('Office skill routing over DSH bundled Office skills', () => {
  const DSH_OFFICE = [
    'office',
    'office-docx',
    'office-export-pdf',
    'office-pptx',
    'office-recalculate',
    'office-render',
    'office-xlsx'
  ]
  const dshOffice = {
    name: 'dsh-office',
    list: () =>
      Promise.resolve(
        DSH_OFFICE.map((name) => ({
          name,
          description: `DSH ${name}`,
          invocation: { modelInvocable: true, userInvocable: true },
          provider: 'dsh-office',
          source: 'bundled',
          rank: BUNDLED_SKILL_RANK,
          locator: name
        }))
      ),
    get: (candidate: any) => Promise.resolve({ ...candidate, content: 'Use python-docx.' })
  }
  it('shadows the DSH Office routes while loaded and restores them on unload', async () => {
    const plugin = await importHostBundle()
    const ctx = new Context()
    new SkillRegistry(ctx)
    // DSH mounts its Office provider before installed bundles.
    ctx.skills.registerProvider(() => dshOffice)
    let child: any
    ctx.plugin({
      name: 'univer-under-test',
      apply: (scope: Context) => {
        child = scope
        plugin.apply(scope, { tools: false, skills: true })
      }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(await providers(ctx.skills)).toMatchObject({
      office: 'univer',
      'office-docx': 'univer',
      'office-pptx': 'univer',
      'office-xlsx': 'univer',
      'office-export-pdf': 'dsh-office',
      'office-recalculate': 'dsh-office',
      'office-render': 'dsh-office',
      univer: 'univer'
    })
    expect((await ctx.skills.get('office-docx'))?.content).toContain('`univer-doc`')

    await child.fiber.dispose()
    const restored = await providers(ctx.skills)
    expect(Object.keys(restored).toSorted()).toEqual(DSH_OFFICE)
    expect(new Set(Object.values(restored))).toEqual(new Set(['dsh-office']))
  })
})

/** Winning provider for each listed skill name. */
async function providers(skills: any): Promise<Record<string, string>> {
  return Object.fromEntries((await skills.list()).map((entry: any) => [entry.name, entry.provider]))
}

/** Markdown files reachable from a skill entrypoint through relative links. */
async function readLinkedReferences(
  root: string,
  entrypoint: string
): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  async function visit(content: string, directory: string): Promise<void> {
    for (const match of content.matchAll(/\]\(([^)]+\.md)\)/g)) {
      const target = match[1]!
      if (/^[a-z]+:/i.test(target)) continue
      const path = resolve(directory, target)
      const name = relative(root, path)
      expect(name.startsWith('..'), `reference escapes skill: ${name}`).toBe(false)
      if (files.has(name)) continue
      const text = await readFile(path, 'utf8')
      files.set(name, text)
      await visit(text, dirname(path))
    }
  }
  await visit(entrypoint, root)
  return files
}
