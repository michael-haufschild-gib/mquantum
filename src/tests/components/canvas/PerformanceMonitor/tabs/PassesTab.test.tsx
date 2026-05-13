/**
 * PassesTab tests.
 *
 * Verifies: empty state message, pass table rows with formatted names,
 * GPU budget bar visible when GPU timings present, skipped pass count shown,
 * no-GPU-timing warning rendered when GPU time is zero.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { PassesTabContent } from '@/components/canvas/PerformanceMonitor/tabs/PassesTab'
import { usePerformanceMetricsStore } from '@/stores/diagnostics/performanceMetricsStore'

const initialState = usePerformanceMetricsStore.getState()

describe('PassesTabContent', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.setState(initialState, true)
  })

  it('shows empty state when no pass timings', () => {
    usePerformanceMetricsStore.setState({ passTimings: [] })
    render(<PassesTabContent />)
    expect(screen.getByText('No pass timing data available')).toBeInTheDocument()
  })

  it('renders pass name in table from camelCase passId', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'schroedingerRenderer',
          gpuTimeMs: 2.5,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 2.5,
          cpuTimeMs: 0.3,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 2.5,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText('Schroedinger Renderer')).toBeInTheDocument()
  })

  it('renders GPU time from pass timing entry', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'bloom',
          gpuTimeMs: 1.23,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 1.23,
          cpuTimeMs: 0.1,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 1.23,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText('1.23')).toBeInTheDocument()
  })

  it('shows GPU budget label when GPU timings are present', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'bloom',
          gpuTimeMs: 3.0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 3.0,
          cpuTimeMs: 0.2,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 3.0,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText(/GPU Budget/)).toBeInTheDocument()
  })

  it('shows GPU timing unavailable warning when all GPU times are zero', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'bloom',
          gpuTimeMs: 0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 0,
          cpuTimeMs: 0.5,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 0,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText(/GPU timing unavailable/)).toBeInTheDocument()
  })

  it('shows skipped pass count when passes are skipped', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'bloom',
          gpuTimeMs: 1.0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 1.0,
          cpuTimeMs: 0.1,
          skipped: false,
        },
        {
          passId: 'ssao',
          gpuTimeMs: 0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 0,
          cpuTimeMs: 0,
          skipped: true,
        },
        {
          passId: 'ssr',
          gpuTimeMs: 0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 0,
          cpuTimeMs: 0,
          skipped: true,
        },
      ],
      totalGpuTimeMs: 1.0,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText(/2 passes skipped/)).toBeInTheDocument()
  })

  it('renders per-pass table header columns', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'test',
          gpuTimeMs: 1.0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 1.0,
          cpuTimeMs: 0.5,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 1.0,
      cpuBreakdown: { setupMs: 0, passesMs: 0, submitMs: 0 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('GPU')).toBeInTheDocument()
    expect(screen.getByText('CPU')).toBeInTheDocument()
  })

  it('shows CPU breakdown labels when passesMs > 0', () => {
    usePerformanceMetricsStore.setState({
      passTimings: [
        {
          passId: 'test',
          gpuTimeMs: 0,
          computeGpuTimeMs: 0,
          renderGpuTimeMs: 0,
          cpuTimeMs: 1.0,
          skipped: false,
        },
      ],
      totalGpuTimeMs: 0,
      cpuBreakdown: { setupMs: 0.5, passesMs: 1.5, submitMs: 0.2 },
    })
    render(<PassesTabContent />)
    expect(screen.getByText(/Setup/)).toBeInTheDocument()
    expect(screen.getByText(/Passes/)).toBeInTheDocument()
    expect(screen.getByText(/Submit/)).toBeInTheDocument()
  })
})
