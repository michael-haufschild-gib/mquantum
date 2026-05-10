/**
 * PerformanceMonitor CollapsedView tests.
 *
 * Verifies: initial FPS/frame time render from store, sparkline SVG path generation,
 * FPS color level assignment (green/yellow/red), store subscription updates DOM via refs.
 */
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CollapsedView } from '@/components/canvas/PerformanceMonitor/CollapsedView'
import { usePerformanceMetricsStore } from '@/stores/diagnostics/performanceMetricsStore'

describe('CollapsedView', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.setState(usePerformanceMetricsStore.getInitialState())
  })

  it('renders initial FPS value from performance metrics store', () => {
    usePerformanceMetricsStore.setState({ fps: 60, frameTime: 16.7 })
    render(<CollapsedView />)

    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('FPS')).toBeInTheDocument()
  })

  it('renders initial frame time', () => {
    usePerformanceMetricsStore.setState({ fps: 30, frameTime: 33.3 })
    render(<CollapsedView />)

    expect(screen.getByText('33.3')).toBeInTheDocument()
    expect(screen.getByText('ms')).toBeInTheDocument()
  })

  it('generates sparkline SVG path from FPS history', () => {
    usePerformanceMetricsStore.setState({
      fps: 60,
      frameTime: 16.7,
      history: { fps: [60, 59, 58, 60, 61], cpu: [], mem: [] },
    })

    render(<CollapsedView />)
    const path = screen.getByTestId('sparkline-path')
    const d = path.getAttribute('d') ?? ''
    expect(d).toMatch(/^M\s/)
    expect(d).toContain(',')
  })

  it('shows empty sparkline when history has fewer than 2 points', () => {
    usePerformanceMetricsStore.setState({
      fps: 60,
      frameTime: 16.7,
      history: { fps: [60], cpu: [], mem: [] },
    })

    render(<CollapsedView />)
    const path = screen.getByTestId('sparkline-path')
    expect(path.getAttribute('d') ?? '').toBe('')
  })

  it('updates FPS text via subscription when store changes', () => {
    usePerformanceMetricsStore.setState({ fps: 60, frameTime: 16.7 })
    render(<CollapsedView />)

    expect(screen.getByText('60')).toBeInTheDocument()

    // Update store — the component uses a zustand subscription, not re-render
    act(() => {
      usePerformanceMetricsStore.setState({
        fps: 45,
        frameTime: 22.2,
        history: { fps: [45], cpu: [], mem: [] },
      })
    })

    // The ref-based update should have changed the text content
    expect(screen.getByText('45')).toBeInTheDocument()
  })

  it('applies health-high class for high FPS (≥50)', () => {
    usePerformanceMetricsStore.setState({ fps: 60 })
    render(<CollapsedView />)

    const fpsContainer = screen.getByTestId('fps-value')
    expect(fpsContainer).toHaveClass('health-high')
  })

  it('applies health-medium class for medium FPS (30-49)', () => {
    usePerformanceMetricsStore.setState({ fps: 35 })
    render(<CollapsedView />)

    const fpsContainer = screen.getByTestId('fps-value')
    expect(fpsContainer).toHaveClass('health-medium')
  })

  it('applies health-low class for low FPS (<30)', () => {
    usePerformanceMetricsStore.setState({ fps: 15 })
    render(<CollapsedView />)

    const fpsContainer = screen.getByTestId('fps-value')
    expect(fpsContainer).toHaveClass('health-low')
  })
})
