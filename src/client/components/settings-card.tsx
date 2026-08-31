import * as React from 'react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UniverSettings } from '../../shared/settings.ts'

interface UniverSettingsCardInjected {
  readonly settings: SettingsScope<UniverSettings>
}

type UniverSettingsCardProps = PropsRuntime<'settings.plugin.item'> &
  PropsLocale<'univer'> &
  InjectFace<UniverSettingsCardInjected>

type Draft = { readonly kind: 'set'; readonly value: boolean } | { readonly kind: 'unset' } | null

/** Univer Office card contributed to DSH Settings > Plugins > Plugin configuration. */
export function UniverSettingsCard(props: UniverSettingsCardProps): React.ReactElement | null {
  const subscribe = React.useCallback(
    (listener: () => void) => props.settings.subscribe(listener),
    [props.settings]
  )
  const getSnapshot = React.useCallback(() => props.settings.getSnapshot(), [props.settings])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft>(null)
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

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
    if (accepted) {
      setDraft(null)
      setOpen(false)
    }
  }

  return (
    <li className={`uvf_settingsCard${open ? ' uvf_settingsCard_open' : ''}`}>
      <button
        type="button"
        className="uvf_settingsHeader"
        aria-expanded={open}
        aria-label={`${props.t(open ? 'settings.collapse' : 'settings.expand')}: ${props.t('settings.title')}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="uvf_settingsHeadText">
          <span className="uvf_settingsName">{props.t('settings.title')}</span>
          <span className="uvf_settingsDescription">{props.t('settings.description')}</span>
        </span>
        {dirty ? <span className="uvf_settingsPending">{props.t('settings.unsaved')}</span> : null}
        <ChevronIcon open={open} />
      </button>
      {open ? (
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
      ) : null}
    </li>
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

function ChevronIcon(props: { readonly open: boolean }): React.ReactElement {
  return (
    <svg
      className={`uvf_settingsChevron${props.open ? ' uvf_settingsChevron_open' : ''}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
        fill="currentColor"
      />
    </svg>
  )
}
