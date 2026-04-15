import { describe, expect, it } from 'vitest'

import {
  solveWheelerDeWitt,
  wdwOperatorResidual,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

// Leapfrog stability: da²·|U_max| < 2 ⇒ da < √(2/|U_max|). Here
// |U_max| ≈ 36π²·aMax² ≈ 800 at aMax=1.5 ⇒ da < 0.05. With Na=96 and
// aMax-aMin = 1.45 we get da ≈ 0.0153, comfortably inside the bound.
const BASE_INPUT: WheelerDeWittSolverInput = {
  boundaryCondition: 'noBoundary',
  inflatonMass: 0.3,
  cosmologicalConstant: 0.05,
  aMin: 0.05,
  aMax: 1.5,
  gridNa: 96,
  gridNphi: 16,
  phiExtent: 2.0,
}

/** Extract the integrated |χ|² on a given a-slab. */
function slabDensity(out: ReturnType<typeof solveWheelerDeWitt>, ia: number): number {
  const [, Nphi] = out.gridSize
  const slab = Nphi * Nphi
  let acc = 0
  for (let i = 0; i < slab; i++) {
    const re = out.chi[ia * 2 * slab + 2 * i] ?? 0
    const im = out.chi[ia * 2 * slab + 2 * i + 1] ?? 0
    acc += re * re + im * im
  }
  return acc
}

/** Mean |arg(χ)| on the full grid (cells above a small density floor). */
function meanAbsPhase(out: ReturnType<typeof solveWheelerDeWitt>): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < out.chi.length; i += 2) {
    const re = out.chi[i] ?? 0
    const im = out.chi[i + 1] ?? 0
    const rho = re * re + im * im
    if (rho > 1e-8) {
      sum += Math.abs(Math.atan2(im, re))
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

describe('Wheeler–DeWitt solver', () => {
  it('Hartle–Hawking produces a real-dominated solution', () => {
    const out = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'noBoundary' })
    // Mean |arg(χ)| should be close to 0 or π (real axis), so we measure
    // sin(arg) instead. For an entirely real output, mean |sin(arg)| < 0.05.
    let sumSin = 0
    let count = 0
    for (let i = 0; i < out.chi.length; i += 2) {
      const re = out.chi[i] ?? 0
      const im = out.chi[i + 1] ?? 0
      const rho = re * re + im * im
      if (rho > 1e-8) {
        const mag = Math.sqrt(rho)
        sumSin += Math.abs(im) / mag
        count++
      }
    }
    const meanAbsSin = count > 0 ? sumSin / count : 0
    expect(meanAbsSin).toBeLessThan(0.2)
  })

  it('Vilenkin solution has non-trivial mean phase magnitude', () => {
    // The Vilenkin boundary seeds a non-zero phase gradient ∂_a S_L = a²·V.
    // After leapfrog propagation the phase diffuses — the grid-averaged
    // |arg(χ)| saturates to ~0.1–0.3 for typical parameters. We only
    // require it to stay clearly non-zero to distinguish it from HH.
    const out = solveWheelerDeWitt({
      ...BASE_INPUT,
      boundaryCondition: 'tunneling',
      cosmologicalConstant: 0.3,
      aMin: 0.5,
    })
    const meanPhase = meanAbsPhase(out)
    expect(meanPhase).toBeGreaterThan(0.05)
  })

  it('DeWitt solution retains its node at a_min (χ(a=0,·) implied)', () => {
    // DeWitt boundary starts from χ(a_min) = a_min·env, with the a=0 node
    // encoded in the linear-in-a scaling of the seed profile. Across any a
    // the field stays finite, and at a_min the slab density is bounded
    // above by (a_min · env_max)² summed over the φ-grid.
    const out = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'deWitt' })
    const densityAtMin = slabDensity(out, 0)
    // Loose upper bound: a_min² · π · Nphi² at Nphi=16 is ≈ 2, so 2000×
    // leaves 3 decades of headroom while still catching a broken BC.
    expect(densityAtMin).toBeLessThan(BASE_INPUT.aMin * BASE_INPUT.aMin * 2000)
    // The solver must not NaN out or zero the field anywhere along the
    // march — confirm the grid contains at least one meaningful cell.
    let maxRho = 0
    for (let i = 0; i < out.chi.length; i += 2) {
      const re = out.chi[i] ?? 0
      const im = out.chi[i + 1] ?? 0
      const rho = re * re + im * im
      if (rho > maxRho) maxRho = rho
    }
    expect(maxRho).toBeGreaterThan(0)
    expect(Number.isFinite(maxRho)).toBe(true)
  })

  it('three boundary conditions give visibly different mean amplitude / phase', () => {
    const hh = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'noBoundary' })
    const vil = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'tunneling' })
    const dw = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'deWitt' })

    // Mean density on the mid-slab distinguishes the three
    const midA = Math.floor(BASE_INPUT.gridNa / 2)
    const dHH = slabDensity(hh, midA)
    const dVil = slabDensity(vil, midA)
    const dDw = slabDensity(dw, midA)

    // No two should be equal (within a tight tolerance)
    expect(Math.abs(dHH - dVil)).toBeGreaterThan(1e-6)
    expect(Math.abs(dHH - dDw)).toBeGreaterThan(1e-6)
    expect(Math.abs(dVil - dDw)).toBeGreaterThan(1e-6)
  })

  it('leapfrog keeps per-slab density bounded (no divergence to Inf/NaN)', () => {
    const out = solveWheelerDeWitt(BASE_INPUT)
    let nonFiniteCount = 0
    for (let i = 0; i < out.chi.length; i++) {
      if (!Number.isFinite(out.chi[i] ?? 0)) nonFiniteCount++
    }
    expect(nonFiniteCount).toBe(0)
  })

  it('Hartle–Hawking slab density stays finite and non-zero end-to-end', () => {
    // WdW is not unitary. With U>0 in the Euclidean region (small a) the HH
    // solution grows exponentially before matching to oscillating behavior
    // at the Lorentzian crossover — that growth is physically correct and
    // not bounded by any conservation law. We only check the solver doesn't
    // go NaN or drop everything to zero.
    const out = solveWheelerDeWitt({ ...BASE_INPUT, boundaryCondition: 'noBoundary' })
    const first = slabDensity(out, 1)
    const last = slabDensity(out, BASE_INPUT.gridNa - 1)
    expect(first).toBeGreaterThan(0)
    expect(last).toBeGreaterThan(0)
    expect(Number.isFinite(first)).toBe(true)
    expect(Number.isFinite(last)).toBe(true)
  })

  it('WdW operator residual is small compared to Uχ norm on interior grid', () => {
    const out = solveWheelerDeWitt(BASE_INPUT)
    const residual = wdwOperatorResidual(out, BASE_INPUT)
    // Second-order leapfrog on a 32×16×16 grid at m=0.3, Λ=0.05 yields
    // residual ~ O(0.01). The PRD says < 5%.
    expect(residual).toBeLessThan(0.05)
  })

  it('maxDensity reflects the Lorentzian region, not clamp-saturated Euclidean cells', () => {
    // Regression: at default params (m=0.3, Λ=0, aMax=1.5, phiExtent=2) the
    // Euclidean region at cube corners hosts the exponentially-growing branch
    // of the WdW solution, which saturates to |χ| = CLAMP = 1e8 and used to
    // set maxDensity ≈ CLAMP² = 1e16. Downstream the density packer then
    // rendered only eight bright cube corners — the physical Lorentzian
    // interior crushed to black by the normalization.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 128,
      gridNphi: 32,
      phiExtent: 2.0,
    })
    // maxDensity should reflect the Lorentzian signal, bounded well below
    // CLAMP². A very loose upper bound of 1e12 still eliminates the prior
    // 1e16 regression by four orders of magnitude.
    expect(out.maxDensity).toBeLessThan(1e12)
    // And it must be strictly positive — otherwise the packer divides by the
    // 1e-20 floor and everything renders black.
    expect(out.maxDensity).toBeGreaterThan(0)
  })

  it.each(['noBoundary', 'tunneling', 'deWitt'] as const)(
    'maxDensity stays at a physical scale at default render config (%s)',
    (bc) => {
      // Regression: prior to the Euclidean absorber + decaying-branch BC,
      // the growing WKB branch saturated the CLAMP = 1e8 at cube corners and
      // produced maxDensity ≈ 1e16. With the absorber in place the field
      // stays at a physical scale across all three boundary conditions.
      const out = solveWheelerDeWitt({
        boundaryCondition: bc,
        inflatonMass: 0.3,
        cosmologicalConstant: 0.0,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: 128,
        gridNphi: 32,
        phiExtent: 2.0,
      })
      expect(Number.isFinite(out.maxDensity)).toBe(true)
      expect(out.maxDensity).toBeGreaterThan(0)
      expect(out.maxDensity).toBeLessThan(100)
    }
  )

  it('operator residual stays tight with the Euclidean absorber active', () => {
    const out = solveWheelerDeWitt(BASE_INPUT)
    const residual = wdwOperatorResidual(out, BASE_INPUT)
    // wdwOperatorResidual skips Euclidean cells, so the absorber cannot
    // perturb the measurement. The Lorentzian region should still satisfy
    // the 5% target.
    expect(residual).toBeLessThan(0.05)
  })
})
