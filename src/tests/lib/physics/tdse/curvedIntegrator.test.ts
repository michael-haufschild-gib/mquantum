/**
 * Tests for the curved-space TDSE RK4 integrator.
 *
 * Covers tests 9–12 from plan §3.1: norm conservation on flat and MT metrics,
 * energy conservation, and analytic Gaussian dispersion on flat metric as the
 * CPU-side regression check for flat-path equivalence.
 *
 * GPU flat-metric still uses the existing split-step path unchanged (zero-
 * regression guarantee from plan §5); tests here verify the CPU RK4 reference
 * is physically correct, not that it reproduces split-step bit-for-bit.
 *
 * @module tests/lib/physics/tdse/curvedIntegrator
 */

import { describe, expect, it } from 'vitest'

import {
  advanceRK4,
  type CurvedIntegratorParams,
  type CurvedIntegratorState,
  stepRK4,
} from '@/lib/physics/tdse/metrics/curvedIntegratorRef'
import {
  applyCurvedKineticRef,
  computeInnerProduct,
  computeProperNorm,
} from '@/lib/physics/tdse/metrics/curvedKineticRef'
import { sampleMetric } from '@/lib/physics/tdse/metrics/evaluator'
import type { MetricConfig } from '@/lib/physics/tdse/metrics/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GridSpec {
  gridSize: number[]
  spacing: number[]
  latticeDim: number
}

function makeGrid(N: number, dx: number, dim: number): GridSpec {
  return {
    gridSize: Array(dim).fill(N) as number[],
    spacing: Array(dim).fill(dx) as number[],
    latticeDim: dim,
  }
}

function totalSites(grid: GridSpec): number {
  let n = 1
  for (let d = 0; d < grid.latticeDim; d++) n *= grid.gridSize[d] as number
  return n
}

function worldCoord(i: number, N: number, dx: number): number {
  return (i - (N - 1) / 2) * dx
}

function get(arr: Float32Array | number[], i: number): number {
  return arr[i] as number
}

function flatIdx(i: number, j: number, k: number, N: number[], dim: number): number {
  if (dim === 1) return i
  const N1 = N[1] as number
  if (dim === 2) return i * N1 + j
  const N2 = N[2] as number
  return (i * N1 + j) * N2 + k
}

function makeGaussian(
  grid: GridSpec,
  sigma: number,
  center: number[] = [0, 0, 0],
  k0: number[] = [0, 0, 0]
): { re: Float32Array; im: Float32Array } {
  const { gridSize: N, spacing, latticeDim } = grid
  const total = totalSites(grid)
  const re = new Float32Array(total)
  const im = new Float32Array(total)
  const N0 = N[0] as number
  const N1 = latticeDim >= 2 ? (N[1] as number) : 1
  const N2 = latticeDim >= 3 ? (N[2] as number) : 1
  const dx0 = spacing[0] as number
  const dx1 = latticeDim >= 2 ? (spacing[1] as number) : 1
  const dx2 = latticeDim >= 3 ? (spacing[2] as number) : 1
  const cx = (center[0] ?? 0) as number
  const cy = (center[1] ?? 0) as number
  const cz = (center[2] ?? 0) as number
  const kx = (k0[0] ?? 0) as number
  const ky = (k0[1] ?? 0) as number
  const kz = (k0[2] ?? 0) as number

  for (let i = 0; i < N0; i++) {
    const x = worldCoord(i, N0, dx0) - cx
    for (let j = 0; j < N1; j++) {
      const y = latticeDim >= 2 ? worldCoord(j, N1, dx1) - cy : 0
      for (let k = 0; k < N2; k++) {
        const z = latticeDim >= 3 ? worldCoord(k, N2, dx2) - cz : 0
        const r2 = x * x + y * y + z * z
        const env = Math.exp(-r2 / (4 * sigma * sigma))
        const phase = kx * x + ky * y + kz * z
        const idx = flatIdx(i, j, k, N, latticeDim)
        re[idx] = env * Math.cos(phase)
        im[idx] = env * Math.sin(phase)
      }
    }
  }
  return { re, im }
}

/** Proper-volume expectation ⟨ψ|Ĥ|ψ⟩ for Ĥ = T_LB + V (V optional). */
function expectationEnergy(state: CurvedIntegratorState, params: CurvedIntegratorParams): number {
  const T = applyCurvedKineticRef({
    psiRe: state.psiRe,
    psiIm: state.psiIm,
    gridSize: params.gridSize,
    spacing: params.spacing,
    mass: params.mass,
    hbar: params.hbar,
    latticeDim: params.latticeDim,
    metric: params.metric,
  })
  const N = params.gridSize as readonly number[]
  const dim = params.latticeDim
  const N0 = N[0] as number
  const N1 = dim >= 2 ? (N[1] as number) : 1
  const N2 = dim >= 3 ? (N[2] as number) : 1
  const dx0 = params.spacing[0] as number
  const dx1 = dim >= 2 ? (params.spacing[1] as number) : 1
  const dx2 = dim >= 3 ? (params.spacing[2] as number) : 1
  let cellVol = 1
  for (let d = 0; d < dim; d++) cellVol *= params.spacing[d] as number

  let sum = 0
  for (let i = 0; i < N0; i++) {
    for (let j = 0; j < N1; j++) {
      for (let k = 0; k < N2; k++) {
        const idx = dim === 1 ? i : dim === 2 ? i * N1 + j : (i * N1 + j) * N2 + k
        const coords = [
          worldCoord(i, N0, dx0),
          dim >= 2 ? worldCoord(j, N1, dx1) : 0,
          dim >= 3 ? worldCoord(k, N2, dx2) : 0,
        ].slice(0, dim)
        const s = sampleMetric(params.metric, coords, dim)
        const psiR = get(state.psiRe, idx)
        const psiI = get(state.psiIm, idx)
        let hRe = get(T.re, idx)
        let hIm = get(T.im, idx)
        if (params.potential !== undefined) {
          const vi = get(params.potential, idx)
          hRe += vi * psiR
          hIm += vi * psiI
        }
        sum += (psiR * hRe + psiI * hIm) * s.sqrtDet
      }
    }
  }
  return sum * cellVol
}

/** σ via √(⟨r²⟩/latticeDim) for an isotropic Gaussian (flat-weight ⟨r²⟩). */
function measureWidth(state: CurvedIntegratorState, grid: GridSpec): number {
  const { gridSize: N, spacing, latticeDim } = grid
  const N0 = N[0] as number
  const N1 = latticeDim >= 2 ? (N[1] as number) : 1
  const N2 = latticeDim >= 3 ? (N[2] as number) : 1
  const dx0 = spacing[0] as number
  const dx1 = latticeDim >= 2 ? (spacing[1] as number) : 1
  const dx2 = latticeDim >= 3 ? (spacing[2] as number) : 1

  let num = 0
  let denom = 0
  for (let i = 0; i < N0; i++) {
    const x = worldCoord(i, N0, dx0)
    for (let j = 0; j < N1; j++) {
      const y = latticeDim >= 2 ? worldCoord(j, N1, dx1) : 0
      for (let k = 0; k < N2; k++) {
        const z = latticeDim >= 3 ? worldCoord(k, N2, dx2) : 0
        const idx = flatIdx(i, j, k, N, latticeDim)
        const prob = get(state.psiRe, idx) ** 2 + get(state.psiIm, idx) ** 2
        num += (x * x + y * y + z * z) * prob
        denom += prob
      }
    }
  }
  const r2 = num / denom
  return Math.sqrt(r2 / latticeDim)
}

// ---------------------------------------------------------------------------
// Test 9: norm conservation on flat metric (500 steps, <0.5%)
// ---------------------------------------------------------------------------

describe('stepRK4 — norm conservation (flat)', () => {
  it('conserves ∫|ψ|² to <0.5% over 500 steps of a free Gaussian', { timeout: 60000 }, () => {
    const grid = makeGrid(12, 0.4, 3)
    const { re, im } = makeGaussian(grid, 0.6)
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric: { kind: 'flat' },
      dt: 0.002,
    }
    const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, params.metric)
    for (let t = 0; t < 500; t++) stepRK4(state, params)
    const n1 = computeProperNorm(
      state.psiRe,
      state.psiIm,
      grid.gridSize,
      grid.spacing,
      3,
      params.metric
    )
    expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.005)
  })
})

// ---------------------------------------------------------------------------
// Test 10: norm conservation on MT metric (500 steps, <1.5%)
// ---------------------------------------------------------------------------

describe('stepRK4 — norm conservation (Morris–Thorne)', () => {
  it('conserves ∫|ψ|²√|g| to <1.5% over 500 steps', { timeout: 60000 }, () => {
    const grid = makeGrid(12, 0.4, 3)
    const { re, im } = makeGaussian(grid, 0.7, [0, 0, 0])
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const metric: MetricConfig = { kind: 'morrisThorne', throatRadius: 0.8 }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt: 0.001,
    }
    const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, metric)
    for (let t = 0; t < 500; t++) stepRK4(state, params)
    const n1 = computeProperNorm(state.psiRe, state.psiIm, grid.gridSize, grid.spacing, 3, metric)
    expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.015)
  })
})

// ---------------------------------------------------------------------------
// Test 11: energy conservation on static MT metric (<1.5%)
// ---------------------------------------------------------------------------

describe('stepRK4 — energy conservation', () => {
  it('conserves ⟨Ĥ⟩ to <1.5% on a static Morris–Thorne metric', { timeout: 60000 }, () => {
    const grid = makeGrid(12, 0.4, 3)
    const { re, im } = makeGaussian(grid, 0.7)
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const metric: MetricConfig = { kind: 'morrisThorne', throatRadius: 0.8 }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt: 0.001,
    }
    const e0 = expectationEnergy(state, params)
    for (let t = 0; t < 500; t++) stepRK4(state, params)
    const e1 = expectationEnergy(state, params)
    expect(Math.abs(e1 - e0) / Math.abs(e0)).toBeLessThan(0.015)
  })
})

// ---------------------------------------------------------------------------
// Test 12: RK4 on flat metric matches analytic Gaussian dispersion
// ---------------------------------------------------------------------------

describe('stepRK4 — flat metric matches analytic Gaussian dispersion', () => {
  /**
   * CPU-side regression check: free Gaussian spreads per the Heisenberg
   * relation σ²(t) = σ₀² + (ℏt/(2mσ₀))². GPU flat-metric uses the existing
   * split-step path unchanged per plan §5; this test is the analytic anchor.
   *
   * Uses σ₀=0.3, t=0.1 (100 dt=0.001 steps) so the analytic width change is
   * ~14% — visible well above the 5% tolerance.
   */
  it('matches σ²(t) = σ₀² + (ℏt/(2mσ₀))² within 5%', { timeout: 60000 }, () => {
    const sigma0 = 0.3
    const grid = makeGrid(18, 0.22, 3)
    const { re, im } = makeGaussian(grid, sigma0)
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric: { kind: 'flat' },
      dt: 0.001,
    }
    const steps = 100
    for (let t = 0; t < steps; t++) stepRK4(state, params)
    const tFinal = steps * params.dt
    const sigmaAnalytic = Math.sqrt(
      sigma0 * sigma0 + ((params.hbar * tFinal) / (2 * params.mass * sigma0)) ** 2
    )
    const sigmaMeasured = measureWidth(state, grid)
    const rel = Math.abs(sigmaMeasured - sigmaAnalytic) / sigmaAnalytic
    expect(rel).toBeLessThan(0.05)
  })
})

// ---------------------------------------------------------------------------
// Wave 3: extended-metric library & time-dependent threading
// ---------------------------------------------------------------------------

/** L2 difference ‖ψ_a − ψ_b‖² summed over all sites (flat-weighted). */
function diffNormSq(
  aRe: Float32Array,
  aIm: Float32Array,
  bRe: Float32Array,
  bIm: Float32Array
): number {
  let s = 0
  for (let i = 0; i < aRe.length; i++) {
    const dr = (aRe[i] as number) - (bRe[i] as number)
    const di = (aIm[i] as number) - (bIm[i] as number)
    s += dr * dr + di * di
  }
  return s
}

/** Deep copy state so independent runs start identically. */
function cloneState(state: CurvedIntegratorState): CurvedIntegratorState {
  return {
    psiRe: new Float32Array(state.psiRe),
    psiIm: new Float32Array(state.psiIm),
  }
}

// --- Test: norm conservation on flat torus -------------------------------

describe('stepRK4 — norm conservation (torus, periodic)', () => {
  it('preserves ∫|ψ|² within 1% over 200 steps on a 1D torus', { timeout: 30000 }, () => {
    const grid = makeGrid(16, 0.3, 1)
    const { re, im } = makeGaussian(grid, 0.6, [0], [1])
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const metric: MetricConfig = { kind: 'torus', torusPeriod: [16 * 0.3, 0, 0] }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 1,
      metric,
      dt: 0.002,
    }
    const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 1, metric)
    for (let t = 0; t < 200; t++) stepRK4(state, params)
    const n1 = computeProperNorm(state.psiRe, state.psiIm, grid.gridSize, grid.spacing, 1, metric)
    expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.01)
  })
})

// --- Test: norm conservation on Schwarzschild ----------------------------

describe('stepRK4 — norm conservation (Schwarzschild)', () => {
  // Tight grid tolerance (2%): the conformal factor ψ⁴ makes norm mildly
  // more sensitive to RK4 truncation than on the flat background; we use
  // small dt and stay well clear of r=0 to avoid the clamp region.
  it('preserves proper norm to <2% over 100 steps', { timeout: 30000 }, () => {
    const grid = makeGrid(14, 0.3, 3)
    // Offset packet along axis 0 so r ≈ 1.5 minimum — away from r=0 clamp.
    const { re, im } = makeGaussian(grid, 0.5, [1.5, 0, 0])
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const metric: MetricConfig = { kind: 'schwarzschild', schwarzschildMass: 0.5 }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt: 0.0005,
    }
    const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, metric)
    for (let t = 0; t < 100; t++) stepRK4(state, params)
    const n1 = computeProperNorm(state.psiRe, state.psiIm, grid.gridSize, grid.spacing, 3, metric)
    expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.02)
  })
})

// --- Test: norm conservation on sphere2D ---------------------------------

describe('stepRK4 — norm conservation (sphere2D)', () => {
  it(
    'preserves proper norm to <2% over 100 steps with packet at equator',
    { timeout: 30000 },
    () => {
      // axes: 0 = flat stacking, 1 = θ, 2 = φ. Put packet at θ=π/2 (equator),
      // φ=π (middle of [0, 2π]) to stay away from Dirichlet boundaries.
      const N = 12
      const dxStack = 0.3
      const dxTheta = Math.PI / N
      const dxPhi = (2 * Math.PI) / N
      const grid: GridSpec = {
        gridSize: [N, N, N],
        spacing: [dxStack, dxTheta, dxPhi],
        latticeDim: 3,
      }
      const { re, im } = makeGaussian(grid, 0.4, [0, Math.PI / 2, Math.PI])
      const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
      const metric: MetricConfig = { kind: 'sphere2D', sphereRadius: 1 }
      const params: CurvedIntegratorParams = {
        gridSize: grid.gridSize,
        spacing: grid.spacing,
        mass: 1,
        hbar: 1,
        latticeDim: 3,
        metric,
        dt: 0.0008,
      }
      const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, metric)
      for (let t = 0; t < 100; t++) stepRK4(state, params)
      const n1 = computeProperNorm(state.psiRe, state.psiIm, grid.gridSize, grid.spacing, 3, metric)
      expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.02)
    }
  )
})

// --- Test: norm conservation on Anti-de Sitter ---------------------------

describe('stepRK4 — norm conservation (antiDeSitter)', () => {
  it(
    'preserves proper norm to <2% over 100 steps with packet away from z=0',
    { timeout: 30000 },
    () => {
      // axis 0 = z. Center packet at z=2·L so (L/z)ⁿ factor is mild and finite.
      const N = 14
      const dx = 0.3
      const grid: GridSpec = {
        gridSize: [N, N, N],
        spacing: [dx, dx, dx],
        latticeDim: 3,
      }
      const { re, im } = makeGaussian(grid, 0.45, [2.0, 0, 0])
      const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
      const metric: MetricConfig = { kind: 'antiDeSitter', adsRadius: 1 }
      const params: CurvedIntegratorParams = {
        gridSize: grid.gridSize,
        spacing: grid.spacing,
        mass: 1,
        hbar: 1,
        latticeDim: 3,
        metric,
        dt: 0.0005,
      }
      const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, metric)
      for (let t = 0; t < 100; t++) stepRK4(state, params)
      const n1 = computeProperNorm(state.psiRe, state.psiIm, grid.gridSize, grid.spacing, 3, metric)
      expect(Math.abs(n1 - n0) / n0).toBeLessThan(0.02)
    }
  )
})

// --- Test: de Sitter (time-dependent) proper-norm drift ------------------

describe('stepRK4 — norm drift (de Sitter, time-dependent)', () => {
  // For a time-dependent metric the Hamiltonian T_LB(t) is Hermitian w.r.t.
  // the instantaneous weight √|g|(t), but the weight itself drifts: so
  // ∫|ψ|²√|g|(t) dⁿx picks up an explicit-∂_t contribution that is NOT
  // annihilated by unitary evolution. We therefore allow up to 3% drift for
  // the Wave-3 acceptance test — keeping dt and total time small enough
  // that the a(t)ⁿ drift itself stays within that envelope.
  it(
    'proper norm (at final time) drifts <3% with H=0.3 over 100 small steps',
    { timeout: 30000 },
    () => {
      const grid = makeGrid(12, 0.3, 3)
      const { re, im } = makeGaussian(grid, 0.5)
      const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
      const metric: MetricConfig = { kind: 'deSitter', hubbleRate: 0.3 }
      const dt = 2e-4
      const params: CurvedIntegratorParams = {
        gridSize: grid.gridSize,
        spacing: grid.spacing,
        mass: 1,
        hbar: 1,
        latticeDim: 3,
        metric,
        dt,
        time: 0,
      }
      // a(0) = 1; norm at t=0 = ∫|ψ|² since √|g|(0)=1.
      const n0 = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, metric, 0)
      const { finalTime } = advanceRK4(state, params, 100)
      const nF = computeProperNorm(
        state.psiRe,
        state.psiIm,
        grid.gridSize,
        grid.spacing,
        3,
        metric,
        finalTime
      )
      expect(Math.abs(nF - n0) / n0).toBeLessThan(0.03)
    }
  )
})

// --- Test: per-stage time threading actually runs ------------------------

describe('stepRK4 — per-stage time threading is active (de Sitter)', () => {
  it('differs from a naive "freeze at t_start" integrator beyond machine eps', () => {
    const grid = makeGrid(10, 0.3, 3)
    const { re, im } = makeGaussian(grid, 0.5)
    // Deliberately large H so exp(H·dt/2) differs measurably from 1 across stages.
    const metric: MetricConfig = { kind: 'deSitter', hubbleRate: 2 }
    const dt = 0.05
    const tStart = 0
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt,
      time: tStart,
    }
    // Proper (threaded) RK4.
    const threaded: CurvedIntegratorState = {
      psiRe: new Float32Array(re),
      psiIm: new Float32Array(im),
    }
    stepRK4(threaded, params)

    // "Naive" reference: all four stages call the kinetic ref with time=tStart,
    // short-circuiting the per-stage time convention. This is hand-inlined so
    // we can prove threading matters without touching production code paths.
    const n = re.length
    const baseRe = new Float32Array(re)
    const baseIm = new Float32Array(im)
    const naiveRhs = (
      inRe: Float32Array,
      inIm: Float32Array
    ): { re: Float32Array; im: Float32Array } => {
      const T = applyCurvedKineticRef({
        psiRe: inRe,
        psiIm: inIm,
        gridSize: params.gridSize,
        spacing: params.spacing,
        mass: params.mass,
        hbar: params.hbar,
        latticeDim: params.latticeDim,
        metric: params.metric,
        time: tStart,
      })
      const invHbar = 1 / params.hbar
      const dRe = new Float32Array(n)
      const dIm = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        dRe[i] = invHbar * (T.im[i] as number)
        dIm[i] = -invHbar * (T.re[i] as number)
      }
      return { re: dRe, im: dIm }
    }
    const k1 = naiveRhs(baseRe, baseIm)
    const tmpRe = new Float32Array(n)
    const tmpIm = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      tmpRe[i] = (baseRe[i] as number) + 0.5 * dt * (k1.re[i] as number)
      tmpIm[i] = (baseIm[i] as number) + 0.5 * dt * (k1.im[i] as number)
    }
    const k2 = naiveRhs(tmpRe, tmpIm)
    for (let i = 0; i < n; i++) {
      tmpRe[i] = (baseRe[i] as number) + 0.5 * dt * (k2.re[i] as number)
      tmpIm[i] = (baseIm[i] as number) + 0.5 * dt * (k2.im[i] as number)
    }
    const k3 = naiveRhs(tmpRe, tmpIm)
    for (let i = 0; i < n; i++) {
      tmpRe[i] = (baseRe[i] as number) + dt * (k3.re[i] as number)
      tmpIm[i] = (baseIm[i] as number) + dt * (k3.im[i] as number)
    }
    const k4 = naiveRhs(tmpRe, tmpIm)
    const naiveRe = new Float32Array(n)
    const naiveIm = new Float32Array(n)
    const oneSixthDt = dt / 6
    for (let i = 0; i < n; i++) {
      naiveRe[i] =
        (baseRe[i] as number) +
        oneSixthDt *
          ((k1.re[i] as number) +
            2 * (k2.re[i] as number) +
            2 * (k3.re[i] as number) +
            (k4.re[i] as number))
      naiveIm[i] =
        (baseIm[i] as number) +
        oneSixthDt *
          ((k1.im[i] as number) +
            2 * (k2.im[i] as number) +
            2 * (k3.im[i] as number) +
            (k4.im[i] as number))
    }
    const diff = diffNormSq(threaded.psiRe, threaded.psiIm, naiveRe, naiveIm)
    expect(diff).toBeGreaterThan(1e-6)
  })
})

// --- Test: flat metric is time-agnostic ----------------------------------

describe('stepRK4 — flat metric ignores params.time', () => {
  it('produces identical ψ for params.time=0 vs params.time=100 on flat metric', () => {
    const grid = makeGrid(10, 0.3, 3)
    const { re, im } = makeGaussian(grid, 0.5, [0, 0, 0], [0.5, 0, 0])
    const paramsBase: Omit<CurvedIntegratorParams, 'time'> = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric: { kind: 'flat' },
      dt: 0.002,
    }
    const sA: CurvedIntegratorState = {
      psiRe: new Float32Array(re),
      psiIm: new Float32Array(im),
    }
    const sB: CurvedIntegratorState = {
      psiRe: new Float32Array(re),
      psiIm: new Float32Array(im),
    }
    stepRK4(sA, { ...paramsBase, time: 0 })
    stepRK4(sB, { ...paramsBase, time: 100 })
    const diff = diffNormSq(sA.psiRe, sA.psiIm, sB.psiRe, sB.psiIm)
    expect(diff).toBeLessThan(1e-10)
  })
})

// --- Test: reduction-to-flat regression ----------------------------------

describe('stepRK4 — flat-metric reduction sanity (time-invariance regression)', () => {
  it('two runs with different times produce the same dispersion width on flat metric', () => {
    const sigma0 = 0.35
    const grid = makeGrid(14, 0.28, 3)
    const { re, im } = makeGaussian(grid, sigma0)
    const paramsBase: Omit<CurvedIntegratorParams, 'time'> = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric: { kind: 'flat' },
      dt: 0.001,
    }
    const a: CurvedIntegratorState = { psiRe: new Float32Array(re), psiIm: new Float32Array(im) }
    const b: CurvedIntegratorState = { psiRe: new Float32Array(re), psiIm: new Float32Array(im) }
    for (let t = 0; t < 50; t++) stepRK4(a, { ...paramsBase, time: 0 })
    for (let t = 0; t < 50; t++) stepRK4(b, { ...paramsBase, time: 42.5 })
    const wA = measureWidth(a, grid)
    const wB = measureWidth(b, grid)
    expect(Math.abs(wA - wB) / wA).toBeLessThan(1e-4)
  })
})

// --- Test: energy conservation on static Schwarzschild -------------------

describe('stepRK4 — energy conservation on Schwarzschild', () => {
  it('⟨Ĥ⟩ drifts <3% over 100 steps', { timeout: 30000 }, () => {
    // V=0 so ⟨Ĥ⟩ = ⟨T⟩, computed via computeInnerProduct(ψ, Tψ) in the
    // proper-volume inner product (consistent with the metric).
    const grid = makeGrid(12, 0.3, 3)
    const { re, im } = makeGaussian(grid, 0.5, [1.5, 0, 0])
    const state: CurvedIntegratorState = { psiRe: re, psiIm: im }
    const metric: MetricConfig = { kind: 'schwarzschild', schwarzschildMass: 0.5 }
    const params: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt: 0.0005,
    }
    const energyOf = (s: CurvedIntegratorState): number => {
      const T = applyCurvedKineticRef({
        psiRe: s.psiRe,
        psiIm: s.psiIm,
        gridSize: params.gridSize,
        spacing: params.spacing,
        mass: params.mass,
        hbar: params.hbar,
        latticeDim: params.latticeDim,
        metric: params.metric,
      })
      // ⟨ψ|Tψ⟩_g (real part; Hermitian T ⇒ imaginary part ≈ 0).
      const ip = computeInnerProduct(
        s.psiRe,
        s.psiIm,
        T.re,
        T.im,
        params.gridSize,
        params.spacing,
        params.latticeDim,
        params.metric
      )
      return ip.re
    }
    const e0 = energyOf(state)
    for (let t = 0; t < 100; t++) stepRK4(state, params)
    const e1 = energyOf(state)
    expect(Math.abs(e1 - e0) / Math.abs(e0)).toBeLessThan(0.03)
  })
})

// --- Test: advanceRK4 chaining contract ----------------------------------

describe('advanceRK4 — chain-resume equals single call', () => {
  it('advanceRK4 ×50 + ×50 (resumed via finalTime) equals advanceRK4 ×100', () => {
    const grid = makeGrid(10, 0.3, 3)
    const { re, im } = makeGaussian(grid, 0.5, [0, 0, 0], [0.5, 0, 0])
    const metric: MetricConfig = { kind: 'flat' } // time-agnostic
    const paramsOnce: CurvedIntegratorParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
      dt: 0.001,
    }
    const singleRun: CurvedIntegratorState = cloneState({ psiRe: re, psiIm: im })
    const { finalTime: tFullEnd } = advanceRK4(singleRun, paramsOnce, 100)

    const chained: CurvedIntegratorState = cloneState({ psiRe: re, psiIm: im })
    const first = advanceRK4(chained, paramsOnce, 50)
    const second = advanceRK4(chained, { ...paramsOnce, time: first.finalTime }, 50)

    expect(second.finalTime).toBeCloseTo(tFullEnd, 12)
    expect(second.finalTime).toBeCloseTo(100 * paramsOnce.dt, 12)
    const diff = diffNormSq(singleRun.psiRe, singleRun.psiIm, chained.psiRe, chained.psiIm)
    expect(diff).toBeLessThan(1e-10)
  })
})
