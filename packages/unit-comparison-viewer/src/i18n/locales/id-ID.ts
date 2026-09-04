import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/id-ID'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.ID_ID, editHistoryLocale)

export const idIDUnitComparisonViewerMessages = {
  changes: 'perubahan',
  structuralDiff: 'Bandingkan · Konten',
  kind: {
    insert: 'Disisipkan',
    delete: 'Dihapus',
    update: 'Diubah'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Gagal merender buku kerja',
  itemCount: (count) => String(count) + ' Item',
  propertyCount: (count) => String(count) + ' Properti',
  moved: 'Dipindahkan',
  rightCurrentVersion: 'Kanan · versi saat ini',
  revision: (revision) => 'Revisi ' + String(revision),
  readOnly: 'Hanya baca',
  side: {
    left: 'Kiri',
    right: 'Kanan'
  },
  changeCount: (count) => String(count) + ' perubahan',
  changedSlides: 'perubahan · file',
  changedBaseTables: 'perubahan · Tabel',
  noRawTableChanges: 'tidak ada Tabel perubahan',
  rawTableData: 'Tabel · Konten',
  baseAlignmentHint: 'Baris dan kolom disejajarkan menurut identitas stabil',
  checkboxState: {
    checked: 'Dicentang',
    unchecked: 'Tidak dicentang'
  },
  comparingMaterializedSnapshots: 'pratinjau penggabungan · Bandingkan',
  snapshot: 'pratinjau penggabungan · Bandingkan',
  noStructuralChanges: 'tidak ada perubahan',
  notPresent: 'tidak ada file',
  workbookTitle: 'Buku kerja · Bandingkan',
  invalidPayloadTitle: 'Bandingkan · gagal',
  invalidPayloadBody: 'pratinjau penggabungan: tidak dapat',
  summaryUnavailable: 'tidak ada Bandingkan',
  scopeLabel: 'Bandingkan · Pilih',
  displayModeLabel: 'Bandingkan · Konten',
  worksheet: 'Lembar kerja',
  workbook: 'Buku kerja',
  content: 'Konten',
  formatting: 'Pemformatan',
  showFormulas: 'Tampilkan rumus',
  searchChanges: 'Cari perubahan',
  noItems: 'tidak ada perubahan',
  selectItemHint: 'Pilih perubahan',
  snapshotUnavailable: 'pratinjau penggabungan: tidak dapat',
  formulaDiff: 'Bandingkan · Rumus',
  baseFormula: 'versi saat ini · Rumus',
  currentFormula: 'perubahan · Rumus',
  baseValue: 'versi saat ini · Konten',
  currentValue: 'perubahan · Konten',
  base: 'versi saat ini',
  current: 'perubahan',
  summaryLabel: 'Bandingkan · perubahan',
  sheetTree: {
    categories: {
      chart: 'Bagan',
      cell: 'Sel',
      conditionFormat: 'Format bersyarat',
      dataValidation: 'Validasi data',
      move: 'Pemindahan',
      pivot: 'Tabel pivot',
      rowColumn: 'Baris dan kolom',
      shape: 'Bentuk',
      sparkline: 'Grafik mini',
      table: 'Tabel',
      workbook: 'Buku kerja',
      worksheet: 'Lembar kerja'
    },
    emptyText: '(Tidak ada file terbuka)',
    noActiveSheet: 'tidak ada Lembar kerja',
    noCompareData: 'tidak ada Bandingkan',
    row: (index) => 'Baris ' + String(index),
    styles: 'Gaya',
    workbookRoot: 'Buku kerja',
    titles: {
      insertedRows: 'Disisipkan Baris',
      deletedRows: 'Dihapus Baris',
      insertedColumns: 'Disisipkan Kolom',
      deletedColumns: 'Dihapus Kolom',
      rowsMoved: 'Baris · Dipindahkan',
      columnsMoved: 'Kolom · Dipindahkan',
      rowChanged: (index) => 'Baris ' + String(index) + ' · Diubah',
      columnChanged: (index) => 'Kolom ' + String(index) + ' · Diubah',
      sheetAdded: (name) => 'Disisipkan Lembar: ' + name,
      sheetDeleted: (name) => 'Dihapus Lembar: ' + name,
      sheetRenamed: 'Lembar · Diubah namanya',
      workbookRenamed: 'Buku kerja · Diubah namanya'
    }
  }
} satisfies IUnitComparisonViewerMessages
