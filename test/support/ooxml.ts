import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

/** Stored-entry ZIP writer (method 0); OOXML readers accept uncompressed parts. */
export function storeZip(entries: ReadonlyArray<readonly [string, string | Uint8Array]>): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    chunks.push(local, nameBytes, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(data.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, centralBytes, end])
}

let crcTable: Int32Array | undefined

function crc32(bytes: Uint8Array): number {
  if (crcTable === undefined) {
    crcTable = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c
    }
  }
  let crc = -1
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!
  return (crc ^ -1) >>> 0
}

/**
 * Read every entry of a ZIP archive through its central directory. Supports the stored and
 * deflated methods that OOXML writers emit; ZIP64 archives are out of scope for test fixtures.
 */
export function readZip(archive: Buffer): Map<string, Buffer> {
  let end = archive.length - 22
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error('ZIP end of central directory not found')
  const count = archive.readUInt16LE(end + 10)
  let cursor = archive.readUInt32LE(end + 16)
  const entries = new Map<string, Buffer>()
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('malformed ZIP directory')
    const method = archive.readUInt16LE(cursor + 10)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    const dataStart =
      localOffset +
      30 +
      archive.readUInt16LE(localOffset + 26) +
      archive.readUInt16LE(localOffset + 28)
    const data = archive.subarray(dataStart, dataStart + compressedSize)
    if (method === 0) entries.set(name, Buffer.from(data))
    else if (method === 8) entries.set(name, inflateRawSync(data))
    else throw new Error(`unsupported ZIP method ${method} for ${name}`)
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Text parts of an OOXML package on disk, keyed by part name. */
export async function readOoxmlParts(path: string): Promise<Map<string, string>> {
  const parts = new Map<string, string>()
  for (const [name, bytes] of readZip(await readFile(path))) {
    if (name.endsWith('.xml') || name.endsWith('.rels')) parts.set(name, bytes.toString('utf8'))
  }
  return parts
}

export const countMatches = (text: string, pattern: RegExp): number =>
  (
    text.match(
      new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    ) ?? []
  ).length

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export interface DocxParts {
  /** Inner XML of `<w:body>`, including the trailing `<w:sectPr>` when the test needs one. */
  readonly body: string
  /** Inner XML of `<w:ftr>`; adds a default footer referenced from the body section. */
  readonly footer?: string
}

/**
 * Minimal WordprocessingML package. The importer needs only the main document part; a footer
 * adds its part, relationship, and a section reference so field tests exercise real footers.
 */
export function buildDocx({ body, footer }: DocxParts): Buffer {
  const footerReference =
    footer === undefined ? '' : `<w:footerReference w:type="default" r:id="rIdFooter1"/>`
  const sectionedBody = body.includes('<w:sectPr')
    ? body.replace('<w:sectPr>', `<w:sectPr>${footerReference}`)
    : `${body}<w:sectPr>${footerReference}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>`
  const parts: Array<[string, string]> = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${footer === undefined ? '' : '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'}
</Types>`
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>${sectionedBody}</w:body></w:document>`
    ]
  ]
  if (footer !== undefined) {
    parts.push(
      [
        'word/_rels/document.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
      ],
      [
        'word/footer1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}">${footer}</w:ftr>`
      ]
    )
  }
  return storeZip(parts)
}

/** Plain-text run. */
export const run = (text: string, properties = ''): string =>
  `<w:r>${properties === '' ? '' : `<w:rPr>${properties}</w:rPr>`}<w:t xml:space="preserve">${text}</w:t></w:r>`

/** Complex field (`fldChar` begin/separate/end) with a cached display result. */
export const complexField = (instruction: string, cachedResult: string): string =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
  `<w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
  run(cachedResult) +
  `<w:r><w:fldChar w:fldCharType="end"/></w:r>`

/** Page break run; the importer paginates on explicit breaks. */
export const pageBreak = `<w:r><w:br w:type="page"/></w:r>`
