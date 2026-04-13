/**
 * Tests for MeasurementControls — Born rule measurement UI.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { MeasurementControls } from '@/components/sections/Analysis/MeasurementControls'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useMeasurementStore } from '@/stores/measurementStore'

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
})
