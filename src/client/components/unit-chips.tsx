import * as React from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangedUnit } from '../../shared/wire/state.ts'

const ICONS: Record<ChangedUnit['kind'], string> = {
  added: '＋',
  modified: '✎',
  deleted: '－',
  conflict: '⚠'
}

/** Navigation chips for the units changed by a worktree. */
export function UnitChips(props: {
  readonly units: readonly ChangedUnit[]
  readonly selected: string | undefined
  readonly t: TranslateNS<'univer'>
  readonly onSelect: (unitId: string) => void
}): React.ReactElement | null {
  if (props.units.length <= 1) return null
  return (
    <div className="uvf_units">
      {props.units.map((unit) => (
        <button
          key={unit.unitId}
          type="button"
          className={`uvf_unit${unit.unitId === props.selected ? ' uvf_unit_on' : ''}`}
          data-kind={unit.kind}
          title={props.t(`dock.unit.${unit.kind}`)}
          onClick={() => props.onSelect(unit.unitId)}
        >
          <span className="uvf_unit_icon">{ICONS[unit.kind]}</span>
          {unit.name || props.t(`dock.unit.${unit.kind}`)}
        </button>
      ))}
    </div>
  )
}

/** Append a selected unit to an opaque Host Viewer target. */
export function unitViewerUrl(
  url: string | undefined,
  units: readonly ChangedUnit[],
  unitId: string | undefined,
  scope: 'worktree' | 'merge'
): string | undefined {
  if (unitId === undefined) return url
  const unit = units.find((entry) => entry.unitId === unitId)
  return scope === 'merge' ? (unit?.mergeUrl ?? url) : (unit?.worktreeUrl ?? url)
}
