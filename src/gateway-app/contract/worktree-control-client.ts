import { encodeUniverfile } from "./univerfile.js";
import type {
  CreateWorktreeRequest,
  CreateWorktreeResponse,
  CreateUniverfileResponse,
  DiscardResponse,
  ErrorEnvelope,
  Worktree,
  WorktreeStatus,
  ListWorktreesResponse,
  ListUnitsResponse,
  MergeResponse,
  MergePreviewResponse,
  MergePreviewUnitResponse,
  OptimizeUniverfileRequest,
  OptimizeUniverfileResponse,
  ReadyResponse,
  ReopenResponse,
  UnitSummary,
} from "./types.js";

/** HTTP 层错误(non-2xx),带 status:404=univerfile 不存在、409=已存在、400=寻址非法。 */
export class WorktreeServerHttpError extends Error {
  public readonly status: number;
  public constructor(message: string, status: number) {
    super(message);
    this.name = "WorktreeServerHttpError";
    this.status = status;
  }
}

export type WorktreeControlClientOptions =
  | LocalWorktreeControlClientOptions
  | GatewayKeyWorktreeControlClientOptions;

export interface LocalWorktreeControlClientOptions {
  /** 服务器地址,如 "http://127.0.0.1:8000"。 */
  readonly origin: string;
  /** 目标 .univer 本地绝对路径。 */
  readonly univerfile: string;
  /** 可注入的 fetch(测试 / 自定义);缺省用全局 fetch。 */
  readonly fetch?: typeof fetch;
}

export interface GatewayKeyWorktreeControlClientOptions {
  /** 同源 collab-gateway `/uf/<key>` 中的 file key。 */
  readonly gatewayFileKey: string;
  /** 同源 gateway origin。 */
  readonly origin: string;
  /** 可注入的 fetch(测试 / 自定义);缺省用全局 fetch。 */
  readonly fetch?: typeof fetch;
}

/**
 * net-new worktree 控制面的 typed 客户端(浏览器与 cli 共用)。
 * 只管控制面；读 unit 数据(snapshot/fetchmissing)与实时查看(comb)
 * 不在此(用 buildRuntimeConfig 的输出 + 官方 collaboration-client / snapshot HTTP)。
 */
export class WorktreeControlClient {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;

  public constructor(opts: WorktreeControlClientOptions) {
    this.base =
      "gatewayFileKey" in opts
        ? `${opts.origin}/uf/${opts.gatewayFileKey}`
        : `${opts.origin}/uf/${encodeUniverfile(opts.univerfile)}`;
    this.fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** 低层按地址创建 univerfile `.univer`(`POST /uf/<enc>`);已存在 → HTTP 409。 */
  public createUniverfile(): Promise<CreateUniverfileResponse> {
    return this.postJson<CreateUniverfileResponse>(this.base, {});
  }

  /** Copy-only package optimization. Every optimization pass is explicit in the request. */
  public optimize(req: OptimizeUniverfileRequest): Promise<OptimizeUniverfileResponse> {
    return this.postJson<OptimizeUniverfileResponse>(`${this.base}/optimize`, req);
  }

  /** 列 unit;省略 worktreeId = trunk,给定 = 该 worktree 视角。 */
  public async listUnits(worktreeId?: string): Promise<UnitSummary[]> {
    const seg = worktreeId !== undefined ? `/worktrees/${worktreeId}` : "";
    const res = await this.getJson<ListUnitsResponse>(`${this.base}${seg}/units`);
    return res.units;
  }

  /** univerfile 级 worktree(B-virtual 零拷贝)。 */
  public createWorktree(req: CreateWorktreeRequest = {}): Promise<CreateWorktreeResponse> {
    return this.postJson<CreateWorktreeResponse>(`${this.base}/worktrees`, req);
  }

  public async listWorktrees(query?: { status?: WorktreeStatus }): Promise<Worktree[]> {
    const qs = query?.status !== undefined ? `?status=${encodeURIComponent(query.status)}` : "";
    const res = await this.getJson<ListWorktreesResponse>(`${this.base}/worktrees${qs}`);
    return res.worktrees;
  }

  /** agent 声明完成(draft -> ready)。 */
  public ready(worktreeId: string): Promise<ReadyResponse> {
    return this.postJson<ReadyResponse>(`${this.base}/worktrees/${worktreeId}/ready`, {});
  }

  /** 用户反馈后显式恢复编辑(ready -> draft)。 */
  public reopen(worktreeId: string): Promise<ReopenResponse> {
    return this.postJson<ReopenResponse>(`${this.base}/worktrees/${worktreeId}/reopen`, {});
  }

  /** 合入 trunk(可能返回 conflict)。 */
  public merge(worktreeId: string): Promise<MergeResponse> {
    return this.postJson<MergeResponse>(`${this.base}/worktrees/${worktreeId}/merge`, {});
  }

  public discard(worktreeId: string): Promise<DiscardResponse> {
    return this.postJson<DiscardResponse>(`${this.base}/worktrees/${worktreeId}/discard`, {});
  }

  /** 只读合并预览摘要(每 unit 状态 + mergeable/diverged)。 */
  public previewMerge(worktreeId: string): Promise<MergePreviewResponse> {
    return this.getJson<MergePreviewResponse>(`${this.base}/worktrees/${worktreeId}/preview`);
  }

  /** 单个 unit 的只读合并预览渲染数据(snapshot + changesets,sheet 含 sheetBlocks)。 */
  public getMergePreviewUnit(
    worktreeId: string,
    unitId: string,
  ): Promise<MergePreviewUnitResponse> {
    return this.getJson<MergePreviewUnitResponse>(
      `${this.base}/worktrees/${worktreeId}/preview/units/${encodeURIComponent(unitId)}`,
    );
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchFn(url, { headers: { accept: "application/json" } });
    return this.parse<T>(res);
  }

  private async postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  private async parse<T>(res: Response): Promise<T> {
    // HTTP 层错误才抛(带 status);业务层(如 merge conflict 的 ok:false)是正常响应,交给调用方判断。
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as Partial<ErrorEnvelope>;
        if (body.error?.message !== undefined && body.error.message !== "") {
          detail = body.error.message;
        }
      } catch {
        // 非 JSON 响应,保留 statusText。
      }
      throw new WorktreeServerHttpError(detail, res.status);
    }
    return (await res.json()) as T;
  }
}
