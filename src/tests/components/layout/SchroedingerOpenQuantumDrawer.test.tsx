import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SchroedingerOpenQuantumDrawer } from '@/components/layout/TimelineControls/SchroedingerOpenQuantumDrawer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('SchroedingerOpenQuantumDrawer', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
  })

  it('renders the Open Quantum drawer with controls', () => {
    render(<SchroedingerOpenQuantumDrawer />)

    expect(screen.getByTestId('schroedinger-open-quantum-drawer')).toBeInTheDocument()
    expect(screen.getByText('Open Quantum')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /toggle open quantum system/i })).toBeInTheDocument()
  })

  it('toggles density matrix enablement from the Open Q drawer', () => {
    useExtendedObjectStore.getState().setOpenQuantumEnabled(false)
    render(<SchroedingerOpenQuantumDrawer />)

    fireEvent.click(screen.getByRole('button', { name: /toggle open quantum system/i }))

    expect(useExtendedObjectStore.getState().schroedinger.openQuantum.enabled).toBe(true)
  })

  it('resets to pure state without changing existing Open Quantum settings', () => {
    const store = useExtendedObjectStore.getState()
    store.setOpenQuantumEnabled(true)
    store.setOpenQuantumDephasingRate(1.25)
    store.setOpenQuantumRelaxationRate(0.75)
    store.setOpenQuantumThermalUpRate(0.33)
    store.setOpenQuantumDt(0.037)
    store.setOpenQuantumSubsteps(7)
    const resetTokenBefore = store.schroedinger.openQuantum.resetToken

    render(<SchroedingerOpenQuantumDrawer />)
    fireEvent.click(screen.getByRole('button', { name: /reset density matrix to pure state/i }))

    const oq = useExtendedObjectStore.getState().schroedinger.openQuantum
    expect(oq.enabled).toBe(true)
    expect(oq.dephasingRate).toBeCloseTo(1.25)
    expect(oq.relaxationRate).toBeCloseTo(0.75)
    expect(oq.thermalUpRate).toBeCloseTo(0.33)
    expect(oq.dt).toBeCloseTo(0.037)
    expect(oq.substeps).toBe(7)
    expect(oq.resetToken).toBe((resetTokenBefore ?? 0) + 1)
  })

  it('does not render in wigner representation', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')

    render(<SchroedingerOpenQuantumDrawer />)

    expect(screen.queryByTestId('schroedinger-open-quantum-drawer')).not.toBeInTheDocument()
  })

  it('shows a warning when termCount is 1', () => {
    useExtendedObjectStore.getState().setSchroedingerTermCount(1)

    render(<SchroedingerOpenQuantumDrawer />)

    expect(
      screen.getByText(/no visible open-system dynamics with single basis state/i)
    ).toBeInTheDocument()
  })
})
