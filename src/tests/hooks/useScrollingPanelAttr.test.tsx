import { fireEvent, render, screen } from '@testing-library/react'
import { type RefObject, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScrollingPanelAttr } from '@/hooks/useScrollingPanelAttr'

function ScrollHarness({ timeout = 120 }: { timeout?: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useScrollingPanelAttr(ref as RefObject<HTMLElement | null>, timeout)

  return (
    <section className="glass-panel" data-testid="panel">
      <div ref={ref} data-testid="scroller" />
    </section>
  )
}

function OrphanScrollHarness() {
  const ref = useRef<HTMLDivElement | null>(null)
  useScrollingPanelAttr(ref as RefObject<HTMLElement | null>, 40)
  return <div ref={ref} data-testid="orphan-scroller" />
}

describe('useScrollingPanelAttr', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(performance.now())
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sets data-scrolling on the nearest glass panel and clears it after idle timeout', () => {
    render(<ScrollHarness timeout={80} />)
    const panel = screen.getByTestId('panel')
    const scroller = screen.getByTestId('scroller')

    fireEvent.scroll(scroller)
    expect(panel).toHaveAttribute('data-scrolling', 'true')
    expect(scroller).not.toHaveAttribute('data-scrolling')

    vi.advanceTimersByTime(79)
    expect(panel).toHaveAttribute('data-scrolling', 'true')

    vi.advanceTimersByTime(1)
    expect(panel).not.toHaveAttribute('data-scrolling')
  })

  it('coalesces repeated scroll events so the first idle timer cannot clear an active scroll', () => {
    render(<ScrollHarness timeout={80} />)
    const panel = screen.getByTestId('panel')
    const scroller = screen.getByTestId('scroller')

    fireEvent.scroll(scroller)
    vi.advanceTimersByTime(60)
    fireEvent.scroll(scroller)

    vi.advanceTimersByTime(20)
    expect(panel).toHaveAttribute('data-scrolling', 'true')

    vi.advanceTimersByTime(60)
    expect(panel).not.toHaveAttribute('data-scrolling')
  })

  it('removes the attribute on unmount even when an idle clear is pending', () => {
    const { unmount } = render(<ScrollHarness timeout={120} />)
    const panel = screen.getByTestId('panel')

    fireEvent.scroll(screen.getByTestId('scroller'))
    expect(panel).toHaveAttribute('data-scrolling', 'true')

    unmount()
    expect(panel).not.toHaveAttribute('data-scrolling')
    vi.runOnlyPendingTimers()
    expect(panel).not.toHaveAttribute('data-scrolling')
  })

  it('does nothing when the scroller is not inside a glass panel', () => {
    render(<OrphanScrollHarness />)
    const scroller = screen.getByTestId('orphan-scroller')

    fireEvent.scroll(scroller)
    vi.runOnlyPendingTimers()

    expect(scroller.dataset).not.toHaveProperty('scrolling')
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
