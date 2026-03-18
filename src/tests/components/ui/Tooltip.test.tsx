import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

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
})
