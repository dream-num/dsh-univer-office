import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/pt-BR'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.PT_BR, editHistoryLocale)

export const ptBRUnitComparisonViewerMessages = {
  changes: 'alteração',
  structuralDiff: 'Comparar · Conteúdo',
  kind: {
    insert: 'Inserido',
    delete: 'Excluído',
    update: 'Alterado'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: 'Falha ao renderizar a pasta de trabalho',
  itemCount: (count) => String(count) + ' Item',
  propertyCount: (count) => String(count) + ' Propriedade',
  moved: 'Movido',
  rightCurrentVersion: 'Direita · versão atual',
  revision: (revision) => 'Revisão ' + String(revision),
  readOnly: 'Somente leitura',
  side: {
    left: 'Esquerda',
    right: 'Direita'
  },
  changeCount: (count) => String(count) + ' alteração',
  changedSlides: 'alteração · arquivo',
  changedBaseTables: 'alteração · Tabelas',
  noRawTableChanges: 'nenhum Tabelas alteração',
  rawTableData: 'Tabelas · Conteúdo',
  baseAlignmentHint: 'Linhas e colunas são alinhadas por identificadores estáveis',
  checkboxState: {
    checked: 'Marcado',
    unchecked: 'Desmarcado'
  },
  comparingMaterializedSnapshots: 'prévia da mesclagem · Comparar',
  snapshot: 'prévia da mesclagem · Comparar',
  noStructuralChanges: 'nenhum alteração',
  notPresent: 'nenhum arquivo',
  workbookTitle: 'Pasta de trabalho · Comparar',
  invalidPayloadTitle: 'Comparar · falhou',
  invalidPayloadBody: 'prévia da mesclagem: não é possível',
  summaryUnavailable: 'nenhum Comparar',
  scopeLabel: 'Comparar · Escolha',
  displayModeLabel: 'Comparar · Conteúdo',
  worksheet: 'Planilha',
  workbook: 'Pasta de trabalho',
  content: 'Conteúdo',
  formatting: 'Formatação',
  showFormulas: 'Mostrar fórmulas',
  searchChanges: 'Pesquisar alteração',
  noItems: 'nenhum alteração',
  selectItemHint: 'Escolha alteração',
  snapshotUnavailable: 'prévia da mesclagem: não é possível',
  formulaDiff: 'Comparar · Fórmula',
  baseFormula: 'versão atual · Fórmula',
  currentFormula: 'alteração · Fórmula',
  baseValue: 'versão atual · Conteúdo',
  currentValue: 'alteração · Conteúdo',
  base: 'versão atual',
  current: 'alteração',
  summaryLabel: 'Comparar · alteração',
  sheetTree: {
    categories: {
      chart: 'Gráficos',
      cell: 'Células',
      conditionFormat: 'Formatação condicional',
      dataValidation: 'Validação de dados',
      move: 'Movimentações',
      pivot: 'Tabelas dinâmicas',
      rowColumn: 'Linhas e colunas',
      shape: 'Formas',
      sparkline: 'Minigráficos',
      table: 'Tabelas',
      workbook: 'Pasta de trabalho',
      worksheet: 'Planilha'
    },
    emptyText: '(Nenhum arquivo aberto)',
    noActiveSheet: 'nenhum Planilha',
    noCompareData: 'nenhum Comparar',
    row: (index) => 'Linha ' + String(index),
    styles: 'Estilos',
    workbookRoot: 'Pasta de trabalho',
    titles: {
      insertedRows: 'Inserido Linha',
      deletedRows: 'Excluído Linha',
      insertedColumns: 'Inserido Colunas',
      deletedColumns: 'Excluído Colunas',
      rowsMoved: 'Linha · Movido',
      columnsMoved: 'Colunas · Movido',
      rowChanged: (index) => 'Linha ' + String(index) + ' · Alterado',
      columnChanged: (index) => 'Colunas ' + String(index) + ' · Alterado',
      sheetAdded: (name) => 'Inserido Planilha: ' + name,
      sheetDeleted: (name) => 'Excluído Planilha: ' + name,
      sheetRenamed: 'Planilha · Renomeado',
      workbookRenamed: 'Pasta de trabalho · Renomeado'
    }
  }
} satisfies IUnitComparisonViewerMessages
