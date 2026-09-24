import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { UniverfileSQLiteError } from '../errors.js'

export interface UniverfileBackup {
  readonly path: string
  readonly sha256: string
}

export function createUniverfileBackup(
  filename: string,
  sourceFormat: 'v0' | 'v1' | 'v2'
): UniverfileBackup {
  try {
    const sourceHash = sha256(filename)
    const existing = findMatchingBackup(filename, sourceFormat, sourceHash)
    if (existing !== undefined) return existing
    const backupPath = join(
      dirname(filename),
      `${basename(filename)}.backup-${sourceFormat}-${Date.now()}-${randomUUID()}`
    )
    copyFileSync(filename, backupPath)
    const backupHash = sha256(backupPath)
    if (sourceHash !== backupHash) {
      throw new Error('backup hash does not match source hash')
    }
    return { path: backupPath, sha256: backupHash }
  } catch (error) {
    throw new UniverfileSQLiteError('BACKUP_FAILED', `failed to back up ${filename}`, {
      cause: error
    })
  }
}

/**
 * Reuse a sibling backup of these exact bytes.
 *
 * A failed upgrade leaves the original unchanged, and session cards retry the open. Copying again
 * would leave a new file on every retry.
 */
function findMatchingBackup(
  filename: string,
  sourceFormat: 'v0' | 'v1' | 'v2',
  sourceHash: string
): UniverfileBackup | undefined {
  const directory = dirname(filename)
  const prefix = `${basename(filename)}.backup-${sourceFormat}-`
  const sourceSize = statSync(filename).size
  for (const name of readdirSync(directory)) {
    if (!name.startsWith(prefix)) continue
    const candidate = join(directory, name)
    try {
      const stat = statSync(candidate)
      if (!stat.isFile() || stat.size !== sourceSize) continue
      const hash = sha256(candidate)
      if (hash === sourceHash) return { path: candidate, sha256: hash }
    } catch {
      // This sibling disappeared or cannot be read. Another backup may still match.
      continue
    }
  }
  return undefined
}

export function sha256(filename: string): string {
  return createHash('sha256').update(readFileSync(filename)).digest('hex')
}
