import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UniverSettings } from '../../shared/settings.ts'

/**
 * Sync state the settings card reads. A legacy SettingsScope snapshot carries
 * every one of these fields plus a `mode` this plugin does not read.
 */
export type UniverSettingsSnapshot = ConfigFormSnapshot<UniverSettings>

/** Shared read/write surface of legacy SettingsScope and current ConfigForm. */
export interface UniverSettingsForm {
  getSnapshot(): UniverSettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void | boolean>
  unset(field: string): Promise<void | boolean>
}

/** Optional service introduced by DSH's profile-backed configuration forms. */
export interface UniverConfigForms {
  get(entryId: string): UniverSettingsForm
}

/**
 * The `settingsScope` service of DSH 0.1.6 and earlier. Current DSH type
 * declarations no longer ship it, so the consumed shape is declared here.
 */
export interface UniverSettingsScopeBinder {
  bind(spec: { readonly namespace: string }): UniverSettingsForm
}
