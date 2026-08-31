import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Single source of the `DSH_HOME` convention shared by config resolution and
 * telemetry state: unset falls back to `~/.dsh`, `~` and `~/` expand against
 * the home directory, and anything else resolves against the current working
 * directory.
 */
export function resolveDshHome(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir()
): string {
  const configured = env.DSH_HOME?.trim()
  if (configured === undefined || configured.length === 0) return join(homeDir, '.dsh')
  if (configured === '~') return homeDir
  if (configured.startsWith('~/')) return join(homeDir, configured.slice(2))
  return resolve(configured)
}
