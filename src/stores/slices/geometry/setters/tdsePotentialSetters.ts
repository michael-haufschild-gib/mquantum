/**
 * TDSE potential and drive parameter setters.
 *
 * Data-driven setters for potential configuration parameters.
 * Each setter validates, clamps, and writes a single field to the TDSE config.
 *
 * @module stores/slices/geometry/setters/tdsePotentialSetters
 */

import { isTdseDriveWaveform, type TdseConfig } from '@/lib/geometry/extended/types'

import type { SetterContext } from './sliceSetterUtils'

/** Definition for a single clamped TDSE parameter setter. */
interface TdseParamDef {
  field: keyof TdseConfig
  min: number
  max: number
}

/** All clamped numeric TDSE potential/drive setters. */
const TDSE_PARAMS: Record<string, TdseParamDef> = {
  setTdseBarrierHeight: { field: 'barrierHeight', min: 0, max: 100 },
  setTdseBarrierWidth: { field: 'barrierWidth', min: 0.01, max: 5 },
  setTdseBarrierCenter: { field: 'barrierCenter', min: -5, max: 5 },
  setTdseWellDepth: { field: 'wellDepth', min: 0, max: 100 },
  setTdseWellWidth: { field: 'wellWidth', min: 0.01, max: 5 },
  setTdseHarmonicOmega: { field: 'harmonicOmega', min: 0.01, max: 50 },
  setTdseStepHeight: { field: 'stepHeight', min: -100, max: 100 },
  setTdseSlitSeparation: { field: 'slitSeparation', min: 0.01, max: 5 },
  setTdseSlitWidth: { field: 'slitWidth', min: 0.001, max: 2 },
  setTdseWallThickness: { field: 'wallThickness', min: 0.005, max: 2 },
  setTdseWallHeight: { field: 'wallHeight', min: 0, max: 200 },
  setTdseLatticeDepth: { field: 'latticeDepth', min: 0, max: 100 },
  setTdseLatticePeriod: { field: 'latticePeriod', min: 0.01, max: 5 },
  setTdseDoubleWellLambda: { field: 'doubleWellLambda', min: 0, max: 200 },
  setTdseDoubleWellSeparation: { field: 'doubleWellSeparation', min: 0.1, max: 5 },
  setTdseDoubleWellAsymmetry: { field: 'doubleWellAsymmetry', min: -50, max: 50 },
  setTdseRadialWellInner: { field: 'radialWellInner', min: 0, max: 5 },
  setTdseRadialWellOuter: { field: 'radialWellOuter', min: 0.1, max: 10 },
  setTdseRadialWellDepth: { field: 'radialWellDepth', min: 0, max: 200 },
  setTdseRadialWellTilt: { field: 'radialWellTilt', min: -2, max: 2 },
  setTdseAnharmonicLambda: { field: 'anharmonicLambda', min: 0, max: 100 },
  // setTdseBhMass lives below in the custom section — it needs to trigger
  // needsReset when the user sweeps M while in blackHoleRingdown mode, which
  // the data-driven factory doesn't support.
  setTdseDisorderStrength: { field: 'disorderStrength', min: 0, max: 100 },
  // setTdseDisorderSeed lives in tdseUiSetters.ts (integer floor + lower-bound only)
  // — intentionally NOT in this float-clamp table because the seed needs Math.floor
  // and has no upper bound.
  setTdseDriveFrequency: { field: 'driveFrequency', min: 0, max: 50 },
  setTdseDriveAmplitude: { field: 'driveAmplitude', min: 0, max: 100 },
}

/**
 * Create data-driven potential/drive parameter setters.
 *
 * @param ctx - Setter context
 * @returns Object with all potential/drive setters
 */
export function createTdsePotentialSetters(
  ctx: SetterContext
): Record<string, (value: number) => void> {
  const { setWithVersion, isFinite, warnNonFinite } = ctx
  const result: Record<string, (value: number) => void> = {}

  for (const [name, def] of Object.entries(TDSE_PARAMS)) {
    result[name] = (value: number) => {
      if (!isFinite(value)) {
        warnNonFinite(`tdse.${def.field}`, value)
        return
      }
      const clamped = Math.max(def.min, Math.min(def.max, value))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, [def.field]: clamped },
        },
      }))
    }
  }

  // Black-hole Regge–Wheeler setters.
  //
  // Changing M, ℓ, or s while already in `blackHoleRingdown` mode reshapes the
  // barrier so dramatically (peak position ∝ M, peak height ∝ ℓ(ℓ+1)/M²) that
  // the existing wavefunction — evolved against the old Hamiltonian — becomes
  // physically meaningless. Trigger `needsReset` whenever these fields change
  // AND the current potential is the BH ringdown barrier. When some other
  // potential is active, the fields are just scratch state for a later switch,
  // so no reset is required.
  //
  // Physical validity requires ℓ ≥ s for Schwarzschild perturbation modes:
  //   • scalar (s=0): any ℓ ≥ 0
  //   • electromagnetic (s=1): only ℓ ≥ 1 is a valid radiating mode
  //   • gravitational (s=2): only ℓ ≥ 2 is a valid propagating mode
  //
  // We enforce this in the setter so the UI can never land on a non-physical
  // combination such as (s=2, ℓ=0), which has no meaning in the linearized
  // Schwarzschild sector even though the closed-form Regge–Wheeler expression
  // would still evaluate to a number.
  const clampInt = (value: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, Math.floor(value)))

  const isBhActive = (cfg: TdseConfig): boolean => cfg.potentialType === 'blackHoleRingdown'

  result.setTdseBhMass = (value: number) => {
    if (!isFinite(value)) {
      warnNonFinite('tdse.bhMass', value)
      return
    }
    const clamped = Math.max(0.1, Math.min(5, value))
    setWithVersion((state) => {
      const prev = state.schroedinger.tdse
      // Only force reset when BH is active AND the clamped value actually
      // changed — a no-op reassignment must preserve the existing
      // `needsReset` flag so repeated slider events don't restart the
      // wavepacket mid-evolution.
      const changed = clamped !== prev.bhMass
      const nextNeedsReset = isBhActive(prev) && changed ? true : prev.needsReset
      return {
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...prev,
            bhMass: clamped,
            needsReset: nextNeedsReset,
          },
        },
      }
    })
  }

  result.setTdseBhMultipoleL = (value: number) => {
    if (!isFinite(value)) {
      warnNonFinite('tdse.bhMultipoleL', value)
      return
    }
    setWithVersion((state) => {
      const prev = state.schroedinger.tdse
      // ℓ floor = current spin; ℓ cap = 6.
      const ell = clampInt(value, prev.bhSpin, 6)
      const changed = ell !== prev.bhMultipoleL
      const nextNeedsReset = isBhActive(prev) && changed ? true : prev.needsReset
      return {
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...prev,
            bhMultipoleL: ell,
            needsReset: nextNeedsReset,
          },
        },
      }
    })
  }

  result.setTdseBhSpin = (value: number) => {
    if (!isFinite(value)) {
      warnNonFinite('tdse.bhSpin', value)
      return
    }
    setWithVersion((state) => {
      const prev = state.schroedinger.tdse
      const spin = clampInt(value, 0, 2) as 0 | 1 | 2
      // Re-enforce the full `[spin, 6]` integer invariant on ℓ — not just
      // `ℓ ≥ s`. A bare `Math.max(prev.bhMultipoleL, spin)` would let a
      // pre-existing `prev.bhMultipoleL = 7` (from a legacy preset migration
      // or direct state mutation) slip through unchanged, violating the
      // upper cap and rounding rules the dedicated `setTdseBhMultipoleL`
      // setter enforces. Round into the canonical band so the spin edit
      // always leaves `(spin, ℓ)` in a state the ℓ setter could itself
      // produce.
      const ell = clampInt(prev.bhMultipoleL, spin, 6)
      const changed = spin !== prev.bhSpin || ell !== prev.bhMultipoleL
      const nextNeedsReset = isBhActive(prev) && changed ? true : prev.needsReset
      return {
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...prev,
            bhSpin: spin,
            bhMultipoleL: ell,
            needsReset: nextNeedsReset,
          },
        },
      }
    })
  }

  // Boolean/enum setters
  result.setTdseDriveEnabled = (enabled: unknown) => {
    if (typeof enabled !== 'boolean') return
    setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        tdse: { ...state.schroedinger.tdse, driveEnabled: enabled },
      },
    }))
  }

  result.setTdseDriveWaveform = (waveform: unknown) => {
    if (!isTdseDriveWaveform(waveform)) return
    const w = waveform
    type DriveWaveform = 'sine' | 'pulse' | 'chirp'
    setWithVersion(
      (state) =>
        ({
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...state.schroedinger.tdse, driveWaveform: w as DriveWaveform },
          },
        }) as Partial<typeof state>
    )
  }

  return result
}
