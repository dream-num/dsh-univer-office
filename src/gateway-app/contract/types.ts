// API 契约类型(net-new 控制面)。Pro 兼容面(snapshot/comb)的 req/res 复用 @univerjs/protocol,
// 不在此定义;modify 的 mutations 在契约里保持不透明(unknown[]),由 server/cli 用真实类型构造。

import { UniverInstanceType } from '@univerjs/core'
import type {
  IUnitComparisonAxisAlignment,
  IUnitComparisonLeafChange,
  IUnitComparisonLocation,
  IUnitComparisonResult,
  IUnitComparisonScope,
  IUnitComparisonScopeReference,
  IUnitComparisonTextSegment
} from '@univerjs-pro/edit-history'

/** Gateway-owning business failures carried alongside the numeric SDK error code. */
export enum GatewaySemanticErrorCode {
  OptimizeHistoryActiveWorktrees = 'OPTIMIZE_HISTORY_ACTIVE_WORKTREES'
}

/** 统一错误信封;所有响应都带。code:1=OK,0=fail(snapshot 类透传 SDK ErrorCode)。 */
export interface ErrorEnvelope {
  error: {
    code: number
    message: string
    semanticCode?: GatewaySemanticErrorCode
    details?: unknown
  }
}

export const UNIT_TYPE_DOC = UniverInstanceType.UNIVER_DOC
export const UNIT_TYPE_SHEET = UniverInstanceType.UNIVER_SHEET
export const UNIT_TYPE_SLIDE = UniverInstanceType.UNIVER_SLIDE
export const UNIT_TYPE_BASE = UniverInstanceType.UNIVER_BASE
export const UNIT_TYPE_BOARD = UniverInstanceType.UNIVER_BOARD

/** 当前网关支持的 Univer Unit 类型。 */
export type UnitType =
  | UniverInstanceType.UNIVER_DOC
  | UniverInstanceType.UNIVER_SHEET
  | UniverInstanceType.UNIVER_SLIDE
  | UniverInstanceType.UNIVER_BASE
  | UniverInstanceType.UNIVER_BOARD

/** 当前支持的类型集合(运行时校验用)。 */
export const SUPPORTED_UNIT_TYPES: readonly UnitType[] = [
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD
]

/** 是否为当前网关支持的 unit 类型。 */
export function isSupportedUnitType(type: UniverInstanceType): type is UnitType {
  return (
    type === UNIT_TYPE_DOC ||
    type === UNIT_TYPE_SHEET ||
    type === UNIT_TYPE_SLIDE ||
    type === UNIT_TYPE_BASE ||
    type === UNIT_TYPE_BOARD
  )
}

/** worktree 生命周期状态。 */
export type WorktreeStatus = 'draft' | 'ready' | 'merged' | 'discarded'

export interface UnitSummary {
  unitId: string
  type: UnitType
  name: string
  headRev: number
}

export interface ListUnitsResponse extends ErrorEnvelope {
  units: UnitSummary[]
}

export interface Worktree {
  worktreeId: string
  status: WorktreeStatus
  agentId: string
  name: string
  /** worktree 时各 unit 的基线版本:unitId -> worktreeRev。 */
  baseline: Record<string, number>
  createdAt: string
  mergedAt?: string
}

export interface CreateWorktreeRequest {
  agentId?: string
  name?: string
}

export interface CreateWorktreeResponse extends ErrorEnvelope {
  worktreeId: string
  baseline: Record<string, number>
  status: WorktreeStatus
}

export interface ListWorktreesResponse extends ErrorEnvelope {
  worktrees: Worktree[]
}

export type ReadyResponse =
  | (ErrorEnvelope & { ok: true; status: 'ready'; worktree: Worktree })
  | (ErrorEnvelope & { ok: false })

export interface ReopenResponse extends ErrorEnvelope {
  ok: true
  status: 'draft'
}

/** merge 成功或结构冲突(冲突是正常响应,不是 HTTP 错误)。 */
export type MergeResponse =
  | (ErrorEnvelope & { ok: true; mergedRevs: Record<string, number> })
  | (ErrorEnvelope & { ok: false; conflict: true; failedUnit: string })

export interface DiscardResponse extends ErrorEnvelope {
  ok: true
}

/** 低层按地址创建 univerfile 的响应;已存在 → HTTP 409,不存在的查询 → HTTP 404。 */
export interface CreateUniverfileResponse extends ErrorEnvelope {}

export type OptimizeUniverfileImages = 'externalize'
export type OptimizeUniverfileWorktrees = 'clean'
export type OptimizeUniverfileHistory = 'reset'

export type OptimizeHistoryActiveWorktreeDetails = {
  readonly activeWorktrees: readonly {
    readonly worktreeId: string
    readonly status: string
    readonly name: string
  }[]
}

export interface OptimizeUniverfileRequest {
  /** Absolute local output path. Required unless dryRun is true. */
  outputPath?: string
  images?: OptimizeUniverfileImages
  worktrees?: OptimizeUniverfileWorktrees
  history?: OptimizeUniverfileHistory
  dryRun: boolean
}

export interface OptimizeUniverfileReport {
  sourcePath: string
  outputPath?: string
  dryRun: boolean
  beforeBytes: number
  afterBytes?: number
  images: {
    selected: boolean
    references: number
    uniqueBlobs: number
    sourceBytes: number
    storedBytes: number
  }
  worktrees: {
    mode: 'preserve' | OptimizeUniverfileWorktrees
    impliedByHistory: boolean
    removedWorktrees: number
  }
  history: {
    mode: 'preserve' | OptimizeUniverfileHistory
    resetUnits: number
    removedSnapshots: number
    removedChangesets: number
  }
}

export interface OptimizeUniverfileResponse extends ErrorEnvelope {
  ok: true
  report: OptimizeUniverfileReport
}

/**
 * Lifecycle events delivered over WebSocket (`/uf/<enc>/events` univerfile channel,
 * `/uf/<enc>/worktrees/<worktreeId>/events` worktree channel).
 * comb carries append-only forward changesets; these are the things comb can't express —
 * version reset, worktree registry/status, and unit add/remove.
 *  - univerfile channel: `worktree` (registry upsert by worktreeId) + trunk `unit_added`/`unit_updated`/`unit_removed`
 *  - worktree channel: `reset` (full Univer rebuild) + that worktree's `unit_added`/`unit_updated`/`unit_removed`
 */
export type WorktreeLifecycleEvent =
  | { type: 'worktree'; worktree: Worktree }
  | { type: 'reset'; worktreeId: string; units?: string[] }
  | { type: 'unit_added'; unitId: string; unitType: UnitType; name: string }
  | { type: 'unit_updated'; unitId: string; name: string; headRev: number }
  | { type: 'unit_removed'; unitId: string }

// ---- merge preview (worktree-merge-preview) ----

/**
 * 一个 unit 在"把当前 worktree 合并进最新版本"时的状态。技术标识;中文展示标签
 * (新/改/删/已更新/冲突)由客户端渲染层映射,不进契约。
 *  - created:worktree 内新建,合并后并入最新版本
 *  - modified:改过且能干净 rebase 到最新版本之上
 *  - deleted:worktree 删除了最新版本里的一个 unit,且无删改冲突
 *  - unchanged:worktree 未改;最新版本可能改过(见 baseStale),合并保留最新版本
 *  - conflict:OT rebase 失败或删改冲突,无法自动合并
 */
export type MergeUnitStatus = 'created' | 'modified' | 'deleted' | 'unchanged' | 'conflict'

/** 合并预览里单个 unit 的状态摘要。 */
export interface MergeUnitPreview {
  unitId: string
  type: UnitType
  name: string
  status: MergeUnitStatus
  /** worktree 冻结的基线版本(created 无)。 */
  baseRev?: number
  /** 该 unit 当前的最新版本 head(created 无)。 */
  trunkRev?: number
  /** trunkRev > baseRev,即"我没改但最新版本改过它",基版本已过期。 */
  baseStale: boolean
}

/** 合并预览摘要(`GET /uf/<enc>/worktrees/<id>/preview`)。 */
export interface MergePreview {
  worktreeId: string
  /** 无 conflict 单元 → 此刻 merge 会成功。 */
  mergeable: boolean
  /** 至少一个 unit baseStale,即 worktree 已落后最新版本。 */
  diverged: boolean
  units: MergeUnitPreview[]
  /** status === "conflict" 的 unitId 列表。 */
  conflicts: string[]
}

export interface MergePreviewResponse extends ErrorEnvelope, MergePreview {}

/**
 * 单个 unit 的合并预览渲染数据(`GET /uf/<enc>/worktrees/<id>/preview/units/<unitId>`)。
 * snapshot / changesets / sheetBlocks 在契约里保持不透明(协议形态);只有 sheet 带 sheetBlocks。
 * 客户端按类型用反向 transform 还原引擎数据并回放 changesets,只读渲染。
 */
export interface MergePreviewUnitResponse extends ErrorEnvelope {
  type: UnitType
  /** 渲染基准 snapshot(协议 ISnapshot);冲突单元为最新版本 snapshot。 */
  snapshot?: unknown
  /** sheet 的 sheet blocks(内联);doc/slide 省略。 */
  sheetBlocks?: unknown[]
  /** 叠加在 snapshot 上的 changesets(协议形态);冲突单元仅含最新版本到 head 的部分。 */
  changesets: unknown[]
}

// ---- pinned Unit comparison (worktree-diff) ----

/** A comparison endpoint accepted by the read-only Worktree diff flow. */
export type UnitComparisonRefRequest =
  | { readonly kind: 'trunk' }
  | { readonly kind: 'worktree'; readonly worktreeId: string }

/** A ref plus the immutable Unit heads captured when the comparison was created. */
export type PinnedUnitComparisonRef =
  | {
      readonly kind: 'trunk'
      readonly label: 'Trunk'
      readonly heads: Readonly<Record<string, number>>
    }
  | {
      readonly kind: 'worktree'
      readonly worktreeId: string
      readonly label: string
      readonly heads: Readonly<Record<string, number>>
    }

export type UnitComparisonPresence = 'paired' | 'left-only' | 'right-only'

export interface UnitComparisonSummary {
  readonly unitId: string
  readonly type: UnitType
  readonly name: string
  readonly presence: UnitComparisonPresence
}

export interface CreateUnitComparisonRequest {
  /** Defaults to Trunk. The right side is always the Worktree addressed by the route. */
  readonly left?: UnitComparisonRefRequest
}

export interface UnitComparisonSession {
  readonly comparisonId: string
  readonly createdAt: string
  readonly left: PinnedUnitComparisonRef
  readonly right: PinnedUnitComparisonRef & { readonly kind: 'worktree' }
  readonly units: readonly UnitComparisonSummary[]
}

export interface CreateUnitComparisonResponse extends ErrorEnvelope, UnitComparisonSession {}

export interface UnitComparisonSideData {
  readonly present: boolean
  readonly revision?: number
  /** Fully materialized protocol snapshot pinned to revision. */
  readonly snapshot?: unknown
  /** Sheet/Base blocks belonging to the fully materialized snapshot. */
  readonly sheetBlocks?: readonly unknown[]
}

export type UnitComparisonFidelity = 'history' | 'snapshot'

/**
 * One Unit's pinned, symmetric comparison input. Both snapshots are final states. When fidelity is
 * history, each changeset stream starts at commonBaseRevision and ends at its pinned side head.
 */
export interface UnitComparisonResponse extends ErrorEnvelope {
  readonly comparisonId: string
  readonly unit: UnitComparisonSummary
  readonly fidelity: UnitComparisonFidelity
  readonly commonBaseRevision?: number
  readonly left: UnitComparisonSideData
  readonly right: UnitComparisonSideData
  readonly leftChangesets: readonly unknown[]
  readonly rightChangesets: readonly unknown[]
  readonly stale: boolean
}

/** Product-neutral change semantics exposed to SDK and agent consumers. */
export type UnitComparisonContextDiffKind = `${IUnitComparisonLeafChange['kind']}`

/**
 * Controls how much changed content is returned for every comparison item.
 *
 * - `summary` keeps entity identities and locations but removes leaf changes and full values.
 * - `changes` returns normalized leaf changes and inline text/formula segments without the
 *   duplicate `item.values` projections. Object insertions/deletions are expanded into readable
 *   leaf paths; scalar or empty values may use an empty path.
 * - `full` additionally returns each product's original projected entity in `item.values`.
 */
export type UnitComparisonContextDetailLevel = `${IUnitComparisonResult['detail']}`

/** Whether the SDK produced a complete comparison or a safe degraded projection. */
export type UnitComparisonReadiness = `${IUnitComparisonResult['diagnostics']['readiness']}`

/** Stable SDK diagnostic codes serialized for agents and UI consumers. */
export type UnitComparisonDiagnosticCode =
  `${IUnitComparisonResult['diagnostics']['codes'][number]}`

/** Coarse value family that lets an agent choose an appropriate explanation or renderer. */
export type UnitComparisonContextValueType = `${IUnitComparisonLeafChange['valueType']}`

/** One side of a character/token diff. Equal spans are retained so consumers can render context. */
export type UnitComparisonContextSegment = Omit<IUnitComparisonTextSegment, 'kind'> & {
  readonly kind: `${IUnitComparisonTextSegment['kind']}`
}

/**
 * One normalized leaf change inside a changed entity. `path` is relative to the parent item, not
 * the Unit root. For example a Slide element may report `["geometry", "x"]`, while a Sheet cell
 * reports `["formula"]`. Insert/delete entities use an empty path to represent the whole entity.
 */
export type UnitComparisonContextChange = Omit<
  IUnitComparisonLeafChange,
  'kind' | 'segments' | 'valueType'
> & {
  readonly kind: UnitComparisonContextDiffKind
  readonly valueType: UnitComparisonContextValueType
  /** Present for comparable text/formula values when the bounded tokenizer can produce hunks. */
  readonly segments?: {
    readonly left: readonly UnitComparisonContextSegment[]
    readonly right: readonly UnitComparisonContextSegment[]
  }
}

/** JSON-friendly view of the SDK-owned product scope reference. */
export type UnitComparisonContextScopeReference = Omit<
  IUnitComparisonScopeReference,
  'entityType'
> & {
  readonly entityType: `${IUnitComparisonScopeReference['entityType']}`
}

export interface UnitComparisonContextQuery {
  /** Independent offset into SDK-owned product context, such as Doc alignment rows. */
  readonly contextOffset?: number
  /** Product context page size, capped at 1000 independently of changed items. */
  readonly contextLimit?: number
  /** Zero-based offset inside the filtered, deterministic item order. */
  readonly offset?: number
  /** Page size, clamped by the semantic comparison service to at most 1000. */
  readonly limit?: number
  /** Keep only the requested symmetric change kinds. */
  readonly kinds?: readonly UnitComparisonContextDiffKind[]
  /** Keep only product entity families advertised by `coverage.supportedEntityTypes`. */
  readonly entityTypes?: readonly string[]
  /** Keep entities contained by this stable Sheet/page/table/record identity. */
  readonly parentStableId?: string
  /** Keep only entities rendered inside this SDK-owned product view scope. */
  readonly scope?: UnitComparisonContextScopeReference
  /** Case-insensitive search across identity, title, paths, details, and returned leaf values. */
  readonly search?: string
  /** Requested response detail. Defaults to `full` for compatibility with the original API. */
  readonly detail?: UnitComparisonContextDetailLevel
  /**
   * Backward-compatible alias: `false` selects `summary`, `true` selects `full`. `detail` wins when
   * both are supplied. New agent integrations should use `detail` explicitly.
   */
  readonly includeValues?: boolean
}

export interface UnitComparisonContextDetail {
  /** Legacy product-specific display label; prefer `changes.path` for programmatic use. */
  readonly label: string
  readonly before?: string | null
  readonly after?: string | null
  readonly kind?: UnitComparisonContextDiffKind | null
}

/** SDK-owned serializable semantic location and product-specific navigation target. */
export type UnitComparisonContextLocation = IUnitComparisonLocation

export interface UnitComparisonContextItem {
  /** Stable diff identity within this pinned comparison and schema version. */
  readonly id: string
  /** Stable product-level identity used for follow-up queries and navigation. */
  readonly stableId: string
  /** Stable identity of the containing Sheet, page, table, or other parent object. */
  readonly parentStableId?: string
  /** SDK-owned worksheet, slide, Base table, or Board page containing this item. */
  readonly scope?: UnitComparisonContextScopeReference
  readonly kind: UnitComparisonContextDiffKind
  /** Product entity family, drawn from `coverage.supportedEntityTypes`. */
  readonly entityType: string
  /** Stable path from the Unit root to the aligned changed entity. */
  readonly path: readonly string[]
  /** Human-readable content or ordinal label; stable identity is always carried separately. */
  readonly title: string
  /** True for an aligned stable entity whose order/position changed. */
  readonly moved: boolean
  /**
   * Product-neutral property changes. These are the preferred source for agent explanations and
   * are also consumed by the Compare UI, so both surfaces describe the same diff.
   */
  readonly changes: readonly UnitComparisonContextChange[]
  readonly details: readonly UnitComparisonContextDetail[]
  /** Null means that the aligned entity is absent on that side. */
  readonly locations: {
    readonly left: UnitComparisonContextLocation | null
    readonly right: UnitComparisonContextLocation | null
  }
  readonly values?: {
    /** Raw product projection; returned only by `detail: "full"`. */
    readonly left?: unknown
    readonly right?: unknown
  }
}

/** SDK-owned compact symmetric row or column alignment run. */
export type UnitComparisonAxisAlignment = IUnitComparisonAxisAlignment

export type UnitComparisonProductContext =
  | {
      readonly kind: 'sheet'
      readonly sheets: readonly {
        readonly id: string
        readonly name: string
        readonly status: UnitComparisonContextDiffKind | 'unchanged'
        readonly changeCount: number
        /** SDK-owned native index runs; never recomputed from mutations by the client. */
        readonly rows?: readonly UnitComparisonAxisAlignment[]
        readonly columns?: readonly UnitComparisonAxisAlignment[]
      }[]
    }
  | {
      readonly kind: 'doc'
      readonly paragraphAlignment: {
        readonly total: number
        readonly page: UnitComparisonContextPage
        /** SDK alignment rows, paged independently from changed items. */
        readonly rows: readonly {
          readonly id: string
          readonly stableId: string
          readonly kind: 'delete' | 'equal' | 'insert' | 'update'
          readonly moved: boolean
          readonly leftIndex: number | null
          readonly rightIndex: number | null
          readonly leftNativeStableId: string | null
          readonly rightNativeStableId: string | null
          readonly segmentPath?: readonly string[]
        }[]
      }
    }
  | { readonly kind: 'slide' }
  | { readonly kind: 'base'; readonly visualProjection: 'raw-table-data' }
  | { readonly kind: 'board' }

export interface UnitComparisonContextSummary {
  /** Total items before query filtering and paging. */
  readonly total: number
  readonly insert: number
  readonly delete: number
  readonly update: number
  readonly moved: number
  readonly byEntityType: Readonly<Record<string, number>>
}

export type UnitComparisonContextPage = IUnitComparisonResult['page']

/** One changed, independently navigable product view reported by Pro History. */
export type UnitComparisonContextScope = Omit<IUnitComparisonScope, 'entityType' | 'kind'> &
  UnitComparisonContextScopeReference & {
    readonly kind: UnitComparisonContextDiffKind
  }

/**
 * Versioned, UI-independent Server API projection of Pro History semantic comparison. The same
 * payload is suitable for CLI clients, agents, and the Compare UI; paths and semantic locations
 * are stable navigation anchors.
 */
export interface UnitComparisonContext {
  readonly schemaVersion: 1
  readonly comparisonId: string
  readonly unit: UnitComparisonSummary
  readonly fidelity: UnitComparisonFidelity
  readonly commonBaseRevision?: number
  readonly stale: boolean
  /** Effective detail projection used to serialize `items`. */
  readonly detail: UnitComparisonContextDetailLevel
  readonly summary: UnitComparisonContextSummary
  readonly coverage: {
    /** Entity families this API version can detect for the Unit product. */
    readonly supportedEntityTypes: readonly string[]
  }
  /** SDK-owned product views used by tabs, trees, and follow-up agent queries. */
  readonly scopes: readonly UnitComparisonContextScope[]
  readonly page: UnitComparisonContextPage
  readonly items: readonly UnitComparisonContextItem[]
  readonly diagnostics: {
    readonly readiness: UnitComparisonReadiness
    readonly unsupportedMutationIds: readonly string[]
    readonly codes: readonly UnitComparisonDiagnosticCode[]
  }
  readonly productContext: UnitComparisonProductContext
}

export interface UnitComparisonContextResponse extends ErrorEnvelope {
  readonly context?: UnitComparisonContext
}
