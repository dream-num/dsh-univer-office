import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startGateway, type GatewayHarness } from '../support/gateway.ts'
import { postJson } from '../support/net.ts'
import { buildDocx, complexField, countMatches, readOoxmlParts, run } from '../support/ooxml.ts'
import { repoPath } from '../support/paths.ts'

/** A4 landscape one-paragraph document with the page setup imports must preserve. */
const LANDSCAPE_DOCX = buildDocx({
  body:
    `<w:p>${run('landscape probe')}</w:p>` +
    '<w:sectPr><w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>' +
    '<w:pgMar w:top="1800" w:right="1440" w:bottom="1800" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'
})

/** Twip-derived geometry survives as floating-point pixels; compare with slack. */
const near = (expected: number) => expect.closeTo(expected, 1)

describe('import and export through the bundled exchange', () => {
  let gateway: GatewayHarness
  let worktreeId: string

  const importFile = async (name: string, bytes: Buffer | string, extra = {}) => {
    const source = join(gateway.workspace, name)
    await writeFile(source, bytes)
    const imported = await gateway.service.importUnitContent({
      ...gateway.scoped,
      source,
      sourceWorkspace: gateway.workspace,
      worktreeId,
      name,
      ...extra
    })
    return imported.result
  }
  const exportUnit = async (unitId: string, name: string) => {
    const output = join(gateway.workspace, name)
    await gateway.service.exportUnitContent({
      ...gateway.scoped,
      worktreeId,
      unitId,
      output,
      outputWorkspace: gateway.workspace
    })
    return output
  }

  beforeAll(async () => {
    gateway = await startGateway()
    worktreeId = await gateway.createWorktree('exchange')
  })

  afterAll(async () => {
    await gateway?.dispose()
  })

  describe('docx page setup', () => {
    let traditional: string

    it('imports docx as a Traditional Doc that keeps its section', async () => {
      const imported = await importFile('landscape-src.docx', LANDSCAPE_DOCX)
      expect(imported).toMatchObject({ unitId: expect.any(String), kind: 'doc' })
      traditional = imported.unitId
      const layout = await gateway.execute(
        worktreeId,
        traditional,
        'return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional(), sections: doc.getSections().length };'
      )
      expect(layout.value).toEqual({ flavor: 1, traditional: true, sections: 1 })
    })

    it('round-trips the landscape page size, orientation, and margins', async () => {
      const output = await exportUnit(traditional, 'landscape-roundtrip.docx')
      expect((await stat(output)).size).toBeGreaterThan(0)
      const reimported = await gateway.service.importUnitContent({
        ...gateway.scoped,
        source: output,
        sourceWorkspace: gateway.workspace,
        worktreeId,
        name: 'Imported Roundtrip'
      })
      expect(reimported.result).toMatchObject({ unitId: expect.any(String), kind: 'doc' })
      const layout = await gateway.execute(
        worktreeId,
        reimported.result.unitId,
        'const section = doc.getSections()[0]; const page = section ? section.getEffectivePageSetup() : undefined; return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional(), sections: doc.getSections().length, page: page === undefined ? null : page };'
      )
      expect(layout.value).toMatchObject({
        flavor: 1,
        traditional: true,
        sections: 1,
        page: {
          pageSize: { width: near(1122.6), height: near(793.8) },
          margins: { top: near(120), left: near(96) },
          pageOrient: 1
        }
      })
    })

    it('imports docx as a Modern Doc on request', async () => {
      const imported = await importFile('landscape-modern.docx', LANDSCAPE_DOCX, {
        docType: 'modern'
      })
      expect(imported).toMatchObject({ unitId: expect.any(String), kind: 'doc' })
      const layout = await gateway.execute(
        worktreeId,
        imported.unitId,
        'return { flavor: doc.getDocumentFlavor(), traditional: doc.isTraditional() };'
      )
      expect(layout.value).toEqual({ flavor: 2, traditional: false })
    })

    it('rejects docType on a non-docx import', async () => {
      await expect(
        importFile('misflagged.csv', 'name,value\nalpha,1\n', { docType: 'modern' })
      ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    })
  })

  describe('server exchange routes', () => {
    const exchangeBase = () => `${gateway.origin}/uf/${gateway.fileKey}/universer-api`
    const upload = async (bytes: Buffer, type: string, name: string) => {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(bytes)], { type }), name)
      const response = await fetch(
        `${exchangeBase()}/stream/file/upload?size=${bytes.byteLength}&source=1&flate=false`,
        { method: 'POST', body: form }
      )
      expect(response.status, await response.clone().text()).toBe(201)
      return (await response.json()).FileId
    }
    const download = async (fileId: string) => {
      const signed = await (await fetch(`${exchangeBase()}/file/${fileId}/sign-url`)).json()
      return fetch(`${gateway.origin}${signed.url}`)
    }

    it('imports an uploaded CSV and exports it back to xlsx', async () => {
      const csv = Buffer.from('name,value\nserver,7\n', 'utf8')
      const fileID = await upload(csv, 'text/csv', '服务端.csv')
      const importTask = await postJson(`${exchangeBase()}/exchange/2/import`, {
        fileID,
        outputType: 1,
        options: {}
      })
      const imported = await waitForExchangeTask(exchangeBase(), importTask.taskID)
      expect(imported.status).toBe('done')
      expect(imported.import?.unitID).toEqual(expect.any(String))
      const exportTask = await postJson(`${exchangeBase()}/exchange/2/export`, {
        unitID: imported.import.unitID,
        format: 'xlsx',
        options: {}
      })
      const exported = await waitForExchangeTask(exchangeBase(), exportTask.taskID)
      expect(exported.export?.fileID).toEqual(expect.any(String))
      const downloaded = await download(exported.export.fileID)
      expect(downloaded.ok).toBe(true)
      expect((await downloaded.arrayBuffer()).byteLength).toBeGreaterThan(0)
    })

    it('imports an uploaded docx into a snapshot that keeps its page setup', async () => {
      const fileID = await upload(
        LANDSCAPE_DOCX,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'landscape-src.docx'
      )
      const task = await postJson(`${exchangeBase()}/exchange/1/import`, {
        fileID,
        outputType: 2,
        options: {}
      })
      const imported = await waitForExchangeTask(exchangeBase(), task.taskID)
      expect(imported.status).toBe('done')
      expect(imported.import?.jsonID).toEqual(expect.any(String))
      const downloaded = await download(imported.import.jsonID)
      expect(downloaded.ok).toBe(true)
      const snapshot = (await downloaded.json()).snapshot?.doc
      const document = JSON.parse(
        Buffer.from(String(snapshot?.originalMeta ?? ''), 'base64').toString('utf8')
      )
      expect(document.documentStyle?.documentFlavor).toBe(1)
      expect(document.body?.sectionBreaks?.[0]).toMatchObject({
        pageSize: { width: near(1122.6), height: near(793.8) },
        marginTop: near(120),
        marginLeft: near(96)
      })
    })
  })

  describe('docx fidelity regressions', () => {
    // WPS and Word write explicit `w:val="0"`; a bare `<w:bidi/>` means RTL on (ST_OnOff).
    it('keeps explicit left-to-right bidi on docx round-trip (#91)', async () => {
      const paragraphs = [
        '（一）自选活动',
        '1.指导幼儿丢沙包时要保持距离。',
        '2.活动结束后整理器材。'
      ]
      const imported = await importFile(
        'bidi.docx',
        buildDocx({
          body: paragraphs
            .map((text) => `<w:p><w:pPr><w:bidi w:val="0"/></w:pPr>${run(text)}</w:p>`)
            .join('')
        })
      )
      const document = (
        await readOoxmlParts(await exportUnit(imported.unitId, 'bidi-out.docx'))
      ).get('word/document.xml')!
      expect(countMatches(document, /<w:bidi\/>/)).toBe(0)
      expect(countMatches(document, /<w:bidi w:val="0"\/>/)).toBe(paragraphs.length)
      expect(document).toContain('<w:pgSz w:w="11906" w:h="16838"/>')
    })

    it('keeps PAGE and NUMPAGES footer fields through import and export (#125)', async () => {
      const imported = await importFile(
        'fields.docx',
        buildDocx({
          body: `<w:p>${run('正文段落。')}</w:p>`,
          footer: `<w:p>${run('第 ')}${complexField('PAGE', '1')}${run(' 页 / 共 ')}${complexField('NUMPAGES', '1')}${run(' 页')}</w:p>`
        })
      )
      const model = await gateway.execute(
        worktreeId,
        imported.unitId,
        `const snapshot = doc.getDocumentDataModel().getSnapshot();
         return Object.values(snapshot.footers ?? {}).flatMap((footer) =>
           (footer.body?.customRanges ?? []).map((range) => range.properties?.fieldType));`
      )
      expect(model.value).toEqual(['PAGE', 'NUMPAGES'])

      const parts = await readOoxmlParts(await exportUnit(imported.unitId, 'fields-out.docx'))
      const footers = [...parts]
        .filter(([name]) => name.startsWith('word/footer'))
        .map(([, xml]) => xml)
      const footer = footers.join('')
      expect(countMatches(footer, /<w:fldChar /)).toBe(6)
      expect(footer).toMatch(/<w:instrText[^>]*>\s*PAGE\s*</)
      expect(footer).toMatch(/<w:instrText[^>]*>\s*NUMPAGES\s*</)
    })
  })

  // Known exchange defects. Each `it.fails` body holds only the defective step, and its setup
  // runs in hooks that must pass, so an unrelated breakage cannot satisfy it. When an SDK
  // upgrade fixes a defect, its test turns red: flip it to `it` and close the issue.
  describe('known exchange issues', () => {
    let csvSheet: string
    let headingDoc: string
    const pptx = new Map<string, string>()

    beforeAll(async () => {
      csvSheet = await gateway.createUnit(worktreeId, 'sheet', 'CSV')
      const sheetWrite = await gateway.execute(
        worktreeId,
        csvSheet,
        `workbook.getActiveSheet().getRange('A1:B2').setValues([['a','b'],[1,2]]); return 1`
      )
      expect(sheetWrite.committed).toBe(true)

      headingDoc = await gateway.createUnit(worktreeId, 'doc', 'Headings')
      // NamedStyleType.HEADING_1 is 4 in @univerjs/core.
      const headingWrite = await gateway.execute(
        worktreeId,
        headingDoc,
        `const heading = doc.appendParagraph('一级标题');
         const updated = heading.setStyle({ namedStyleType: 4 });
         doc.appendParagraph('正文');
         return updated;`
      )
      expect(headingWrite).toMatchObject({ committed: true, value: true })

      for (const name of ['slide-picture', 'layout-picture']) {
        const source = await readFile(repoPath('test', 'fixtures', 'exchange', `${name}.pptx`))
        const imported = await importFile(`${name}.pptx`, source)
        expect(imported.kind).toBe('slide')
        pptx.set(name, imported.unitId)
      }
    })

    it.fails('exports a Sheet Unit to CSV (#103)', async () => {
      const output = await exportUnit(csvSheet, 'sheet.csv')
      expect(await readFile(output, 'utf8')).toContain('a,b')
    })

    it.fails('writes heading paragraph styles for API-authored headings (#105)', async () => {
      const parts = await readOoxmlParts(await exportUnit(headingDoc, 'headings.docx'))
      expect(parts.get('word/document.xml')).toMatch(/<w:pStyle w:val="Heading1"\/>/)
      expect(parts.get('word/styles.xml')).toMatch(/w:styleId="Heading1"/)
    })

    it.fails.each(['slide-picture', 'layout-picture'])(
      'exports an imported PPTX with a picture (%s, #122)',
      async (name) => {
        const output = await exportUnit(pptx.get(name)!, `${name}-out.pptx`)
        expect((await readOoxmlParts(output)).has('ppt/presentation.xml')).toBe(true)
      }
    )

    describe('Base to xlsx', () => {
      let workbook: Map<string, string>
      let progress: { value: number; numFmtId: string }
      let tableNames: Array<string | undefined>

      beforeAll(async () => {
        const base = await gateway.createUnit(worktreeId, 'base', 'Base')
        const written = await gateway.execute(
          worktreeId,
          base,
          `const table = base.getTableById('table-1');
           if (!table) throw new Error('missing table');
           table.setName('点位台账');
           const progress = table.addField('进度', univerAPI.Enum.BaseFieldType.Progress, { field: { config: { start: 0, end: 100 } } });
           table.addRecords([{ values: { [progress.getId()]: 88 } }]);
           return true;`
        )
        expect(written).toMatchObject({ committed: true, value: true })
        workbook = await readOoxmlParts(await exportUnit(base, 'base.xlsx'))

        const cell = workbook
          .get('xl/worksheets/sheet1.xml')
          ?.match(/<c r="[A-Z]+2" s="(\d+)"><v>(0\.88|88)<\/v><\/c>/)
        const cellXfs = workbook.get('xl/styles.xml')?.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0]
        const numFmtId = [...(cellXfs ?? '').matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)][
          Number(cell?.[1])
        ]?.[1]
        expect(cell, 'exported Progress cell').toBeDefined()
        expect(numFmtId, 'Progress cell number format').toBeDefined()
        progress = { value: Number(cell![2]), numFmtId: numFmtId! }

        tableNames = [...workbook]
          .filter(([name]) => /^xl\/tables\/table\d+\.xml$/.test(name))
          .map(([, xml]) => xml.match(/<table [^>]*? name="([^"]*)"/)?.[1])
        expect(tableNames).toEqual([expect.any(String)])
      })

      it('keeps the Chinese table name on the worksheet', () => {
        expect(workbook.get('xl/workbook.xml')).toContain('<sheet name="点位台账"')
      })

      it.fails('displays a Progress value of 88 as 88% in Excel (#105)', () => {
        // Built-in formats 9 and 10 are percentages: Excel multiplies the stored value by 100.
        const percent = progress.numFmtId === '9' || progress.numFmtId === '10'
        expect(percent ? progress.value * 100 : progress.value).toBe(88)
      })

      it.fails('keeps a usable Excel table name for a Chinese Base table (#105)', () => {
        expect(tableNames[0]).not.toMatch(/^_+$/)
      })
    })
  })
})

async function waitForExchangeTask(exchangeBase: string, taskId: string): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${exchangeBase}/exchange/task/${encodeURIComponent(taskId)}`)
    if (!response.ok) throw new Error(`exchange task polling failed: ${await response.text()}`)
    const task = await response.json()
    if (task.status !== 'pending') return task
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`exchange task ${taskId} did not settle`)
}
