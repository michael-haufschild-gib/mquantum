/**
 * BuffersTab tests.
 *
 * Verifies: buffer dimensions rendered, refresh button updates display,
 * temporal debug toggle disabled when temporal reprojection is off,
 * temporal debug toggle enabled for schroedinger with reprojection on.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { BuffersTabContent } from '@/components/canvas/PerformanceMonitor/tabs/BuffersTab'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'

const initialMetrics = usePerformanceMetricsStore.getState()
const initialPerf = usePerformanceStore.getState()
const initialUI = useUIStore.getState()
const initialGeom = useGeometryStore.getState()

function seedBuffers(screenW = 1920, screenH = 1080, temporalW = 960, temporalH = 540) {
  usePerformanceMetricsStore.setState({
    buffers: {
      screen: { width: screenW, height: screenH },
      temporal: { width: temporalW, height: temporalH },
    },
  })
}

describe('BuffersTabContent', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.setState(initialMetrics, true)
    usePerformanceStore.setState(initialPerf, true)
    useUIStore.setState(initialUI, true)
    useGeometryStore.setState(initialGeom, true)
  })

  it('renders "Render Targets" section header', () => {
    seedBuffers()
    render(<BuffersTabContent />)
    expect(screen.getByText('Render Targets')).toBeInTheDocument()
  })

  it('renders screen buffer dimensions', () => {
    seedBuffers(1920, 1080, 960, 540)
    render(<BuffersTabContent />)
    expect(screen.getByText('Screen')).toBeInTheDocument()
    // BufferRow renders w×h as adjacent text nodes — use container text check
    expect(screen.getByText((_, el) => el?.textContent === '1920\u00d71080')).toBeInTheDocument()
  })

  it('renders temporal buffer dimensions', () => {
    seedBuffers(1920, 1080, 960, 540)
    render(<BuffersTabContent />)
    // "Temporal" appears in section header AND button — check by label text "Temporal" in BufferRow
    expect(screen.getByText((_, el) => el?.textContent === '960\u00d7540')).toBeInTheDocument()
  })

  it('refresh button re-reads buffer stats from store', async () => {
    const user = userEvent.setup()
    seedBuffers(1920, 1080, 960, 540)
    render(<BuffersTabContent />)

    // Update metrics store before refresh
    usePerformanceMetricsStore.setState({
      buffers: {
        screen: { width: 2560, height: 1440 },
        temporal: { width: 1280, height: 720 },
      },
    })

    await user.click(screen.getByRole('button', { name: 'Refresh buffer stats' }))
    expect(screen.getByText((_, el) => el?.textContent === '2560\u00d71440')).toBeInTheDocument()
  })

  it('temporal debug toggle is disabled when temporalReprojectionEnabled is false', () => {
    seedBuffers()
    usePerformanceStore.setState({ temporalReprojectionEnabled: false })
    useGeometryStore.setState({ objectType: 'schroedinger' })
    render(<BuffersTabContent />)

    // DebugToggle renders a button; when disabled it should have disabled attribute
    const temporalButton = screen.getByRole('button', { name: /Temporal/i })
    expect(temporalButton).toBeDisabled()
  })

  it('temporal debug toggle is disabled for non-schroedinger object type', () => {
    seedBuffers()
    usePerformanceStore.setState({ temporalReprojectionEnabled: true })
    useGeometryStore.setState({ objectType: 'pauliSpinor' })
    render(<BuffersTabContent />)

    const temporalButton = screen.getByRole('button', { name: /Temporal/i })
    expect(temporalButton).toBeDisabled()
  })

  it('temporal debug toggle is enabled for schroedinger with temporal reprojection on', () => {
    seedBuffers()
    usePerformanceStore.setState({ temporalReprojectionEnabled: true })
    useGeometryStore.setState({ objectType: 'schroedinger' })
    render(<BuffersTabContent />)

    const temporalButton = screen.getByRole('button', { name: /Temporal/i })
    expect(temporalButton).not.toBeDisabled()
  })

  it('clicking temporal debug toggle flips showTemporalDepthBuffer', async () => {
    const user = userEvent.setup()
    seedBuffers()
    usePerformanceStore.setState({ temporalReprojectionEnabled: true })
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useUIStore.setState({ showTemporalDepthBuffer: false })
    render(<BuffersTabContent />)

    await user.click(screen.getByRole('button', { name: /Temporal/i }))
    expect(useUIStore.getState().showTemporalDepthBuffer).toBe(true)
  })

  it('renders "Debug View" section header', () => {
    seedBuffers()
    render(<BuffersTabContent />)
    expect(screen.getByText('Debug View')).toBeInTheDocument()
  })
})
