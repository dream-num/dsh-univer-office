import { encodeUniverfile } from "./univerfile.js";

export type RuntimeConfigInput = LocalRuntimeConfigInput | GatewayKeyRuntimeConfigInput;

export interface LocalRuntimeConfigInput {
  /** 唯一必配项,如 "http://127.0.0.1:8000"。 */
  readonly origin: string;
  /** WS 源;缺省由 origin 推导(http->ws / https->wss)。 */
  readonly wsOrigin?: string;
  /** .univer 本地绝对路径。 */
  readonly univerfile: string;
  /** 给定 = 看 worktree;省略 = 看 trunk。 */
  readonly worktreeId?: string;
}

export interface GatewayKeyRuntimeConfigInput {
  /** 同源 collab-gateway `/uf/<key>` 中的 file key。 */
  readonly gatewayFileKey: string;
  /** 同源 gateway origin。 */
  readonly origin: string;
  /** WS 源;缺省由 origin 推导(http->ws / https->wss)。 */
  readonly wsOrigin?: string;
  /** 给定 = 看 worktree;省略 = 看 trunk。 */
  readonly worktreeId?: string;
}

/** collaboration-client 需要的各 base URL。 */
export interface RuntimeConfigUrls {
  snapshotServerUrl: string;
  collabSubmitChangesetUrl: string;
  collabWebSocketUrl: string;
  wsSessionTicketUrl: string;
  authzUrl: string;
  downloadEndpointUrl: string;
  uploadFileServerUrl: string;
  signUrlServerUrl: string;
  getTaskServerUrl: string;
  importServerUrl: string;
  exportServerUrl: string;
}

function toWsOrigin(origin: string): string {
  return origin.replace(/^http/, "ws");
}

/**
 * 拼出 collaboration-client 各 base URL(trunk 或 worktree)。
 * trunk:  ${origin}/uf/<enc>
 * worktree:   ${origin}/uf/<enc>/worktrees/<worktreeId>
 */
export function buildRuntimeConfig(input: RuntimeConfigInput): RuntimeConfigUrls {
  const origin = input.origin.replace(/\/+$/u, "");
  const worktreeSeg = input.worktreeId !== undefined ? `/worktrees/${input.worktreeId}` : "";
  const fileKey =
    "gatewayFileKey" in input ? input.gatewayFileKey : encodeUniverfile(input.univerfile);
  const baseRoot = `${origin}/uf/${fileKey}`;
  const wsRoot = `${input.wsOrigin ?? toWsOrigin(origin)}/uf/${fileKey}`;
  const base = `${baseRoot}${worktreeSeg}`;
  const wsBase = `${wsRoot}${worktreeSeg}`;
  return {
    snapshotServerUrl: `${base}/universer-api/snapshot`,
    collabSubmitChangesetUrl: `${base}/universer-api/comb`,
    collabWebSocketUrl: `${wsBase}/universer-api/comb/connect`,
    wsSessionTicketUrl: `${base}/universer-api/user/session-ticket`,
    authzUrl: `${base}/universer-api/authz`,
    // Signed exchange URLs are Gateway-root-relative (`/uf/<key>/...`). Univer resolves
    // them against this base path, so using the file-scoped API path would duplicate it.
    downloadEndpointUrl: `${origin}/`,
    uploadFileServerUrl: `${base}/universer-api/stream/file/upload`,
    signUrlServerUrl: `${base}/universer-api/file/{fileID}/sign-url`,
    getTaskServerUrl: `${base}/universer-api/exchange/task/{taskID}`,
    importServerUrl: `${base}/universer-api/exchange/{type}/import`,
    exportServerUrl: `${base}/universer-api/exchange/{type}/export`,
  };
}
