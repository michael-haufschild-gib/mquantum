import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { StatsTabContent } from '@/components/canvas/PerformanceMonitor/tabs/StatsTab'
import { usePerformanceMetricsStore } from '@/stores/diagnostics/performanceMetricsStore'

const initialMetrics = usePerformanceMetricsStore.getState()

describe('StatsTabContent', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.setState(initialMetrics, true)
  })

  it('renders collected vertex counts instead of deriving them from primitives', () => {
    usePerformanceMetricsStore.setState({
      sceneGpu: { calls: 2, triangles: 100, vertices: 42, lines: 5, points: 7 },
      gpu: { calls: 3, triangles: 200, vertices: 64, lines: 9, points: 13 },
    })

    render(<StatsTabContent />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.queryByText('317')).not.toBeInTheDocument()
    expect(screen.queryByText('631')).not.toBeInTheDocument()
  })
})
