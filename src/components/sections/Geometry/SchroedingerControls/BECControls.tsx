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

import { ControlGroup } from '@/components/ui/ControlGroup'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ALL_GRID_SIZE_OPTIONS, AXIS_LABELS } from '@/constants/dimension'
import type {
  BecFieldView,
  BecInitialCondition,
  DisorderDistribution,
} from '@/lib/geometry/extended/types'
import { TDSE_MAX_TOTAL_SITES } from '@/stores/slices/geometry/setters/sliceSetterUtils'

import type { BecControlsProps } from './types'

const DISORDER_DISTRIBUTION_OPTIONS = [
  { value: 'uniform', label: 'Uniform [-W/2, +W/2]' },
  { value: 'gaussian', label: 'Gaussian N(0, W)' },
]

const INITIAL_CONDITION_OPTIONS = [
  { value: 'thomasFermi', label: 'Thomas-Fermi' },
  { value: 'gaussianPacket', label: 'Gaussian Packet' },
  { value: 'vortexImprint', label: 'Vortex Imprint' },
  { value: 'vortexLattice', label: 'Vortex Lattice' },
  { value: 'darkSoliton', label: 'Dark Soliton' },
  { value: 'vortexReconnection', label: 'Vortex Reconnection (D≥4)' },
  { value: 'blackHoleAnalog', label: 'Analog Horizon (Waterfall)' },
]

const FIELD_VIEW_OPTIONS = [
  { value: 'density', label: 'Density |ψ|²' },
  { value: 'phase', label: 'Phase arg(ψ)' },
  { value: 'current', label: 'Probability Current' },
  { value: 'potential', label: 'Potential V(x)' },
  { value: 'superfluidVelocity', label: 'Superfluid Velocity' },
  { value: 'healingLength', label: 'Healing Length' },
  { value: 'machNumber', label: 'Mach Number M = |v_s|/c_s' },
]

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

    // Filter grid options by budget: at high D, large grid sizes exceed TDSE_MAX_TOTAL_SITES
    const maxGridPerDim = useMemo(
      () => Math.round(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / activeDims)),
      [activeDims]
    )
    const gridSizeOptions = useMemo(
      () => ALL_GRID_SIZE_OPTIONS.filter((o) => parseInt(o.value, 10) <= maxGridPerDim),
      [maxGridPerDim]
    )

    const activeGridSize = bec.gridSize[0] ?? 64
    const handleGridSizeChange = useCallback(
      (v: string) => {
        const size = parseInt(v, 10)
        actions.setGridSize(Array.from({ length: activeDims }, () => size))
      },
      [activeDims, actions]
    )
    const totalSites = useMemo(() => {
      let sites = 1
      for (let d = 0; d < activeDims; d++) sites *= bec.gridSize[d] ?? 64
      return sites
    }, [bec.gridSize, activeDims])
    const memoryKB = Math.round((totalSites * 2 * 8) / 1024)

    const showVortexControls =
      bec.initialCondition === 'vortexImprint' || bec.initialCondition === 'vortexLattice'
    const showSolitonControls = bec.initialCondition === 'darkSoliton'
    const showReconnectionControls = bec.initialCondition === 'vortexReconnection'
    const showAnalogHorizonControls = bec.initialCondition === 'blackHoleAnalog'

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
      <div className="space-y-1">
        <ControlGroup
          title="Initial Condition"
          collapsible
          defaultOpen
          data-testid="control-group-bec-initial"
        >
          <Select
            label="Initial Condition"
            tooltip="Starting wavefunction shape: Thomas-Fermi ground state, Gaussian, vortex, or soliton."
            value={bec.initialCondition}
            onChange={(v) => actions.setInitialCondition(v as BecInitialCondition)}
            options={INITIAL_CONDITION_OPTIONS}
          />

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

          {showAnalogHorizonControls && (
            <>
              <Slider
                label="v_max (asymptotic flow)"
                tooltip="Supersonic flow speed as |x₀| → ∞. The waterfall profile v_s = v_max·tanh(x₀/L_h) crosses the sound speed c_s at the horizon; the horizon exists iff v_max > c_s."
                value={bec.hawkingVmax}
                onChange={actions.setHawkingVmax}
                min={0.5}
                max={5}
                step={0.05}
                data-testid="bec-hawking-vmax"
              />
              <Slider
                label="L_h (horizon width)"
                tooltip="Profile length scale. Smaller L_h ⇒ steeper velocity gradient ⇒ higher surface gravity κ ⇒ higher analog Hawking temperature T_H = κ/2π."
                value={bec.hawkingLh}
                onChange={actions.setHawkingLh}
                min={0.1}
                max={1.5}
                step={0.01}
                data-testid="bec-hawking-lh"
              />
              <Slider
                label="Δn (horizon density dip)"
                tooltip="Fractional density depletion at the horizon: n(x₀) = n₀(1 − Δn·sech²(x₀/L_h)). Larger Δn localizes the horizon but risks a dark-soliton instability."
                value={bec.hawkingDeltaN}
                onChange={actions.setHawkingDeltaN}
                min={0}
                max={0.6}
                step={0.01}
                data-testid="bec-hawking-deltan"
              />
              <Switch
                label="Pair injection"
                tooltip="Horizon-localized stochastic phase kick δφ = rate·w(M)·η. Deterministic per (seed, stepIndex). Off by default — turn on to seed analog Hawking pair production."
                checked={bec.hawkingPairInjection}
                onCheckedChange={actions.setHawkingPairInjection}
                data-testid="bec-hawking-inject"
              />
              {bec.hawkingPairInjection && (
                <Slider
                  label="Inject rate"
                  tooltip="Strength of the horizon phase kick per substep. Kept small (≤ 0.5 rad) to stay in the small-angle regime and preserve norm."
                  value={bec.hawkingInjectRate}
                  onChange={actions.setHawkingInjectRate}
                  min={0}
                  max={0.5}
                  step={0.005}
                  data-testid="bec-hawking-rate"
                />
              )}
              <NumberInput
                label="Seed"
                tooltip="Deterministic integer seed for the pair-injection noise. Changing it selects a different realization of the phonon bath."
                value={bec.hawkingSeed}
                onChange={actions.setHawkingSeed}
                min={0}
                max={2_147_483_647}
                step={1}
                data-testid="bec-hawking-seed"
              />
            </>
          )}
        </ControlGroup>

        <ControlGroup
          title="Physics"
          collapsible
          defaultOpen
          data-testid="control-group-bec-physics"
        >
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
          <Select
            label="Field View"
            tooltip="Which physical observable to visualize: condensate density, phase, probability current, or potential."
            value={bec.fieldView}
            onChange={(v) => actions.setFieldView(v as BecFieldView)}
            options={FIELD_VIEW_OPTIONS}
          />
        </ControlGroup>

        <ControlGroup
          title="Disorder Overlay"
          collapsible
          defaultOpen={false}
          data-testid="control-group-bec-disorder"
        >
          <Slider
            label="Strength (W)"
            tooltip="Anderson-style on-site disorder strength added to the trap potential: V(x) += W·η(x) where η(x) ∈ [−0.5, +0.5] is deterministic seeded noise. 0 = disabled (no simulation cost). Sweep at fixed interaction strength to trace the superfluid↔Bose-glass phase boundary (Fisher et al., Phys. Rev. B 40, 546 (1989))."
            value={bec.disorderStrength}
            onChange={actions.setDisorderStrength}
            min={0}
            max={100}
            step={0.1}
            showValue
            data-testid="bec-disorder-strength"
          />
          {bec.disorderStrength > 0 && (
            <>
              <Select
                label="Distribution"
                tooltip="Statistical distribution of on-site disorder energies."
                value={bec.disorderDistribution}
                onChange={(v) => actions.setDisorderDistribution(v as DisorderDistribution)}
                options={DISORDER_DISTRIBUTION_OPTIONS}
                data-testid="bec-disorder-distribution"
              />
              <Slider
                label="Seed"
                tooltip="PRNG seed for the disorder realization. Same seed + grid = same random potential for reproducibility."
                value={bec.disorderSeed}
                onChange={actions.setDisorderSeed}
                min={0}
                max={999999}
                step={1}
                showValue
                data-testid="bec-disorder-seed"
              />
            </>
          )}
        </ControlGroup>

        <ControlGroup
          title="Grid & Numerics"
          collapsible
          defaultOpen={false}
          data-testid="control-group-bec-numerics"
        >
          <Select
            label="Grid Size"
            tooltip="Number of lattice points per dimension. Total sites = N^D; larger grids increase spatial resolution but cost O(N^D) memory."
            value={String(activeGridSize)}
            onChange={handleGridSizeChange}
            options={gridSizeOptions}
            data-testid="bec-grid-size"
          />
          <div className="text-xs text-text-tertiary">
            {totalSites.toLocaleString()} sites ({maxGridPerDim}^{activeDims} max) · {memoryKB} KB
          </div>
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
        </ControlGroup>

        {activeDims > 3 && bec.slicePositions.length > 0 && (
          <ControlGroup
            title="Slice Positions"
            collapsible
            defaultOpen={false}
            data-testid="control-group-bec-slices"
          >
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
          </ControlGroup>
        )}
      </div>
    )
  }
)

BECControls.displayName = 'BECControls'
