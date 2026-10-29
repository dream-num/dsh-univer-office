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
  },
  {
    name: 'office',
    description:
      'Create, edit, inspect, or convert Office documents, spreadsheets, and presentations through Univer and the structured univer_* tools. Load to choose the relevant workflow.'
  },
  {
    name: 'office-docx',
    description:
      'Create, read, edit, and validate Word documents (.docx) through Univer Doc Units and the structured univer_* tools.'
  },
  {
    name: 'office-pptx',
    description:
      'Create, read, edit, and validate PowerPoint presentations (.pptx) through Univer Slide Units and the structured univer_* tools.'
  },
  {
    name: 'office-xlsx',
    description:
      'Read, create, edit, and validate Excel workbooks, data, and formulas (.xlsx) through Univer Sheet Units and the structured univer_* tools.'
  }
] as const

/**
 * DSH's bundled `dsh-office` provider registers these names at `BUNDLED_SKILL_RANK` and routes
 * Office work to python-docx, openpyxl, and python-pptx. The registry keeps the lowest rank among
 * same-name skills in one layer, so these Univer routing skills shadow them while this plugin is
 * loaded; DSH's LibreOffice Kit operation skills stay visible.
 */
const OFFICE_ROUTES: ReadonlySet<string> = new Set([
  'office',
  'office-docx',
  'office-pptx',
  'office-xlsx'
])
const OFFICE_ROUTE_RANK = BUNDLED_SKILL_RANK - 1

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
    rank: OFFICE_ROUTES.has(definition.name) ? OFFICE_ROUTE_RANK : BUNDLED_SKILL_RANK,
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
