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
import { isKasnerVacuum } from '@/lib/physics/cosmology/bianchiKasner'
import {
  isValidPreset,
  MAX_SPACETIME_DIM,
  MIN_SPACETIME_DIM,
  sCritical,
} from '@/lib/physics/cosmology/presets'

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
    kasnerExponents: fs.cosmology.kasnerExponents,
    lqcRhoCritical: fs.cosmology.lqcRhoCritical,
    lqcEquationOfState: fs.cosmology.lqcEquationOfState,
    lqcInitialRhoRatio: fs.cosmology.lqcInitialRhoRatio,
  }
  // Invalid preset combo (e.g. ekpyrotic with steepness ≤ s_c after a lattice
  // bump pushed s_c past the current value, or de Sitter with non-positive
  // hubble) would let `sampleAdiabaticVacuum` / `computeCosmologyAt` throw at
  // reset time. Soft-disable cosmology and mark for reset so the next frame
  // falls through to the ordinary Minkowski vacuum path instead of crashing.
  if (!isValidPreset(params)) {
    logger.warn(
      `[reconcileCosmologyInvariants] Disabling cosmology: preset=${fs.cosmology.preset} ` +
        `params invalid (steepness=${fs.cosmology.steepness}, hubble=${fs.cosmology.hubble}, ` +
        `spacetimeDim=${spacetimeDim}) after lattice change.`
    )
    return {
      cosmology: { ...fs.cosmology, enabled: false },
      needsReset: true,
    }
  }

  // Re-clamp eta0 to the new safe threshold. If the threshold moved, the
  // clamp raises |eta0| and marks needsReset so the adiabatic vacuum is
  // re-sampled at the updated starting time.
  // Bianchi-I does not use the isotropic safe-η₀ heuristic — the runtime
  // COSMOLOGY_ETA_FLOOR is the only guard needed. Matches the bypass in
  // resolveEta0ForPresetSwitch and setFreeScalarCosmologyEnabled.
  if (fs.cosmology.preset !== 'bianchiKasner' && fs.cosmology.preset !== 'lqcBounce') {
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
      // throw indicates a corrupted store state from earlier writes. Soft-
      // disable cosmology so the compute pass cannot crash on the next reset,
      // and log the underlying error so the bug is visible in dev consoles.
      logger.warn(
        `[reconcileCosmologyInvariants] Disabling cosmology: clampEta0 failed for ` +
          `eta0=${fs.cosmology.eta0}: ${e instanceof Error ? e.message : String(e)}`
      )
      return {
        cosmology: { ...fs.cosmology, enabled: false },
        needsReset: true,
      }
    }
  }
  return {}
}

/**
 * Validate + re-clamp `eta0` for the new preset during a preset switch.
 * Encapsulates the fallthrough that soft-disables cosmology whenever the
 * new params would be rejected by `isValidPreset` or `clampEta0` throws.
 * Bianchi-I skips the clamp because the safe-η₀ heuristic is derived from
 * the isotropic Mukhanov-Sasaki super-horizon bound.
 *
 * @param fs - Current free-scalar config (gridSize/spacing/latticeDim source)
 * @param preset - Target cosmology preset
 * @param staged - Already-resolved steepness/hubble/kasnerExponents and
 *                 starting eta0 from {@link resolvePresetSwitchSubstate}
 * @returns Final `(eta0, enabled)` to write into the cosmology sub-config
 */
function resolveEta0ForPresetSwitch(
  fs: FreeScalarConfig,
  preset: import('@/lib/physics/cosmology/presets').CosmologyPreset,
  staged: {
    spacetimeDim: number
    steepness: number
    hubble: number
    kasnerExponents: NonNullable<FreeScalarConfig['cosmology']['kasnerExponents']>
    lqcRhoCritical: number
    lqcEquationOfState: number
    lqcInitialRhoRatio: number
    eta0: number
    enabled: boolean
  }
): { eta0: number; enabled: boolean } {
  let { eta0, enabled } = staged
  if (!enabled) return { eta0, enabled }
  const params = {
    preset,
    spacetimeDim: staged.spacetimeDim,
    steepness: staged.steepness,
    hubble: staged.hubble,
    kasnerExponents: staged.kasnerExponents,
    lqcRhoCritical: staged.lqcRhoCritical,
    lqcEquationOfState: staged.lqcEquationOfState,
    lqcInitialRhoRatio: staged.lqcInitialRhoRatio,
  }
  if (!isValidPreset(params)) {
    logger.warn(
      `[setFreeScalarCosmologyPreset] Disabling cosmology: preset=${preset} ` +
        `params invalid after switch (steepness=${staged.steepness}, ` +
        `hubble=${staged.hubble}, spacetimeDim=${staged.spacetimeDim}).`
    )
    return { eta0, enabled: false }
  }
  if (preset === 'bianchiKasner' || preset === 'lqcBounce') {
    // Bianchi-I and LQC bounce do not use the isotropic safe-η₀
    // heuristic — the runtime COSMOLOGY_ETA_FLOOR is the only guard
    // needed, and both use the η > 0 gauge.
    return { eta0, enabled }
  }
  try {
    const clamped = clampEta0(eta0, params, fs.gridSize, fs.spacing, fs.latticeDim)
    eta0 = clamped.eta0
  } catch (e) {
    logger.warn(
      `[setFreeScalarCosmologyPreset] Disabling cosmology: clampEta0 failed for ` +
        `eta0=${eta0}: ${e instanceof Error ? e.message : String(e)}`
    )
    enabled = false
  }
  return { eta0, enabled }
}

/**
 * Resolve the `(eta0, kasnerExponents)` pair when switching cosmology preset.
 * Bianchi-I requires η > 0 and a populated exponent triple; flipping to or
 * from that preset flips the sign of the stored `eta0`. Extracted so the
 * main preset setter stays under the cognitive-complexity ceiling.
 *
 * @param fs - Current free-scalar config
 * @param preset - Target cosmology preset
 * @returns `(eta0, kasnerExponents)` to stage into the next state
 */
function resolvePresetSwitchSubstate(
  fs: FreeScalarConfig,
  preset: import('@/lib/physics/cosmology/presets').CosmologyPreset
): {
  eta0: number
  kasnerExponents: NonNullable<FreeScalarConfig['cosmology']['kasnerExponents']>
} {
  const kasnerExponents = fs.cosmology.kasnerExponents ?? { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 }
  let eta0 = fs.cosmology.eta0
  const positiveEta = preset === 'bianchiKasner' || preset === 'lqcBounce'
  if (positiveEta && eta0 < 0) eta0 = -eta0
  if (!positiveEta && eta0 > 0) eta0 = -eta0
  // LQC bounce lives on a bounded η-window centred on `etaBounceAnchor = 10`
  // by default. If the user's previous η₀ was huge (e.g. −200 from the
  // FLRW slider), after the flip it lands outside the LQC table's range
  // and evaluateLqcBounceCoefs would clamp. Snap into the table window
  // so the starting frame is physically meaningful.
  if (preset === 'lqcBounce') {
    if (eta0 < 1) eta0 = 1
    if (eta0 > 19) eta0 = 19
  }
  return { eta0, kasnerExponents }
}

/** Actions exposed by the free-scalar cosmology setter bundle. */
export interface FreeScalarCosmologySetters {
  setFreeScalarCosmologyEnabled: (enabled: boolean) => void
  setFreeScalarCosmologyPreset: (
    preset: import('@/lib/physics/cosmology/presets').CosmologyPreset
  ) => void
  setFreeScalarCosmologySteepness: (s: number) => void
  setFreeScalarCosmologyHubble: (h: number) => void
  setFreeScalarCosmologyEta0: (eta0: number) => void
  /**
   * Set the Bianchi-I Kasner exponent triple `(p₁, p₂, p₃)`. Only
   * consulted when `cosmology.preset === 'bianchiKasner'`; the other
   * presets keep the stored value through serialization but do not read
   * it. Non-finite inputs are rejected with a dev warning.
   */
  setFreeScalarCosmologyBianchiExponents: (p1: number, p2: number, p3: number) => void
  /**
   * Set the LQC critical density `ρ_c > 0` (clamped to `[0.1, 10]`). Only
   * consulted when `cosmology.preset === 'lqcBounce'`.
   */
  setFreeScalarCosmologyLqcRhoCritical: (rhoCritical: number) => void
  /**
   * Set the LQC matter equation-of-state `w ∈ [0, 1]`. Only consulted
   * when `cosmology.preset === 'lqcBounce'`.
   */
  setFreeScalarCosmologyLqcEquationOfState: (w: number) => void
  /**
   * Set the LQC starting `ρ/ρ_c` ratio (clamped to `(0, 1)`). Only
   * consulted when `cosmology.preset === 'lqcBounce'`.
   */
  setFreeScalarCosmologyLqcInitialRhoRatio: (ratio: number) => void
}

/**
 * Build the five cosmology setter actions.
 *
 * @param ctx - Shared setter context with set/get and validation helpers
 * @returns Partial action object containing the cosmology setters
 */
export function createFreeScalarCosmologySetters(ctx: SetterContext): FreeScalarCosmologySetters {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setFreeScalarCosmologyEnabled: (enabled) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // On enable, clamp eta0 to the safe threshold for the current lattice.
        // If the preset params are invalid or clampEta0 throws, we refuse to
        // flip the flag: letting `enabled=true` stand with bad params causes
        // `sampleAdiabaticVacuum` / `computeCosmologyAt` to throw at reset
        // time, which breaks the compute pass mid-frame. Silently staying
        // disabled is the safest fallback — the user can fix the preset and
        // try again.
        let nextEnabled = enabled
        let { eta0 } = fs.cosmology
        if (enabled) {
          const params = {
            preset: fs.cosmology.preset,
            spacetimeDim: fs.latticeDim + 1,
            steepness: fs.cosmology.steepness,
            hubble: fs.cosmology.hubble,
            kasnerExponents: fs.cosmology.kasnerExponents,
            lqcRhoCritical: fs.cosmology.lqcRhoCritical,
            lqcEquationOfState: fs.cosmology.lqcEquationOfState,
            lqcInitialRhoRatio: fs.cosmology.lqcInitialRhoRatio,
          }
          if (!isValidPreset(params)) {
            logger.warn(
              `[setFreeScalarCosmologyEnabled] Refusing to enable cosmology: ` +
                `preset=${fs.cosmology.preset} params invalid (steepness=${fs.cosmology.steepness}, ` +
                `hubble=${fs.cosmology.hubble}, spacetimeDim=${fs.latticeDim + 1}).`
            )
            nextEnabled = false
          } else if (
            fs.cosmology.preset === 'bianchiKasner' ||
            fs.cosmology.preset === 'lqcBounce'
          ) {
            // Bianchi-I and LQC bounce do not use the isotropic safe-η₀
            // heuristic — the runtime COSMOLOGY_ETA_FLOOR is the only
            // guard needed, and both use the η > 0 gauge. Matches the
            // bypass in resolveEta0ForPresetSwitch.
          } else {
            try {
              const clamped = clampEta0(eta0, params, fs.gridSize, fs.spacing, fs.latticeDim)
              eta0 = clamped.eta0
            } catch (e) {
              logger.warn(
                `[setFreeScalarCosmologyEnabled] Refusing to enable cosmology: ` +
                  `clampEta0 failed for eta0=${eta0}: ` +
                  `${e instanceof Error ? e.message : String(e)}`
              )
              nextEnabled = false
            }
          }
        }
        // The v1 mutex (cosmology enabled ⟹ self-interaction off) must key
        // off the *validated* `nextEnabled`, not the raw request. Otherwise
        // a refused enable would still clear the user's self-interaction
        // setting as a side effect of a no-op toggle.
        const selfInteractionEnabled = nextEnabled ? false : fs.selfInteractionEnabled
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              selfInteractionEnabled,
              cosmology: { ...fs.cosmology, enabled: nextEnabled, eta0 },
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
        const { eta0: presetEta0, kasnerExponents } = resolvePresetSwitchSubstate(fs, preset)
        const resolved = resolveEta0ForPresetSwitch(fs, preset, {
          spacetimeDim,
          steepness,
          hubble: fs.cosmology.hubble,
          kasnerExponents,
          lqcRhoCritical: fs.cosmology.lqcRhoCritical ?? 1.0,
          lqcEquationOfState: fs.cosmology.lqcEquationOfState ?? 1.0,
          lqcInitialRhoRatio: fs.cosmology.lqcInitialRhoRatio ?? 0.01,
          eta0: presetEta0,
          enabled: fs.cosmology.enabled,
        })
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: {
                ...fs.cosmology,
                preset,
                steepness,
                eta0: resolved.eta0,
                enabled: resolved.enabled,
                kasnerExponents,
              },
              needsReset: true,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyBianchiExponents: (p1, p2, p3) => {
      if (!isFinite(p1) || !isFinite(p2) || !isFinite(p3)) {
        warnNonFinite('freeScalar.cosmology.kasnerExponents', [p1, p2, p3])
        return
      }
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Only trigger a field reset when the exponents satisfy the vacuum
        // Kasner conditions (Σpᵢ = 1, Σpᵢ² = 1). Non-vacuum triples are
        // stored for UI display but won't reset the GPU field — the physics
        // code (computeBianchiKasnerCoefs) would throw for invalid triples.
        const vacuumValid = isKasnerVacuum({ p1, p2, p3 }, 1e-4)
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: {
                ...fs.cosmology,
                kasnerExponents: { p1, p2, p3 },
              },
              needsReset: (fs.cosmology.preset === 'bianchiKasner' && vacuumValid) || fs.needsReset,
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
        // Guard: sCritical throws for spacetimeDim < 3, and steepness is
        // only meaningful for the supported cosmology window. Mirror the
        // soft-fail behavior of reconcileCosmologyInvariants /
        // setFreeScalarCosmologyEta0: store the raw value verbatim and let
        // the next lattice reconcile re-validate. This prevents a 1D
        // lattice (spacetimeDim = 2) from crashing the store path.
        if (spacetimeDim < MIN_SPACETIME_DIM || spacetimeDim > MAX_SPACETIME_DIM) {
          return {
            schroedinger: {
              ...state.schroedinger,
              freeScalar: {
                ...fs,
                cosmology: { ...fs.cosmology, steepness: s },
                needsReset: fs.cosmology.preset === 'ekpyrotic' || fs.needsReset,
              },
            },
          }
        }
        const sc = sCritical(spacetimeDim)
        // Clamp to (s_c, +∞). Use a tiny epsilon above s_c so the denominator
        // (n-1)s²-s_c² stays strictly positive and q is finite.
        const sMin = sc * 1.0001
        const sMax = 100
        const clamped = Math.max(sMin, Math.min(sMax, s))
        let { eta0 } = fs.cosmology
        if (fs.cosmology.enabled && fs.cosmology.preset === 'ekpyrotic') {
          try {
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
          } catch (e) {
            // Match the enabled/preset setters: a bad lattice/spacing state
            // shouldn't block a steepness edit. Leave eta0 untouched; the
            // next preset/enable cycle (or reconcileCosmologyInvariants) will
            // soft-disable if the state stays corrupt.
            logger.warn(
              `[setFreeScalarCosmologySteepness] clampEta0 failed for ` +
                `eta0=${eta0}: ${e instanceof Error ? e.message : String(e)}`
            )
          }
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
          kasnerExponents: fs.cosmology.kasnerExponents,
          lqcRhoCritical: fs.cosmology.lqcRhoCritical,
          lqcEquationOfState: fs.cosmology.lqcEquationOfState,
          lqcInitialRhoRatio: fs.cosmology.lqcInitialRhoRatio,
        }
        if (isValidPreset(params)) {
          if (fs.cosmology.preset === 'bianchiKasner' || fs.cosmology.preset === 'lqcBounce') {
            // Bianchi-I does not use the isotropic safe-η₀ heuristic — the
            // runtime COSMOLOGY_ETA_FLOOR is the only guard needed.
            clampedEta0 = eta0
          } else {
            try {
              const result = clampEta0(eta0, params, fs.gridSize, fs.spacing, fs.latticeDim)
              clampedEta0 = result.eta0
            } catch (e) {
              // Match the other setters: a corrupted gridSize/spacing shouldn't
              // block an eta0 edit. Store the user's value verbatim; the next
              // reconcileCosmologyInvariants pass will soft-disable if the
              // lattice state stays invalid.
              logger.warn(
                `[setFreeScalarCosmologyEta0] clampEta0 failed for ` +
                  `eta0=${eta0}: ${e instanceof Error ? e.message : String(e)}`
              )
            }
          }
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
    setFreeScalarCosmologyLqcRhoCritical: (rhoC) => {
      if (!isFinite(rhoC)) {
        warnNonFinite('freeScalar.cosmology.lqcRhoCritical', rhoC)
        return
      }
      // Clamp matches the UI slider range. Keeps `isValidPreset` happy and
      // prevents the RK4 integrator from running at a near-zero critical
      // density where ρ_c·a^(2(n−1)) scales destabilise.
      const clamped = Math.max(0.1, Math.min(10, rhoC))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, lqcRhoCritical: clamped },
              needsReset: fs.cosmology.preset === 'lqcBounce' || fs.needsReset,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyLqcEquationOfState: (w) => {
      if (!isFinite(w)) {
        warnNonFinite('freeScalar.cosmology.lqcEquationOfState', w)
        return
      }
      const clamped = Math.max(0, Math.min(1, w))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, lqcEquationOfState: clamped },
              needsReset: fs.cosmology.preset === 'lqcBounce' || fs.needsReset,
            },
          },
        }
      })
    },
    setFreeScalarCosmologyLqcInitialRhoRatio: (r) => {
      if (!isFinite(r)) {
        warnNonFinite('freeScalar.cosmology.lqcInitialRhoRatio', r)
        return
      }
      // Strict (0, 1) — the inner clamp uses a finite safety epsilon so
      // `isValidPreset` validation never rejects a slider endpoint.
      const clamped = Math.max(0.001, Math.min(0.999, r))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              cosmology: { ...fs.cosmology, lqcInitialRhoRatio: clamped },
              needsReset: fs.cosmology.preset === 'lqcBounce' || fs.needsReset,
            },
          },
        }
      })
    },
  }
}
