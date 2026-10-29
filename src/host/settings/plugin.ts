import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_UNIVER_SETTINGS,
  UNIVER_SETTINGS_NAMESPACE,
  type UniverSettings
} from '../../shared/settings.ts'

export const name = 'univer-settings'

const SettingsSchema: z<UniverSettings> = z.object({
  autoOpenLivePreview: z.boolean().default(true),
  conversationReviewCards: z.boolean().default(true)
})

/**
 * The namespace registry of DSH 0.1.6 and earlier. DSH 0.1.7+ provides
 * `SettingsForms` under the same service name without `register`, and current
 * DSH type declarations no longer ship this shape.
 */
interface LegacySettingsRegistry {
  readonly register?: (
    ns: string,
    schema: z<UniverSettings>,
    options: { readonly base: UniverSettings; readonly applies: 'live' }
  ) => unknown
}

/** Expose presentation preferences when the active DSH composition provides Settings. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx: Context) => {
    const settings = settingsCtx.get('settings') as LegacySettingsRegistry
    // DSH 0.1.7+ derives forms from the root plugin's live Config instead.
    if (typeof settings.register !== 'function') return
    settings.register(UNIVER_SETTINGS_NAMESPACE, SettingsSchema, {
      base: DEFAULT_UNIVER_SETTINGS,
      applies: 'live'
    })
  })
}
