import * as React from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {
  SettingsScope,
  SettingsScopeSnapshot
} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DEFAULT_UNIVER_SETTINGS, type UniverSettings } from '../../shared/settings.ts'
import type { UniverLocaleKey } from '../locales/zh.ts'

interface UniverSettingsCardInjected {
  readonly settings: SettingsScope<UniverSettings>
}

type UniverSettingsCardProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'univer'> &
  InjectFace<UniverSettingsCardInjected>

type Draft = { readonly kind: 'set'; readonly value: boolean } | { readonly kind: 'unset' }
type Drafts = Partial<Record<BooleanSettingKey, Draft>>

/** Settings that are a plain switch in this card. */
type BooleanSettingKey = {
  [K in keyof UniverSettings]: UniverSettings[K] extends boolean ? K : never
}[keyof UniverSettings]

/** One switch row: the schema field it writes and the copy it renders. */
interface BooleanSettingField {
  readonly key: BooleanSettingKey
  readonly label: UniverLocaleKey
  readonly hint: UniverLocaleKey
}

const BOOLEAN_FIELDS: readonly BooleanSettingField[] = [
  {
    key: 'autoOpenLivePreview',
    label: 'settings.autoOpenLivePreview',
    hint: 'settings.autoOpenLivePreviewHint'
  },
  {
    key: 'conversationReviewCards',
    label: 'settings.conversationReviewCards',
    hint: 'settings.conversationReviewCardsHint'
  }
]

/**
 * Univer Office configuration contributed to this package's own Plugins page
 * (DSH 0.1.6-alpha.2+) and to the retired settings.plugin.item slot on older
 * hosts, which pass no `view` and receive the page form directly.
 *
 * Every switch shares one draft: edits accumulate per field and a single Save
 * commits them together, so a user can flip both and still Discard once.
 */
export function UniverSettingsCard(props: UniverSettingsCardProps): React.ReactNode {
  const subscribe = React.useCallback(
    (listener: () => void) => props.settings.subscribe(listener),
    [props.settings]
  )
  const getSnapshot = React.useCallback(() => props.settings.getSnapshot(), [props.settings])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [drafts, setDrafts] = React.useState<Drafts>({})
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  if (props.view === 'summary') return props.t('settings.description')
  if (snapshot.status !== 'ready' || snapshot.value === undefined) return null
  const dirty = Object.keys(drafts).length > 0

  const edit = (key: BooleanSettingKey, draft: Draft | undefined): void => {
    setFailed(false)
    setDrafts((previous) => {
      const next = { ...previous }
      // An absent draft means "no pending change for this field".
      if (draft === undefined) delete next[key]
      else next[key] = draft
      return next
    })
  }
  const save = async (): Promise<void> => {
    if (!dirty || saving) return
    const pending = Object.entries(drafts) as [BooleanSettingKey, Draft][]
    setSaving(true)
    setFailed(false)
    // Sequential on purpose: each write is revision-guarded, so overlapping
    // writes against one settings document could drop a field's change.
    for (const [key, draft] of pending) {
      if (draft.kind === 'unset') await props.settings.unset(key)
      else await props.settings.set(key, draft.value)
    }
    const applied = props.settings.getSnapshot()
    const accepted =
      applied.status === 'ready' &&
      pending.every(([key, draft]) => {
        const expected = draft.kind === 'unset' ? fallbackValue(applied, key) : draft.value
        return applied.value?.[key] === expected
      })
    setSaving(false)
    setFailed(!accepted)
    if (accepted) setDrafts({})
  }

  return (
    <div className="uvf_settingsCard">
      <div className="uvf_settingsHead">
        <span className="uvf_settingsName">{props.t('settings.title')}</span>
        <span className="uvf_settingsDescription">{props.t('settings.description')}</span>
      </div>
      <div className="uvf_settingsBody">
        {!snapshot.writable ? (
          <output className="uvf_settingsReadOnly">{props.t('settings.readOnly')}</output>
        ) : null}
        {BOOLEAN_FIELDS.map((field) => {
          const effective = snapshot.value?.[field.key] ?? DEFAULT_UNIVER_SETTINGS[field.key]
          const pending = drafts[field.key]
          const selected =
            pending === undefined
              ? effective
              : pending.kind === 'set'
                ? pending.value
                : fallbackValue(snapshot, field.key)
          const overridden = hasBooleanField(snapshot.user, field.key)
          const willOverride = pending === undefined ? overridden : pending.kind === 'set'
          return (
            <div className="uvf_settingsField" key={field.key}>
              <div className="uvf_settingsFieldHead">
                <span className="uvf_settingsLabel">{props.t(field.label)}</span>
                <span className="uvf_settingsFieldActions">
                  {willOverride ? (
                    <span className="uvf_settingsBadges">
                      <span className="uvf_settingsBadge">{props.t('settings.overridden')}</span>
                      <button
                        type="button"
                        className="uvf_settingsReset"
                        disabled={!snapshot.writable || saving}
                        onClick={() => edit(field.key, overridden ? { kind: 'unset' } : undefined)}
                      >
                        {props.t('settings.reset')}
                      </button>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    role="switch"
                    className={`uvf_settingsSwitch${selected ? ' uvf_settingsSwitch_on' : ''}`}
                    aria-checked={selected}
                    aria-label={props.t(field.label)}
                    disabled={!snapshot.writable || saving}
                    onClick={() => {
                      // Toggling back onto the durable value clears the pending change.
                      const next = !selected
                      edit(field.key, next === effective ? undefined : { kind: 'set', value: next })
                    }}
                  >
                    <span className="uvf_settingsSwitchThumb" />
                  </button>
                </span>
              </div>
              <p className="uvf_settingsHint">{props.t(field.hint)}</p>
            </div>
          )
        })}
        <div className="uvf_settingsFooter">
          {failed ? (
            <output className="uvf_settingsFailed">{props.t('settings.saveFailed')}</output>
          ) : null}
          <button
            type="button"
            className="uvf_settingsDiscard"
            disabled={!dirty || saving}
            onClick={() => setDrafts({})}
          >
            {props.t('settings.discard')}
          </button>
          <button
            type="button"
            className="uvf_settingsSave"
            disabled={!dirty || saving || !snapshot.writable}
            onClick={() => void save()}
          >
            {props.t(saving ? 'settings.saving' : 'settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The schema default for one field, used when a Reset is committed. */
function fallbackValue(
  snapshot: SettingsScopeSnapshot<UniverSettings>,
  field: BooleanSettingKey
): boolean {
  const base =
    typeof snapshot.base === 'object' && snapshot.base !== null && !Array.isArray(snapshot.base)
      ? (snapshot.base as Record<string, unknown>)[field]
      : undefined
  return typeof base === 'boolean' ? base : DEFAULT_UNIVER_SETTINGS[field]
}

function hasBooleanField(value: unknown, field: string): value is Record<string, boolean> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, field) &&
    typeof (value as Record<string, unknown>)[field] === 'boolean'
  )
}
