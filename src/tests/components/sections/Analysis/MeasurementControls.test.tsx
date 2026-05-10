/**
 * Tests for MeasurementControls — Born rule measurement UI.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { MeasurementControls } from '@/components/sections/Analysis/MeasurementControls'
import { useMeasurementStore } from '@/stores/diagnostics/measurementStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function resetStores() {
  useExtendedObjectStore.getState().reset()
  useMeasurementStore.setState(useMeasurementStore.getInitialState())
  useGeometryStore.setState({ ...useGeometryStore.getState(), dimension: 3 })
}

/** Open the measurement group and optionally enable measurement. */
async function openGroup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('control-group-measurement-header'))
}

beforeEach(() => {
  resetStores()
})

describe('MeasurementControls', () => {
  it('renders measurement toggle in header', () => {
    render(<MeasurementControls />)
    expect(screen.getByTestId('measurement-toggle')).toBeInTheDocument()
  })

  it('measurement inner content is not in DOM when group is collapsed', () => {
    render(<MeasurementControls />)
    expect(screen.queryByTestId('measurement-collapse-width')).not.toBeInTheDocument()
    expect(screen.queryByTestId('measurement-clear')).not.toBeInTheDocument()
  })

  it('shows inner controls when group opened and measurement is enabled', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({ ...useMeasurementStore.getInitialState(), enabled: true })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByTestId('measurement-collapse-width')).toBeInTheDocument()
    expect(screen.getByTestId('measurement-clear')).toBeInTheDocument()
  })

  it('shows measurement count text when group opened and enabled', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({
      ...useMeasurementStore.getInitialState(),
      enabled: true,
      totalCount: 5,
    })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByText(/Measurements: 5/)).toBeInTheDocument()
  })

  it('shows axis select for dimension >= 2 when opened', async () => {
    const user = userEvent.setup()
    useGeometryStore.setState({ ...useGeometryStore.getState(), dimension: 3 })
    useMeasurementStore.setState({ ...useMeasurementStore.getInitialState(), enabled: true })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByTestId('measurement-axis')).toBeInTheDocument()
  })

  it('hides axis select for dimension 1 when opened', async () => {
    const user = userEvent.setup()
    useGeometryStore.setState({ ...useGeometryStore.getState(), dimension: 1 })
    useMeasurementStore.setState({ ...useMeasurementStore.getInitialState(), enabled: true })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.queryByTestId('measurement-axis')).not.toBeInTheDocument()
  })

  it('shows Collapsing... text when isCollapsing is true', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({
      ...useMeasurementStore.getInitialState(),
      enabled: true,
      isCollapsing: true,
    })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByText(/Collapsing\.\.\./)).toBeInTheDocument()
  })

  it('shows cooldown frames text when not collapsing but cooldown > 0', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({
      ...useMeasurementStore.getInitialState(),
      enabled: true,
      isCollapsing: false,
      cooldownFrames: 10,
    })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByText(/Evolving\.\.\./)).toBeInTheDocument()
  })

  it('calls clearMeasurements when Clear button clicked', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({ ...useMeasurementStore.getInitialState(), enabled: true })
    render(<MeasurementControls />)
    await openGroup(user)
    await user.click(screen.getByTestId('measurement-clear'))
    expect(useMeasurementStore.getState().measurements).toHaveLength(0)
    expect(useMeasurementStore.getState().totalCount).toBe(0)
  })

  it('shows position statistics table when measurements and positionMean are present', async () => {
    const user = userEvent.setup()
    useMeasurementStore.setState({
      ...useMeasurementStore.getInitialState(),
      enabled: true,
      measurements: [{ position: [0.5, 0.5, 0.5], density: 1, index: 0, measuredAxis: null }],
      totalCount: 1,
      positionMean: [0.5, 0.5, 0.5],
      positionStd: [0.1, 0.1, 0.1],
    })
    render(<MeasurementControls />)
    await openGroup(user)
    expect(screen.getByText('mean')).toBeInTheDocument()
    expect(screen.getByText('std')).toBeInTheDocument()
  })

  it('toggle-on collapseWidth derives from BEC lattice in BEC mode (not TDSE)', async () => {
    const user = userEvent.setup()
    // Distinct lattices so the auto-derived width is unambiguously BEC's:
    // BEC half-extent = 16 * 0.5 * 0.5 = 4.0 → width ≈ 4.0 * 0.2 = 0.80
    // TDSE half-extent = 32 * 0.05 * 0.5 = 0.8 → width ≈ 0.8 * 0.2 = 0.16
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumMode: 'becDynamics',
        tdse: { ...s.schroedinger.tdse, gridSize: [32, 32, 32], spacing: [0.05, 0.05, 0.05] },
        bec: { ...s.schroedinger.bec, gridSize: [16, 16, 16], spacing: [0.5, 0.5, 0.5] },
      },
    }))
    render(<MeasurementControls />)
    await openGroup(user)
    await user.click(screen.getByTestId('measurement-toggle'))
    // Expected: ~0.80 (BEC), not ~0.16 (TDSE).
    const w = useMeasurementStore.getState().collapseWidth
    expect(w).toBeGreaterThan(0.5)
    expect(w).toBeLessThan(1.0)
  })
})
