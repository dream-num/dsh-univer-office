/// <reference types="vite/client" />
import type { ReactElement } from 'react'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Topbar } from '../ui/app-view.tsx'
import { LOCALE_MANIFEST, setLang, t, type Lang } from '../i18n/index.ts'
import '../styles.css'

/** Production Header with inert, type-checked application callbacks; never opens a document. */
function Fixture(): ReactElement {
  const [width, setWidth] = useState(1130)
  const [state, setState] = useState('ready')
  const [name, setName] = useState('all-unit-comparison-changes')
  const [language, setLanguage] = useState<Lang>('zh-CN')
  const [collapsed, setCollapsed] = useState(false)
  const [compare, setCompare] = useState(false)
  const [preview, setPreview] = useState(true)
  const [action, setAction] = useState('')
  const unit = { unitId: 'unit', type: 2 as const, name, headRev: 1 }
  const app: Parameters<typeof Topbar>[0]['app'] = {
    univerfileName: 'Header fixture',
    topbarUnits: () => [unit],
    pendingWorktreeCount: () => 0,
    unitBadgeInfo: () => ({ variant: 'added', text: t().change.added }),
    startTrunkEdit: () => Promise.resolve(),
    stopTrunkEdit: () => undefined,
    setComparisonMode: (value) => {
      setCompare(value)
      setAction(`compare:${value}`)
      return Promise.resolve()
    },
    setViewPreview: (value) => {
      setPreview(value)
      setAction(`preview:${value}`)
    },
    doReady: () => Promise.resolve(setAction('submit')),
    doMerge: () => Promise.resolve(setAction('merge')),
    doDiscard: () => Promise.resolve(setAction('discard')),
    refreshUnitComparison: () => Promise.resolve(setAction('refresh'))
  }
  const snap: Parameters<typeof Topbar>[0]['snap'] = {
    view: state === 'trunk' ? { kind: 'trunk' } : { kind: 'worktree', worktreeId: 'worktree' },
    selectedUnitId: 'unit',
    trunkUnits: [unit],
    comparisonMode: compare,
    comparisonData: undefined,
    viewPreview: preview,
    trunkEditingOptIn: false,
    sidebarCollapsed: collapsed,
    worktrees: [
      {
        worktreeId: 'worktree',
        name: 'Fixture worktree (not the document title)',
        status: state === 'draft' ? 'draft' : state === 'merged' ? 'merged' : 'ready',
        agentId: 'fixture',
        baseline: {},
        createdAt: '2026-09-05T00:00:00Z'
      }
    ],
    previews: new Map(
      state === 'preview' || state === 'conflict'
        ? [
            [
              'worktree',
              {
                worktreeId: 'worktree',
                diverged: true,
                mergeable: state !== 'conflict',
                units: [],
                conflicts: state === 'conflict' ? ['unit'] : []
              }
            ]
          ]
        : []
    ),
    previewErrors: new Map(state === 'error' ? [['worktree', 'Preview unavailable']] : [])
  }
  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100vh' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <label>
          Frame width{' '}
          <input
            aria-label="Frame width"
            type="number"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <label>
          State{' '}
          <select
            aria-label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            {['ready', 'preview', 'draft', 'conflict', 'error', 'merged', 'trunk'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Language{' '}
          <select
            aria-label="Language"
            value={language}
            onChange={(event) => {
              const selectedLanguage = event.target.value as Lang
              void setLang(selectedLanguage).then(() => setLanguage(selectedLanguage))
            }}
          >
            {LOCALE_MANIFEST.map((value) => (
              <option key={value.tag} value={value.tag}>
                {value.tag}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title{' '}
          <input
            aria-label="Title"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={collapsed}
            onChange={(event) => setCollapsed(event.target.checked)}
          />
          Sidebar collapsed
        </label>
        <label>
          <input
            type="checkbox"
            onChange={(event) =>
              document.documentElement.classList.toggle('gateway-dark', event.target.checked)
            }
          />
          Dark
        </label>
        <output aria-label="Last action">{action}</output>
      </div>
      <div
        style={{
          display: 'flex',
          width,
          margin: '16px auto',
          minHeight: 520,
          border: '1px solid #ddd'
        }}
      >
        {!collapsed && (
          <aside style={{ flex: '0 0 256px', background: '#fafafa' }}>Sidebar · 256px</aside>
        )}
        <main style={{ flex: 1, minWidth: 0 }}>
          <Topbar app={app} snap={snap} />
        </main>
      </div>
    </div>
  )
}
const root = createRoot(document.getElementById('root')!)
let active = true
import.meta.hot?.dispose(() => {
  active = false
  root.unmount()
})
void setLang('zh-CN').then(() => {
  if (active) root.render(<Fixture />)
  return undefined
})
