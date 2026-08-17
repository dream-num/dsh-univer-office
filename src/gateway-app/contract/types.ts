// API 契约类型(net-new 控制面)。Pro 兼容面(snapshot/comb)的 req/res 复用 @univerjs/protocol,
// 不在此定义;modify 的 mutations 在契约里保持不透明(unknown[]),由 server/cli 用真实类型构造。

/** Gateway-owning business failures carried alongside the numeric SDK error code. */
export enum GatewaySemanticErrorCode {
  OptimizeHistoryActiveWorktrees = "OPTIMIZE_HISTORY_ACTIVE_WORKTREES",
}

/** 统一错误信封;所有响应都带。code:1=OK,0=fail(snapshot 类透传 SDK ErrorCode)。 */
export interface ErrorEnvelope {
  error: {
    code: number;
    message: string;
    semanticCode?: GatewaySemanticErrorCode;
    details?: unknown;
  };
}

// unit 类型号 = @univerjs/core `UniverInstanceType`(= @univerjs/protocol `UniverType`)的数字值。
// 作为本地字面量保持共享契约零运行时依赖;这些是冻结的 wire 值。注意 4 = PROJECT(跳过)。
export const UNIT_TYPE_DOC = 1;
export const UNIT_TYPE_SHEET = 2;
export const UNIT_TYPE_SLIDE = 3;
/** base(多维表)= 5。注意 4 = PROJECT(跳过)。 */
export const UNIT_TYPE_BASE = 5;
/** board（无限画板）= 6。 */
export const UNIT_TYPE_BOARD = 6;

/** 当前网关支持的 unit 类型号(doc / sheet / slide / base / board)。 */
export type UnitType = 1 | 2 | 3 | 5 | 6;

/** 当前支持的类型集合(运行时校验用)。 */
export const SUPPORTED_UNIT_TYPES: readonly UnitType[] = [
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
];

/** 是否为当前网关支持的 unit 类型。 */
export function isSupportedUnitType(type: number): type is UnitType {
  return (
    type === UNIT_TYPE_DOC ||
    type === UNIT_TYPE_SHEET ||
    type === UNIT_TYPE_SLIDE ||
    type === UNIT_TYPE_BASE ||
    type === UNIT_TYPE_BOARD
  );
}

/** worktree 生命周期状态。 */
export type WorktreeStatus = "draft" | "ready" | "merged" | "discarded";

export interface UnitSummary {
  unitId: string;
  type: UnitType;
  name: string;
  headRev: number;
}

export interface ListUnitsResponse extends ErrorEnvelope {
  units: UnitSummary[];
}

export interface Worktree {
  worktreeId: string;
  status: WorktreeStatus;
  agentId: string;
  name: string;
  /** worktree 时各 unit 的基线版本:unitId -> worktreeRev。 */
  baseline: Record<string, number>;
  createdAt: string;
  mergedAt?: string;
}

export interface CreateWorktreeRequest {
  agentId?: string;
  name?: string;
}

export interface CreateWorktreeResponse extends ErrorEnvelope {
  worktreeId: string;
  baseline: Record<string, number>;
  status: WorktreeStatus;
}

export interface ListWorktreesResponse extends ErrorEnvelope {
  worktrees: Worktree[];
}

export type ReadyResponse =
  | (ErrorEnvelope & { ok: true; status: "ready"; worktree: Worktree })
  | (ErrorEnvelope & { ok: false });

export interface ReopenResponse extends ErrorEnvelope {
  ok: true;
  status: "draft";
}

/** merge 成功或结构冲突(冲突是正常响应,不是 HTTP 错误)。 */
export type MergeResponse =
  | (ErrorEnvelope & { ok: true; mergedRevs: Record<string, number> })
  | (ErrorEnvelope & { ok: false; conflict: true; failedUnit: string });

export interface DiscardResponse extends ErrorEnvelope {
  ok: true;
}

/** 低层按地址创建 univerfile 的响应;已存在 → HTTP 409,不存在的查询 → HTTP 404。 */
export interface CreateUniverfileResponse extends ErrorEnvelope {}

export type OptimizeUniverfileImages = "externalize";
export type OptimizeUniverfileWorktrees = "clean";
export type OptimizeUniverfileHistory = "reset";

export type OptimizeHistoryActiveWorktreeDetails = {
  readonly activeWorktrees: readonly {
    readonly worktreeId: string;
    readonly status: string;
    readonly name: string;
  }[];
};

export interface OptimizeUniverfileRequest {
  /** Absolute local output path. Required unless dryRun is true. */
  outputPath?: string;
  images?: OptimizeUniverfileImages;
  worktrees?: OptimizeUniverfileWorktrees;
  history?: OptimizeUniverfileHistory;
  dryRun: boolean;
}

export interface OptimizeUniverfileReport {
  sourcePath: string;
  outputPath?: string;
  dryRun: boolean;
  beforeBytes: number;
  afterBytes?: number;
  images: {
    selected: boolean;
    references: number;
    uniqueBlobs: number;
    sourceBytes: number;
    storedBytes: number;
  };
  worktrees: {
    mode: "preserve" | OptimizeUniverfileWorktrees;
    impliedByHistory: boolean;
    removedWorktrees: number;
  };
  history: {
    mode: "preserve" | OptimizeUniverfileHistory;
    resetUnits: number;
    removedSnapshots: number;
    removedChangesets: number;
  };
}

export interface OptimizeUniverfileResponse extends ErrorEnvelope {
  ok: true;
  report: OptimizeUniverfileReport;
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
  | { type: "worktree"; worktree: Worktree }
  | { type: "reset"; worktreeId: string; units?: string[] }
  | { type: "unit_added"; unitId: string; unitType: UnitType; name: string }
  | { type: "unit_updated"; unitId: string; name: string; headRev: number }
  | { type: "unit_removed"; unitId: string };

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
export type MergeUnitStatus = "created" | "modified" | "deleted" | "unchanged" | "conflict";

/** 合并预览里单个 unit 的状态摘要。 */
export interface MergeUnitPreview {
  unitId: string;
  type: UnitType;
  name: string;
  status: MergeUnitStatus;
  /** worktree 冻结的基线版本(created 无)。 */
  baseRev?: number;
  /** 该 unit 当前的最新版本 head(created 无)。 */
  trunkRev?: number;
  /** trunkRev > baseRev,即"我没改但最新版本改过它",基版本已过期。 */
  baseStale: boolean;
}

/** 合并预览摘要(`GET /uf/<enc>/worktrees/<id>/preview`)。 */
export interface MergePreview {
  worktreeId: string;
  /** 无 conflict 单元 → 此刻 merge 会成功。 */
  mergeable: boolean;
  /** 至少一个 unit baseStale,即 worktree 已落后最新版本。 */
  diverged: boolean;
  units: MergeUnitPreview[];
  /** status === "conflict" 的 unitId 列表。 */
  conflicts: string[];
}

export interface MergePreviewResponse extends ErrorEnvelope, MergePreview {}

/**
 * 单个 unit 的合并预览渲染数据(`GET /uf/<enc>/worktrees/<id>/preview/units/<unitId>`)。
 * snapshot / changesets / sheetBlocks 在契约里保持不透明(协议形态);只有 sheet 带 sheetBlocks。
 * 客户端按类型用反向 transform 还原引擎数据并回放 changesets,只读渲染。
 */
export interface MergePreviewUnitResponse extends ErrorEnvelope {
  type: UnitType;
  /** 渲染基准 snapshot(协议 ISnapshot);冲突单元为最新版本 snapshot。 */
  snapshot?: unknown;
  /** sheet 的 sheet blocks(内联);doc/slide 省略。 */
  sheetBlocks?: unknown[];
  /** 叠加在 snapshot 上的 changesets(协议形态);冲突单元仅含最新版本到 head 的部分。 */
  changesets: unknown[];
}
