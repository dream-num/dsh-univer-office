import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { EnsureGatewayResult } from '../../../shared/wire/status.ts'
import { GATEWAY_PORT_IN_USE_EXIT_CODE } from '../../../shared/gateway-process-protocol.ts'
import { gatewayLaunch } from './launcher.ts'
import { gatewayIsHealthy } from './protocol.ts'

type GatewayProcessStartResult =
  | Extract<EnsureGatewayResult, { readonly ok: true }>
  | {
      readonly ok: false
      readonly reason: string
      readonly portInUse: boolean
    }

/** One plugin-owned Gateway child process. */
export class GatewayProcess {
  private child: ChildProcess | null = null

  /** Start on one port and wait until the Viewer health endpoint responds. */
  async start(
    port: number,
    startupTimeoutMs: number,
    probeTimeoutMs: number
  ): Promise<GatewayProcessStartResult> {
    const launch = gatewayLaunch(port)
    const child = spawn(launch.command, [...launch.args], launch.options)
    this.child = child
    const origin = `http://127.0.0.1:${String(port)}`
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4_000)
      if (process.env.UNIVER_DSH_GATEWAY_DEBUG === '1') process.stderr.write(chunk)
    })

    const startedAt = Date.now()
    while (Date.now() - startedAt < startupTimeoutMs) {
      if (child.exitCode !== null || child.signalCode !== null) {
        if (this.child === child) this.child = null
        const portInUse = child.exitCode === GATEWAY_PORT_IN_USE_EXIT_CODE
        const detail = stderr.trim()
        return {
          ok: false,
          reason: portInUse
            ? `Gateway port ${String(port)} is already in use`
            : detail ||
              `bundled Gateway exited (${String(child.signalCode ?? child.exitCode ?? 'unknown')})`,
          portInUse
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
      if (child.exitCode !== null || child.signalCode !== null) continue
      if (await gatewayIsHealthy(origin, probeTimeoutMs))
        return { ok: true, gateway: origin, reused: false }
    }

    await this.stop()
    return {
      ok: false,
      reason: `bundled Gateway did not become ready within ${String(startupTimeoutMs)}ms`,
      portInUse: false
    }
  }

  /** Stop only the child process this instance created. */
  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    if (child === null || child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3_000))])
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
}
