import type { UniverSettingsForm } from './settings-contract.ts'
import type { UniverSettings } from '../../shared/settings.ts'

/** Presentation switches the browser surfaces read from the DSH Settings scope. */
export interface UniverPreferencesState {
  /** Live floating window while the agent edits a document. */
  readonly livePreview: boolean
  /** Turn-tail review cards in the conversation. */
  readonly conversationReviewCards: boolean
}

/** Product defaults, mirrored from the settings schema for a broken settings document. */
const PREFERENCES_DEFAULT: UniverPreferencesState = {
  livePreview: true,
  conversationReviewCards: true
}

/** Every switch is suppressed until the durable value arrives, so none flashes on. */
const PREFERENCES_SUPPRESSED: UniverPreferencesState = {
  livePreview: false,
  conversationReviewCards: false
}

/**
 * Reactive projection of the optional DSH Settings scope.
 *
 * A surface the user turned off must not flash before its durable value loads,
 * so `loading` resolves every switch to off while a settings document that
 * failed to load keeps the product defaults — absence of a settings service is
 * not a user decision. The published state keeps a stable identity between
 * changes, so `useSyncExternalStore` consumers do not re-render on every read.
 */
export class UniverPreferences {
  /**
   * Starts at the product defaults: a host with no settings service never calls
   * {@link attach}, and an absent optional capability must not disable surfaces.
   * Only a scope that reports `loading` suppresses them.
   */
  private state: UniverPreferencesState = PREFERENCES_DEFAULT
  private readonly listeners = new Set<() => void>()

  readonly getSnapshot = (): UniverPreferencesState => this.state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Attach one Settings scope and return its detach for the owning fiber. */
  attach(scope: UniverSettingsForm): () => void {
    const sync = (): void => this.publish(project(scope.getSnapshot()))
    const dispose = scope.subscribe(sync)
    sync()
    return () => {
      dispose()
      this.publish(PREFERENCES_DEFAULT)
    }
  }

  private publish(next: UniverPreferencesState): void {
    if (
      next.livePreview === this.state.livePreview &&
      next.conversationReviewCards === this.state.conversationReviewCards
    )
      return
    this.state = next
    for (const listener of this.listeners) listener()
  }
}

/**
 * Project one settings snapshot onto the switch state.
 *
 * `value` is read as a partial even though the host types every field as
 * required: the document is resolved by the Host half, so a Client bundle that
 * ships ahead of its Host (a rolling upgrade, and every HMR reload) can observe
 * a snapshot that predates a field. An absent field must fall back to the
 * product default rather than to `undefined`, which would read as "off" and
 * silently hide a surface the user never turned off.
 */
function project(snapshot: {
  readonly status: string
  readonly value?: Partial<UniverSettings> | undefined
}): UniverPreferencesState {
  if (snapshot.status === 'loading') return PREFERENCES_SUPPRESSED
  if (snapshot.status !== 'ready' || snapshot.value === undefined) return PREFERENCES_DEFAULT
  return {
    livePreview: snapshot.value.autoOpenLivePreview ?? PREFERENCES_DEFAULT.livePreview,
    conversationReviewCards:
      snapshot.value.conversationReviewCards ?? PREFERENCES_DEFAULT.conversationReviewCards
  }
}
