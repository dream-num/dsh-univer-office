import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { UniverfileSQLiteError } from "../errors.js";

export interface UniverfileBackup {
  readonly path: string;
  readonly sha256: string;
}

export function createUniverfileBackup(
  filename: string,
  sourceFormat: "v0" | "v1",
): UniverfileBackup {
  const backupPath = join(
    dirname(filename),
    `${basename(filename)}.backup-${sourceFormat}-${Date.now()}-${randomUUID()}`,
  );
  try {
    const sourceHash = sha256(filename);
    copyFileSync(filename, backupPath);
    const backupHash = sha256(backupPath);
    if (sourceHash !== backupHash) {
      throw new Error("backup hash does not match source hash");
    }
    return { path: backupPath, sha256: backupHash };
  } catch (error) {
    throw new UniverfileSQLiteError("BACKUP_FAILED", `failed to back up ${filename}`, {
      cause: error,
    });
  }
}

export function sha256(filename: string): string {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}
