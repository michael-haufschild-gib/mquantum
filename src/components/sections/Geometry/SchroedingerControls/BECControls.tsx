/**
 * BECControls Component
 *
 * Configuration panel for Bose-Einstein condensate dynamics via Gross-Pitaevskii equation.
 * Provides controls for initial condition, interaction strength, trap parameters,
 * field view, PML boundaries, and numerical settings.
 *
 * @module components/sections/Geometry/SchroedingerControls/BECControls
 */

import React, { useCallback, useMemo } from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { BecFieldView, BecInitialCondition } from '@/lib/geometry/extended/types'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'

import type { BecControlsProps } from './types'

const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o']

/** TDSE/BEC max total sites — must match store constant */
const TDSE_MAX_TOTAL_SITES = 262144

const ALL_GRID_SIZE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]

const INITIAL_CONDITION_OPTIONS = [
  { value: 'thomasFermi', label: 'Thomas-Fermi' },
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'vortexImprint', label: 'Vortex Imprint' },
  { value: 'vortexLattice', label: 'Vortex Lattice' },
  { value: 'darkSoliton', label: 'Dark Soliton' },
  { value: 'vortexReconnection', label: 'Vortex Reconnection (D≥4)' },
]

const FIELD_VIEW_OPTIONS = [
  { value: 'density', label: 'Density |ψ|²' },
  { value: 'phase', label: 'Phase arg(ψ)' },
  { value: 'current', label: 'Probability Current' },
  { value: 'potential', label: 'Potential V(x)' },
  { value: 'superfluidVelocity', label: 'Superfluid Velocity' },
  { value: 'healingLength', label: 'Healing Length' },
]

/** Filter BEC presets by dimension — presets with minDim > current dim are hidden. */
function getPresetOptions(dim: number) {
  return [
    { value: '', label: '— Select Preset —' },
    ...BEC_SCENARIO_PRESETS
      .filter((p) => (p.minDim ?? 2) <= dim)
      .map((p) => ({ value: p.id, label: p.name })),
  ]
}

/**
 * BEC (Gross-Pitaevskii) control panel.
 *
 * @param props - BEC controls props
 * @returns BEC configuration UI
 *
 * @example
 * ```tsx
 * <BECControls config={config} dimension={3} actions={becActions} />
 * ```
 */
export const BECControls: React.FC<BecControlsProps> = React.memo(
  ({ config, dimension, actions }) => {
    const bec = config.bec
    const activeDims = Math.min(bec.latticeDim, dimension)

    // Scenario preset detection
    const detectActivePreset = useCallback((cfg: typeof bec): string => {
      for (const preset of BEC_SCENARIO_PRESETS) {
        const o = preset.overrides
        if (
          (o.interactionStrength === undefined ||
            o.interactionStrength === cfg.interactionStrength) &&
          (o.trapOmega === undefined || o.trapOmega === cfg.trapOmega) &&
          (o.initialCondition === undefined || o.initialCondition === cfg.initialCondition)
        ) {
          return preset.id
        }
      }
      return ''
    }, [])

    const activePreset = useMemo(() => detectActivePreset(bec), [detectActivePreset, bec])

    // Filter grid options by budget: at high D, large grid sizes exceed TDSE_MAX_TOTAL_SITES
    const maxGridPerDim = useMemo(
      () => Math.floor(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / activeDims)),
      [activeDims]
    )
    const gridSizeOptions = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((o) => parseInt(o.value, 10) <= maxGridPerDim),
      [maxGridPerDim]
    )
    const presetOptions = useMemo(() => getPresetOptions(dimension), [dimension])

    const showVortexControls =
      bec.initialCondition === 'vortexImprint' || bec.initialCondition === 'vortexLattice'
    const showSolitonControls = bec.initialCondition === 'darkSoliton'
    const showReconnectionControls = bec.initialCondition === 'vortexReconnection'

    // Build axis pair options for vortex plane selectors
    const axisPairOptions = useMemo(() => {
      const opts: { value: string; label: string }[] = []
      for (let a = 0; a < activeDims; a++) {
        for (let b = a + 1; b < activeDims; b++) {
          opts.push({
            value: `${a},${b}`,
            label: `${AXIS_LABELS[a]}${AXIS_LABELS[b]}`,
          })
        }
      }
      return opts
    }, [activeDims])

    return (
      <div className="space-y-4">
        {/* Scenario Preset */}
        <Select
          label="Scenario"
          tooltip="Pre-configured BEC scenarios with tuned interaction strength, trap, and initial state."
          value={activePreset}
          onChange={(v) => v && actions.applyPreset(v)}
          options={presetOptions}
        />

        {/* Initial Condition */}
        <Select
          label="Initial Condition"
          tooltip="Starting wavefunction shape: Thomas-Fermi ground state, Gaussian, vortex, or soliton."
          value={bec.initialCondition}
          onChange={(v) => actions.setInitialCondition(v as BecInitialCondition)}
          options={INITIAL_CONDITION_OPTIONS}
        />

        {/* Conditional: Vortex controls */}
        {showVortexControls && (
          <>
            <Slider
              label="Vortex Charge"
              tooltip="Topological charge (winding number) of the vortex. Higher magnitude = more angular momentum. Sign determines rotation direction."
              value={bec.vortexCharge}
              onChange={actions.setVortexCharge}
              min={-4}
              max={4}
              step={1}
            />
            {bec.initialCondition === 'vortexLattice' && (
              <Slider
                label="Vortex Count"
                tooltip="Number of quantized vortices in the Abrikosov-like lattice arrangement."
                value={bec.vortexLatticeCount}
                onChange={actions.setVortexLatticeCount}
                min={1}
                max={16}
                step={1}
              />
            )}
          </>
        )}

        {/* Conditional: Soliton controls */}
        {showSolitonControls && (
          <>
            <Slider
              label="Soliton Depth"
              tooltip="Density notch depth of the dark soliton. 1.0 = fully dark (stationary), lower = grey soliton."
              value={bec.solitonDepth}
              onChange={actions.setSolitonDepth}
              min={0}
              max={1}
              step={0.05}
            />
            <Slider
              label="Soliton Velocity"
              tooltip="Initial velocity of the dark soliton in units of the speed of sound. Sign sets propagation direction."
              value={bec.solitonVelocity}
              onChange={actions.setSolitonVelocity}
              min={-1}
              max={1}
              step={0.05}
            />
          </>
        )}

        {/* Conditional: Vortex reconnection controls (D≥4) */}
        {showReconnectionControls && (
          <>
            <Slider
              label="Vortex Charge"
              tooltip="Topological winding number for both vortices in the reconnection pair."
              value={bec.vortexCharge}
              onChange={actions.setVortexCharge}
              min={-4}
              max={4}
              step={1}
            />
            <Select
              label="Vortex 1 Plane"
              tooltip="2D plane for the first vortex's phase winding. In D=4, a vortex in plane xy is a 2-surface spanning zw."
              value={`${bec.vortexPlane1[0]},${bec.vortexPlane1[1]}`}
              onChange={(v) => {
                const [a, b] = v.split(',').map(Number) as [number, number]
                actions.setVortexPlane1([a, b])
              }}
              options={axisPairOptions}
            />
            <Select
              label="Vortex 2 Plane"
              tooltip="2D plane for the second vortex. Orthogonal planes (e.g. xy+zw) produce reconnection; same plane produces parallel vortices."
              value={`${bec.vortexPlane2[0]},${bec.vortexPlane2[1]}`}
              onChange={(v) => {
                const [a, b] = v.split(',').map(Number) as [number, number]
                actions.setVortexPlane2([a, b])
              }}
              options={axisPairOptions}
            />
            <Slider
              label="Separation"
              tooltip="Distance between vortex cores. Zero = coincident cores, larger values delay reconnection onset."
              value={bec.vortexSeparation}
              onChange={actions.setVortexSeparation}
              min={0}
              max={5}
              step={0.1}
            />
            <Select
              label="Vortex Count"
              tooltip="1 = single configurable-plane vortex, 2 = reconnection pair."
              value={String(bec.vortexPairCount)}
              onChange={(v) => actions.setVortexPairCount(parseInt(v, 10))}
              options={[
                { value: '1', label: '1 (single vortex)' },
                { value: '2', label: '2 (reconnection pair)' },
              ]}
            />
          </>
        )}

        {/* Physics */}
        <Slider
          label="Interaction g̃"
          tooltip="Dimensionless contact interaction strength. Positive = repulsive (stable BEC), negative = attractive (collapse). Controls nonlinearity in the Gross-Pitaevskii equation."
          value={bec.interactionStrength}
          onChange={actions.setInteractionStrength}
          min={-1000}
          max={10000}
          step={10}
        />
        <Slider
          label="Trap ω"
          tooltip="Harmonic trap frequency. Higher values confine the condensate more tightly, increasing the density and interaction energy."
          value={bec.trapOmega}
          onChange={actions.setTrapOmega}
          min={0.01}
          max={10}
          step={0.01}
        />

        {/* Per-dimension trap anisotropy ratios (ω_d = ratio * ω) */}
        {activeDims > 1 &&
          Array.from({ length: activeDims }, (_, i) => (
            <Slider
              key={`aniso-${i}`}
              label={`ω ratio ${AXIS_LABELS[i]}`}
              tooltip="Trap anisotropy ratio for this axis. Multiplies the base trap frequency to create elongated or pancake traps."
              value={bec.trapAnisotropy?.[i] ?? 1.0}
              onChange={(v) => actions.setTrapAnisotropy(i, v)}
              min={0.1}
              max={5.0}
              step={0.05}
            />
          ))}

        {/* Display */}
        <Select
          label="Field View"
          tooltip="Which physical observable to visualize: condensate density, phase, probability current, or potential."
          value={bec.fieldView}
          onChange={(v) => actions.setFieldView(v as BecFieldView)}
          options={FIELD_VIEW_OPTIONS}
        />
        <Switch
          label="Auto-Scale"
          tooltip="Automatically rescale the color map range to the current density extrema each frame."
          checked={bec.autoScale}
          onCheckedChange={actions.setAutoScale}
        />

        {/* Numerics: Grid */}
        {Array.from({ length: activeDims }, (_, i) => (
          <Select
            key={`grid-${i}`}
            label={`Grid ${AXIS_LABELS[i]}`}
            tooltip="Number of lattice points along this axis. Higher values increase spatial resolution but cost O(N^D) memory."
            value={String(bec.gridSize[i] ?? 64)}
            onChange={(v) => {
              const arr = [...bec.gridSize]
              arr[i] = parseInt(v, 10)
              actions.setGridSize(arr)
            }}
            options={gridSizeOptions}
          />
        ))}

        {/* Numerics: Spacing */}
        {Array.from({ length: activeDims }, (_, i) => (
          <Slider
            key={`spacing-${i}`}
            label={`Spacing ${AXIS_LABELS[i]}`}
            tooltip="Distance between adjacent grid points (dx). Smaller spacing resolves finer features but requires more points."
            value={bec.spacing[i] ?? 0.15}
            onChange={(v) => {
              const arr = [...bec.spacing]
              arr[i] = v
              actions.setSpacing(arr)
            }}
            min={0.01}
            max={1.0}
            step={0.01}
          />
        ))}

        {/* Numerics: Particle */}
        <Slider
          label="Mass"
          tooltip="Particle mass in the GP equation. Affects kinetic energy scale and healing length of the condensate."
          value={bec.mass}
          onChange={actions.setMass}
          min={0.1}
          max={10}
          step={0.1}
        />
        <Slider
          label="ℏ"
          tooltip="Reduced Planck constant. Scales the kinetic term and sets the quantum pressure in the Gross-Pitaevskii equation."
          value={bec.hbar}
          onChange={actions.setHbar}
          min={0.1}
          max={10}
          step={0.1}
        />

        {/* Numerics: Time */}
        <Slider
          label="dt"
          tooltip="Time step for split-step Fourier integration. Too large causes numerical instability; too small slows evolution."
          value={bec.dt}
          onChange={actions.setDt}
          min={0.0001}
          max={0.02}
          step={0.0001}
        />
        <Slider
          label="Steps/Frame"
          tooltip="Number of GP integration steps per rendered frame. More steps = faster physical time per frame."
          value={bec.stepsPerFrame}
          onChange={actions.setStepsPerFrame}
          min={1}
          max={16}
          step={1}
        />

        {/* Slice positions for dims > 3 */}
        {activeDims > 3 && bec.slicePositions.length > 0 && (
          <>
            {Array.from({ length: Math.min(activeDims - 3, bec.slicePositions.length) }, (_, i) => {
              const dimIdx = i + 3
              const halfExtent =
                ((bec.gridSize[dimIdx] ?? 8) * (bec.spacing[dimIdx] ?? bec.spacing[0] ?? 0.15)) / 2
              return (
                <Slider
                  key={`slice-${dimIdx}`}
                  label={`Slice ${AXIS_LABELS[dimIdx]}`}
                  tooltip="Cross-section position along this extra dimension for 3D visualization of the higher-D condensate."
                  value={bec.slicePositions[i] ?? 0}
                  onChange={(v) => actions.setSlicePosition(i, v)}
                  min={-halfExtent}
                  max={halfExtent}
                  step={halfExtent / 20}
                />
              )
            })}
          </>
        )}
      </div>
    )
  }
)

BECControls.displayName = 'BECControls'
