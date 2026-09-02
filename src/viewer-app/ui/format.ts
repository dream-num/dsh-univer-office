import type { MergeUnitPreview, Worktree } from '@univer/collab-gateway-contract'
import { t } from '../i18n'

export type ChangeTagVariant = 'modified' | 'added' | 'deleted' | 'conflict' | 'updated'
export type BadgeVariant = 'neutral' | 'info' | 'warn' | 'ok' | 'danger' | 'outline'

/** Status badge appearance for a worktree row. */
export function statusBadgeMeta(status: Worktree['status']): {
  variant: BadgeVariant
  text: string
} {
  const map = {
    draft: ['info', t().status.draft],
    ready: ['warn', t().status.ready],
    merged: ['ok', t().status.merged],
    discarded: ['neutral', t().status.discarded]
  } as const
  const [variant, text] = map[status] ?? ['neutral', status]
  return { variant, text }
}

/** Diff badge for a unit row against its base ("modified" / "added" / "deleted"). */
export function changeBadgeInfo(
  change: 'added' | 'modified' | 'deleted' | 'unchanged'
): { variant: ChangeTagVariant; text: string } | undefined {
  if (change === 'modified') {
    return { variant: 'modified', text: t().change.modified }
  }
  if (change === 'added') {
    return { variant: 'added', text: t().change.added }
  }
  if (change === 'deleted') {
    return { variant: 'deleted', text: t().change.deleted }
  }
  return undefined
}

/** Badge for a merge-preview row: conflict > structural change > base-stale "updated". */
export function previewBadgeInfo(
  p: MergeUnitPreview
): { variant: ChangeTagVariant; text: string } | undefined {
  if (p.status === 'created') {
    return { variant: 'added', text: t().change.added }
  }
  if (p.status === 'modified') {
    return { variant: 'modified', text: t().change.modified }
  }
  if (p.status === 'deleted') {
    return { variant: 'deleted', text: t().change.deleted }
  }
  if (p.status === 'conflict') {
    return { variant: 'conflict', text: t().change.conflict }
  }
  if (p.status === 'unchanged' && p.baseStale) {
    return { variant: 'updated', text: t().change.updated }
  }
  return undefined
}

/** Coarse relative time for worktree rows ("3 min ago"). */
export function relativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) {
    return ''
  }
  const min = Math.floor((Date.now() - time) / 60000)
  if (min < 1) {
    return t().time.justNow
  }
  if (min < 60) {
    return t().time.minutesAgo(min)
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) {
    return t().time.hoursAgo(hr)
  }
  return t().time.daysAgo(Math.floor(hr / 24))
}

/** One-line modified/added/deleted counts, omitting zero buckets. */
export function summaryText(s: { modified: number; added: number; deleted: number }): string {
  const parts: string[] = []
  if (s.modified) {
    parts.push(t().summary.modified(s.modified))
  }
  if (s.added) {
    parts.push(t().summary.added(s.added))
  }
  if (s.deleted) {
    parts.push(t().summary.deleted(s.deleted))
  }
  return parts.length ? parts.join(' · ') : t().summary.noChanges
}
