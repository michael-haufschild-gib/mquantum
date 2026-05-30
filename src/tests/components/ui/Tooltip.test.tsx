import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { computeTooltipCoords } from '@/components/ui/tooltipPositioning'
import { Z_INDEX } from '@/constants/zIndex'

describe('computeTooltipCoords', () => {
  it('flips below topbar controls instead of clamping over the trigger', () => {
    const coords = computeTooltipCoords(
      new DOMRect(10, 8, 160, 32),
      new DOMRect(0, 0, 180, 28),
      'top',
      null,
      { width: 500, height: 300 }
    )

    expect(coords.y).toBe(48)
  })

  it('uses pointer position while keeping tooltips outside the trigger', () => {
    const coords = computeTooltipCoords(
      new DOMRect(12, 12, 220, 120),
      new DOMRect(0, 0, 104, 28),
      'top',
      { x: 130, y: 70 },
      { width: 320, height: 320 }
    )

    expect(coords.x).toBe(144)
    expect(coords.y).toBe(140)
  })
})

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('shows tooltip after delay on hover', async () => {
    render(
      <Tooltip content="Tooltip text" delay={300}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Tooltip text')).toBeInTheDocument()
  })

  it('does not show tooltip before delay expires', () => {
    render(
      <Tooltip content="Tooltip text" delay={500}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides tooltip when mouse leaves before delay', () => {
    render(
      <Tooltip content="Tooltip text" delay={500}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    fireEvent.mouseLeave(trigger)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('clears stacked hover and focus timers when trigger exits before delay', () => {
    render(
      <Tooltip content="Tooltip text" delay={500}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger)
    fireEvent.focus(trigger)
    fireEvent.mouseLeave(trigger)
    fireEvent.blur(trigger)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides tooltip when mouse leaves after showing', async () => {
    render(
      <Tooltip content="Tooltip text" delay={100}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger)

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(trigger)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('hides tooltip when the trigger is clicked', async () => {
    render(
      <Tooltip content="Tooltip text" delay={0}>
        <Button>Click me</Button>
      </Tooltip>
    )

    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger)

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.click(trigger)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('clears delayed hover when the browser window blurs before the delay completes', () => {
    render(
      <Tooltip content="Tooltip text" delay={500}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))
    fireEvent(window, new Event('blur'))

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('uses default delay of 300ms when not specified', async () => {
    render(
      <Tooltip content="Default delay">
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('renders ReactNode content', async () => {
    render(
      <Tooltip content={<span data-testid="custom-content">Rich content</span>} delay={0}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByTestId('custom-content')).toBeInTheDocument()
  })

  it('uses the centralized tooltip z-index above nonblocking overlays', async () => {
    render(
      <Tooltip content="Layered tooltip" delay={0}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('tooltip')).toHaveStyle({ zIndex: Z_INDEX.TOOLTIP })
  })

  it('repositions while visible when the trigger moves during scroll', async () => {
    let triggerTop = 100
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    rectSpy.mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tooltip') {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 80,
          bottom: 20,
          width: 80,
          height: 20,
          toJSON: () => ({}),
        }
      }
      if (this.textContent?.includes('Hover me')) {
        return {
          x: 40,
          y: triggerTop,
          left: 40,
          top: triggerTop,
          right: 90,
          bottom: triggerTop + 20,
          width: 50,
          height: 20,
          toJSON: () => ({}),
        }
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }
    })

    render(
      <Tooltip content="Moving tooltip" delay={0}>
        <Button>Hover me</Button>
      </Tooltip>
    )

    fireEvent.mouseEnter(screen.getByRole('button'))

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    expect(screen.getByRole('tooltip')).toHaveStyle({ top: '72px' })

    triggerTop = 160
    fireEvent.scroll(window)

    expect(screen.getByRole('tooltip')).toHaveStyle({ top: '132px' })
  })
})
