import type { ResolvedConfig } from '../../config.ts'
import type { EnsureGatewayResult, GatewayStatus } from '../../../shared/wire/status.ts'
import { GatewayProcess } from './gateway-process.ts'
import { gatewayIsHealthy } from './protocol.ts'

/** Own the lifecycle of the package's Gateway process. */
export class GatewaySupervisor {
  private readonly process = new GatewayProcess()
  private starting: Promise<EnsureGatewayResult> | null = null
  private lastFailure: string | undefined
  private ownedGateway: string | null = null

  constructor(private readonly config: ResolvedConfig) {}

  /** Return current Gateway availability without starting it. */
  async status(): Promise<GatewayStatus> {
    if (this.starting !== null) return { phase: 'starting', gateway: null, owned: false }
    if (
      this.ownedGateway !== null &&
      (await gatewayIsHealthy(this.ownedGateway, this.config.gatewayRequestTimeoutMs))
    ) {
      return { phase: 'running', gateway: this.ownedGateway, owned: true }
    }
    this.ownedGateway = null
    if (this.lastFailure !== undefined)
      return { phase: 'failed', gateway: null, owned: false, reason: this.lastFailure }
    return { phase: 'stopped', gateway: null, owned: false }
  }

  /** Reuse this supervisor's healthy Gateway or start the bundled one once for concurrent callers. */
  async ensure(): Promise<EnsureGatewayResult> {
    if (
      this.ownedGateway !== null &&
      (await gatewayIsHealthy(this.ownedGateway, this.config.gatewayRequestTimeoutMs))
    ) {
      return { ok: true, gateway: this.ownedGateway, reused: true }
    }
    this.ownedGateway = null
    if (this.starting !== null) return this.starting
    this.starting = this.start()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async start(): Promise<EnsureGatewayResult> {
    let failure = 'bundled Gateway did not start'
    for (let port = this.config.gatewayPort; port <= 65_535; port += 1) {
      const result = await this.process.start(
        port,
        this.config.gatewayStartupTimeoutMs,
        this.config.gatewayRequestTimeoutMs
      )
      if (result.ok) {
        this.ownedGateway = result.gateway
        this.lastFailure = undefined
        return result
      }
      failure = result.reason
      if (!result.portInUse) break
    }
    this.lastFailure = failure
    return { ok: false, reason: failure }
  }

  /** Stop the plugin-owned process and forget Gateway state. */
  async dispose(): Promise<void> {
    await this.process.stop()
    this.ownedGateway = null
    this.lastFailure = undefined
  }
}
