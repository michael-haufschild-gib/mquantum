/**
 * CosmologyControls — UI for the Mukhanov-Sasaki bridge on Free Scalar Field.
 *
 * Exposes the cosmological background sub-config introduced in v1:
 *
 * - Master enable toggle (mutually exclusive with self-interaction).
 * - Preset selector: Minkowski, de Sitter, Kasner, ekpyrotic.
 * - Steepness slider (ekpyrotic only) with `s > s_c(n)` enforcement.
 * - Hubble slider (de Sitter only).
 * - Initial conformal time `η₀` slider with auto-safety clamp readout.
 *
 * The spacetime dimension `n = latticeDim + 1` is derived and shown read-only.
 *
 * See `docs/plans/cosmological-background-scalar-field.md` for the full plan.
 */

import React, { useCallback, useMemo } from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { CosmologyConfig } from '@/lib/geometry/extended/freeScalar'
import { safeEta0 } from '@/lib/physics/cosmology/adiabaticVacuum'
import {
  type CosmologyPreset,
  isValidPreset,
  MAX_SPACETIME_DIM,
  MIN_SPACETIME_DIM,
  sCritical,
} from '@/lib/physics/cosmology/presets'

import { BianchiKasnerControls } from './BianchiKasnerControls'
import type { FreeScalarFieldActions } from './types'

/** Props for the cosmology controls sub-panel. */
export interface CosmologyControlsProps {
  /** Current cosmology sub-config (from `FreeScalarConfig.cosmology`). */
  cosmology: CosmologyConfig
  /** Active lattice dimension — drives `n_spacetime = latticeDim + 1`. */
  latticeDim: number
  /** Current lattice grid size (for the η₀ safety readout). */
  gridSize: number[]
  /** Current lattice spacing (for the η₀ safety readout). */
  spacing: number[]
  /** Whether self-interaction is currently enabled (disables cosmology toggle). */
  selfInteractionEnabled: boolean
  /** Store actions for cosmology sub-config. */
  actions: Pick<
    FreeScalarFieldActions,
    | 'setCosmologyEnabled'
    | 'setCosmologyPreset'
    | 'setCosmologySteepness'
    | 'setCosmologyHubble'
    | 'setCosmologyEta0'
    | 'setCosmologyBianchiExponents'
    | 'setCosmologyLqcRhoCritical'
    | 'setCosmologyLqcEquationOfState'
    | 'setCosmologyLqcInitialRhoRatio'
  >
}

/** UI labels for the cosmology presets. */
const PRESET_LABELS: Record<CosmologyPreset, string> = {
  minkowski: 'Minkowski (flat)',
  deSitter: 'de Sitter (inflation)',
  ekpyrotic: 'Ekpyrotic (paper)',
  kasner: 'Kasner (stiff FLRW)',
  bianchiKasner: 'Bianchi-I (vacuum Kasner)',
  lqcBounce: 'LQC Bounce (polymer Friedmann)',
}

/**
 * Sub-panel controlling the Mukhanov-Sasaki cosmological background for the
 * Free Scalar Field mode.
 *
 * @param props - Component props
 * @returns React component
 */
export const CosmologyControls: React.FC<CosmologyControlsProps> = React.memo(
  ({ cosmology, latticeDim, gridSize, spacing, selfInteractionEnabled, actions }) => {
    const spacetimeDim = latticeDim + 1
    const inRange = spacetimeDim >= MIN_SPACETIME_DIM && spacetimeDim <= MAX_SPACETIME_DIM

    const presetOptions = useMemo(
      () =>
        (['minkowski', 'deSitter', 'ekpyrotic', 'kasner', 'bianchiKasner', 'lqcBounce'] as const)
          .filter((p) => (p === 'bianchiKasner' ? latticeDim >= 3 : true))
          .map((p) => ({
            value: p,
            label: PRESET_LABELS[p],
          })),
      [latticeDim]
    )

    // s_c(n) for the current spacetime dim. Defined only when n ≥ 3.
    const scCurrent = useMemo(() => {
      if (!inRange) return undefined
      return sCritical(spacetimeDim)
    }, [inRange, spacetimeDim])

    // Admissible steepness range for ekpyrotic. Matches the setter clamp in
    // `freeScalarCosmologySetters.ts` (sMin = s_c · 1.0001, sMax = 100) so
    // the slider cannot select values the setter would silently clip.
    const steepnessMin = scCurrent !== undefined ? scCurrent * 1.0001 : 0.01
    const steepnessMax = 100

    // Auto-computed safe |η₀| for the current regime. Displayed so the user
    // knows why their input was bumped.
    const safeAbs = useMemo(() => {
      if (!inRange) return undefined
      const params = {
        preset: cosmology.preset,
        spacetimeDim,
        steepness: cosmology.steepness,
        hubble: cosmology.hubble,
        kasnerExponents: cosmology.kasnerExponents,
        lqcRhoCritical: cosmology.lqcRhoCritical,
        lqcEquationOfState: cosmology.lqcEquationOfState,
        lqcInitialRhoRatio: cosmology.lqcInitialRhoRatio,
      }
      if (!isValidPreset(params)) return undefined
      try {
        return safeEta0(params, gridSize, spacing, latticeDim)
      } catch {
        return undefined
      }
    }, [
      cosmology.preset,
      cosmology.steepness,
      cosmology.hubble,
      cosmology.kasnerExponents,
      cosmology.lqcRhoCritical,
      cosmology.lqcEquationOfState,
      cosmology.lqcInitialRhoRatio,
      spacetimeDim,
      gridSize,
      spacing,
      latticeDim,
      inRange,
    ])

    const handlePreset = useCallback(
      (v: string) => actions.setCosmologyPreset(v as CosmologyPreset),
      [actions]
    )

    const etaAbs = Math.abs(cosmology.eta0)
    const safeDisplay = safeAbs !== undefined ? safeAbs.toFixed(2) : '—'
    // `cosmology.eta0` is the already-clamped value stored in state, so we
    // can only detect the narrow case where `safeAbs` has increased since
    // the value was written (e.g. the lattice shrank and `safeEta0` grew).
    // When that happens, tell the user what the clamp target will be on
    // the next reset, not a spurious "from X" number.
    // `clampEta0` keeps the sign of the stored `eta0` and scales it up to
    // `safeAbs`, so the hint must mirror that sign — a positive `eta0` is
    // clamped to `+safeAbs`, a negative one to `-safeAbs`.
    const clampedHint =
      safeAbs !== undefined && etaAbs < safeAbs - 1e-9
        ? ` (will be clamped to ${(cosmology.eta0 < 0 ? -safeAbs : safeAbs).toFixed(2)} on reset)`
        : ''

    return (
      <ControlGroup
        title="Cosmology (Mukhanov-Sasaki)"
        collapsible
        defaultOpen={false}
        data-testid="control-group-fsf-cosmology"
        rightElement={
          <Switch
            checked={cosmology.enabled}
            onCheckedChange={actions.setCosmologyEnabled}
            disabled={selfInteractionEnabled || !inRange}
            data-testid="cosmology-toggle"
          />
        }
      >
        {selfInteractionEnabled && (
          <div className="text-xs text-text-tertiary italic">
            Disabled while self-interaction is active (v1 mutex — linear free field only).
          </div>
        )}

        {!inRange && (
          <div className="text-xs text-text-tertiary italic">
            Cosmology requires spacetime dimension n ∈ [{MIN_SPACETIME_DIM}, {MAX_SPACETIME_DIM}].
            Current n = {spacetimeDim} (latticeDim + 1).
          </div>
        )}

        {cosmology.enabled && inRange && (
          <>
            <div className="text-xs text-text-secondary">
              Spacetime dim n = {spacetimeDim} (derived from latticeDim = {latticeDim})
            </div>

            <Select
              label="Preset"
              tooltip="FLRW background regime. Minkowski = flat spacetime (bit-identical to the default pipeline). de Sitter = exponential inflation, scale-invariant spectrum. Ekpyrotic = paper regime, requires steepness s > s_c(n). Kasner = stiff-fluid limit."
              options={presetOptions}
              value={cosmology.preset}
              onChange={handlePreset}
              data-testid="cosmology-preset-select"
            />

            {cosmology.preset === 'ekpyrotic' && scCurrent !== undefined && (
              <>
                <Slider
                  label="Steepness (s)"
                  tooltip={`Paper's potential steepness s in V(φ) = V₀·e^(−sφ). Must satisfy s > s_c(n)=${scCurrent.toFixed(3)} to stay in the ekpyrotic regime.`}
                  min={steepnessMin}
                  max={steepnessMax}
                  step={0.01}
                  value={cosmology.steepness}
                  onChange={actions.setCosmologySteepness}
                  showValue
                  data-testid="cosmology-steepness-slider"
                />
                <div className="text-xs text-text-tertiary">
                  s_c(n={spacetimeDim}) = {scCurrent.toFixed(3)}
                </div>
              </>
            )}

            {cosmology.preset === 'deSitter' && (
              <Slider
                label="Hubble (H)"
                tooltip="Hubble rate H > 0, setting the de Sitter scale factor a(η) = −1/(Hη). Larger H yields faster exponential expansion and a bluer spectral tilt contribution."
                min={0.01}
                max={100}
                step={0.01}
                value={cosmology.hubble}
                onChange={actions.setCosmologyHubble}
                showValue
                data-testid="cosmology-hubble-slider"
              />
            )}

            {cosmology.preset === 'bianchiKasner' && (
              <BianchiKasnerControls
                kasnerExponents={cosmology.kasnerExponents}
                latticeDim={latticeDim}
                setBianchiExponents={actions.setCosmologyBianchiExponents}
              />
            )}

            {cosmology.preset === 'lqcBounce' && (
              <>
                <Slider
                  label="ρ_c (critical density)"
                  tooltip="LQC critical density at which the Hubble rate vanishes and the contracting phase turns into expansion. Units match the sim; increase to push the bounce to higher densities."
                  min={0.1}
                  max={10}
                  step={0.01}
                  value={cosmology.lqcRhoCritical ?? 1.0}
                  onChange={actions.setCosmologyLqcRhoCritical}
                  showValue
                  data-testid="cosmology-lqc-rhoc-slider"
                />
                <Slider
                  label="w (equation of state)"
                  tooltip="Matter equation of state p = w·ρ. w = 1 is the stiff-fluid default (massless scalar in its kinetic-dominated regime); w = 0 is dust-like."
                  min={0}
                  max={1}
                  step={0.01}
                  value={cosmology.lqcEquationOfState ?? 1.0}
                  onChange={actions.setCosmologyLqcEquationOfState}
                  showValue
                  data-testid="cosmology-lqc-w-slider"
                />
                <Slider
                  label="ρ/ρ_c (start ratio)"
                  tooltip="Starting density ratio ρ/ρ_c at the pre-bounce window edge. Smaller values push the starting point further from the bounce into the Kasner asymptote."
                  min={0.001}
                  max={0.999}
                  step={0.001}
                  value={cosmology.lqcInitialRhoRatio ?? 0.01}
                  onChange={actions.setCosmologyLqcInitialRhoRatio}
                  showValue
                  data-testid="cosmology-lqc-rhostart-slider"
                />
              </>
            )}

            <Slider
              label="η₀ (initial)"
              tooltip="Initial conformal time. Isotropic FLRW presets use η < 0 (deep past). Bianchi-I Kasner and LQC Bounce use η > 0. Runtime floor |η| ≥ 1e-2 prevents singularity crossing."
              min={
                cosmology.preset === 'bianchiKasner'
                  ? 0.01
                  : cosmology.preset === 'lqcBounce'
                    ? 1
                    : -200
              }
              max={
                cosmology.preset === 'bianchiKasner'
                  ? 200
                  : cosmology.preset === 'lqcBounce'
                    ? 19
                    : -0.01
              }
              step={0.01}
              value={cosmology.eta0}
              onChange={actions.setCosmologyEta0}
              showValue
              data-testid="cosmology-eta0-slider"
            />

            <div className="text-xs text-text-tertiary">
              Safe |η₀| ≥ {safeDisplay}
              {clampedHint}
            </div>

            <div className="text-xs text-text-tertiary italic">
              Evolved field is the canonical perturbation δφ with conjugate momentum π, advanced by
              a time-dependent integrator whose coefficients (aKinetic, aPotential, aFull) come from
              the selected background. Output labels refer to these canonical variables — the
              Mukhanov–Sasaki rescaling v = a^((n−2)/2)·δφ is not applied to the stored state.
            </div>
          </>
        )}
      </ControlGroup>
    )
  }
)

CosmologyControls.displayName = 'CosmologyControls'
