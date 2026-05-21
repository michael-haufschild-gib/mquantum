/**
 * SchroedingerOpenQuantumDrawer Component
 *
 * Dedicated timeline drawer for Open Quantum controls. Consolidates all
 * density-matrix and Lindblad channel controls into one place.
 *
 * Supports two modes:
 * - HO mode: manual rate sliders for dephasing, relaxation, thermal channels
 * - Hydrogen mode: physics-based controls (bath temperature, coupling, basis size)
 *
 * Each feature group is a separate grid child so the drawer can use
 * two columns when enough sections are present.
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import {
  type ExtendedObjectState,
  useExtendedObjectStore,
} from '@/stores/scene/extendedObjectStore'

import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import { DrawerSection } from './DrawerSection'

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
        setBathTemperature: state.setOpenQuantumBathTemperature,
        setCouplingScale: state.setOpenQuantumCouplingScale,
        setHydrogenBasisMaxN: state.setOpenQuantumHydrogenBasisMaxN,
        setDephasingModel: state.setOpenQuantumDephasingModel,
      }))
    )

    const isHydrogen = quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled'
    const supportsOpenQuantum =
      (quantumMode === 'harmonicOscillator' ||
        quantumMode === 'hydrogenND' ||
        quantumMode === 'hydrogenNDCoupled') &&
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
      <AnimationDrawerContainer
        onClose={onClose}
        fullWidth
        data-testid="schroedinger-open-quantum-drawer"
      >
        {/* Master toggle — spans full width */}
        <DrawerSection
          title="Open Quantum"
          enabled={enabled}
          onToggle={setEnabled}
          toggleAriaLabel="Toggle open quantum system"
          testId="openq-panel-main"
          className="col-span-full"
        >
          {quantumMode === 'harmonicOscillator' && termCount === 1 && (
            <div
              className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning"
              data-testid="openq-termcount-warning"
            >
              No visible open-system dynamics with single basis state.
            </div>
          )}
        </DrawerSection>

        {/* Sub-sections: each is a separate grid child, disabled when master is OFF */}
        {isHydrogen ? (
          <>
            <DrawerSection
              title="Hydrogen Basis"
              enabled={enabled}
              testId="openq-panel-hydrogen-basis"
            >
              <Select
                label="Basis Size (n_max)"
                options={BASIS_MAX_N_OPTIONS}
                value={String(hydrogenBasisMaxN)}
                onChange={onBasisMaxNChange}
                tooltip="Largest principal quantum number n in the basis"
              />
            </DrawerSection>

            <DrawerSection title="Thermal Bath" enabled={enabled} testId="openq-panel-thermal-bath">
              <Slider
                label="Temperature (K)"
                min={0.1}
                max={10000}
                step={1}
                value={bathTemperature}
                onChange={setBathTemperature}
                showValue
                tooltip="Bath temperature in kelvin (Lindblad equilibrium)"
              />
              <Slider
                label="Coupling"
                min={0.01}
                max={100}
                step={0.01}
                value={couplingScale}
                onChange={setCouplingScale}
                showValue
                tooltip="System-bath coupling strength (Lindblad rate prefactor)"
              />
            </DrawerSection>

            <DrawerSection
              title="Dephasing"
              enabled={enabled}
              testId="openq-panel-hydrogen-dephasing"
            >
              <Select
                label="Model"
                options={DEPHASING_MODEL_OPTIONS}
                value={dephasingModel}
                onChange={onDephasingModelChange}
                tooltip="Pure-dephasing model applied to the hydrogen basis"
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
                  tooltip="Pure-dephasing rate \u03B3\u03C6 (off-diagonal decay)"
                />
              )}
            </DrawerSection>
          </>
        ) : (
          <DrawerSection
            title="Decoherence Channels"
            enabled={enabled}
            testId="openq-panel-decoherence"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Dephasing</label>
                <ToggleButton
                  pressed={dephasingEnabled}
                  onToggle={onDephasingToggle}
                  className="text-xs px-2 py-1 h-auto"
                  ariaLabel="Toggle dephasing channel"
                  tooltip="Enable or disable the pure-dephasing Lindblad channel"
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
                  tooltip="Pure-dephasing rate \u03B3\u03C6 (off-diagonal decay)"
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
                  tooltip="Enable or disable the relaxation Lindblad channel"
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
                  tooltip="Population decay rate \u03B3\u2193 (downward transitions)"
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
                  tooltip="Enable or disable the thermal-excitation channel"
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
                  tooltip="Thermal excitation rate \u03B3\u2191 (upward transitions)"
                />
              )}
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="Integrator" enabled={enabled} testId="openq-panel-integrator">
          <Slider
            label="dt"
            min={0.001}
            max={0.1}
            step={0.001}
            value={dt}
            onChange={setDt}
            showValue
            tooltip="Lindblad integration time step (smaller = more accurate)"
          />
          <Slider
            label="Substeps"
            min={1}
            max={10}
            step={1}
            value={substeps}
            onChange={setSubsteps}
            showValue
            tooltip="Sub-steps per visual frame for the Lindblad integrator"
          />
        </DrawerSection>
      </AnimationDrawerContainer>
    )
  })

SchroedingerOpenQuantumDrawer.displayName = 'SchroedingerOpenQuantumDrawer'

export default SchroedingerOpenQuantumDrawer
