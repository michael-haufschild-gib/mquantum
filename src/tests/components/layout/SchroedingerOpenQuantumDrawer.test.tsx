import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

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

  // ─── HO mode: decoherence channel toggles ───────────────────────────

  describe('HO mode: decoherence channels', () => {
    beforeEach(() => {
      useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
    })

    it('toggles dephasing channel on/off and shows rate slider when on', () => {
      // Dephasing is enabled by default
      render(<SchroedingerOpenQuantumDrawer />)

      const decoherencePanel = screen.getByTestId('openq-panel-decoherence')

      // Dephasing toggle should show "ON"
      const dephasingToggle = within(decoherencePanel).getByRole('button', {
        name: /toggle dephasing channel/i,
      })
      expect(dephasingToggle).toHaveTextContent('ON')

      // γφ slider should be visible when dephasing is on
      expect(screen.getByText('γφ')).toBeInTheDocument()

      // Toggle off
      fireEvent.click(dephasingToggle)

      expect(useExtendedObjectStore.getState().schroedinger.openQuantum.dephasingEnabled).toBe(
        false
      )
    })

    it('toggles relaxation channel and shows rate slider when enabled', () => {
      // Relaxation is disabled by default
      render(<SchroedingerOpenQuantumDrawer />)

      const relaxationToggle = screen.getByRole('button', {
        name: /toggle relaxation channel/i,
      })
      expect(relaxationToggle).toHaveTextContent('OFF')

      // γ↓ slider should NOT be visible when relaxation is off
      expect(screen.queryByText('γ↓')).not.toBeInTheDocument()

      // Toggle on
      fireEvent.click(relaxationToggle)

      expect(useExtendedObjectStore.getState().schroedinger.openQuantum.relaxationEnabled).toBe(
        true
      )
    })

    it('toggles thermal excitation channel and shows rate slider when enabled', () => {
      render(<SchroedingerOpenQuantumDrawer />)

      const thermalToggle = screen.getByRole('button', {
        name: /toggle thermal excitation channel/i,
      })
      expect(thermalToggle).toHaveTextContent('OFF')

      // γ↑ slider should NOT be visible when thermal is off
      expect(screen.queryByText('γ↑')).not.toBeInTheDocument()

      // Toggle on
      fireEvent.click(thermalToggle)

      expect(useExtendedObjectStore.getState().schroedinger.openQuantum.thermalEnabled).toBe(true)
    })
  })

  // ─── HO mode: integrator controls ──────────────────────────────────

  describe('HO mode: integrator controls', () => {
    beforeEach(() => {
      useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
    })

    it('renders dt and substeps sliders in the integrator section', () => {
      render(<SchroedingerOpenQuantumDrawer />)

      const integratorPanel = screen.getByTestId('openq-panel-integrator')
      expect(within(integratorPanel).getByText('dt')).toBeInTheDocument()
      expect(within(integratorPanel).getByText('Substeps')).toBeInTheDocument()
    })
  })

  // ─── Hydrogen mode: physics-based controls ─────────────────────────

  describe('hydrogen mode controls', () => {
    beforeEach(() => {
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
      useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
    })

    it('shows thermal bath controls instead of decoherence channels', () => {
      render(<SchroedingerOpenQuantumDrawer />)

      // Hydrogen mode should show Thermal Bath section, not Decoherence Channels
      expect(screen.getByTestId('openq-panel-thermal-bath')).toBeInTheDocument()
      expect(screen.queryByTestId('openq-panel-decoherence')).not.toBeInTheDocument()

      // Temperature and coupling sliders should be visible
      expect(screen.getByText('Temperature (K)')).toBeInTheDocument()
      expect(screen.getByText('Coupling')).toBeInTheDocument()
    })

    it('shows hydrogen basis selector', () => {
      render(<SchroedingerOpenQuantumDrawer />)

      expect(screen.getByTestId('openq-panel-hydrogen-basis')).toBeInTheDocument()
      expect(screen.getByText('Basis Size (n_max)')).toBeInTheDocument()
    })

    it('shows hydrogen dephasing model selector with rate slider', () => {
      render(<SchroedingerOpenQuantumDrawer />)

      expect(screen.getByTestId('openq-panel-hydrogen-dephasing')).toBeInTheDocument()
      expect(screen.getByText('Model')).toBeInTheDocument()
      // Default model is "uniform" — dephasing rate slider should be visible
      expect(screen.getByText('γφ')).toBeInTheDocument()
    })

    it('hides dephasing rate slider when model is "none"', () => {
      useExtendedObjectStore.getState().setOpenQuantumDephasingModel('none')

      render(<SchroedingerOpenQuantumDrawer />)

      expect(screen.queryByText('γφ')).not.toBeInTheDocument()
    })
  })

  // ─── Disabled state ────────────────────────────────────────────────

  describe('disabled state', () => {
    it('applies opacity/pointer-events-none when open quantum is disabled', () => {
      useExtendedObjectStore.getState().setOpenQuantumEnabled(false)

      render(<SchroedingerOpenQuantumDrawer />)

      // The parameter group should be aria-disabled
      const paramGroup = screen.getByRole('group', { name: 'Open quantum parameters' })
      expect(paramGroup).toHaveAttribute('aria-disabled', 'true')
    })
  })
})
