// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shouldClearDiffSidebarSelection } from '../src/shared/sidebar-selection'

describe('diff sidebar selection', () => {
  it('clears from empty chrome but preserves interactive controls and their children', () => {
    const sidebar = document.createElement('aside')
    const blank = document.createElement('div')
    const button = document.createElement('button')
    const label = document.createElement('span')
    button.append(label)
    sidebar.append(blank, button)

    expect(shouldClearDiffSidebarSelection(sidebar)).toBe(true)
    expect(shouldClearDiffSidebarSelection(blank)).toBe(true)
    expect(shouldClearDiffSidebarSelection(button)).toBe(false)
    expect(shouldClearDiffSidebarSelection(label)).toBe(false)
  })
})
