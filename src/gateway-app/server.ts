import type { AddressInfo } from "node:net";
import { stat } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";
import sirv from "sirv";
import { createRequestListener } from "./transport/http.js";
import { attachGatewayWebSockets } from "./transport/ws.js";
import type { UniverfileManagerOptions } from "./univerfile-manager.js";
import { UniverfileManager } from "./univerfile-manager.js";

const LOOPBACK_HOST = "127.0.0.1";

export interface StartServerOptions {
  /** TCP port; 0 lets the OS pick. Default 8000. */
  readonly port?: number;
  /** Confine every addressed `univerfile` under this directory. */
  readonly allowedRoot?: string;
  /** Evict univerfiles idle (and with no live connections) after this many ms. */
  readonly idleTtlMs?: number;
  /** Static browser assets served from the same HTTP listener as the Gateway API. */
  readonly viewAssetsRoot?: string;
}

export interface StartedServer {
  readonly manager: UniverfileManager;
  readonly httpServer: http.Server;
  readonly port: number;
  close(): Promise<void>;
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  if (options.viewAssetsRoot !== undefined) {
    await assertViewAssetsRoot(options.viewAssetsRoot);
  }
  const managerOptions: UniverfileManagerOptions = {
    ...(options.allowedRoot === undefined ? {} : { allowedRoot: options.allowedRoot }),
    ...(options.idleTtlMs === undefined ? {} : { idleTtlMs: options.idleTtlMs }),
  };
  const manager = new UniverfileManager(managerOptions);
  const apiRequestListener = createRequestListener(manager);
  const httpServer = http.createServer(
    createGatewayRequestListener(apiRequestListener, options.viewAssetsRoot),
  );
  const wss = attachGatewayWebSockets(httpServer, manager);

  const port = await listen(httpServer, options.port ?? 8000);

  return {
    manager,
    httpServer,
    port,
    // Force-close: viewer pages hold long-lived event/comb sockets that never end on their
    // own; shutdown must not wait for clients to disconnect.
    close: async () => {
      wss.close();
      for (const client of wss.clients) {
        client.terminate();
      }
      // Runtime disposal closes SDK-owned upgraded sockets before waiting for the HTTP server.
      await manager.dispose();
      await new Promise<void>((resolveClose) => {
        httpServer.close(() => resolveClose());
        httpServer.closeAllConnections();
      });
    },
  };
}

async function assertViewAssetsRoot(viewAssetsRoot: string): Promise<void> {
  const root = resolve(viewAssetsRoot);
  const indexStat = await stat(resolve(root, "index.html"));
  if (!indexStat.isFile()) {
    throw new Error(`Gateway view assets root is missing index.html: ${viewAssetsRoot}`);
  }
  const assetsStat = await stat(resolve(root, "assets"));
  if (!assetsStat.isDirectory()) {
    throw new Error(`Gateway view assets root is missing assets directory: ${viewAssetsRoot}`);
  }
}

function createGatewayRequestListener(
  apiRequestListener: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  viewAssetsRoot: string | undefined,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
  const serveViewAsset =
    viewAssetsRoot === undefined ? undefined : createViewAssetHandler(viewAssetsRoot);
  return (req, res): void => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (isGatewayApiPath(pathname) || (req.method ?? "GET") === "OPTIONS") {
      apiRequestListener(req, res);
      return;
    }

    const method = req.method ?? "GET";
    if (serveViewAsset === undefined || (method !== "GET" && method !== "HEAD")) {
      sendStaticNotFound(res);
      return;
    }
    serveViewAsset(req, res, () => sendStaticNotFound(res));
  };
}

function createViewAssetHandler(
  viewAssetsRoot: string,
): (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void {
  return sirv(viewAssetsRoot, {
    etag: true,
    // Bundled assets carry a content hash in their filename, so they never change in place.
    immutable: true,
    maxAge: 31536000,
    setHeaders: (res, pathname) => {
      // index.html must revalidate to pick up new asset hashes after a redeploy.
      if (!pathname.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  });
}

function isGatewayApiPath(pathname: string): boolean {
  return pathname === "/uf" || pathname.startsWith("/uf/");
}

function sendStaticNotFound(res: http.ServerResponse): void {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    const onListening = (): void => {
      const address = server.address() as AddressInfo | null;
      resolve(address?.port ?? port);
    };
    server.listen(port, LOOPBACK_HOST, onListening);
  });
}
