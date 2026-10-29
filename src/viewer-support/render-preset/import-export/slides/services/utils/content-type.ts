import { UniverInstanceType } from '@univerjs/core'

export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const DOC = 'application/msword'
export const XLS = 'application/vnd.ms-excel'
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const CSV = 'text/csv'
export const TSV = 'text/tab-separated-values'
export const PPT = 'application/vnd.ms-powerpoint'
export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
export const PDF = 'application/pdf'

export const UNIT_CONTENT_TYPE: Record<UniverInstanceType, string[]> = {
  [UniverInstanceType.UNIVER_UNKNOWN]: [''],
  [UniverInstanceType.UNIVER_DOC]: [DOC, DOCX],
  [UniverInstanceType.UNIVER_SHEET]: [XLS, XLSX, CSV, TSV],
  [UniverInstanceType.UNIVER_SLIDE]: [PPT, PPTX],
  [UniverInstanceType.UNIVER_PDF]: [PDF],
  [UniverInstanceType.UNIVER_BASE]: [XLS, XLSX, CSV, TSV],
  [UniverInstanceType.UNIVER_BOARD]: [''],
  [UniverInstanceType.UNIVER_PROJECT]: [''],
  [UniverInstanceType.UNRECOGNIZED]: ['']
}

export const CONTENT_TYPE_EXTNAME: { [key: string]: string } = {
  [DOC]: 'doc',
  [DOCX]: 'docx',
  [XLS]: 'xls',
  [XLSX]: 'xlsx',
  [CSV]: 'csv',
  [TSV]: 'tsv',
  [PPT]: 'ppt',
  [PPTX]: 'pptx',
  [PDF]: 'pdf'
}

export const UNIT_FILE_EXTENSIONS: Record<UniverInstanceType, string[]> = Object.fromEntries(
  Object.entries(UNIT_CONTENT_TYPE).map(([type, contentTypes]) => [
    type,
    contentTypes.map((contentType) => CONTENT_TYPE_EXTNAME[contentType]).filter(Boolean)
  ])
) as Record<UniverInstanceType, string[]>
