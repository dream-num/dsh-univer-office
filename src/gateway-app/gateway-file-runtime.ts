import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
  MemorySessionTicketStore,
  UniverCollabEndpoint,
} from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import {
  createNodeTransport,
  type INodeTransport,
  type NodeTransportEndpoint,
  type NodeWebSocketEndpointContext,
  type NodeWebSocketHandler,
} from "@univerjs-pro/collaboration-transport-node";
import { UniverCollabWorktreeEndpoint } from "@univerjs-pro/collaboration-worktree-endpoint";
import { UniverCollabWorktreeService } from "@univerjs-pro/collaboration-worktree-service";
import {
  createUniverfileSQLite,
  openUniverfileSQLite,
  type UniverfileSQLite,
  type UniverfileSQLiteAssetStore,
  type UniverfileSQLiteDatabaseAdapter,
  type UniverfileUpgradeResult,
  type UniverfileSQLiteWorktreeDatabaseAdapter,
} from './univerfile-sqlite';

export interface GatewayFileRuntimeOptions {
  /** `.univer` SQLite filename, or `:memory:` for tests. */
  readonly dbPath?: string;
  readonly create?: boolean;
}

/**
 * One file's complete Collaboration SDK stack.
 *
 * The gateway owns the adapters, while the SDK owns OT, snapshots, Worktree state transitions,
 * protocol endpoints and Comb connections.
 */
export class GatewayFileRuntime {
  public readonly trunkAdapter: UniverfileSQLiteDatabaseAdapter;
  public readonly worktreeAdapter: UniverfileSQLiteWorktreeDatabaseAdapter;
  public readonly assetStore: UniverfileSQLiteAssetStore;
  public readonly upgrade: UniverfileUpgradeResult;
  public readonly trunkService: UniverCollabService;
  public readonly worktreeService: UniverCollabWorktreeService;

  private readonly _univerfile: UniverfileSQLite;
  private readonly _ticketStore: MemorySessionTicketStore;
  private readonly _trunkEndpoint: UniverCollabEndpoint;
  private readonly _worktreeEndpoint: UniverCollabWorktreeEndpoint;
  private readonly _transport: INodeTransport;
  private readonly _connectionIds = new Set<string>();
  private _disposed = false;

  public constructor(options: GatewayFileRuntimeOptions = {}) {
    const filename = options.dbPath ?? ":memory:";
    this._univerfile =
      filename === ":memory:" || options.create === true
        ? createUniverfileSQLite(filename)
        : openUniverfileSQLite(filename);
    try {
      this.upgrade = this._univerfile.upgrade;
      this.trunkAdapter = this._univerfile.databaseAdapter;
      this.worktreeAdapter = this._univerfile.worktreeDatabaseAdapter;
      this.assetStore = this._univerfile.assetStore;

      this.trunkService = new UniverCollabService({
        dbAdapter: this.trunkAdapter,
      });
      this.worktreeService = new UniverCollabWorktreeService({
        trunk: {
          service: this.trunkService,
          dbAdapter: this.trunkAdapter,
        },
        dbAdapter: this.worktreeAdapter,
      });
      this._ticketStore = new MemorySessionTicketStore();
      this._trunkEndpoint = new UniverCollabEndpoint(this.trunkService, {
        ticketStore: this._ticketStore,
      });
      this._worktreeEndpoint = new UniverCollabWorktreeEndpoint(this.worktreeService, {
        ticketStore: this._ticketStore,
      });
      this._transport = createNodeTransport();

      this._transport.use(async (context, next) => {
        context.userID = headerValue(context.incomingMessage.headers["x-user-id"]);
        context.customData.gateway = { userId: context.userID };
        await next();
      });
      this._transport.register(
        trackEndpointConnections(this._worktreeEndpoint, this._connectionIds),
      );
      this._transport.register(trackEndpointConnections(this._trunkEndpoint, this._connectionIds));
      this._transport.use(async (context) => {
        if (!context.response.writableEnded) {
          context.response.writeHead(404, {
            "content-type": "application/json",
          });
          context.response.end(
            JSON.stringify({
              error: {
                code: 0,
                message: `no SDK route for ${context.incomingMessage.method ?? "GET"} ${
                  context.incomingMessage.url ?? "/"
                }`,
              },
            }),
          );
        }
      });
      this._transport.useUpgrade(async (context) => {
        context.reject(404, "Unknown collaboration endpoint");
      });
    } catch (error) {
      void this._univerfile.dispose();
      throw error;
    }
  }

  /**
   * Dispatch an already-addressed gateway request into the SDK after replacing the `/uf/<key>`
   * compatibility path with the SDK-native protocol path.
   */
  public handleRequest(request: IncomingMessage, response: ServerResponse, sdkUrl: string): void {
    this._assertRunning();
    request.url = sdkUrl;
    this._transport.handleRequest(request, response);
  }

  /** Dispatch a Comb/worktree WebSocket upgrade into the SDK Node Transport. */
  public handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    sdkUrl: string,
  ): void {
    this._assertRunning();
    request.url = sdkUrl;
    this._transport.handleUpgrade(request, socket, head);
  }

  public async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    await this._transport.dispose();
    await this.worktreeService.dispose();
    await this.trunkService.dispose();
    await this._ticketStore.dispose();
    await this._univerfile.dispose();
    this._connectionIds.clear();
  }

  public hasConnections(): boolean {
    return this._connectionIds.size > 0;
  }

  private _assertRunning(): void {
    if (this._disposed) {
      throw new Error("GatewayFileRuntime is disposed");
    }
  }
}

function trackEndpointConnections(
  endpoint: NodeTransportEndpoint,
  connectionIds: Set<string>,
): NodeTransportEndpoint {
  return {
    ...(endpoint.handleHttp === undefined
      ? {}
      : { handleHttp: endpoint.handleHttp.bind(endpoint) }),
    ...(endpoint.handleUpgrade === undefined
      ? {}
      : {
          handleUpgrade: async (context: NodeWebSocketEndpointContext, next): Promise<void> => {
            await endpoint.handleUpgrade!(withTrackedConnection(context, connectionIds), next);
          },
        }),
    ...(endpoint.dispose === undefined ? {} : { dispose: endpoint.dispose.bind(endpoint) }),
  };
}

function withTrackedConnection(
  context: NodeWebSocketEndpointContext,
  connectionIds: Set<string>,
): NodeWebSocketEndpointContext {
  return {
    incomingMessage: context.incomingMessage,
    customData: context.customData,
    reject: context.reject.bind(context),
    accept(handler: NodeWebSocketHandler): void {
      context.accept({
        async open(openContext): Promise<void> {
          connectionIds.add(openContext.connection.id);
          try {
            await handler.open?.(openContext);
          } catch (error) {
            connectionIds.delete(openContext.connection.id);
            throw error;
          }
        },
        async message(messageContext): Promise<void> {
          await handler.message?.(messageContext);
        },
        async close(closeContext): Promise<void> {
          try {
            await handler.close?.(closeContext);
          } finally {
            connectionIds.delete(closeContext.connection.id);
          }
        },
      });
    },
  };
}

function headerValue(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") {
    return value.trim() || "local";
  }
  return value?.[0]?.trim() || "local";
}
