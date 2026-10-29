import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'
import { buildDocx, run } from '../support/ooxml.ts'

const RUNS = `const body = doc.getBody();
  return (body.textRuns ?? []).map((run) => ({ st: run.st, ed: run.ed, bl: run.ts?.bl ?? null, it: run.ts?.it ?? null, cl: run.ts?.cl?.rgb ?? null }));`

// Known Doc Facade defects. Setup runs in hooks that must pass, so each `it.fails` covers only
// the defective behavior; when a fix lands, the test turns red: flip it to `it` and close the
// issue.
describe('known Doc Facade issues', () => {
  let gateway: GatewayHarness
  let worktreeId: string

  const importDocx = async (name: string, bytes: Buffer) => {
    const source = join(gateway.workspace, name)
    await writeFile(source, bytes)
    const imported = await gateway.service.importUnitContent({
      ...gateway.scoped,
      source,
      sourceWorkspace: gateway.workspace,
      worktreeId,
      name
    })
    expect(imported.result?.kind).toBe('doc')
    return imported.result.unitId as string
  }

  beforeAll(async () => {
    gateway = await startGateway()
    worktreeId = await gateway.createWorktree('doc facade')
  })

  afterAll(async () => {
    await gateway?.dispose()
  })

  describe('section page setup (#100)', () => {
    let unitId: string
    let write: any

    beforeAll(async () => {
      unitId = await importDocx('page-setup.docx', buildDocx({ body: `<w:p>${run('正文')}</w:p>` }))
      write = await gateway.execute(
        worktreeId,
        unitId,
        `const section = doc.getSection(0);
         const ok = section.setPageSetup({ marginLeft: 150, marginRight: 150 });
         return { ok, margins: section.getEffectivePageSetup().margins };`
      )
      // The Facade accepts the change and reads it back inside the same execution.
      expect(write.value).toMatchObject({ ok: true, margins: { left: 150, right: 150 } })
    })

    it.fails('commits setPageSetup() to the worktree', () => {
      expect(write.committed).toBe(true)
    })

    // A one-shot Worker loads only persisted revisions, so it shows what the worktree stores.
    it.fails('persists the new margins', async () => {
      const oneShot = gateway.createService({ unitContentRuntimeMaxEntries: 0 })
      const read = await oneShot.executeUnitContent({
        ...gateway.scoped,
        worktreeId,
        unitId,
        code: 'return doc.getSection(0).getEffectivePageSetup().margins'
      })
      expect(read.result.value).toMatchObject({ left: 150, right: 150 })
    })

    // The pooled runtime keeps the uncommitted change, so later executions disagree with the
    // persisted worktree and with export until the runtime is evicted.
    it.fails('keeps a pooled runtime in step with the persisted worktree', async () => {
      const pooled = await gateway.execute(
        worktreeId,
        unitId,
        'return doc.getSection(0).getEffectivePageSetup().margins'
      )
      expect(pooled.value).toMatchObject({ left: 120, right: 120 })
    })
  })

  describe('style-preserving text replacement (#126)', () => {
    let before: unknown[]
    let after: unknown[]

    beforeAll(async () => {
      const unitId = await importDocx(
        'runs.docx',
        buildDocx({
          body: `<w:p>${run('普通文字')}${run('加粗红色', '<w:b/><w:color w:val="C00000"/>')}${run('斜体', '<w:i/>')}</w:p>`
        })
      )
      before = (await gateway.execute(worktreeId, unitId, RUNS)).value
      expect(before).toHaveLength(3)
      const replaced = await gateway.execute(
        worktreeId,
        unitId,
        'const paragraph = doc.getParagraphs()[0]; return paragraph.setText(paragraph.getText());'
      )
      expect(replaced).toMatchObject({ committed: true, value: true })
      after = (await gateway.execute(worktreeId, unitId, RUNS)).value
    })

    it.fails('keeps inline run formatting when the text is unchanged', () => {
      expect(after).toEqual(before)
    })
  })
})
