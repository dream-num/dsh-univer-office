// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { attachLinkedWheelNavigation } from '../src/native/native-comparison-view.js'

describe('linked comparison navigation', () => {
  it('relays wheel gestures inside the peer viewport without echoing and detaches', () => {
    const left = document.createElement('div')
    const right = document.createElement('div')
    const canvas = document.createElement('canvas')
    right.append(canvas)
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(500, 600, 300, 200))
    const leftEvents = vi.fn()
    const rightEvents = vi.fn()
    left.addEventListener('wheel', leftEvents)
    right.addEventListener('wheel', rightEvents)

    const dispose = attachLinkedWheelNavigation(left, right)
    left.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true }))

    expect(leftEvents).toHaveBeenCalledTimes(1)
    expect(rightEvents).toHaveBeenCalledTimes(1)
    expect(rightEvents.mock.calls[0]?.[0]).toMatchObject({
      deltaY: 120,
      ctrlKey: true,
      clientX: 650,
      clientY: 700
    })

    dispose()
    left.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }))
    expect(rightEvents).toHaveBeenCalledTimes(1)
  })
})
