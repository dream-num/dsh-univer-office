import editHistoryLocale from '@univerjs-pro/edit-history-ui/locale/ko-KR'
import { LocaleType } from '@univerjs/core'
import { createComparisonSemanticMessages } from '../semantic-labels.js'
import type { IUnitComparisonViewerMessages } from '../types.js'

const semantic = createComparisonSemanticMessages(LocaleType.KO_KR, editHistoryLocale)

export const koKRUnitComparisonViewerMessages = {
  changes: '변경 사항',
  structuralDiff: '비교 · 내용',
  kind: {
    insert: '삽입됨',
    delete: '삭제됨',
    update: '변경됨'
  },
  entity: semantic.entity,
  entityAt: (entityType, index) => semantic.entity(entityType) + ' ' + String(index),
  changePath: semantic.changePath,
  changeValue: semantic.changeValue,
  renderFailed: '통합 문서 렌더링 실패',
  itemCount: (count) => String(count) + ' 항목',
  propertyCount: (count) => String(count) + ' 속성',
  moved: '이동됨',
  rightCurrentVersion: '오른쪽 · 현재 버전',
  revision: (revision) => '수정 버전 ' + String(revision),
  readOnly: '읽기 전용',
  side: {
    left: '왼쪽',
    right: '오른쪽'
  },
  changeCount: (count) => String(count) + ' 변경 사항',
  changedSlides: '변경 사항 · 파일',
  changedBaseTables: '변경 사항 · 표',
  noRawTableChanges: '없음 표 변경 사항',
  rawTableData: '표 · 내용',
  baseAlignmentHint: '행과 열은 안정적인 식별자로 정렬됩니다',
  checkboxState: {
    checked: '선택됨',
    unchecked: '선택 안 됨'
  },
  comparingMaterializedSnapshots: '병합 미리보기 · 비교',
  snapshot: '병합 미리보기 · 비교',
  noStructuralChanges: '없음 변경 사항',
  notPresent: '없음 파일',
  workbookTitle: '통합 문서 · 비교',
  invalidPayloadTitle: '비교 · 실패',
  invalidPayloadBody: '병합 미리보기: 할 수 없음',
  summaryUnavailable: '없음 비교',
  scopeLabel: '비교 · 선택',
  displayModeLabel: '비교 · 내용',
  worksheet: '워크시트',
  workbook: '통합 문서',
  content: '내용',
  formatting: '서식',
  showFormulas: '수식 표시',
  searchChanges: '검색 변경 사항',
  noItems: '없음 변경 사항',
  selectItemHint: '선택 변경 사항',
  snapshotUnavailable: '병합 미리보기: 할 수 없음',
  formulaDiff: '비교 · 수식',
  baseFormula: '현재 버전 · 수식',
  currentFormula: '변경 사항 · 수식',
  baseValue: '현재 버전 · 내용',
  currentValue: '변경 사항 · 내용',
  base: '현재 버전',
  current: '변경 사항',
  summaryLabel: '비교 · 변경 사항',
  sheetTree: {
    categories: {
      chart: '차트',
      cell: '셀',
      conditionFormat: '조건부 서식',
      dataValidation: '데이터 유효성 검사',
      move: '이동',
      pivot: '피벗 테이블',
      rowColumn: '행과 열',
      shape: '도형',
      sparkline: '스파크라인',
      table: '표',
      workbook: '통합 문서',
      worksheet: '워크시트'
    },
    emptyText: '(열린 파일 없음)',
    noActiveSheet: '없음 워크시트',
    noCompareData: '없음 비교',
    row: (index) => '행 ' + String(index),
    styles: '스타일',
    workbookRoot: '통합 문서',
    titles: {
      insertedRows: '삽입됨 행',
      deletedRows: '삭제됨 행',
      insertedColumns: '삽입됨 열',
      deletedColumns: '삭제됨 열',
      rowsMoved: '행 · 이동됨',
      columnsMoved: '열 · 이동됨',
      rowChanged: (index) => '행 ' + String(index) + ' · 변경됨',
      columnChanged: (index) => '열 ' + String(index) + ' · 변경됨',
      sheetAdded: (name) => '삽입됨 시트: ' + name,
      sheetDeleted: (name) => '삭제됨 시트: ' + name,
      sheetRenamed: '시트 · 이름 변경됨',
      workbookRenamed: '통합 문서 · 이름 변경됨'
    }
  }
} satisfies IUnitComparisonViewerMessages
