import type { Context } from '@deepseek-ai/cordis'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_UNIVER_SETTINGS,
  UNIVER_SETTINGS_NAMESPACE,
  type UniverSettings
} from '../../shared/settings.ts'

export const name = 'univer-settings'

const SettingsSchema: z<UniverSettings> = z.object({
  autoOpenLivePreview: z.boolean().default(true)
})

/** Expose presentation preferences when the active DSH composition provides Settings. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx: Context) => {
    const settings: SettingsProvider = settingsCtx.settings
    settings.register(UNIVER_SETTINGS_NAMESPACE, SettingsSchema, {
      base: DEFAULT_UNIVER_SETTINGS,
      applies: 'live'
    })
  })
}
