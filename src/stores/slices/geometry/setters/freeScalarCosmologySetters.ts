/**
 * Free Scalar Field cosmology setter factory.
 *
 * Extracted from `freeScalarSetters.ts` to keep that file under the 600-line
 * limit. Provides the five cosmology setters for the Mukhanov-Sasaki bridge,
 * each enforcing the physically admissible ranges and re-running the safe-η₀
 * clamp whenever lattice or regime parameters change.
 *
 * Invariants enforced here (see `docs/plans/cosmological-background-scalar-field.md`):
 *
 * - Enabling cosmology forces `selfInteractionEnabled = false` (v1 mutex).
 * - Ekpyrotic steepness is clamped to `(s_c(n), 100]`.
 * - Hubble rate is clamped to `[0.01, 100]`.
 * - `eta0 ≠ 0` always; auto-clamped to `|η₀| ≥ safeEta0(...)` via `clampEta0`.
 * - `needsReset = true` on any change that invalidates the current field data.
 *
 * @module stores/slices/geometry/setters/freeScalarCosmologySetters
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { clampEta0 } from '@/lib/physics/cosmology/adiabaticVacuum'
import {
  isValidPreset,
  MAX_SPACETIME_DIM,
  MIN_SPACETIME_DIM,
  sCritical,
} from '@/lib/physics/cosmology/presets'

import type { SchroedingerSliceActions } from '../types'
import type { SetterContext } from './sliceSetterUtils'

/**
 * Re-enforce cosmology invariants after a lattice change (latticeDim, gridSize,
 * spacing, initialCondition grid-snap, ...). Three invariants are maintained:
 *
 * 1. **Range:** cosmology is only valid for `spacetimeDim = latticeDim + 1`
 *    in `[MIN_SPACETIME_DIM, MAX_SPACETIME_DIM]`. Outside that range, the
 *    Mukhanov-Sasaki bridge's `qExponent` throws (see `presets.ts`), and the
 *    runtime would oscillate between soft-fail (step path) and hard-fail
 *    (reset path). Force-disable here with a warning.
 * 2. **Safe η₀:** the Bunch-Davies sub-horizon condition depends on `k_min`
 *    (from `gridSize` + `spacing`) and `|β(β−1)|` (from the preset). Any
 *    change to the lattice can invalidate the stored `eta0`; re-run
 *    `clampEta0` to raise `|η₀|` back above the safe threshold.
 * 3. **Reset flag:** whenever either of the above applies, mark the field
 *    for reinit so the next frame re-samples the adiabatic vacuum at the
 *    updated `eta0` (or the Minkowski vacuum if cosmology was disabled).
 *
 * Returns a partial `FreeScalarConfig` patch — empty if no invariants were
 * violated. Merge with the caller's update object.
 *
 * @param fs - Free scalar config AFTER the lattice change has been applied
 * @returns Patch to merge into the next state, or `{}` if no changes needed
 */
export function reconcileCosmologyInvariants(fs: FreeScalarConfig): Partial<FreeScalarConfig> {
  if (!fs.cosmology.enabled) return {}

  const spacetimeDim = fs.latticeDim + 1
  // Out-of-range lattice dim — soft-disable cosmology and mark for reset.
  if (spacetimeDim < MIN_SPACETIME_DIM || spacetimeDim > MAX_SPACETIME_DIM) {
    logger.warn(
      `[freeScalar] Disabling cosmology: spacetimeDim=${spacetimeDim} outside ` +
        `[${MIN_SPACETIME_DIM}, ${MAX_SPACETIME_DIM}] after lattice change.`
    )
    return {
      cosmology: { ...fs.cosmology, enabled: false },
      needsReset: true,
    }
  }

  const params = {
    preset: fs.cosmology.preset,
    spacetimeDim,
    steepness: fs.cosmology.steepness,
    hubble: fs.cosmology.hubble,
  }
  if (!isValidPreset(params)) return {}

  // Re-clamp eta0 to the new safe threshold. If the threshold moved, the
  // clamp raises |eta0| and marks needsReset so the adiabatic vacuum is
  // re-sampled at the updated starting time.
  try {
    const result = clampEta0(fs.cosmology.eta0, params, fs.gridSize, fs.spacing, fs.latticeDim)
    if (result.clamped) {
      return {
        cosmology: { ...fs.cosmology, eta0: result.eta0 },
        needsReset: true,
      }
    }
  } catch (e) {
    // clampEta0 throws on zero / non-finite eta0. The dimension-change path
    // never receives user input here — it's a pure-state reconcile — so a
    // throw indicates a corrupted store state from earlier writes. Surface
    // it via logger.warn so the bug is visible in dev consoles instead of
    // silently swallowed.
    logger.warn(
      `[reconcileCosmologyInvariants] clampEta0 failed for eta0=${fs.cosmology.eta0}: ` +
        `${e instanceof Error ? e.message : String(e)}`
    )
  }
  return {}
}

type CosmologyActions = Pick<
  SchroedingerSliceActions,
  | 'setFreeScalarCosmologyEnabled'
  | 'setFreeScalarCosmologyPreset'
  | 'setFreeScalarCosmologySteepness'
  | 'setFreeScalarCosmologyHubble'
  | 'setFreeScalarCosmologyEta0'
>

/**
 * Build the five cosmology setter actions.
 *
 * @param ctx - Shared setter context with set/get and validation helpers
 * @returns Partial action object containing the cosmology setters
 */
export function createFreeScalarCosmologySetters(ctx: SetterContext): CosmologyActions {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setFreeScalarCosmologyEnabled: (enabled) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Enabling cosmology forces self-interaction off (v1 mutex).
        const selfInteractionEnabled = enabled ? false : fs.selfInteractionEnabled
        // On enable, clamp eta0 to the safe threshold for the current lattice.
        let { eta0 } = fs.cosmology
        if (enabled) {
          try {
            const clamped = clampEta0(
              eta0,
              {
                preset: fs.cosmology.preset,
                spacetimeDim: fs.latticeDim + 1,
                steepness: fs.cosmology.steepness,
                hubble: fs.cosmology.hubble,
              },
              fs.gridSize,
              fs.spacing,
              fs.latticeDim
            )
            eta0 = clamped.eta0
          } catch {
            // Invalid preset combo — keep enable flag but leave eta0 untouched;
            // the compute pass path will fall back to the Minkowski dispersion
            // until the user picks a valid preset.
          }
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              selfInteractionEnabled,
              cosmology: { ...fs.cosmology, enabled, eta0 },
              needsReset: true,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyPreset: (preset) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const spacetimeDim = fs.latticeDim + 1
        // Auto-bump steepness if the new preset is ekpyrotic and the current
        // value would be invalid. Use a 1.5× s_c safety margin.
        let steepness = fs.cosmology.steepness
        if (preset === 'ekpyrotic' && spacetimeDim >= MIN_SPACETIME_DIM) {
          const sc = sCritical(spacetimeDim)
          if (steepness <= sc) steepness = sc * 1.5
        }
        // Re-clamp eta0 for the new regime.
        let { eta0 } = fs.cosmology
        if (fs.cosmology.enabled) {
          try {
            const clamped = clampEta0(
              eta0,
              { preset, spacetimeDim, steepness, hubble: fs.cosmology.hubble },
              fs.gridSize,
              fs.spacing,
              fs.latticeDim
            )
            eta0 = clamped.eta0
          } catch {
            // ignore — kept from previous
          }
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, preset, steepness, eta0 },
              needsReset: true,
            },
          },
        }
      })
    },
    setFreeScalarCosmologySteepness: (s) => {
      if (!isFinite(s)) {
        warnNonFinite('freeScalar.cosmology.steepness', s)
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const spacetimeDim = fs.latticeDim + 1
        const sc = sCritical(spacetimeDim)
        // Clamp to (s_c, +∞). Use a tiny epsilon above s_c so the denominator
        // (n-1)s²-s_c² stays strictly positive and q is finite.
        const sMin = sc * 1.0001
        const sMax = 100
        const clamped = Math.max(sMin, Math.min(sMax, s))
        let { eta0 } = fs.cosmology
        if (fs.cosmology.enabled && fs.cosmology.preset === 'ekpyrotic') {
          const result = clampEta0(
            eta0,
            {
              preset: 'ekpyrotic',
              spacetimeDim,
              steepness: clamped,
              hubble: fs.cosmology.hubble,
            },
            fs.gridSize,
            fs.spacing,
            fs.latticeDim
          )
          eta0 = result.eta0
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, steepness: clamped, eta0 },
              needsReset: fs.cosmology.preset === 'ekpyrotic' || fs.needsReset,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyHubble: (h) => {
      if (!isFinite(h)) {
        warnNonFinite('freeScalar.cosmology.hubble', h)
        return
      }
      const clamped = Math.max(0.01, Math.min(100, h))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, hubble: clamped },
              needsReset: fs.cosmology.preset === 'deSitter' || fs.needsReset,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyEta0: (eta0) => {
      if (!isFinite(eta0)) {
        warnNonFinite('freeScalar.cosmology.eta0', eta0)
        return
      }
      if (eta0 === 0) return // zero is never admissible; reject silently
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        const spacetimeDim = fs.latticeDim + 1
        if (spacetimeDim < MIN_SPACETIME_DIM || spacetimeDim > MAX_SPACETIME_DIM) {
          // latticeDim out of the cosmology-supported range; store verbatim.
          return {
            schroedinger: {
              ...state.schroedinger,
              freeScalar: { ...fs, cosmology: { ...fs.cosmology, eta0 }, needsReset: true },
            },
          }
        }
        let clampedEta0 = eta0
        const params = {
          preset: fs.cosmology.preset,
          spacetimeDim,
          steepness: fs.cosmology.steepness,
          hubble: fs.cosmology.hubble,
        }
        if (isValidPreset(params)) {
          const result = clampEta0(eta0, params, fs.gridSize, fs.spacing, fs.latticeDim)
          clampedEta0 = result.eta0
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, eta0: clampedEta0 },
              needsReset: true,
            },
          },
        }
      })
    },
  }
}
