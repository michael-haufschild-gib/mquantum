import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Tooltip } from '../../../components/ui/Tooltip'
import { Button } from '../../../components/ui/Button'

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

    const trigger = screen.getByRole('button')
    fireEvent.mouseEnter(trigger)

    // Fast-forward time within act
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Tooltip text')).toBeInTheDocument()
  })

  it('does not show tooltip before delay', () => {
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

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
