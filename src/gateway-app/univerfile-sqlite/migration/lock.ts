import { mkdirSync, rmdirSync } from "node:fs";
import { UniverfileSQLiteError } from "../errors.js";

const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));

export function withUniverfileUpgradeLock<T>(
  filename: string,
  timeoutMs: number,
  operation: () => T,
): T {
  const lockPath = `${filename}.upgrade.lock`;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (!isExists(error)) throw error;
      if (Date.now() >= deadline) {
        throw new UniverfileSQLiteError(
          "UPGRADE_LOCK_TIMEOUT",
          `timed out waiting for .univer upgrade lock: ${filename}`,
          { cause: error },
        );
      }
      Atomics.wait(WAIT_BUFFER, 0, 0, Math.min(50, Math.max(1, deadline - Date.now())));
    }
  }

  try {
    return operation();
  } finally {
    rmdirSync(lockPath);
  }
}

function isExists(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "EEXIST"
  );
}
