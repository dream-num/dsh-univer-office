import type { ResolvedConfig } from '../../config.ts'
import type { EnsureGatewayResult, GatewayStatus } from '../../../shared/wire/status.ts'
import { GatewayProcess } from './gateway-process.ts'

/** Own the lifecycle of the package's Gateway process. */
export class GatewaySupervisor {
  private process: GatewayProcess | null = null
  private starting: Promise<EnsureGatewayResult> | null = null
  private lastFailure: string | undefined
  private disposed = false

  constructor(private readonly config: ResolvedConfig) {}

  /** Return current Gateway availability without starting it. */
  async status(): Promise<GatewayStatus> {
    if (this.starting !== null) return { phase: 'starting', gateway: null, owned: false }
    const child = this.process
    if (
      child !== null &&
      (await child.healthy(this.config.gatewayRequestTimeoutMs)) &&
      this.process === child
    ) {
      return { phase: 'running', gateway: child.origin, owned: true }
    }
    if (this.lastFailure !== undefined)
      return { phase: 'failed', gateway: null, owned: false, reason: this.lastFailure }
    return { phase: 'stopped', gateway: null, owned: false }
  }

  /** Join a pending launch, or reuse this Host's healthy child. */
  async ensure(): Promise<EnsureGatewayResult> {
    if (this.disposed) return { ok: false, reason: 'Gateway supervisor was disposed' }
    if (this.starting !== null) return this.starting
    const child = this.process
    if (child !== null) {
      const healthy = await child.healthy(this.config.gatewayRequestTimeoutMs)
      // Another caller may have begun replacing this child during the probe.
      if (this.process !== child || this.starting !== null || this.disposed) return this.ensure()
      if (healthy) return { ok: true, gateway: child.origin, reused: true }
    }
    this.starting = this.start().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async start(): Promise<EnsureGatewayResult> {
    if (this.process !== null) {
      await this.process.stop()
      this.process = null
    }
    let failure = 'bundled Gateway did not start'
    for (let port = this.config.gatewayPort; port <= 65_535; port += 1) {
      if (this.disposed) return { ok: false, reason: 'Gateway supervisor was disposed' }
      const child = new GatewayProcess(port)
      this.process = child
      const result = await child.waitForStartup(
        this.config.gatewayStartupTimeoutMs,
        this.config.gatewayRequestTimeoutMs
      )
      if (this.disposed) return { ok: false, reason: 'Gateway supervisor was disposed' }
      if (result.ok) {
        this.lastFailure = undefined
        return result
      }
      await child.stop()
      this.process = null
      failure = result.reason
      if (!result.portInUse) break
    }
    this.lastFailure = failure
    return { ok: false, reason: failure }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await this.process?.stop()
    await this.starting
    this.process = null
    this.lastFailure = undefined
  }
}
