import { existsSync } from 'node:fs'
import { openReadOnlyDatabase } from './driver/connection.ts'
import { UniverfileError } from './errors.ts'

/**
 * Writes a consistent copy of a `.univer` file to `targetPath`, which must not exist.
 *
 * The source is read in one SQLite read transaction, so concurrent writers neither block the copy
 * for long nor leave it half-updated. The source is never upgraded or modified; a file in an older
 * format is copied as it is, and opening the copy upgrades only the copy.
 */
export function copyUniverfile(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath)) {
    throw new UniverfileError('FILE_NOT_FOUND', `.univer file not found: ${sourcePath}`)
  }
  if (existsSync(targetPath)) {
    throw new UniverfileError('FILE_EXISTS', `.univer file already exists: ${targetPath}`)
  }
  const database = openReadOnlyDatabase(sourcePath)
  try {
    database.prepare('VACUUM INTO ?').run(targetPath)
  } finally {
    database.close()
  }
}
