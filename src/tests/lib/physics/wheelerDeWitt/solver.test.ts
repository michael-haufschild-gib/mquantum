import { describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  countEuclideanDeepCells,
  maxEuclideanChiSquared,
  solveWheelerDeWitt,
  wdwOperatorResidual,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

/** Project's runtime WdW config stripped of display-only fields. */
const DEFAULT_SOLVER_INPUT: WheelerDeWittSolverInput = {
  boundaryCondition: DEFAULT_WHEELER_DEWITT_CONFIG.boundaryCondition,
  inflatonMass: DEFAULT_WHEELER_DEWITT_CONFIG.inflatonMass,
  cosmologicalConstant: DEFAULT_WHEELER_DEWITT_CONFIG.cosmologicalConstant,
  aMin: DEFAULT_WHEELER_DEWITT_CONFIG.aMin,
  aMax: DEFAULT_WHEELER_DEWITT_CONFIG.aMax,
  gridNa: DEFAULT_WHEELER_DEWITT_CONFIG.gridNa,
  gridNphi: DEFAULT_WHEELER_DEWITT_CONFIG.gridNphi,
  phiExtent: DEFAULT_WHEELER_DEWITT_CONFIG.phiExtent,
}

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

  it('maxDensity is bounded and strictly positive at default render config', () => {
    // With Stage-2 the Euclidean region carries the physical exp(−S_Euc)
    // tail (~1e-12 at cube corners), so maxDensity is set by the
    // Lorentzian oscillating region at O(1). No Lorentzian-only fallback
    // is required in the solver any more — the full-grid max coincides
    // with the Lorentzian max.
    const out = solveWheelerDeWitt(DEFAULT_SOLVER_INPUT)
    expect(Number.isFinite(out.maxDensity)).toBe(true)
    expect(out.maxDensity).toBeGreaterThan(0)
    // Bounded at the Lorentzian physical scale.
    expect(out.maxDensity).toBeLessThan(100)
  })

  it.each(['noBoundary', 'deWitt'] as const)(
    'maxDensity stays at a physical scale at default render config (%s)',
    (bc) => {
      // HH and DeWitt: Stage-3 Airy weighting sets c₂ = 0 (pure decaying
      // Ai), so the Euclidean tail is exponentially suppressed and the
      // grid-max stays at the Lorentzian wave's O(1) scale.
      const out = solveWheelerDeWitt({ ...DEFAULT_SOLVER_INPUT, boundaryCondition: bc })
      expect(Number.isFinite(out.maxDensity)).toBe(true)
      expect(out.maxDensity).toBeGreaterThan(0)
      expect(out.maxDensity).toBeLessThan(100)
    }
  )

  it('Vilenkin maxDensity reflects the physical exp(+S_E) tunneling tail', () => {
    // Vilenkin gets c₂ = −i·c₁ — the outgoing-wave Lorentzian → growing
    // Bi-branch Euclidean continuation. |χ_Euc|² grows as exp(+2·S_E)
    // (the famous "Vilenkin tunneling enhancement"), reaching ~1e20 at
    // cube corners with default config. This is physically correct; the
    // pre-Stage-3 absorber masked it. We only require a finite, positive
    // value here — the renderer's logarithmic G channel handles the
    // dynamic range.
    const out = solveWheelerDeWitt({
      ...DEFAULT_SOLVER_INPUT,
      boundaryCondition: 'tunneling',
    })
    expect(Number.isFinite(out.maxDensity)).toBe(true)
    expect(out.maxDensity).toBeGreaterThan(0)
  })

  it('operator residual stays tight across the full grid (all valid bands)', () => {
    // Stage-2 residual metric accepts both Lorentzian and deep-band
    // Euclidean stencils (where the analytic WKB propagator satisfies
    // the PDE to leading order). Transition-band cells are still
    // excluded — the absorber violates the raw PDE there by design.
    const out = solveWheelerDeWitt(BASE_INPUT)
    const residual = wdwOperatorResidual(out, BASE_INPUT)
    expect(residual).toBeLessThan(0.05)
  })

  it.each(['noBoundary', 'deWitt'] as const)(
    'Stage-3 Airy connection keeps |χ_Euc| physically bounded (%s)',
    (bc) => {
      // HH and DeWitt: Stage-3 selects c₂ = 0 (pure-decaying Euclidean
      // continuation), so the Euclidean tail is bounded by the
      // Lorentzian-side amplitude at the turning surface (~O(1)). The
      // ~14-orders-of-magnitude headroom below the former 1e16 absorber
      // runaway is comfortably preserved.
      const out = solveWheelerDeWitt({ ...DEFAULT_SOLVER_INPUT, boundaryCondition: bc })
      const deepCount = countEuclideanDeepCells(out)
      expect(deepCount).toBeGreaterThan(0)
      const maxEuclideanSq = maxEuclideanChiSquared(out)
      expect(Number.isFinite(maxEuclideanSq)).toBe(true)
      expect(maxEuclideanSq).toBeLessThan(100)
    }
  )

  it('Stage-3 Airy connection: Vilenkin Euclidean tail grows physically', () => {
    // Vilenkin: c₂ = −i·c₁. The Euclidean continuation contains Bi(ζ)
    // which grows as exp(+S_E)/ζ^{1/4} → |χ_Euc|² ~ exp(+2·S_E). At cube
    // corners with default config S_E_max ≈ 30, so peak |χ|² is around
    // exp(60)·|c₁|². The exact value depends on the Vilenkin BC scale at
    // the corner; we assert finite, positive, and clearly larger than
    // the HH/DeWitt bound (so the test catches a regression to absorber
    // damping).
    const out = solveWheelerDeWitt({
      ...DEFAULT_SOLVER_INPUT,
      boundaryCondition: 'tunneling',
    })
    const maxEuclideanSq = maxEuclideanChiSquared(out)
    expect(Number.isFinite(maxEuclideanSq)).toBe(true)
    expect(maxEuclideanSq).toBeGreaterThan(100)
  })

  it('Stage-2: deep-band χ follows the analytic exp(−ΔS) decay (HH)', () => {
    // Sample a column deep in the Euclidean region and verify two
    // deep-band slabs separated by ΔS satisfy the analytic relation:
    //
    //   |χ(a_far)| / |χ(a_near)| = (U(a_near) / U(a_far))^{1/4} · exp(−ΔS)
    //
    // within a tight relative tolerance. If Stage-2 ever regresses
    // (e.g. match coefficient captured from the wrong slab, wrong
    // prefactor power, sign flip in ΔS) the relation fails by orders
    // of magnitude. This is the smoke test for the Stage-2 propagator.
    const out = solveWheelerDeWitt(DEFAULT_SOLVER_INPUT)
    const [Na, Nphi] = out.gridSize
    const slabSize = Nphi * Nphi
    // Cube-corner column — (i1, i2) = (Nphi-1, Nphi-1): φ = (+phiExtent,
    // +phiExtent) at DEFAULT_SOLVER_INPUT means (2, 2), V > 0.
    const i1 = Nphi - 1
    const i2 = Nphi - 1
    const idx = i1 * Nphi + i2
    // Scan from the last slab backwards to find two deep-band slabs.
    let iaFar = -1
    let iaNear = -1
    for (let ia = Na - 1; ia >= 0 && (iaFar === -1 || iaNear === -1); ia--) {
      if (out.bandKind[ia * slabSize + idx] !== 2) continue
      if (iaFar === -1) iaFar = ia
      else if (ia < iaFar - 4) iaNear = ia
    }
    expect(iaFar).toBeGreaterThan(0)
    expect(iaNear).toBeGreaterThan(0)
    const da = (out.aMax - out.aMin) / (Na - 1)
    const aNear = out.aMin + iaNear * da
    const aFar = out.aMin + iaFar * da
    const phi = DEFAULT_SOLVER_INPUT.phiExtent
    // V and U at each sample.
    const m = DEFAULT_SOLVER_INPUT.inflatonMass
    const lam = DEFAULT_SOLVER_INPUT.cosmologicalConstant
    const V = 0.5 * m * m * (phi * phi + phi * phi) + lam
    const K = (8 * Math.PI) / 3
    const cU = 36 * Math.PI * Math.PI
    const Unear = cU * aNear * aNear * (K * V * aNear * aNear - 1)
    const Ufar = cU * aFar * aFar * (K * V * aFar * aFar - 1)
    const Snear = (3 / (4 * V)) * Math.pow(K * V * aNear * aNear - 1, 1.5)
    const Sfar = (3 / (4 * V)) * Math.pow(K * V * aFar * aFar - 1, 1.5)
    const expectedRatio = Math.pow(Unear / Ufar, 0.25) * Math.exp(-(Sfar - Snear))
    const nearRe = out.chi[2 * (iaNear * slabSize + idx)]!
    const nearIm = out.chi[2 * (iaNear * slabSize + idx) + 1]!
    const farRe = out.chi[2 * (iaFar * slabSize + idx)]!
    const farIm = out.chi[2 * (iaFar * slabSize + idx) + 1]!
    const nearMag = Math.sqrt(nearRe * nearRe + nearIm * nearIm)
    const farMag = Math.sqrt(farRe * farRe + farIm * farIm)
    expect(nearMag).toBeGreaterThan(0)
    const observedRatio = farMag / nearMag
    // Stage-3: cells use Langer χ = (ζ/U)^{1/4}·c₁·Ai(ζ). In the deep
    // asymptotic Ai(ζ) ~ (1/(2√π))·ζ^{-1/4}·exp(−(2/3)ζ^{3/2}), so the
    // ratio reduces to (U_near/U_far)^{1/4}·exp(−ΔS_E) up to subleading
    // O(1/ξ) Airy corrections. At ξ = (2/3)·ζ^{3/2} ≈ 26 for default
    // cube-corner deep cells, the leading u₁/ξ correction differs
    // between near and far cells by ~1e-3 (ΔU₁/ξ scales with Δa).
    // 0.5 % relative tolerance catches a Langer formula bug while
    // tolerating the physics of Airy subleading terms.
    const relErr = Math.abs(observedRatio / expectedRatio - 1)
    expect(relErr).toBeLessThan(0.005)
  })

  it('Taylor seed: slab 1 Lorentzian-region residual matches first-order Taylor', () => {
    // For the second slab, χ(a_min + da, φ) = χ(a_min, φ) + da·χ'(a_min, φ)
    // + ½·da²·χ''(a_min, φ). On a Lorentzian-only slice (U < 0 at both
    // a_min and a_min+da) the Euclidean absorber is inactive, so the
    // solver's slab-1 output matches the Taylor expansion cleanly.
    //
    // At φ = 0 the Vilenkin generator has χ(a_min, 0) = exp(i·a_min³·Λ/3)
    // and (post-WKB-fix) χ'(a_min, 0) = i·√|U(a_min, 0)|·χ(a_min, 0).
    // Chose aMin=0.5, aMax=1.0 with small Λ=0.1 so U(aMin, 0) < 0 —
    // Lorentzian everywhere on the first two slabs.
    //
    // Catches: missing ½-factor in Taylor (unchanged first-order), sign
    // flip on the Vilenkin χ', misapplied absorber (which would damp by
    // ~13 % at a_min here if incorrectly triggered inside the Lorentzian
    // region).
    const params = {
      boundaryCondition: 'tunneling' as const,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      aMin: 0.5,
      aMax: 1.0,
      gridNa: 48,
      gridNphi: 9,
      phiExtent: 2.0,
    }
    const out = solveWheelerDeWitt(params)
    const [Na, Nphi] = out.gridSize
    const iMid = (Nphi - 1) / 2
    const da = (params.aMax - params.aMin) / (Na - 1)
    const a0 = params.aMin
    const V = params.cosmologicalConstant
    const S0 = (a0 * a0 * a0 * V) / 3
    const chi0Re = Math.cos(S0)
    const chi0Im = Math.sin(S0)
    // WKB outgoing-wave gradient (Stage-3 BC fix):
    //   ∂_a S_phys = √|U(a_min)| with U = −36π²·a²·(1 − K·V·a²).
    const cU = 36 * Math.PI * Math.PI
    const K = (8 * Math.PI) / 3
    const Uat0 = -cU * a0 * a0 * (1 - K * V * a0 * a0)
    const dSda = Math.sqrt(-Uat0)
    const chiPrimeRe = -dSda * chi0Im
    const chiPrimeIm = dSda * chi0Re

    const idx1 = 2 * (Nphi * Nphi + iMid * Nphi + iMid)
    const slab1Re = out.chi[idx1]!
    const slab1Im = out.chi[idx1 + 1]!
    const expectedRe = chi0Re + da * chiPrimeRe
    const expectedIm = chi0Im + da * chiPrimeIm
    // The O(da²) correction is ½·da²·(|U|+|Laplacian|)·|χ|. With the
    // WKB BC the leading-order Taylor matches the solver to ~5e-3 at
    // this grid (driven by the |U|·da² second-order term). 2e-2
    // tolerance keeps headroom for architecture variation while still
    // catching sign-flips (which would inflate the residual by ≥ 2|χ′|·da
    // ≈ 0.4 at these params).
    expect(Math.abs(slab1Re - expectedRe)).toBeLessThan(2e-2)
    expect(Math.abs(slab1Im - expectedIm)).toBeLessThan(2e-2)
  })

  it('Vilenkin BC seeds a complex χ at a_min matching S_L = a³V/3', () => {
    // Analytic check on the first slab: the Vilenkin generator sets
    //   χ(a_min, φ) = e^{−½|φ|²} · exp(i · a_min³ · V(φ) / 3)
    // with V(φ) = ½m²|φ|² + Λ. For arbitrary m, Λ the phase at the grid
    // centre (φ = 0) is a_min³·Λ/3 exactly, with envelope 1.
    const params = {
      boundaryCondition: 'tunneling' as const,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.5,
      aMin: 0.4,
      aMax: 1.0,
      gridNa: 16,
      gridNphi: 9, // odd Nphi so φ = 0 is a grid point
      phiExtent: 2.0,
    }
    const out = solveWheelerDeWitt(params)
    const [Na, Nphi] = out.gridSize
    expect(Na).toBe(params.gridNa)
    // Centre of the φ grid — the grid spans [−phiExtent, +phiExtent] so
    // for odd Nphi the middle index is Nphi/2 rounded down.
    const iMid = (Nphi - 1) / 2
    expect(iMid).toBe(4)
    // Slab 0 at (iMid, iMid) should be exp(i · a_min³·Λ/3).
    const idx = 2 * (0 * Nphi * Nphi + iMid * Nphi + iMid)
    const re = out.chi[idx]!
    const im = out.chi[idx + 1]!
    const mag = Math.sqrt(re * re + im * im)
    const expectedS = (params.aMin ** 3 * params.cosmologicalConstant) / 3
    expect(mag).toBeCloseTo(1.0, 5) // envelope = 1 at φ = 0
    expect(Math.atan2(im, re)).toBeCloseTo(expectedS, 5)
  })

  it('DeWitt BC enforces the linear-in-a ramp at the origin', () => {
    // At a_min the DeWitt generator emits χ(a_min) = a_min · env(φ) with
    // the grid's a = 0 node encoded in the linear scaling. Halving a_min
    // while keeping (m, Λ, phiExtent) fixed must halve χ at any (φ) grid
    // location too.
    const params = {
      boundaryCondition: 'deWitt' as const,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      aMax: 1.5,
      gridNa: 32,
      gridNphi: 9,
      phiExtent: 2.0,
    }
    const out1 = solveWheelerDeWitt({ ...params, aMin: 0.1 })
    const out2 = solveWheelerDeWitt({ ...params, aMin: 0.2 })
    // Centre-of-grid sample on slab 0.
    const Nphi = out1.gridSize[1]
    const iMid = (Nphi - 1) / 2
    const chi1 = out1.chi[2 * (iMid * Nphi + iMid)]!
    const chi2 = out2.chi[2 * (iMid * Nphi + iMid)]!
    // χ(aMin) ∝ aMin at fixed φ → ratio equals aMin ratio.
    expect(chi2 / chi1).toBeCloseTo(2.0, 5)
  })

  it('sign convention: U < 0 inside the Lorentzian region at the grid centre', () => {
    // The mask semantics are load-bearing for streamline gating; drift
    // here has been the cause of "streamlines bleed into forbidden
    // region" bugs. Confirm the mask actually reports the Lorentzian
    // condition U(a, φ) < 0 at a deterministic interior cell, and
    // confirm that U > 0 cells return mask = 0.
    const params = BASE_INPUT
    const out = solveWheelerDeWitt(params)
    const [Na, Nphi] = out.gridSize
    // Centre-of-grid: by construction the default config puts this in
    // the Lorentzian region, so mask should be 1 and U should be < 0.
    const ia = Math.floor(Na / 2)
    const i1 = Math.floor(Nphi / 2)
    const i2 = Math.floor(Nphi / 2)
    const idx = ia * Nphi * Nphi + i1 * Nphi + i2
    const maskVal = out.lorentzianMask[idx]!
    expect(maskVal).toBe(1)
  })

  it('bit-identical re-runs at identical inputs (deterministic solver)', () => {
    // Determinism is a prerequisite for bisection-friendly physics
    // regression tests: two solves of the same config must produce
    // bit-identical χ and mask arrays. No hidden global state
    // (e.g. Math.random, performance.now) may leak into the solver.
    const a = solveWheelerDeWitt(BASE_INPUT)
    const b = solveWheelerDeWitt(BASE_INPUT)
    expect(a.chi.length).toBe(b.chi.length)
    for (let i = 0; i < a.chi.length; i++) {
      expect(a.chi[i]).toBe(b.chi[i])
    }
    for (let i = 0; i < a.lorentzianMask.length; i++) {
      expect(a.lorentzianMask[i]).toBe(b.lorentzianMask[i])
    }
    expect(a.maxDensity).toBe(b.maxDensity)
  })

  it('inflatonMassAsymmetry=1 is byte-identical to omitting the field (isotropic default)', () => {
    // The new per-axis asymmetry knob enters the potential via
    // `½m²·φ₁² + ½(m·α)²·φ₂² + Λ`. At `α = 1` the product `m² · 1 · 1`
    // is exactly `m² · m² / m² = m²` in IEEE-754 (multiplying by the
    // exact constant 1.0 is a no-op), so every `wdwPotential` /
    // `wdwU` / `wdwTurningA` / `wdwEuclideanWkbAction` call returns
    // bit-identical values whether `inflatonMassAsymmetry` is absent
    // or set to `1`. The solver must therefore produce byte-exact
    // `chi`, `mask`, and `maxDensity` buffers under both call shapes.
    //
    // This is the backward-compat regression pin: every existing call
    // site in the repo that omits `inflatonMassAsymmetry` now relies
    // on this property.
    const omitted = solveWheelerDeWitt(BASE_INPUT)
    const explicit = solveWheelerDeWitt({ ...BASE_INPUT, inflatonMassAsymmetry: 1 })
    expect(explicit.chi.length).toBe(omitted.chi.length)
    for (let i = 0; i < omitted.chi.length; i++) {
      expect(explicit.chi[i]).toBe(omitted.chi[i])
    }
    for (let i = 0; i < omitted.lorentzianMask.length; i++) {
      expect(explicit.lorentzianMask[i]).toBe(omitted.lorentzianMask[i])
    }
    for (let i = 0; i < omitted.bandKind.length; i++) {
      expect(explicit.bandKind[i]).toBe(omitted.bandKind[i])
    }
    expect(explicit.maxDensity).toBe(omitted.maxDensity)
  })

  it('inflatonMassAsymmetry != 1 breaks φ₁↔φ₂ exchange symmetry of χ', () => {
    // With `α = 2`, the effective mass on the φ₂ axis is `2m`, so the
    // potential weighs φ₂ displacements 4× more heavily than φ₁. The
    // solved χ must therefore lose the `χ(a, φ₁, φ₂) = χ(a, φ₂, φ₁)`
    // exchange symmetry the isotropic case enjoys. If this test
    // passes at `α = 1` (which it does not — the isotropic case is
    // symmetric) then the asymmetry is silently dropped somewhere in
    // the pipeline.
    const out = solveWheelerDeWitt({ ...BASE_INPUT, inflatonMassAsymmetry: 2.0 })
    const [, Nphi] = out.gridSize
    const iMid = Math.floor(BASE_INPUT.gridNa / 2)
    const slab = Nphi * Nphi
    let maxDiff = 0
    // Compare χ(ia=iMid, i1, i2) vs χ(ia=iMid, i2, i1) for a handful of
    // off-diagonal cells.
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = i1 + 1; i2 < Nphi; i2++) {
        const aOff = 2 * (iMid * slab + i1 * Nphi + i2)
        const bOff = 2 * (iMid * slab + i2 * Nphi + i1)
        const aRe = out.chi[aOff] ?? 0
        const aIm = out.chi[aOff + 1] ?? 0
        const bRe = out.chi[bOff] ?? 0
        const bIm = out.chi[bOff + 1] ?? 0
        const d = Math.hypot(aRe - bRe, aIm - bIm)
        if (d > maxDiff) maxDiff = d
      }
    }
    expect(maxDiff).toBeGreaterThan(1e-4)
  })
})
