import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { UniverSettings } from '../../shared/settings.ts'

/** Reactive projection of the optional DSH Settings scope used by the live-window surface. */
export class LivePreviewPreference {
  private enabled = true
  private readonly listeners = new Set<() => void>()

  readonly getSnapshot = (): boolean => this.enabled

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Attach one Settings scope; loading suppresses a stale-default window flash. */
  attach(scope: SettingsScope<UniverSettings>): () => void {
    const sync = (): void => {
      const snapshot = scope.getSnapshot()
      const enabled =
        snapshot.status === 'loading'
          ? false
          : snapshot.status === 'ready'
            ? (snapshot.value?.autoOpenLivePreview ?? true)
            : true
      this.publish(enabled)
    }
    const dispose = scope.subscribe(sync)
    sync()
    return () => {
      dispose()
      this.publish(true)
    }
  }

  private publish(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    for (const listener of this.listeners) listener()
  }
}
