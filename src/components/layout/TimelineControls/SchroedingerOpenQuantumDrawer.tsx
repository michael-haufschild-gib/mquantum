/**
 * SchroedingerOpenQuantumDrawer Component
 *
 * Dedicated timeline drawer for Open Quantum controls. Consolidates all
 * density-matrix and Lindblad channel controls into one place.
 *
 * Supports two modes:
 * - HO mode: manual rate sliders for dephasing, relaxation, thermal channels
 * - Hydrogen mode: physics-based controls (bath temperature, coupling, basis size)
 */

import React, { useCallback } from 'react'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { Button } from '@/components/ui/Button'
import {
  useExtendedObjectStore,
  type ExtendedObjectState,
} from '@/stores/extendedObjectStore'
import { useShallow } from 'zustand/react/shallow'
import { AnimationDrawerContainer } from './AnimationDrawerContainer'

/**
 * Props for the Schrödinger Open Quantum drawer.
 */
export interface SchroedingerOpenQuantumDrawerProps {
  /** Callback to close the drawer. */
  onClose?: () => void
}

const BASIS_MAX_N_OPTIONS = [
  { value: '1', label: 'n\u2264 1 (1 state)' },
  { value: '2', label: 'n\u2264 2 (5 states)' },
  { value: '3', label: 'n\u2264 3 (14 states)' },
]

const DEPHASING_MODEL_OPTIONS = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'none', label: 'None' },
]

/**
 * Renders the consolidated Open Quantum controls in a dedicated timeline drawer.
 *
 * @param props - Component props.
 * @returns Open Quantum drawer, or null when the current mode does not support it.
 */
export const SchroedingerOpenQuantumDrawer: React.FC<SchroedingerOpenQuantumDrawerProps> =
  React.memo(({ onClose }) => {
    const {
      quantumMode,
      representation,
      termCount,
      enabled,
      dephasingEnabled,
      dephasingRate,
      relaxationEnabled,
      relaxationRate,
      thermalEnabled,
      thermalUpRate,
      dt,
      substeps,
      bathTemperature,
      couplingScale,
      hydrogenBasisMaxN,
      dephasingModel,
      setEnabled,
      setDephasingRate,
      setRelaxationRate,
      setThermalUpRate,
      setDt,
      setSubsteps,
      setChannelEnabled,
      requestOpenQuantumStateReset,
      setBathTemperature,
      setCouplingScale,
      setHydrogenBasisMaxN,
      setDephasingModel,
    } = useExtendedObjectStore(
      useShallow((state: ExtendedObjectState) => ({
        quantumMode: state.schroedinger.quantumMode,
        representation: state.schroedinger.representation,
        termCount: state.schroedinger.termCount,
        enabled: state.schroedinger.openQuantum?.enabled ?? false,
        dephasingEnabled: state.schroedinger.openQuantum?.dephasingEnabled ?? true,
        dephasingRate: state.schroedinger.openQuantum?.dephasingRate ?? 0.5,
        relaxationEnabled: state.schroedinger.openQuantum?.relaxationEnabled ?? false,
        relaxationRate: state.schroedinger.openQuantum?.relaxationRate ?? 0,
        thermalEnabled: state.schroedinger.openQuantum?.thermalEnabled ?? false,
        thermalUpRate: state.schroedinger.openQuantum?.thermalUpRate ?? 0,
        dt: state.schroedinger.openQuantum?.dt ?? 0.01,
        substeps: state.schroedinger.openQuantum?.substeps ?? 4,
        bathTemperature: state.schroedinger.openQuantum?.bathTemperature ?? 300,
        couplingScale: state.schroedinger.openQuantum?.couplingScale ?? 1.0,
        hydrogenBasisMaxN: state.schroedinger.openQuantum?.hydrogenBasisMaxN ?? 2,
        dephasingModel: state.schroedinger.openQuantum?.dephasingModel ?? 'uniform',
        setEnabled: state.setOpenQuantumEnabled,
        setDephasingRate: state.setOpenQuantumDephasingRate,
        setRelaxationRate: state.setOpenQuantumRelaxationRate,
        setThermalUpRate: state.setOpenQuantumThermalUpRate,
        setDt: state.setOpenQuantumDt,
        setSubsteps: state.setOpenQuantumSubsteps,
        setChannelEnabled: state.setOpenQuantumChannelEnabled,
        requestOpenQuantumStateReset: state.requestOpenQuantumStateReset,
        setBathTemperature: state.setOpenQuantumBathTemperature,
        setCouplingScale: state.setOpenQuantumCouplingScale,
        setHydrogenBasisMaxN: state.setOpenQuantumHydrogenBasisMaxN,
        setDephasingModel: state.setOpenQuantumDephasingModel,
      }))
    )

    const isHydrogen = quantumMode === 'hydrogenND'
    const supportsOpenQuantum =
      (quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND') &&
      representation !== 'wigner'

    const onDephasingToggle = useCallback(() => {
      setChannelEnabled('dephasing', !dephasingEnabled)
    }, [dephasingEnabled, setChannelEnabled])
    const onRelaxationToggle = useCallback(() => {
      setChannelEnabled('relaxation', !relaxationEnabled)
    }, [relaxationEnabled, setChannelEnabled])
    const onThermalToggle = useCallback(() => {
      setChannelEnabled('thermal', !thermalEnabled)
    }, [setChannelEnabled, thermalEnabled])
    const onResetToPure = useCallback(() => {
      requestOpenQuantumStateReset()
    }, [requestOpenQuantumStateReset])
    const onBasisMaxNChange = useCallback(
      (v: string) => setHydrogenBasisMaxN(parseInt(v, 10)),
      [setHydrogenBasisMaxN]
    )
    const onDephasingModelChange = useCallback(
      (v: string) => setDephasingModel(v as 'none' | 'uniform'),
      [setDephasingModel]
    )

    if (!supportsOpenQuantum) {
      return null
    }

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="schroedinger-open-quantum-drawer">
        <div className="space-y-4 md:col-span-2" data-testid="openq-panel-controls">
          <div className="space-y-4" data-testid="openq-panel-main">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Open Quantum
              </label>
              <ToggleButton
                pressed={enabled}
                onToggle={() => setEnabled(!enabled)}
                className="text-xs px-2 py-1 h-auto"
                ariaLabel="Toggle open quantum system"
              >
                {enabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>

            {quantumMode === 'harmonicOscillator' && termCount === 1 && (
              <div
                className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning"
                data-testid="openq-termcount-warning"
              >
                No visible open-system dynamics with single basis state.
              </div>
            )}

            <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              {isHydrogen ? (
                /* ── Hydrogen mode: physics-based controls ── */
                <>
                  <div className="space-y-3" data-testid="openq-panel-hydrogen-basis">
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                      Hydrogen Basis
                    </p>
                    <Select
                      label="Basis Size (n_max)"
                      options={BASIS_MAX_N_OPTIONS}
                      value={String(hydrogenBasisMaxN)}
                      onChange={onBasisMaxNChange}
                    />
                  </div>

                  <div className="space-y-3" data-testid="openq-panel-thermal-bath">
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                      Thermal Bath
                    </p>
                    <Slider
                      label="Temperature (K)"
                      min={0.1}
                      max={10000}
                      step={1}
                      value={bathTemperature}
                      onChange={setBathTemperature}
                      showValue
                    />
                    <Slider
                      label="Coupling"
                      min={0.01}
                      max={100}
                      step={0.01}
                      value={couplingScale}
                      onChange={setCouplingScale}
                      showValue
                    />
                  </div>

                  <div className="space-y-3" data-testid="openq-panel-hydrogen-dephasing">
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                      Dephasing
                    </p>
                    <Select
                      label="Model"
                      options={DEPHASING_MODEL_OPTIONS}
                      value={dephasingModel}
                      onChange={onDephasingModelChange}
                    />
                    {dephasingModel !== 'none' && (
                      <Slider
                        label={'\u03B3\u03C6'}
                        min={0}
                        max={5}
                        step={0.01}
                        value={dephasingRate}
                        onChange={setDephasingRate}
                        showValue
                      />
                    )}
                  </div>
                </>
              ) : (
                /* ── HO mode: manual rate controls ── */
                <div className="space-y-3" data-testid="openq-panel-decoherence">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                    Decoherence Channels
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary">Dephasing</label>
                      <ToggleButton
                        pressed={dephasingEnabled}
                        onToggle={onDephasingToggle}
                        className="text-xs px-2 py-1 h-auto"
                        ariaLabel="Toggle dephasing channel"
                      >
                        {dephasingEnabled ? 'ON' : 'OFF'}
                      </ToggleButton>
                    </div>
                    {dephasingEnabled && (
                      <Slider
                        label={'\u03B3\u03C6'}
                        min={0}
                        max={5}
                        step={0.01}
                        value={dephasingRate}
                        onChange={setDephasingRate}
                        showValue
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary">Relaxation</label>
                      <ToggleButton
                        pressed={relaxationEnabled}
                        onToggle={onRelaxationToggle}
                        className="text-xs px-2 py-1 h-auto"
                        ariaLabel="Toggle relaxation channel"
                      >
                        {relaxationEnabled ? 'ON' : 'OFF'}
                      </ToggleButton>
                    </div>
                    {relaxationEnabled && (
                      <Slider
                        label={'\u03B3\u2193'}
                        min={0}
                        max={5}
                        step={0.01}
                        value={relaxationRate}
                        onChange={setRelaxationRate}
                        showValue
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-text-secondary">Thermal Excitation</label>
                      <ToggleButton
                        pressed={thermalEnabled}
                        onToggle={onThermalToggle}
                        className="text-xs px-2 py-1 h-auto"
                        ariaLabel="Toggle thermal excitation channel"
                      >
                        {thermalEnabled ? 'ON' : 'OFF'}
                      </ToggleButton>
                    </div>
                    {thermalEnabled && (
                      <Slider
                        label={'\u03B3\u2191'}
                        min={0}
                        max={5}
                        step={0.01}
                        value={thermalUpRate}
                        onChange={setThermalUpRate}
                        showValue
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3" data-testid="openq-panel-integrator">
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                  Integrator
                </p>
                <Slider
                  label="dt"
                  min={0.001}
                  max={0.1}
                  step={0.001}
                  value={dt}
                  onChange={setDt}
                  showValue
                />
                <Slider
                  label="Substeps"
                  min={1}
                  max={10}
                  step={1}
                  value={substeps}
                  onChange={setSubsteps}
                  showValue
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={onResetToPure}
                ariaLabel="Reset density matrix to pure state"
              >
                Reset to Pure State
              </Button>
            </div>
          </div>
        </div>
      </AnimationDrawerContainer>
    )
  })

SchroedingerOpenQuantumDrawer.displayName = 'SchroedingerOpenQuantumDrawer'

export default SchroedingerOpenQuantumDrawer
