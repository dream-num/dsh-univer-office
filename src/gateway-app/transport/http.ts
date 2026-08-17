import type { IncomingMessage, ServerResponse } from "node:http";
import Busboy from "busboy";
import type { ISnapshot } from "@univerjs/protocol";
import {
  GATEWAY_CAPABILITIES,
  GATEWAY_DESCRIPTOR_CONTENT_TYPE,
  GATEWAY_PROTOCOL_VERSION,
  isGatewayDescriptorContentType,
  type ErrorEnvelope,
  type OptimizeUniverfileRequest,
  type UnitType,
} from "../contract";
import { CollabGatewayAssetScopeNotFoundError } from "../assets/errors.js";
import { GatewaySemanticError } from "../errors.js";
import { optimizeUniverfilePath } from "../optimization/univerfile-optimizer.js";
import { MAX_UNIVERFILE_ASSET_BYTES } from "../univerfile-sqlite";
import type { Univerfile, UniverfileManager } from "../univerfile-manager.js";
import {
  UniverfileError,
  UniverfileExistsError,
  UniverfileNotFoundError,
} from "../univerfile-manager.js";
const SHEET_TYPE = 2;

type RouteParams = Record<string, string>;
type RouteHandler = (
  univerfile: Univerfile,
  params: RouteParams,
  query: URLSearchParams,
  body: unknown,
  res: ServerResponse,
) => Promise<void> | void;

interface Route {
  readonly method: string;
  readonly parts: readonly string[];
  readonly handler: RouteHandler;
}

/** Gateway-only compatibility routes; remaining `universer-api` paths go to the SDK Endpoint. */
const ROUTES: readonly Route[] = [
  {
    method: "POST",
    parts: split("universer-api/snapshot/:type/unit/-/create"),
    handler: async (univerfile, p, _q, body, res) => {
      try {
        const payload = body as { name?: string; unitID?: string } | undefined;
        const created = await univerfile.collab.createUnit(numType(p.type), {
          ...(payload?.name === undefined ? {} : { name: payload.name }),
          ...(payload?.unitID === undefined ? {} : { unitId: payload.unitID }),
        });
        sendJson(res, 200, {
          error: { code: 1, message: "" },
          unitID: created.unitId,
          ...(created.sheetOrder === undefined ? {} : { sheetOrder: created.sheetOrder }),
        });
      } catch (error) {
        sendJson(res, 200, { error: toErrorDetail(error) });
      }
    },
  },
  {
    method: "GET",
    parts: split("units"),
    handler: (univerfile, _p, _q, _b, res) => {
      sendJson(res, 200, { error: { code: 1, message: "" }, units: univerfile.collab.listUnits() });
    },
  },
];

/**
 * Build a node:http request listener for the `/uf/<enc>`-addressed server (no express).
 * Requests without the prefix get `404` (there is no default file).
 */
export function createRequestListener(
  manager: UniverfileManager,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req: IncomingMessage, res: ServerResponse): void => {
    applyCors(req, res);
    if ((req.method ?? "GET") === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    void dispatch(manager, req, res);
  };
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader(
    "access-control-allow-headers",
    req.headers["access-control-request-headers"] ?? "content-type, x-user-id, authorization",
  );
  res.setHeader("access-control-expose-headers", "content-type");
  res.setHeader("access-control-max-age", "86400");
}

async function dispatch(
  manager: UniverfileManager,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const segments = splitPath(url.pathname);

    if (segments.length < 2 || segments[0] !== "uf") {
      sendJson(res, 404, { error: { code: 0, message: `no route for ${method} ${url.pathname}` } });
      return;
    }

    const key = segments[1] ?? "";
    const rest = segments.slice(2);

    // Gateway file descriptor: `GET /uf/<enc>` with collab-gateway Accept.
    // It validates the endpoint address, but does not require the file to exist.
    if (rest.length === 0 && method === "GET" && acceptsGatewayDescriptor(req.headers.accept)) {
      try {
        manager.assertAddressableByKey(key);
        sendGatewayDescriptor(res, key);
      } catch (error) {
        sendUniverfileError(res, error);
      }
      return;
    }

    // Low-level addressed create route. The local CLI chooses the absolute path before calling it.
    if (rest.length === 0 && method === "POST") {
      try {
        manager.createByKey(key);
        sendJson(res, 200, { error: { code: 1, message: "" } });
      } catch (error) {
        sendUniverfileError(res, error);
      }
      return;
    }

    if (rest.length === 1 && rest[0] === "optimize" && method === "POST") {
      try {
        const sourcePath = manager.resolveExistingPathByKey(key);
        const input = parseOptimizeRequest(await readJsonBody(req));
        const outputPath =
          input.outputPath === undefined
            ? undefined
            : manager.prepareNewUniverfilePath(input.outputPath);
        const report = await optimizeUniverfilePath({
          sourcePath,
          ...input,
          ...(outputPath === undefined ? {} : { outputPath }),
        });
        sendJson(res, 200, { error: { code: 1, message: "" }, ok: true, report });
      } catch (error) {
        if (
          error instanceof UniverfileError ||
          error instanceof UniverfileExistsError ||
          error instanceof UniverfileNotFoundError
        ) {
          sendUniverfileError(res, error);
        } else {
          sendJson(res, 200, { error: toErrorDetail(error) });
        }
      }
      return;
    }

    // Every other endpoint requires the univerfile to already exist (never creates).
    let univerfile: Univerfile;
    try {
      univerfile = manager.resolveByKey(key);
    } catch (error) {
      sendUniverfileError(res, error);
      return;
    }

    // Auth stub under the prefix: allow everything under universer-api/authz.
    if (rest[0] === "universer-api" && rest[1] === "authz") {
      sendAllowAllAuthz(res);
      return;
    }

    if (rest[0] === "universer-api") {
      const handled = await handleAssetApi(univerfile, undefined, rest, method, url, req, res);
      if (handled) return;
    }

    // Worktree control plane + worktree-scoped reads: `/uf/<enc>/worktrees[/<worktreeId>/...]`.
    // (`/uf/<enc>/events` is the lifecycle-events WebSocket upgrade, handled in ws.ts.)
    if (rest[0] === "worktrees") {
      await handleWorktrees(univerfile, rest.slice(1), method, url, req, res);
      return;
    }

    for (const route of ROUTES) {
      if (route.method !== method) {
        continue;
      }
      const params = matchParts(route.parts, rest);
      if (params === null) {
        continue;
      }
      const body = method === "POST" ? await readJsonBody(req) : undefined;
      await route.handler(univerfile, params, url.searchParams, body, res);
      return;
    }

    if (rest[0] === "universer-api") {
      univerfile.collab.handleSdkRequest(
        req,
        res,
        `/${rest.map(encodeURIComponent).join("/")}${url.search}`,
      );
      return;
    }

    sendJson(res, 404, { error: { code: 0, message: `no route for ${method} ${url.pathname}` } });
  } catch (error) {
    sendJson(res, 500, { error: toErrorDetail(error) });
  }
}

function parseOptimizeRequest(body: unknown): OptimizeUniverfileRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new UniverfileError("optimize request body must be an object");
  }
  const value = body as Record<string, unknown>;
  if (value.images !== undefined && value.images !== "externalize") {
    throw new UniverfileError("optimize images must be externalize");
  }
  if (value.worktrees !== undefined && value.worktrees !== "clean") {
    throw new UniverfileError("optimize worktrees must be clean");
  }
  if (value.history !== undefined && value.history !== "reset") {
    throw new UniverfileError("optimize history must be reset");
  }
  if (typeof value.dryRun !== "boolean") {
    throw new UniverfileError("optimize dryRun must be a boolean");
  }
  if (value.outputPath !== undefined && typeof value.outputPath !== "string") {
    throw new UniverfileError("optimize outputPath must be a string");
  }
  return {
    ...(value.outputPath === undefined ? {} : { outputPath: value.outputPath }),
    ...(value.images === undefined ? {} : { images: value.images }),
    ...(value.worktrees === undefined ? {} : { worktrees: value.worktrees }),
    ...(value.history === undefined ? {} : { history: value.history }),
    dryRun: value.dryRun,
  };
}

/**
 * Worktree control plane + worktree-scoped reads. `worktreeRest` is the path after `/uf/<enc>/worktrees`.
 * Compatibility control API: createWorktree / listWorktrees (collection), and per-worktree `units` / `commits` /
 * worktree-aware `universer-api` reads. rollback / discard / ready / merge land in later phases.
 */
async function handleWorktrees(
  univerfile: Univerfile,
  worktreeRest: readonly string[],
  method: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const collab = univerfile.collab;

  // Collection: /uf/<enc>/worktrees
  if (worktreeRest.length === 0) {
    if (method === "POST") {
      const body = (await readJsonBody(req)) as { agentId?: string; name?: string } | undefined;
      const worktree = await collab.createWorktree(body?.agentId ?? "", body?.name ?? "");
      univerfile.events.emit("", { type: "worktree", worktree });
      sendJson(res, 200, {
        error: { code: 1, message: "" },
        worktreeId: worktree.worktreeId,
        baseline: worktree.baseline,
        status: worktree.status,
      });
      return;
    }
    if (method === "GET") {
      const status = url.searchParams.get("status") ?? undefined;
      sendJson(res, 200, {
        error: { code: 1, message: "" },
        worktrees: collab.listWorktrees(status),
      });
      return;
    }
    sendJson(res, 404, { error: { code: 0, message: `no worktree route for ${method}` } });
    return;
  }

  const worktreeId = worktreeRest[0] ?? "";
  if (collab.worktrees.getWorktree(worktreeId) === undefined) {
    sendJson(res, 404, { error: { code: 0, message: `worktree ${worktreeId} not found` } });
    return;
  }
  const sub = worktreeRest.slice(1);

  // /uf/<enc>/worktrees/<worktreeId>/units
  if (sub.length === 1 && sub[0] === "units" && method === "GET") {
    sendJson(res, 200, {
      error: { code: 1, message: "" },
      units: collab.worktreeUnits(worktreeId),
    });
    return;
  }

  // /uf/<enc>/worktrees/<worktreeId>/preview — read-only merge preview summary (MergePreview).
  if (sub.length === 1 && sub[0] === "preview" && method === "GET") {
    try {
      const preview = await collab.previewMerge(worktreeId);
      sendJson(res, 200, { error: { code: 1, message: "" }, ...preview });
    } catch (error) {
      sendJson(res, 200, { error: toErrorDetail(error) });
    }
    return;
  }

  // /uf/<enc>/worktrees/<worktreeId>/preview/units/<unitID> — one unit's read-only render data.
  if (sub.length === 3 && sub[0] === "preview" && sub[1] === "units" && method === "GET") {
    try {
      const data = await collab.getMergePreviewUnit(worktreeId, sub[2] ?? "");
      sendJson(res, 200, {
        error: { code: data.error === undefined ? 1 : 0, message: data.error ?? "" },
        type: data.type,
        snapshot: encodeSnapshotForWire(data.snapshot),
        ...(data.sheetBlocks === undefined ? {} : { sheetBlocks: data.sheetBlocks }),
        changesets: data.changesets,
      });
    } catch (error) {
      sendJson(res, 200, { error: toErrorDetail(error), changesets: [] });
    }
    return;
  }

  // (`/uf/<enc>/worktrees/<worktreeId>/events` is the lifecycle-events WebSocket upgrade,
  // handled in ws.ts.)

  // Merge into trunk (atomic; OT rebase). Conflict is a normal response, not an error.
  if (sub.length === 1 && sub[0] === "merge" && method === "POST") {
    try {
      const outcome = await collab.merge(worktreeId);
      if (outcome.ok) {
        for (const u of outcome.addedUnits) {
          univerfile.events.emit("", {
            type: "unit_added",
            unitId: u.unitId,
            unitType: u.type as UnitType,
            name: u.name,
          });
        }
        for (const u of outcome.removedUnits) {
          univerfile.events.emit("", { type: "unit_removed", unitId: u });
        }
        for (const u of outcome.updatedUnits) {
          univerfile.events.emit("", { type: "unit_updated", ...u });
        }
        const worktree = collab.worktrees.getWorktree(worktreeId);
        if (worktree) {
          univerfile.events.emit("", { type: "worktree", worktree });
        }
        sendJson(res, 200, {
          error: { code: 1, message: "" },
          ok: true,
          mergedRevs: outcome.mergedRevs,
        });
      } else {
        sendJson(res, 200, {
          error: { code: 1, message: "" },
          ok: false,
          conflict: true,
          failedUnit: outcome.failedUnit,
        });
      }
    } catch (error) {
      sendJson(res, 200, { error: toErrorDetail(error), ok: false });
    }
    return;
  }

  // Lifecycle: discard / ready / reopen.
  if (
    sub.length === 1 &&
    method === "POST" &&
    (sub[0] === "discard" || sub[0] === "ready" || sub[0] === "reopen")
  ) {
    try {
      if (sub[0] === "discard") {
        await collab.discard(worktreeId);
        const worktree = collab.worktrees.getWorktree(worktreeId);
        if (worktree) {
          univerfile.events.emit("", { type: "worktree", worktree });
        }
        sendJson(res, 200, { error: { code: 1, message: "" }, ok: true });
      } else if (sub[0] === "ready") {
        await readJsonBody(req);
        const r = await collab.ready(worktreeId);
        const { worktree } = r;
        univerfile.events.emit("", { type: "worktree", worktree });
        sendJson(res, 200, {
          error: { code: 1, message: "" },
          ok: true,
          status: r.status,
          worktree,
        });
      } else {
        const r = await collab.reopen(worktreeId);
        const worktree = collab.worktrees.getWorktree(worktreeId);
        if (worktree) {
          univerfile.events.emit("", { type: "worktree", worktree });
        }
        sendJson(res, 200, { error: { code: 1, message: "" }, ok: true, status: r.status });
      }
    } catch (error) {
      sendJson(res, 200, { error: toErrorDetail(error), ok: false });
    }
    return;
  }

  // Worktree-scoped Pro-compatible reads: /uf/<enc>/worktrees/<worktreeId>/universer-api/...
  if (sub[0] === "universer-api") {
    const handled = await handleAssetApi(univerfile, worktreeId, sub, method, url, req, res);
    if (handled) return;
    handleWorktreeUniverApi(univerfile, worktreeId, sub, url, req, res);
    return;
  }

  sendJson(res, 404, { error: { code: 0, message: `no worktree route for ${method}` } });
}

async function handleAssetApi(
  univerfile: Univerfile,
  worktreeId: string | undefined,
  path: readonly string[],
  method: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const isUpload =
    method === "POST" &&
    path.length === 4 &&
    path[1] === "stream" &&
    path[2] === "file" &&
    path[3] === "upload";
  const isFileRead =
    method === "GET" &&
    path.length === 4 &&
    path[1] === "file" &&
    path[2] !== undefined &&
    (path[3] === "sign-url" || path[3] === "content");
  if (!isUpload && !isFileRead) return false;

  try {
    if (isUpload) {
      const intent = validateAssetUploadIntent(url.searchParams);
      const file = await receiveSingleAssetFile(req);
      if (file.bytes.byteLength !== intent.size) {
        throw new AssetHttpError(400, "Uploaded file size does not match size query parameter");
      }
      const stored = univerfile.collab.storeAsset({
        unitId: intent.unitId,
        ...(worktreeId === undefined ? {} : { worktreeId }),
        originalFilename: file.filename,
        mediaType: file.mediaType,
        bytes: file.bytes,
      });
      sendJson(res, 201, { FileId: stored.assetId });
      return true;
    }

    const assetId = decodeURIComponent(path[2] ?? "");
    const opened = univerfile.collab.openAsset(assetId, worktreeId);
    if (opened === null) throw new AssetHttpError(404, "The resource was not found");
    if (path[3] === "sign-url") {
      res.setHeader("cache-control", "private, no-store");
      sendJson(res, 200, {
        error: { code: 1, message: "" },
        url: new URL(
          url.pathname.replace(/\/sign-url$/u, "/content"),
          `http://${req.headers.host ?? "localhost"}`,
        ).href,
      });
      return true;
    }
    if (path[3] !== "content") return false;
    res.writeHead(200, {
      "content-type": opened.record.mediaType,
      "content-length": String(opened.record.byteSize),
      etag: `"${opened.record.digest}"`,
      "content-disposition": contentDisposition(opened.record.originalFilename),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "same-origin",
    });
    res.end(Buffer.from(opened.bytes));
    return true;
  } catch (error) {
    const status =
      error instanceof AssetHttpError
        ? error.status
        : error instanceof CollabGatewayAssetScopeNotFoundError
          ? 404
          : 400;
    sendJson(res, status, { error: toErrorDetail(error) });
    return true;
  }
}

function handleWorktreeUniverApi(
  univerfile: Univerfile,
  worktreeId: string,
  sub: readonly string[],
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const collab = univerfile.collab;

  if (sub[1] === "authz") {
    sendAllowAllAuthz(res);
    return;
  }
  if (sub[1] === "user" && sub[2] === "session-ticket") {
    collab.handleSdkRequest(req, res, `/universer-api/user/session-ticket${url.search}`);
    return;
  }
  const suffix = sub.slice(1).map(encodeURIComponent).join("/");
  collab.handleSdkRequest(
    req,
    res,
    `/universer-api/worktrees/${encodeURIComponent(worktreeId)}/${suffix}${url.search}`,
  );
}

/** Encode the snapshot's byte `originalMeta` fields as base64, which is how the client decodes them. */
export function encodeSnapshotForWire(snapshot: ISnapshot | undefined): ISnapshot | undefined {
  if (snapshot === undefined) {
    return snapshot;
  }
  const enc = (meta: unknown): unknown =>
    meta instanceof Uint8Array ? Buffer.from(meta).toString("base64") : meta;

  // 一个 snapshot 可能带不止一个 meta —— slide 会把文字内容内嵌成 `.doc`,故 `.slide` 与 `.doc` 同在。
  // 因此对**所有存在的 meta** 都编码其二进制 `originalMeta`,绝不在第一个匹配处早返回(早返回会让
  // slide 的 `.slide` 字节因 `.doc` 先命中而漏编)。sheet=workbook,doc=doc,slide=slide(+doc),
  // board=board。
  const out = { ...snapshot } as Record<string, unknown>;

  const doc = (snapshot as { doc?: { originalMeta?: unknown } }).doc;
  if (doc) {
    out.doc = { ...doc, originalMeta: enc(doc.originalMeta) };
  }

  const slide = (snapshot as { slide?: { originalMeta?: unknown } }).slide;
  if (slide) {
    out.slide = { ...slide, originalMeta: enc(slide.originalMeta) };
  }

  const board = (snapshot as { board?: { originalMeta?: unknown } }).board;
  if (board) {
    out.board = { ...board, originalMeta: enc(board.originalMeta) };
  }

  if (snapshot.workbook) {
    const wb = snapshot.workbook;
    const sheets: Record<string, unknown> = {};
    for (const [id, sheet] of Object.entries(wb.sheets ?? {})) {
      sheets[id] = {
        ...sheet,
        originalMeta: enc((sheet as { originalMeta?: unknown }).originalMeta),
      };
    }
    out.workbook = { ...wb, originalMeta: enc(wb.originalMeta), sheets };
  }

  return out as unknown as ISnapshot;
}

function split(template: string): string[] {
  return splitPath(template);
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter((part) => part.length > 0);
}

function matchParts(template: readonly string[], actual: readonly string[]): RouteParams | null {
  if (template.length !== actual.length) {
    return null;
  }
  const params: RouteParams = {};
  for (let i = 0; i < template.length; i++) {
    const t = template[i]!;
    const a = actual[i]!;
    if (t.startsWith(":")) {
      params[t.slice(1)] = decodeURIComponent(a);
    } else if (t !== a) {
      return null;
    }
  }
  return params;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  try {
    const body = await readRequestBody(req);
    return body.length === 0 ? undefined : JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject(new Error("Unable to read request body")));
  });
}

function receiveSingleAssetFile(req: IncomingMessage): Promise<{
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 0, parts: 1, fileSize: MAX_UNIVERFILE_ASSET_BYTES },
      });
    } catch {
      reject(new AssetHttpError(400, "A multipart file field named 'file' is required"));
      return;
    }

    let file:
      | {
          filename: string;
          mediaType: string;
          chunks: Buffer[];
        }
      | undefined;
    let parseError: unknown;
    parser.on("file", (field, stream, info) => {
      if (field !== "file" || file !== undefined) {
        parseError ??= new AssetHttpError(400, "A single multipart file field is required");
        stream.resume();
        return;
      }
      file = {
        filename: info.filename,
        mediaType: info.mimeType || "application/octet-stream",
        chunks: [],
      };
      stream.on("data", (chunk: Buffer) => file?.chunks.push(Buffer.from(chunk)));
      stream.once("limit", () => {
        parseError ??= new AssetHttpError(
          413,
          `Asset exceeds the ${MAX_UNIVERFILE_ASSET_BYTES} byte limit`,
        );
      });
      stream.once("error", (error) => {
        parseError ??= error;
      });
    });
    parser.on("field", () => {
      parseError ??= new AssetHttpError(400, "Multipart fields are not accepted");
    });
    parser.once("error", (error) => {
      parseError ??= error;
    });
    parser.once("close", () => {
      if (parseError !== undefined) {
        reject(parseError);
        return;
      }
      if (file === undefined) {
        reject(new AssetHttpError(400, "A multipart file field named 'file' is required"));
        return;
      }
      const bytes = Buffer.concat(file.chunks);
      resolve({ filename: file.filename, mediaType: file.mediaType, bytes });
    });
    req.once("aborted", () => {
      parseError ??= new AssetHttpError(400, "Asset upload was aborted");
    });
    req.pipe(parser);
  });
}

function validateAssetUploadIntent(query: URLSearchParams): {
  readonly size: number;
  readonly unitId: string;
} {
  if (query.get("source") !== "3") {
    throw new AssetHttpError(400, "source must be UnitEmbedded (3)");
  }
  const rawSize = query.get("size");
  const size = rawSize === null || rawSize.trim() === "" ? Number.NaN : Number(rawSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new AssetHttpError(400, "size must be a non-negative integer");
  }
  if (size > MAX_UNIVERFILE_ASSET_BYTES) {
    throw new AssetHttpError(413, `Asset exceeds the ${MAX_UNIVERFILE_ASSET_BYTES} byte limit`);
  }
  const unitId = query.get("assign");
  if (unitId === null || unitId.length === 0 || unitId.length > 255) {
    throw new AssetHttpError(400, "assign must be a valid Unit ID");
  }
  return { size, unitId };
}

function contentDisposition(filename: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

class AssetHttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  const json = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

function sendGatewayDescriptor(res: ServerResponse, key: string): void {
  res.writeHead(200, { "content-type": GATEWAY_DESCRIPTOR_CONTENT_TYPE, vary: "accept" });
  res.end(
    JSON.stringify({
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      capabilities: GATEWAY_CAPABILITIES,
      viewUrl: `/?file=${encodeURIComponent(key)}`,
    }),
  );
}

function acceptsGatewayDescriptor(accept: string | string[] | undefined): boolean {
  const values = Array.isArray(accept) ? accept : accept === undefined ? [] : [accept];
  return values.some((value) =>
    value.split(",").some((part) => isGatewayDescriptorContentType(part)),
  );
}

function sendAllowAllAuthz(res: ServerResponse): void {
  sendJson(res, 200, { error: { code: 1, message: "" }, actions: [], objectActions: [] });
}

/** Map univerfile addressing errors to HTTP status (400 bad / 404 missing / 409 exists); rethrow others. */
function sendUniverfileError(res: ServerResponse, error: unknown): void {
  if (error instanceof UniverfileExistsError) {
    sendJson(res, 409, { error: toErrorDetail(error) });
    return;
  }
  if (error instanceof UniverfileNotFoundError) {
    sendJson(res, 404, { error: toErrorDetail(error) });
    return;
  }
  if (error instanceof UniverfileError) {
    sendJson(res, 400, { error: toErrorDetail(error) });
    return;
  }
  throw error;
}

function numType(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : SHEET_TYPE;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toErrorDetail(error: unknown): ErrorEnvelope["error"] {
  if (error instanceof GatewaySemanticError) {
    return {
      code: 0,
      message: error.message,
      semanticCode: error.semanticCode,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return { code: 0, message: asMessage(error) };
}
