import childProcess from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
import type { Browser, LaunchOptions } from 'puppeteer-core'
import { spawnEnvironment } from '../processes/spawn-env.ts'

/** A separate process makes even a stuck filesystem request cancellable on Windows. */
function removeProfile(directory: string): Promise<void> {
  return new Promise((resolve) => {
    childProcess.execFile(
      process.execPath,
      [
        '-e',
        "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })",
        '--',
        directory
      ],
      { env: spawnEnvironment(), timeout: 8_000, killSignal: 'SIGKILL', windowsHide: true },
      (error) => {
        if (error !== null) {
          process.emitWarning('Could not remove a temporary render browser profile.', {
            code: 'UNIVER_RENDER_PROFILE_CLEANUP_FAILED'
          })
        }
        resolve()
      }
    )
  })
}

/** Used only for browsers launched by the bundled render runtime. */
async function launch(options: LaunchOptions): Promise<Browser> {
  if (
    options.userDataDir !== undefined ||
    options.args?.some((arg) => arg.startsWith('--user-data-dir'))
  ) {
    return puppeteer.launch(options)
  }
  const userDataDir = await mkdtemp(join(tmpdir(), 'univer-render-profile-'))
  let browser: Browser
  try {
    browser = await puppeteer.launch({ ...options, userDataDir })
  } catch (error) {
    await removeProfile(userDataDir)
    throw error
  }

  // Puppeteer waits for its own temporary-profile removal inside browser.close().
  // Supplying our directory lets it finish waiting for Chrome independently.
  let cleanup: Promise<void> | undefined
  const cleanupOnce = (): Promise<void> => (cleanup ??= removeProfile(userDataDir))
  const child = browser.process()
  if (child !== null) {
    if (child.exitCode === null && child.signalCode === null) child.once('exit', cleanupOnce)
    else void cleanupOnce()
  }

  const close = browser.close.bind(browser)
  let closing: Promise<void> | undefined
  browser.close = () => (closing ??= close().then(cleanupOnce))
  return browser
}

export default { launch }
