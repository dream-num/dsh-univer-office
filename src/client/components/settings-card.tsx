import * as React from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {
  SettingsScope,
  SettingsScopeSnapshot
} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UniverSettings } from '../../shared/settings.ts'

interface UniverSettingsCardInjected {
  readonly settings: SettingsScope<UniverSettings>
}

type UniverSettingsCardProps = PropsRuntime<'plugins.bundle.config'> &
  PropsLocale<'univer'> &
  InjectFace<UniverSettingsCardInjected>

type Draft = { readonly kind: 'set'; readonly value: boolean } | { readonly kind: 'unset' } | null

/**
 * Univer Office configuration contributed to this package's own Plugins page
 * (DSH 0.1.6-alpha.2+) and to the retired settings.plugin.item slot on older
 * hosts, which pass no `view` and receive the page form directly.
 */
export function UniverSettingsCard(props: UniverSettingsCardProps): React.ReactNode {
  const subscribe = React.useCallback(
    (listener: () => void) => props.settings.subscribe(listener),
    [props.settings]
  )
  const getSnapshot = React.useCallback(() => props.settings.getSnapshot(), [props.settings])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [draft, setDraft] = React.useState<Draft>(null)
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  if (props.view === 'summary') return props.t('settings.description')
  if (snapshot.status !== 'ready' || snapshot.value === undefined) return null
  const effective = snapshot.value.autoOpenLivePreview
  const fallback = fallbackValue(snapshot)
  const selected = draft === null ? effective : draft.kind === 'set' ? draft.value : fallback
  const overridden = hasBooleanField(snapshot.user, 'autoOpenLivePreview')
  const willOverride = draft === null ? overridden : draft.kind === 'set'
  const dirty = draft !== null

  const toggle = (): void => {
    const next = !selected
    setFailed(false)
    setDraft(next === effective ? null : { kind: 'set', value: next })
  }
  const reset = (): void => {
    setFailed(false)
    setDraft(overridden ? { kind: 'unset' } : null)
  }
  const save = async (): Promise<void> => {
    if (draft === null || saving) return
    const pending = draft
    setSaving(true)
    setFailed(false)
    if (pending.kind === 'unset') await props.settings.unset('autoOpenLivePreview')
    else await props.settings.set('autoOpenLivePreview', pending.value)
    const settled = props.settings.getSnapshot()
    const expected = pending.kind === 'unset' ? fallbackValue(settled) : pending.value
    const accepted = settled.status === 'ready' && settled.value?.autoOpenLivePreview === expected
    setSaving(false)
    setFailed(!accepted)
    if (accepted) setDraft(null)
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
        <div className="uvf_settingsField">
          <div className="uvf_settingsFieldHead">
            <span className="uvf_settingsLabel">{props.t('settings.autoOpenLivePreview')}</span>
            <span className="uvf_settingsFieldActions">
              {willOverride ? (
                <span className="uvf_settingsBadges">
                  <span className="uvf_settingsBadge">{props.t('settings.overridden')}</span>
                  <button
                    type="button"
                    className="uvf_settingsReset"
                    disabled={!snapshot.writable || saving}
                    onClick={reset}
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
                aria-label={props.t('settings.autoOpenLivePreview')}
                disabled={!snapshot.writable || saving}
                onClick={toggle}
              >
                <span className="uvf_settingsSwitchThumb" />
              </button>
            </span>
          </div>
          <p className="uvf_settingsHint">{props.t('settings.autoOpenLivePreviewHint')}</p>
        </div>
        <div className="uvf_settingsFooter">
          {failed ? (
            <output className="uvf_settingsFailed">{props.t('settings.saveFailed')}</output>
          ) : null}
          <button
            type="button"
            className="uvf_settingsDiscard"
            disabled={!dirty || saving}
            onClick={() => setDraft(null)}
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

function fallbackValue(snapshot: SettingsScopeSnapshot<UniverSettings>): boolean {
  const value =
    typeof snapshot.base === 'object' && snapshot.base !== null && !Array.isArray(snapshot.base)
      ? (snapshot.base as Record<string, unknown>).autoOpenLivePreview
      : undefined
  return typeof value === 'boolean' ? value : true
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
