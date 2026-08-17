import process from "node:process";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8000);
  const allowedRoot = process.env.ALLOWED_ROOT;
  const idleTtlMs =
    process.env.IDLE_TTL_MS === undefined ? undefined : Number(process.env.IDLE_TTL_MS);

  const server = await startServer({
    port,
    ...(allowedRoot === undefined ? {} : { allowedRoot }),
    ...(idleTtlMs === undefined ? {} : { idleTtlMs }),
  });

  const origin = `http://127.0.0.1:${server.port}`;
  const wsOrigin = `ws://127.0.0.1:${server.port}`;
  process.stdout.write(
    `[ucb-server] listening on ${origin}${
      allowedRoot === undefined ? "" : `  (allowedRoot: ${allowedRoot})`
    }\n` +
      `  addressing: every request carries /uf/<base64url(univerfile)>; no default file\n` +
      `  create:   POST ${origin}/uf/<enc>\n` +
      `  units:    GET ${origin}/uf/<enc>/units\n` +
      `  snapshot: ${origin}/uf/<enc>/universer-api/snapshot\n` +
      `  comb:     ${origin}/uf/<enc>/universer-api/comb\n` +
      `  ws:       ${wsOrigin}/uf/<enc>/universer-api/comb/connect\n` +
      `  enc:      node -e 'process.stdout.write(Buffer.from("/abs/book.univer").toString("base64url"))'\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`[ucb-server] failed to start: ${String(error)}\n`);
  process.exitCode = 1;
});
