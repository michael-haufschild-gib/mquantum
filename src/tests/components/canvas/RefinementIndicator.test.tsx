import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RefinementIndicator } from '@/components/canvas/RefinementIndicator'
import { usePerformanceStore } from '@/stores/performanceStore'

const initialState = usePerformanceStore.getState()
const resetStore = () => usePerformanceStore.setState(initialState, true)

describe('RefinementIndicator', () => {
  beforeEach(() => {
    resetStore()
    // Default to enabled
    usePerformanceStore.setState({ progressiveRefinementEnabled: true })
    // Cleanup body
    document.body.innerHTML = ''
  })

  it('should render when refining', () => {
    render(<RefinementIndicator />)

    act(() => {
      usePerformanceStore.setState({
        refinementProgress: 50,
        refinementStage: 'low',
        isInteracting: false,
      })
    })

    const indicator = screen.getByTestId('refinement-indicator')
    expect(indicator).toBeInTheDocument()
    expect(indicator.parentElement).toBe(document.body) // Verify portal
    expect(screen.getByText('Refining')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('should not render when disabled', () => {
    render(<RefinementIndicator />)

    act(() => {
      usePerformanceStore.setState({
        progressiveRefinementEnabled: false,
        refinementProgress: 50,
      })
    })

    expect(screen.queryByTestId('refinement-indicator')).not.toBeInTheDocument()
  })

  it('should hide during interaction', () => {
    render(<RefinementIndicator />)

    act(() => {
      usePerformanceStore.setState({
        refinementProgress: 50,
        isInteracting: true,
      })
    })

    expect(screen.queryByTestId('refinement-indicator')).not.toBeInTheDocument()
  })

  it('should show "Complete" when finished', () => {
    render(<RefinementIndicator />)

    act(() => {
      usePerformanceStore.setState({
        refinementProgress: 100,
        refinementStage: 'final',
        isInteracting: false,
      })
    })

    const indicator = screen.getByTestId('refinement-indicator')
    expect(indicator).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })
})
