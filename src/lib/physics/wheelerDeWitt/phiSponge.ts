/**
 * φ-boundary absorbing-sponge helpers for the Wheeler–DeWitt solver.
 *
 * The sponge multiplies χ by a `(0, 1]` factor at the outer φ-cells
 * after each leapfrog / CN step to absorb outgoing φ-bulk modes. It
 * is only active when the boundary condition produces a φ-varying
 * slab; constant-in-φ seeds (the `m = 0`, V = Λ = const regime) skip
 * the sponge so φ-translation symmetry is preserved exactly.
 *
 * Extracted from `./solver.ts` so the sponge geometry can be reused
 * by diagnostics (`./solverDiagnostics.effectiveSpongeWidth` callers
 * already import this) and tested in isolation.
 *
 * @module lib/physics/wheelerDeWitt/phiSponge
 */

import { WDW_PHI_SPONGE_GAMMA, WDW_PHI_SPONGE_WIDTH } from './solverConstants'

/**
 * Effective sponge width for a given `Nphi`. Exported so the
 * `wdwOperatorResidual` function in `./solverDiagnostics` can skip
 * sponge-affected cells when computing the PDE residual.
 */
export function effectiveSpongeWidth(Nphi: number): number {
  return Math.min(WDW_PHI_SPONGE_WIDTH, Math.floor(Nphi / 6))
}

/**
 * Detect whether an interleaved-complex boundary slab is constant in
 * the φ grid (within `Float32` precision).
 *
 * Used by the solver to auto-disable the φ-boundary sponge on initial
 * data that has no φ-variation — when V(φ) is independent of φ (the
 * `m = 0` regime, see `./hhLangerSeed` delegates that produce a slab
 * which is exactly constant over every `(φ₁, φ₂)`) there are no
 * outgoing φ-waves for the sponge to absorb, and the sponge's
 * multiplicative damping only seeds a spurious edge-to-bulk wave that
 * violates φ-translation symmetry.
 *
 * Tolerance is an absolute+relative check: deviations below `1e-6` of
 * the centre-cell magnitude count as constant. Float32 round-off on the
 * BC generator's trig + Airy evaluations bounds the natural spread to
 * the `~1e-7` level, so the tolerance has a comfortable margin above
 * precision noise.
 *
 * @param chi  Interleaved `(re, im)` slab, length `2·Nphi²`.
 * @param Nphi Grid size.
 * @returns `true` iff every cell agrees with the centre cell within
 *   tolerance.
 */
export function isConstantInPhiSlab(chi: Float32Array, Nphi: number): boolean {
  if (Nphi < 2) return true
  const center = Math.floor(Nphi / 2)
  const centerOff = 2 * (center * Nphi + center)
  const refRe = chi[centerOff] ?? 0
  const refIm = chi[centerOff + 1] ?? 0
  const refMag = Math.hypot(refRe, refIm)
  const absTol = 1e-10
  const relTol = 1e-6
  const tol = Math.max(absTol, relTol * refMag)
  const N = Nphi * Nphi
  for (let idx = 0; idx < N; idx++) {
    const re = chi[2 * idx] ?? 0
    const im = chi[2 * idx + 1] ?? 0
    if (Math.abs(re - refRe) > tol || Math.abs(im - refIm) > tol) {
      return false
    }
  }
  return true
}

/**
 * Build a per-cell multiplicative sponge-damping table for the φ-grid.
 * Each entry is in `(0, 1]`: `1.0` in the bulk, smoothly decreasing
 * toward the grid edges via a quadratic profile. The caller multiplies
 * `(re, im)` by this factor after each leapfrog step.
 *
 * Profile: for a cell at distance `k` from the nearest edge (k=0 at
 * the edge), the factor is `exp(−γ · d²)` where `d = max(0, 1 − k/W)`
 * and `W = effectiveSpongeWidth(Nphi)`. Cells with `k ≥ W` get 1.0.
 *
 * @returns Float32Array of length `Nphi²`, indexed `i1 * Nphi + i2`.
 */
export function buildPhiSpongeDamping(Nphi: number): Float32Array {
  const sponge = new Float32Array(Nphi * Nphi)
  const W = effectiveSpongeWidth(Nphi)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const d1 = Math.min(i1, Nphi - 1 - i1)
    const s1 = d1 < W ? Math.exp(-WDW_PHI_SPONGE_GAMMA * Math.pow(1 - d1 / W, 2)) : 1
    for (let i2 = 0; i2 < Nphi; i2++) {
      const d2 = Math.min(i2, Nphi - 1 - i2)
      const s2 = d2 < W ? Math.exp(-WDW_PHI_SPONGE_GAMMA * Math.pow(1 - d2 / W, 2)) : 1
      sponge[i1 * Nphi + i2] = s1 * s2
    }
  }
  return sponge
}
