import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { EnsureGatewayResult } from '../../../shared/wire/status.ts'
import {
  GATEWAY_LISTENING,
  GATEWAY_PORT_IN_USE_EXIT_CODE
} from '../../../shared/gateway-process-protocol.ts'
import { gatewayLaunch } from './launcher.ts'
import { gatewayIsHealthy } from './protocol.ts'

type GatewayProcessStartResult =
  | Extract<EnsureGatewayResult, { readonly ok: true }>
  | { readonly ok: false; readonly reason: string; readonly portInUse: boolean }

/** One launch attempt. Its IPC channel and lifetime identify the owner of the listener. */
export class GatewayProcess {
  readonly origin: string
  private readonly child: ChildProcess
  private readonly closed: Promise<void>
  private detail = ''

  constructor(private readonly port: number) {
    this.origin = `http://127.0.0.1:${String(port)}`
    const launch = gatewayLaunch(port)
    this.child = spawn(launch.command, [...launch.args], launch.options)
    this.child.stderr?.on('data', (chunk: Buffer | string) => {
      this.detail = `${this.detail}${String(chunk)}`.slice(-4_000)
      if (process.env.UNIVER_DSH_GATEWAY_DEBUG === '1') process.stderr.write(chunk)
    })
    this.child.once('error', (error) => {
      this.detail = error.message
    })
    this.closed = new Promise((resolve) => this.child.once('close', () => resolve()))
  }

  async healthy(timeoutMs: number): Promise<boolean> {
    return (
      this.child.connected &&
      (await gatewayIsHealthy(this.origin, timeoutMs)) &&
      this.child.connected
    )
  }

  waitForStartup(
    startupTimeoutMs: number,
    probeTimeoutMs: number
  ): Promise<GatewayProcessStartResult> {
    const failure = (reason: string, portInUse = false) =>
      ({ ok: false, reason, portInUse }) as const
    return new Promise((resolve) => {
      const finish = (result: GatewayProcessStartResult): void => {
        clearTimeout(timer)
        this.child.off('message', onListening)
        resolve(result)
      }
      const onListening = async (message: unknown): Promise<void> => {
        if (
          typeof message !== 'object' ||
          message === null ||
          !('type' in message) ||
          message.type !== GATEWAY_LISTENING ||
          !('port' in message) ||
          message.port !== this.port
        ) {
          finish(failure('bundled Gateway sent an invalid listening message'))
          return
        }
        if (await this.healthy(probeTimeoutMs)) {
          finish({ ok: true, gateway: this.origin, reused: false })
        } else {
          finish(failure('bundled Gateway failed the Viewer health check'))
        }
      }
      this.child.once('message', onListening)
      const timer = setTimeout(
        () =>
          finish(
            failure(`bundled Gateway did not become ready within ${String(startupTimeoutMs)}ms`)
          ),
        startupTimeoutMs
      )
      void this.closed.then(() => {
        const occupied = this.child.exitCode === GATEWAY_PORT_IN_USE_EXIT_CODE
        finish(
          failure(
            occupied
              ? `Gateway port ${String(this.port)} is already in use`
              : this.detail.trim() ||
                  `bundled Gateway exited (${String(this.child.signalCode ?? this.child.exitCode)})`,
            occupied
          )
        )
      })
    })
  }

  async stop(): Promise<void> {
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGTERM')
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 3_000)
    try {
      await this.closed
    } finally {
      clearTimeout(timer)
    }
  }
}
