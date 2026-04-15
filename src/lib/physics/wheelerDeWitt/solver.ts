/**
 * Wheeler–DeWitt leapfrog solver (3D minisuperspace: a × φ₁ × φ₂).
 *
 * Reduced WdW equation (χ = a^{3/2} Ψ, conformal-minimal ordering):
 *
 *   [ −∂²_a + (1/a²)(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ = 0
 *
 * with U(a, φ) = −36π²·a²·(1 − (8πG/3)·a²·V(φ)), V(φ) = ½m²(φ₁²+φ₂²) + Λ.
 *
 * Explicit second-order leapfrog in `a`:
 *
 *   χ(a+da, φ) = 2 χ(a, φ) − χ(a−da, φ) + da²·[ (1/a²)·∇²_φ χ − U·χ ]
 *
 * The φ-Laplacian uses 2nd-order central differences with ghost-zero
 * Dirichlet conditions at the outer φ-edges — i.e. cells one step beyond
 * the grid are treated as χ = 0 when computing the Laplacian at edge
 * cells `i1 ∈ {0, Nphi-1}` and `i2 ∈ {0, Nphi-1}`. Edge cells themselves
 * evolve under the PDE (they are not pinned to zero), which preserves the
 * non-trivial Gaussian-in-φ envelope supplied by the boundary generators.
 *
 * Output: interleaved (re, im) Float32Array of shape (Na, Nphi, Nphi) in
 * row-major order [ia, iPhi1, iPhi2] with 2 floats per cell, plus a
 * per-cell Lorentzian mask (1 byte: 1 where U < 0, 0 otherwise).
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'
import { logger } from '@/lib/logger'

import { buildWdwBoundary, WDW_G_PREFACTOR, wdwPotential } from './boundaryConditions'

/**
 * Explicit-leapfrog stability budget for the φ-Laplacian term
 * `da² · (1/aMin²) · 8/dphi²`. Empirically the solver stays well-behaved up to
 * ~4; values above that are flagged as borderline. The guard is informational
 * only (dev-only `logger.warn`) so existing callers — including the in-app
 * default config and unit tests — are never blocked.
 */
const WDW_CFL_BUDGET = 4

let wdwCflWarningCount = 0
const WDW_CFL_WARN_LIMIT = 3

/** Prefactor in U: c_U = 36·π². With G = 1 this matches the WdW derivation. */
const C_U = 36 * Math.PI * Math.PI

/**
 * Soft absorber strength for the Euclidean (U > 0) region. At each leapfrog
 * step, cells with U > 0 are multiplied by exp(-η·sqrt(U)·da) to suppress
 * the exponentially growing branch — which is non-physical for the
 * Hartle–Hawking and DeWitt proposals (they should be Euclidean-decaying)
 * and is dominant under the classically symmetric BC otherwise.
 *
 * η = 1.0 cancels the WKB growth rate of the growing branch exactly. Note
 * the absorber is NOT branch-selective: it damps both branches equally.
 * That is fine in the classically forbidden region where physical |χ| is
 * exponentially small (~ exp(-S_E)); avoid raising η so much that
 * legitimate decaying-branch amplitude is also suppressed.
 */
const WDW_EUCLIDEAN_ABSORBER_ETA = 1.0

/** Solver inputs mirroring the WdW config fields. */
export interface WheelerDeWittSolverInput {
  boundaryCondition: WdwBoundaryCondition
  inflatonMass: number
  cosmologicalConstant: number
  aMin: number
  aMax: number
  gridNa: number
  gridNphi: number
  phiExtent: number
}

/** Dense output of the Wheeler–DeWitt solver. */
export interface WheelerDeWittSolverOutput {
  /**
   * χ(a, φ₁, φ₂) as interleaved (re, im) pairs. Strides in units of
   * complex entries: stride_a = Nphi·Nphi, stride_phi1 = Nphi,
   * stride_phi2 = 1. Total floats = 2·Na·Nphi·Nphi.
   */
  chi: Float32Array
  /** Per-cell mask: 1 when U(a,φ) < 0 (Lorentzian), 0 otherwise (Euclidean). */
  lorentzianMask: Uint8Array
  /** Grid dimensions (Na, Nphi, Nphi). */
  gridSize: [number, number, number]
  /** Physical grid extents (consumers read for coordinate mapping). */
  aMin: number
  aMax: number
  phiExtent: number
  /** Maximum |χ|² observed on the grid — for consumer-side normalization. */
  maxDensity: number
}

/**
 * Compute U(a, φ) = −c_U·a²·(1 − (8πG/3)·a²·V(φ)).
 * Lorentzian (classically allowed) region corresponds to U < 0.
 */
export function wdwU(a: number, phi1: number, phi2: number, m: number, lambda: number): number {
  const V = wdwPotential(phi1, phi2, m, lambda)
  const a2 = a * a
  return -C_U * a2 * (1 - WDW_G_PREFACTOR * a2 * V)
}

/**
 * Run the leapfrog Wheeler–DeWitt solver.
 *
 * @param input - Solver config
 * @returns Dense χ grid and auxiliary metadata
 */
export function solveWheelerDeWitt(input: WheelerDeWittSolverInput): WheelerDeWittSolverOutput {
  const {
    boundaryCondition,
    inflatonMass,
    cosmologicalConstant,
    aMin,
    aMax,
    gridNa,
    gridNphi,
    phiExtent,
  } = input

  if (gridNa < 3) throw new Error('gridNa must be >= 3')
  if (gridNphi < 3) throw new Error('gridNphi must be >= 3')
  if (!(aMax > aMin)) throw new Error('aMax must exceed aMin')

  const Na = gridNa
  const Nphi = gridNphi
  const slabSize = Nphi * Nphi
  const complexSlabFloats = 2 * slabSize

  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)

  const da = (aMax - aMin) / (Na - 1)
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)

  // Explicit-leapfrog CFL diagnostic for the φ-Laplacian term:
  //   da² · max(1/a²) · 8/dphi²   (max(1/a²) attained at aMin).
  // > WDW_CFL_BUDGET flags marginal stability. Dev-only and rate-limited so
  // it never spams the console during interactive parameter sweeps.
  if (aMin > 0 && wdwCflWarningCount < WDW_CFL_WARN_LIMIT) {
    const cflPhi = (da * da * 8 * invDphi2) / (aMin * aMin)
    if (cflPhi > WDW_CFL_BUDGET) {
      wdwCflWarningCount++
      logger.warn(
        `[wdw] CFL margin tight: da²·(1/aMin²)·8/dphi² = ${cflPhi.toFixed(2)} (budget ${WDW_CFL_BUDGET}). ` +
          `Recommend aMin ≥ 0.1, gridNphi ≤ 32, gridNa ≤ 256, phiExtent ≥ 1.5. ` +
          `Current: aMin=${aMin}, aMax=${aMax}, gridNa=${gridNa}, gridNphi=${gridNphi}, phiExtent=${phiExtent}.`
      )
    }
  }

  // Initial slab from the chosen boundary condition.
  const initial = buildWdwBoundary(boundaryCondition, {
    Nphi,
    phiExtent,
    aMin,
    mass: inflatonMass,
    lambda: cosmologicalConstant,
  })

  // Copy χ(a_min, ·) into slab 0.
  chi.set(initial.chi, 0)

  // Second slab from Taylor expansion:
  //   χ(a_min + da) = χ(a_min) + da·χ'(a_min) + ½·da²·χ''(a_min)
  // with χ'' = (1/a²)·∇²_φ χ − U·χ (from the equation).
  const a0 = aMin
  const a1 = aMin + da
  const invA0Sq = 1 / (a0 * a0)

  // Scratch accumulator for ∇²_φ at each grid point on slab 0.
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2
      const V = wdwPotential(phi1, phi2, inflatonMass, cosmologicalConstant)
      const U0 = -C_U * a0 * a0 * (1 - WDW_G_PREFACTOR * a0 * a0 * V)

      // Central differences with ghost-zero Dirichlet (ghost cells one step
      // beyond the grid are χ = 0; edge cells evolve under the PDE).
      const cre = initial.chi[2 * idx] ?? 0
      const cim = initial.chi[2 * idx + 1] ?? 0
      const pre1 = i1 > 0 ? (initial.chi[2 * ((i1 - 1) * Nphi + i2)] ?? 0) : 0
      const pim1 = i1 > 0 ? (initial.chi[2 * ((i1 - 1) * Nphi + i2) + 1] ?? 0) : 0
      const nre1 = i1 < Nphi - 1 ? (initial.chi[2 * ((i1 + 1) * Nphi + i2)] ?? 0) : 0
      const nim1 = i1 < Nphi - 1 ? (initial.chi[2 * ((i1 + 1) * Nphi + i2) + 1] ?? 0) : 0
      const pre2 = i2 > 0 ? (initial.chi[2 * (i1 * Nphi + i2 - 1)] ?? 0) : 0
      const pim2 = i2 > 0 ? (initial.chi[2 * (i1 * Nphi + i2 - 1) + 1] ?? 0) : 0
      const nre2 = i2 < Nphi - 1 ? (initial.chi[2 * (i1 * Nphi + i2 + 1)] ?? 0) : 0
      const nim2 = i2 < Nphi - 1 ? (initial.chi[2 * (i1 * Nphi + i2 + 1) + 1] ?? 0) : 0

      const lapRe = (pre1 + nre1 - 2 * cre + pre2 + nre2 - 2 * cre) * invDphi2
      const lapIm = (pim1 + nim1 - 2 * cim + pim2 + nim2 - 2 * cim) * invDphi2

      // From the reduced Wheeler–DeWitt equation
      //   -∂²_a χ + (1/a²) ∇²_φ χ + U·χ = 0,
      // so ∂²_a χ = (1/a²) ∇²_φ χ + U·χ.
      const chiDDotRe = invA0Sq * lapRe + U0 * cre
      const chiDDotIm = invA0Sq * lapIm + U0 * cim

      const dre = initial.chiDeriv[2 * idx] ?? 0
      const dim = initial.chiDeriv[2 * idx + 1] ?? 0

      // χ(a_min + da) via Taylor:
      let nextRe = cre + da * dre + 0.5 * da * da * chiDDotRe
      let nextIm = cim + da * dim + 0.5 * da * da * chiDDotIm

      // Mask for slab 0
      mask[idx] = U0 < 0 ? 1 : 0
      // Mask for slab 1 — reuse a1 here
      const Ua1 = -C_U * a1 * a1 * (1 - WDW_G_PREFACTOR * a1 * a1 * V)
      mask[slabSize + idx] = Ua1 < 0 ? 1 : 0

      // Soft Euclidean absorber on the written slab — damps the growing WKB
      // branch so it cannot saturate the clamp at cube corners.
      if (Ua1 > 0) {
        const damp = Math.exp(-WDW_EUCLIDEAN_ABSORBER_ETA * Math.sqrt(Ua1) * da)
        nextRe *= damp
        nextIm *= damp
      }

      chi[complexSlabFloats + 2 * idx] = nextRe
      chi[complexSlabFloats + 2 * idx + 1] = nextIm
    }
  }

  // Leapfrog main loop for slabs ia = 2 .. Na-1.
  for (let ia = 2; ia < Na; ia++) {
    const a = aMin + ia * da
    const aPrev = aMin + (ia - 1) * da
    const invAprevSq = 1 / (aPrev * aPrev)
    const prevSlabBase = (ia - 1) * complexSlabFloats
    const prevPrevSlabBase = (ia - 2) * complexSlabFloats
    const curSlabBase = ia * complexSlabFloats
    const maskBase = ia * slabSize

    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + i1 * dphi
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2
        const V = wdwPotential(phi1, phi2, inflatonMass, cosmologicalConstant)
        const U = -C_U * aPrev * aPrev * (1 - WDW_G_PREFACTOR * aPrev * aPrev * V)

        const cre = chi[prevSlabBase + 2 * idx] ?? 0
        const cim = chi[prevSlabBase + 2 * idx + 1] ?? 0
        const prevRe = chi[prevPrevSlabBase + 2 * idx] ?? 0
        const prevIm = chi[prevPrevSlabBase + 2 * idx + 1] ?? 0

        const pre1 = i1 > 0 ? (chi[prevSlabBase + 2 * ((i1 - 1) * Nphi + i2)] ?? 0) : 0
        const pim1 = i1 > 0 ? (chi[prevSlabBase + 2 * ((i1 - 1) * Nphi + i2) + 1] ?? 0) : 0
        const nre1 = i1 < Nphi - 1 ? (chi[prevSlabBase + 2 * ((i1 + 1) * Nphi + i2)] ?? 0) : 0
        const nim1 = i1 < Nphi - 1 ? (chi[prevSlabBase + 2 * ((i1 + 1) * Nphi + i2) + 1] ?? 0) : 0
        const pre2 = i2 > 0 ? (chi[prevSlabBase + 2 * (i1 * Nphi + i2 - 1)] ?? 0) : 0
        const pim2 = i2 > 0 ? (chi[prevSlabBase + 2 * (i1 * Nphi + i2 - 1) + 1] ?? 0) : 0
        const nre2 = i2 < Nphi - 1 ? (chi[prevSlabBase + 2 * (i1 * Nphi + i2 + 1)] ?? 0) : 0
        const nim2 = i2 < Nphi - 1 ? (chi[prevSlabBase + 2 * (i1 * Nphi + i2 + 1) + 1] ?? 0) : 0

        const lapRe = (pre1 + nre1 - 2 * cre + pre2 + nre2 - 2 * cre) * invDphi2
        const lapIm = (pim1 + nim1 - 2 * cim + pim2 + nim2 - 2 * cim) * invDphi2

        // Leapfrog: χ'' = (1/a²)·∇²_φ χ + U·χ (from the WdW equation
        // -∂²_a χ + (1/a²)∇²_φ χ + U·χ = 0).
        const chiDDotRe = invAprevSq * lapRe + U * cre
        const chiDDotIm = invAprevSq * lapIm + U * cim
        let nextRe = 2 * cre - prevRe + da * da * chiDDotRe
        let nextIm = 2 * cim - prevIm + da * da * chiDDotIm

        // Soft Euclidean absorber on the written slab — damps the growing
        // WKB branch so it cannot saturate the clamp at cube corners.
        const Ucur = -C_U * a * a * (1 - WDW_G_PREFACTOR * a * a * V)
        if (Ucur > 0) {
          const damp = Math.exp(-WDW_EUCLIDEAN_ABSORBER_ETA * Math.sqrt(Ucur) * da)
          nextRe *= damp
          nextIm *= damp
        }

        // Clamp extreme divergence — WdW is not unitary and U·χ can blow up
        // for pathological (m, Λ) in the Euclidean region. Saturate to a
        // large but finite value so the packed f16 grid doesn't go NaN.
        const CLAMP = 1e8
        chi[curSlabBase + 2 * idx] = nextRe > CLAMP ? CLAMP : nextRe < -CLAMP ? -CLAMP : nextRe
        chi[curSlabBase + 2 * idx + 1] = nextIm > CLAMP ? CLAMP : nextIm < -CLAMP ? -CLAMP : nextIm

        mask[maskBase + idx] = Ucur < 0 ? 1 : 0
      }
    }
  }

  // Find max |χ|² for downstream normalization. Restrict to Lorentzian
  // (classically allowed, U < 0) cells: the growing branch of the
  // Euclidean solution saturates at CLAMP = 1e8 and would otherwise set
  // maxDensity = 1e16, crushing the physical interior signal to black
  // in the packed density grid.
  // Fallback: if the whole grid is Euclidean (e.g. large-m regime),
  // fall back to the non-clamp-saturated max so normalization still
  // produces a meaningful range.
  const CLAMP_SOFT_SQ = 0.9 * 1e8 * (0.9 * 1e8) // ~(0.9·CLAMP)² per component
  let maxDensity = 0
  let maxDensityEuclideanFallback = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    const d = re * re + im * im
    const cellIdx = i >> 1
    const isLorentzian = (mask[cellIdx] ?? 0) !== 0
    if (isLorentzian) {
      if (d > maxDensity) maxDensity = d
    } else if (re * re < CLAMP_SOFT_SQ && im * im < CLAMP_SOFT_SQ) {
      if (d > maxDensityEuclideanFallback) maxDensityEuclideanFallback = d
    }
  }
  if (maxDensity === 0) maxDensity = maxDensityEuclideanFallback

  return {
    chi,
    lorentzianMask: mask,
    gridSize: [Na, Nphi, Nphi],
    aMin,
    aMax,
    phiExtent,
    maxDensity,
  }
}

/**
 * Residual check: plug solution back into the WdW equation and return the
 * relative L² residual across the interior of the grid. Exposed for tests.
 *
 * residual(a, φ) = −∂²_a χ + (1/a²)·∇²_φ χ + U·χ
 *
 * We compare ||residual||₂ against ||U·χ||₂ over interior cells, excluding
 * cells where |χ| is at or near the solver's overflow clamp (those carry a
 * non-physical residual from the clamp operation).
 *
 * @param output - Solver output
 * @param input - Original solver input
 * @param maxAFraction - Upper a-fraction of the grid to include. Use a value
 *   < 1 to exclude late-time slabs where the Euclidean-growth branch may
 *   have been clamped (default 0.6 — checks the first 60% of the march).
 * @returns Fractional residual (dimensionless)
 */
export function wdwOperatorResidual(
  output: WheelerDeWittSolverOutput,
  input: WheelerDeWittSolverInput,
  maxAFraction: number = 0.6
): number {
  const Na = output.gridSize[0]
  const Nphi = output.gridSize[1]
  const slabSize = Nphi * Nphi
  const complexSlab = 2 * slabSize
  const da = (output.aMax - output.aMin) / (Na - 1)
  const dphi = (2 * output.phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)
  const invDa2 = 1 / (da * da)

  let resNorm = 0
  let ucNorm = 0
  // Skip a-slabs where the solver clamped extreme values (they carry a
  // non-physical discrete residual from the clamp).
  const aMax = Math.min(Na - 1, Math.max(2, Math.floor((Na - 1) * maxAFraction)))
  const CLAMP = 1e7

  for (let ia = 1; ia < aMax; ia++) {
    const a = output.aMin + ia * da
    const invAsq = 1 / (a * a)
    for (let i1 = 1; i1 < Nphi - 1; i1++) {
      const phi1 = -output.phiExtent + i1 * dphi
      for (let i2 = 1; i2 < Nphi - 1; i2++) {
        const phi2 = -output.phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2
        const cre = output.chi[ia * complexSlab + 2 * idx] ?? 0
        const cim = output.chi[ia * complexSlab + 2 * idx + 1] ?? 0
        const prevRe = output.chi[(ia - 1) * complexSlab + 2 * idx] ?? 0
        const prevIm = output.chi[(ia - 1) * complexSlab + 2 * idx + 1] ?? 0
        const nextRe = output.chi[(ia + 1) * complexSlab + 2 * idx] ?? 0
        const nextIm = output.chi[(ia + 1) * complexSlab + 2 * idx + 1] ?? 0
        if (
          Math.abs(cre) > CLAMP ||
          Math.abs(cim) > CLAMP ||
          Math.abs(prevRe) > CLAMP ||
          Math.abs(prevIm) > CLAMP ||
          Math.abs(nextRe) > CLAMP ||
          Math.abs(nextIm) > CLAMP
        ) {
          continue
        }
        const d2aRe = (nextRe - 2 * cre + prevRe) * invDa2
        const d2aIm = (nextIm - 2 * cim + prevIm) * invDa2

        const base = ia * complexSlab
        const pre1 = output.chi[base + 2 * ((i1 - 1) * Nphi + i2)] ?? 0
        const pim1 = output.chi[base + 2 * ((i1 - 1) * Nphi + i2) + 1] ?? 0
        const nre1 = output.chi[base + 2 * ((i1 + 1) * Nphi + i2)] ?? 0
        const nim1 = output.chi[base + 2 * ((i1 + 1) * Nphi + i2) + 1] ?? 0
        const pre2 = output.chi[base + 2 * (i1 * Nphi + i2 - 1)] ?? 0
        const pim2 = output.chi[base + 2 * (i1 * Nphi + i2 - 1) + 1] ?? 0
        const nre2 = output.chi[base + 2 * (i1 * Nphi + i2 + 1)] ?? 0
        const nim2 = output.chi[base + 2 * (i1 * Nphi + i2 + 1) + 1] ?? 0

        const lapRe = (pre1 + nre1 - 2 * cre + pre2 + nre2 - 2 * cre) * invDphi2
        const lapIm = (pim1 + nim1 - 2 * cim + pim2 + nim2 - 2 * cim) * invDphi2

        const U = wdwU(a, phi1, phi2, input.inflatonMass, input.cosmologicalConstant)

        // Skip cells where any stencil input (current, previous, or next in
        // a) is Euclidean. The solver applies the Euclidean absorber in those
        // cells which violates the PDE by construction, so the discrete
        // residual there reports the absorber strength rather than solver
        // fidelity. Only interior Lorentzian runs with all three stencil
        // points Lorentzian give a meaningful residual.
        const Uprev = wdwU(
          output.aMin + (ia - 1) * da,
          phi1,
          phi2,
          input.inflatonMass,
          input.cosmologicalConstant
        )
        const Unext = wdwU(
          output.aMin + (ia + 1) * da,
          phi1,
          phi2,
          input.inflatonMass,
          input.cosmologicalConstant
        )
        if (U > 0 || Uprev > 0 || Unext > 0) continue

        const resRe = -d2aRe + invAsq * lapRe + U * cre
        const resIm = -d2aIm + invAsq * lapIm + U * cim
        resNorm += resRe * resRe + resIm * resIm
        ucNorm += U * U * (cre * cre + cim * cim)
      }
    }
  }

  if (ucNorm <= 0) return 0
  return Math.sqrt(resNorm / ucNorm)
}
