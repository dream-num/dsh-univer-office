/**
 * Extra environment entries for spawning one bundled Node entry script
 * (Gateway, Unit Content Worker) through `process.execPath`.
 *
 * When the plugin is hosted inside an Electron shell such as DSH Desktop,
 * `process.execPath` is the Electron executable, not a Node binary. The spawned
 * entries are plain Node scripts, so the child must opt into plain-Node mode via
 * ELECTRON_RUN_AS_NODE=1; otherwise Electron boots as a GUI app and the child
 * exits with code 0 before executing the script. A plain-Node host needs no
 * such flag, so nothing is added there.
 */
export function spawnEnvironment(base: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return process.versions.electron === undefined ? base : { ...base, ELECTRON_RUN_AS_NODE: '1' }
}
