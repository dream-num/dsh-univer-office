import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'univer'
const INVOCATION = { modelInvocable: true, userInvocable: true } as const
const DEFINITIONS = [
  {
    name: 'univer',
    description:
      'Create, inspect, edit, import, export, and hand off multi-Unit .univer files through DSH tools and isolated worktrees. Use proactively for any task involving .univer files, spreadsheets or .xlsx/.csv/.tsv data, presentations or .pptx slides, .docx documents, Base databases, Board canvases, cross-Unit content, or exact Univer Facade API authoring; load this before the matching Unit skill.'
  },
  {
    name: 'univer-sheet',
    description:
      'Read, write, format, calculate, and verify Univer Sheet Units through DSH tools and the Lite Interface. Use proactively for spreadsheet values, formulas, ranges, tables, charts, images, formatting, validation, filters, pivots, rich text, xlsx/csv/tsv import or export, and any Sheet Unit task.'
  },
  {
    name: 'univer-doc',
    description:
      'Read, create, edit, paginate, chart, inspect, export, and review Univer Doc Units through DSH tools and the Lite Interface. Use proactively for paragraphs, rich text, lists, tasks, tables, images, charts, headers, footers, page layout, Traditional or Modern documents, docx import/export, and any Doc Unit task.'
  },
  {
    name: 'univer-slide',
    description:
      'Create, redesign, edit, inspect, lint, export, and review Univer Slide Units through DSH tools and the Lite Interface. Use proactively for presentations, slide decks, pages, SVG-authored layouts, shapes, text, images, tables, charts, transitions, pptx import/export, or any request whose deliverable is a presentation; generated pages should use univer_compile_svg and every changed page should use univer_lint.'
  },
  {
    name: 'univer-base',
    description:
      'Create, edit, calculate, inspect, export, and review Univer Base database Units through DSH tools and the Lite Interface. Use proactively for Base tables, fields, records, views, Formula fields, structured references, Sheet-backed external references, Base import/export, or any Base Unit task.'
  },
  {
    name: 'univer-board',
    description:
      'Create, edit, chart, inspect, and review Univer Board canvas Units through DSH tools and the Lite Interface. Use proactively for Board shapes, text, connectors, routing, images, native charts, diagrams, canvas layout, or any Board Unit task.'
  },
  {
    name: 'univer-embed',
    description:
      'Embed one Univer Unit inside another through DSH tools and the Lite Interface. Use proactively when a Sheet, Doc, Slide, Base, Board, dashboard, report, presentation, database, or canvas should display or interact with content from another Unit in the same .univer file.'
  },
  {
    name: 'univer-cross-unit-formula',
    description:
      'Author, calculate, update, inspect, and verify cross-Unit formulas through DSH tools and the Lite Interface. Use proactively when a Sheet cell or formula-driven Shape in a Sheet, Doc, Slide, or Board reads a Sheet range or Base table column from another Unit in the same .univer file.'
  }
] as const

const CANDIDATES: readonly SkillCandidate[] = DEFINITIONS.map((definition) => {
  const url = new URL(`../skills/${definition.name}/SKILL.md`, import.meta.url)
  return {
    ...definition,
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: {
      kind: 'directory',
      path: fileURLToPath(new URL(`../skills/${definition.name}/`, import.meta.url))
    },
    rank: BUNDLED_SKILL_RANK,
    locator: url
  }
})

const provider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve(CANDIDATES),
  async get(candidate): Promise<SkillDefinition> {
    if (!(candidate.locator instanceof URL)) throw new Error('univer skill locator must be a URL')
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      ...(candidate.resourceBase === undefined ? {} : { resourceBase: candidate.resourceBase }),
      content: stripFrontmatter(await readFile(candidate.locator, 'utf8'))
    }
  }
}

export const name = 'univer-skills'
export const inject = ['skills']

/** Register version-matched Univer instructions on the DSH skill seam. */
export function apply(ctx: Context): void {
  ctx.skills.registerProvider(() => provider)
}

function stripFrontmatter(value: string): string {
  if (!value.startsWith('---\n')) return value
  const end = value.indexOf('\n---\n', 4)
  return end === -1 ? value : value.slice(end + 5)
}
