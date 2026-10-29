import { isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Repository checkout that owns these tests. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export const repoPath = (...segments: string[]): string => join(REPO_ROOT, ...segments)

/**
 * Package under test: this checkout, or an installed package named by `UNIVER_PLUGIN_ROOT`.
 * Release verification points the variable at the staged package so the same tests prove the
 * published layout, including its manifest and runtime bindings.
 */
export function pluginRoot(): string {
  const root = process.env.UNIVER_PLUGIN_ROOT
  if (root === undefined) return REPO_ROOT
  if (!isAbsolute(root)) throw new Error('UNIVER_PLUGIN_ROOT must be absolute')
  return root
}

/**
 * Built Host entry. Its exports are untyped here: integration tests assert the runtime
 * contract of the artifact, while `src/` keeps its own typecheck.
 */
export async function importHostBundle(root = REPO_ROOT): Promise<any> {
  return import(pathToFileURL(join(root, 'lib', 'index.js')).href)
}
