import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { UniverSettings } from '../../shared/settings.ts'

/** Shared read/write surface of legacy SettingsScope and current ConfigForm. */
export interface UniverSettingsForm {
  getSnapshot(): SettingsScopeSnapshot<UniverSettings>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void | boolean>
  unset(field: string): Promise<void | boolean>
}

/** Optional service introduced by DSH's profile-backed configuration forms. */
export interface UniverConfigForms {
  get(entryId: string): UniverSettingsForm
}
