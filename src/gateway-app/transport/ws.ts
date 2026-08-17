import type { IncomingMessage, Server } from "node:http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { Univerfile, UniverfileManager } from "../univerfile-manager.js";

/** The comb WS path tail after the `/uf/<enc>` (or `/uf/<enc>/worktrees/<worktreeId>`) prefix. */
const COMB_TAIL = ["universer-api", "comb", "connect"] as const;

/** The lifecycle-events WS path tail after the same prefixes. */
const EVENTS_TAIL = "events";

const DEFAULT_EVENTS_HEARTBEAT_MS = 15_000;

export interface AttachGatewayWebSocketsOptions {
  /** Lifecycle-events ping interval; a connection missing two pongs is terminated. */
  readonly eventsHeartbeatMs?: number;
}

type ResolvedUpgrade =
  | { kind: "comb"; univerfile: Univerfile; sdkUrl: string }
  | { kind: "events"; univerfile: Univerfile; channel: string };

/**
 * Attach the gateway WebSocket endpoints on one shared upgrade handler:
 *  - comb at `/uf/<enc>[/worktrees/<worktreeId>]/universer-api/comb/connect` — presence/changeset
 *    relay, routed into that file's rooms (cross-file isolation); the optional
 *    `/worktrees/<worktreeId>` scopes its rooms to that worktree (trunk vs worktree isolation).
 *  - lifecycle events at `/uf/<enc>[/worktrees/<worktreeId>]/events` — server→client
 *    `WorktreeLifecycleEvent` JSON messages from that univerfile's EventHub ("" = univerfile
 *    channel, else the worktree channel).
 * We upgrade manually (`noServer`) and destroy sockets without a valid prefix / known tail.
 */
export function attachGatewayWebSockets(
  server: Server,
  manager: UniverfileManager,
  options: AttachGatewayWebSocketsOptions = {},
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.eventsHeartbeatMs ?? DEFAULT_EVENTS_HEARTBEAT_MS;

  server.on("upgrade", (req, socket, head) => {
    const resolved = resolveUpgrade(req, manager);
    if (resolved === null) {
      socket.destroy();
      return;
    }
    if (resolved.kind === "comb") {
      resolved.univerfile.collab.handleSdkUpgrade(req, socket, head, resolved.sdkUrl);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      setupEventsConnection(ws, resolved.univerfile, resolved.channel, heartbeatMs);
    });
  });

  return wss;
}

function resolveUpgrade(req: IncomingMessage, manager: UniverfileManager): ResolvedUpgrade | null {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const segments = pathname.split("/").filter((part) => part.length > 0);
  if (segments[0] !== "uf") {
    return null;
  }
  const enc = segments[1] ?? "";
  // After the `/uf/<enc>` prefix, the rest is either a known tail (trunk) or
  // `worktrees/<worktreeId>` + a known tail.
  let rest = segments.slice(2);
  let worktreeId = "";
  if (rest[0] === "worktrees") {
    worktreeId = rest[1] ?? "";
    rest = rest.slice(2);
    if (worktreeId.length === 0) {
      return null;
    }
  }
  const isComb = rest.length === COMB_TAIL.length && COMB_TAIL.every((seg, i) => rest[i] === seg);
  const isEvents = rest.length === 1 && rest[0] === EVENTS_TAIL;
  if (!isComb && !isEvents) {
    return null;
  }
  try {
    const univerfile = manager.resolveByKey(enc);
    if (
      worktreeId.length > 0 &&
      univerfile.collab.worktrees.getWorktree(worktreeId) === undefined
    ) {
      return null;
    }
    if (!isComb) {
      return { kind: "events", univerfile, channel: worktreeId };
    }
    const search = new URL(req.url ?? "/", "http://localhost").search;
    return {
      kind: "comb",
      univerfile,
      sdkUrl:
        worktreeId.length === 0
          ? `/universer-api/comb/connect${search}`
          : `/universer-api/worktrees/${encodeURIComponent(worktreeId)}/comb/connect${search}`,
    };
  } catch {
    return null;
  }
}

/**
 * Lifecycle-events connection: push-only JSON `WorktreeLifecycleEvent` messages. Server pings
 * every `heartbeatMs`; a peer missing two consecutive pongs is terminated so dead connections
 * release their subscription (which also unblocks idle eviction and shutdown).
 */
function setupEventsConnection(
  ws: WebSocket,
  univerfile: Univerfile,
  channel: string,
  heartbeatMs: number,
): void {
  const unsubscribe = univerfile.events.subscribe(channel, {
    write: (event) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    },
  });
  let alive = true;
  ws.on("pong", () => {
    alive = true;
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, heartbeatMs);
  heartbeat.unref();
  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}
