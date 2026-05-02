/**
 * Neumann-ghost φ-Laplacian stencil for the Wheeler–DeWitt leapfrog.
 *
 * Extracted from `./solver.ts` so the stencil — the most-called inner
 * routine of the solve — can be unit-tested + reasoned about in
 * isolation. See `./solver.ts` module docstring for the BC physics
 * rationale (Neumann replaces a prior Dirichlet rule that broke
 * `q_a(phiExtent)` monotonicity in SRMT sensitivity sweeps).
 *
 * @module lib/physics/wheelerDeWitt/phiLaplacian
 */

import type { ComplexPair } from './solverTypes'

/**
 * Compute the Neumann-ghost φ-Laplacian stencil at grid point
 * `(i1, i2)` reading complex pairs from a contiguous slab buffer.
 *
 * Ghost rule: cells whose required neighbour would sit outside the grid
 * inherit the value of the adjacent interior-edge cell (so the ghost
 * takes the centre cell's value when `i1 = 0` or `i1 = Nphi-1`, and
 * likewise for `i2`). This imposes `dχ/dφ = 0` at the outer boundary
 * face (first-order accurate at the edge, second-order accurate at
 * all interior points) — a reflecting / zero-flux boundary condition.
 *
 * This replaces the prior ghost-zero Dirichlet rule (`χ_ghost = 0`),
 * which artificially clipped the χ tail at the boundary and produced
 * non-monotone `q_a(phiExtent)` in SRMT sensitivity sweeps (see the
 * `./solver` module-level docstring for the physics rationale). Under
 * Neumann, a constant-in-φ seed is an exact eigenfunction of `∇²_φ`
 * with eigenvalue `0` at every cell including the edges, so the
 * analytic-comparison tests in `solverAnalytic.test.ts` are no longer
 * contaminated by a `−2·const/dφ²` edge leak.
 *
 * Edge-cell stencil algebra: at `i1 = 0` the `−2·c` axis-1 term
 * collapses to `(c + n − 2c) = (n − c)`, since the missing `p`
 * neighbour contributes `c` rather than `0`. The axis-2 contribution
 * is unchanged for interior `i2`. Corner cells get the reduction on
 * both axes.
 *
 * @param slab - Interleaved-complex slab buffer of length `2·Nphi²`.
 * @param slabBase - Offset into `slab` for the φ-plane being laplacianised.
 * @param i1 - Row index along the first inflaton axis.
 * @param i2 - Column index along the second inflaton axis.
 * @param Nphi - φ-grid dimension.
 * @param invDphi2 - `1 / dφ²`; caller precomputes once per solve.
 * @returns `(Re, Im)` pair of `∇²_φ χ` at `(i1, i2)`.
 */
export function phiLaplacianAt(
  slab: Float32Array,
  slabBase: number,
  i1: number,
  i2: number,
  Nphi: number,
  invDphi2: number
): ComplexPair {
  const center = slabBase + 2 * (i1 * Nphi + i2)
  const cre = slab[center] ?? 0
  const cim = slab[center + 1] ?? 0

  // Neumann ghost: when a neighbour would sit outside the grid, fall
  // back to the centre-cell value so the stencil contribution is
  // `(c + c − 2c) = 0` on that side and the one-sided difference on
  // the other side dominates.
  const prevIdx1 = i1 > 0 ? slabBase + 2 * ((i1 - 1) * Nphi + i2) : -1
  const nextIdx1 = i1 < Nphi - 1 ? slabBase + 2 * ((i1 + 1) * Nphi + i2) : -1
  const prevIdx2 = i2 > 0 ? slabBase + 2 * (i1 * Nphi + i2 - 1) : -1
  const nextIdx2 = i2 < Nphi - 1 ? slabBase + 2 * (i1 * Nphi + i2 + 1) : -1

  const pre1 = prevIdx1 >= 0 ? (slab[prevIdx1] ?? 0) : cre
  const pim1 = prevIdx1 >= 0 ? (slab[prevIdx1 + 1] ?? 0) : cim
  const nre1 = nextIdx1 >= 0 ? (slab[nextIdx1] ?? 0) : cre
  const nim1 = nextIdx1 >= 0 ? (slab[nextIdx1 + 1] ?? 0) : cim
  const pre2 = prevIdx2 >= 0 ? (slab[prevIdx2] ?? 0) : cre
  const pim2 = prevIdx2 >= 0 ? (slab[prevIdx2 + 1] ?? 0) : cim
  const nre2 = nextIdx2 >= 0 ? (slab[nextIdx2] ?? 0) : cre
  const nim2 = nextIdx2 >= 0 ? (slab[nextIdx2 + 1] ?? 0) : cim

  return {
    re: (pre1 + nre1 - 2 * cre + pre2 + nre2 - 2 * cre) * invDphi2,
    im: (pim1 + nim1 - 2 * cim + pim2 + nim2 - 2 * cim) * invDphi2,
  }
}
