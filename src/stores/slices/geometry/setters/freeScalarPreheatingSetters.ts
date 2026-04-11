/**
 * Free Scalar Field preheating setter factory.
 *
 * Extracted from `freeScalarSetters.ts` to keep that file under the
 * 600-line limit. Provides the three parametric-resonance setters that
 * control the post-inflation preheating drive
 *
 *     m²_eff(η) = m₀² · (1 + A · sin(Ω · (η − η_ref)))
 *
 * injected into the pi-update shader via the `massSquaredScale` uniform
 * slot. See `src/lib/physics/cosmology/preheating.ts` for the physics and
 * `docs/architecture.md` for the store-slice layout conventions.
 *
 * Invariants enforced here:
 *
 * - Amplitude clamped to `[0, 1]` — anything outside this range either
 *   drives the Mathieu equation into the strongly-nonlinear regime where
 *   the growth-rate formula breaks down, or inverts the sign of the
 *   mass-term coefficient for part of each drive cycle (which is
 *   physically fine but confusing to the user without explicit scaffolding).
 * - Frequency clamped to `[0.1, 10]` — the lower bound keeps one drive
 *   cycle under the field-reset cadence; the upper bound keeps the
 *   narrow-resonance formulae applicable relative to the default
 *   dispersion range.
 * - `needsReset = true` on enable-toggle and frequency change so the new
 *   drive always starts at phase 0 alongside a freshly-sampled field.
 *   Amplitude is continuously tunable (no reset) since it only scales the
 *   existing envelope — the user can sweep through growth regimes without
 *   discarding the current trajectory.
 *
 * @module stores/slices/geometry/setters/freeScalarPreheatingSetters
 */

import type { SchroedingerSliceActions } from '../types'
import type { SetterContext } from './sliceSetterUtils'

type PreheatingActions = Pick<
  SchroedingerSliceActions,
  | 'setFreeScalarPreheatingEnabled'
  | 'setFreeScalarPreheatingAmplitude'
  | 'setFreeScalarPreheatingFrequency'
>

/**
 * Build the three parametric-resonance setter actions.
 *
 * @param ctx - Shared setter context with set/get and validation helpers
 * @returns Partial action object containing the preheating setters
 */
export function createFreeScalarPreheatingSetters(ctx: SetterContext): PreheatingActions {
  const { setWithVersion, isFinite, warnNonFinite } = ctx

  return {
    setFreeScalarPreheatingEnabled: (enabled) => {
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Flipping the master toggle re-anchors the drive at phase 0, so
        // mark the field for reset. This ensures the initial vacuum sample
        // always sees the bare (unperturbed) mass and the modulation then
        // grows smoothly from zero — matching the CPU integrator's
        // reference trajectory and the tests that anchor its growth rate.
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              preheating: { ...fs.preheating, enabled },
              needsReset: true,
            },
          },
        }
      })
    },
    setFreeScalarPreheatingAmplitude: (amplitude) => {
      if (!isFinite(amplitude)) {
        warnNonFinite('freeScalar.preheating.amplitude', amplitude)
        return
      }
      const clamped = Math.max(0, Math.min(1, amplitude))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Amplitude is continuously tunable — the drive envelope can
        // smoothly sweep without resetting the field, which is desirable
        // for live exploration of the instability tongues.
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              preheating: { ...fs.preheating, amplitude: clamped },
            },
          },
        }
      })
    },
    setFreeScalarPreheatingFrequency: (frequency) => {
      if (!isFinite(frequency)) {
        warnNonFinite('freeScalar.preheating.frequency', frequency)
        return
      }
      const clamped = Math.max(0.1, Math.min(10, frequency))
      setWithVersion((state) => {
        const fs = state.schroedinger.freeScalar
        // Frequency edits change the phase reference for the drive; reset
        // so the new `sin(Ω·(t−ref))` starts cleanly at zero phase rather
        // than whatever instantaneous value the old drive happened to be
        // at when the user dragged the slider.
        return {
          schroedinger: {
            ...state.schroedinger,
            freeScalar: {
              ...fs,
              preheating: { ...fs.preheating, frequency: clamped },
              needsReset: true,
            },
          },
        }
      })
    },
  }
}
