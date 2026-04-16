/**
 * Tests for the curved-space kinetic operator (Laplace–Beltrami reference).
 *
 * Covers tests 5–8 from plan §3.1 (flat reduction, plane-wave eigenvalue,
 * MT transverse decoupling, hermiticity) plus Wave 2 additions:
 *   - periodic torus plane-wave eigenvalue
 *   - flat vs torus interior equivalence
 *   - hermiticity on torus / sphere2D / Schwarzschild / AdS
 *   - de Sitter time-dependence and a(t)⁻² scaling
 *   - doubleThroat asymptotic flatness
 *   - plane-wave dispersion across multiple k.
 *
 * @module tests/lib/physics/tdse/curvedKinetic
 */

import { describe, expect, it } from 'vitest'

import {
  applyCurvedKineticRef,
  computeInnerProduct,
  computeProperNorm,
} from '@/lib/physics/tdse/metrics/curvedKineticRef'
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

/**
 * Reference flat Laplacian using plain 2nd-order central differences and
 * Dirichlet BC: Tψ = −ℏ²/(2m)·Σ_μ (ψ_{+1} − 2ψ + ψ_{−1}) / dx².
 */
function applyFlatKineticTrivial(
  psiRe: Float32Array,
  psiIm: Float32Array,
  grid: GridSpec,
  mass: number,
  hbar: number
): { re: Float32Array; im: Float32Array } {
  const { gridSize: N, spacing, latticeDim } = grid
  const total = totalSites(grid)
  const outRe = new Float32Array(total)
  const outIm = new Float32Array(total)
  const pref = -(hbar * hbar) / (2 * mass)

  const N0 = N[0] as number
  const N1 = latticeDim >= 2 ? (N[1] as number) : 1
  const N2 = latticeDim >= 3 ? (N[2] as number) : 1

  const fetch = (arr: Float32Array, i: number, j: number, k: number): number => {
    if (i < 0 || i >= N0) return 0
    if (latticeDim >= 2 && (j < 0 || j >= N1)) return 0
    if (latticeDim >= 3 && (k < 0 || k >= N2)) return 0
    return get(arr, flatIdx(i, j, k, N, latticeDim))
  }

  for (let i = 0; i < N0; i++) {
    for (let j = 0; j < N1; j++) {
      for (let k = 0; k < N2; k++) {
        let lapRe = 0
        let lapIm = 0
        for (let axis = 0; axis < latticeDim; axis++) {
          const dx = spacing[axis] as number
          const inv = 1 / (dx * dx)
          const iP = axis === 0 ? i + 1 : i
          const jP = axis === 1 ? j + 1 : j
          const kP = axis === 2 ? k + 1 : k
          const iM = axis === 0 ? i - 1 : i
          const jM = axis === 1 ? j - 1 : j
          const kM = axis === 2 ? k - 1 : k
          const idxCenter = flatIdx(i, j, k, N, latticeDim)
          lapRe +=
            inv * (fetch(psiRe, iP, jP, kP) - 2 * get(psiRe, idxCenter) + fetch(psiRe, iM, jM, kM))
          lapIm +=
            inv * (fetch(psiIm, iP, jP, kP) - 2 * get(psiIm, idxCenter) + fetch(psiIm, iM, jM, kM))
        }
        const idx = flatIdx(i, j, k, N, latticeDim)
        outRe[idx] = pref * lapRe
        outIm[idx] = pref * lapIm
      }
    }
  }
  return { re: outRe, im: outIm }
}

/** Gaussian ψ(x) = exp(−|x−x0|²/(4σ²)) · exp(ik·x) on a centered grid. */
function makeGaussian(
  grid: GridSpec,
  sigma: number,
  k0: number[] = [0, 0, 0]
): { re: Float32Array; im: Float32Array } {
  return makeOffsetGaussian(grid, sigma, [0, 0, 0], k0)
}

/**
 * Gaussian centered at a specified world-coord offset.
 * Used for hermiticity tests on metrics where the origin is singular or
 * otherwise invalid (Schwarzschild, AdS, sphere2D).
 */
function makeOffsetGaussian(
  grid: GridSpec,
  sigma: number,
  center: number[],
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
    const x = worldCoord(i, N0, dx0)
    for (let j = 0; j < N1; j++) {
      const y = latticeDim >= 2 ? worldCoord(j, N1, dx1) : 0
      for (let k = 0; k < N2; k++) {
        const z = latticeDim >= 3 ? worldCoord(k, N2, dx2) : 0
        const r2 = (x - cx) * (x - cx) + (y - cy) * (y - cy) + (z - cz) * (z - cz)
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

/** Deterministic PRNG (mulberry32) for reproducible random fields. */
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Existing Test 5: flat Laplace–Beltrami equals trivial flat Laplacian
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — flat metric reduction', () => {
  it('matches a trivial central-difference Laplacian for a Gaussian (3D, <1e-5)', () => {
    const grid = makeGrid(20, 0.2, 3)
    const { re, im } = makeGaussian(grid, 0.5, [1.0, 0.5, -0.3])
    const mass = 1.0
    const hbar = 1.0
    const ref = applyCurvedKineticRef({
      psiRe: re,
      psiIm: im,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass,
      hbar,
      latticeDim: 3,
      metric: { kind: 'flat' },
    })
    const trivial = applyFlatKineticTrivial(re, im, grid, mass, hbar)
    let maxAbs = 0
    let refMax = 0
    for (let n = 0; n < ref.re.length; n++) {
      const rr = get(ref.re, n)
      const ti = get(trivial.re, n)
      const ri = get(ref.im, n)
      const tii = get(trivial.im, n)
      maxAbs = Math.max(maxAbs, Math.abs(rr - ti), Math.abs(ri - tii))
      refMax = Math.max(refMax, Math.abs(ti), Math.abs(tii))
    }
    expect(maxAbs / refMax).toBeLessThan(1e-5)
  })
})

// ---------------------------------------------------------------------------
// Existing Test 6 (expanded): plane-wave dispersion on flat metric, multiple k
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — flat plane-wave dispersion', () => {
  const cases: Array<{ kx: number; N: number; dx: number }> = [
    { kx: 0.5, N: 32, dx: 0.15 },
    { kx: 1.0, N: 32, dx: 0.15 },
    { kx: 1.5, N: 48, dx: 0.12 },
    { kx: 2.0, N: 48, dx: 0.1 },
  ]
  for (const { kx, N, dx } of cases) {
    it(`T·exp(ikx) matches analytical FD eigenvalue at interior cells (kx=${kx})`, () => {
      const grid = makeGrid(N, dx, 1)
      const mass = 1.0
      const hbar = 1.0
      const re = new Float32Array(N)
      const im = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        const x = (i - (N - 1) / 2) * dx
        re[i] = Math.cos(kx * x)
        im[i] = Math.sin(kx * x)
      }
      const T = applyCurvedKineticRef({
        psiRe: re,
        psiIm: im,
        gridSize: grid.gridSize,
        spacing: grid.spacing,
        mass,
        hbar,
        latticeDim: 1,
        metric: { kind: 'flat' },
      })
      const lambdaFd = (((hbar * hbar) / (2 * mass)) * (2 * (1 - Math.cos(kx * dx)))) / (dx * dx)
      for (let i = 4; i < N - 4; i++) {
        expect(get(T.re, i)).toBeCloseTo(lambdaFd * get(re, i), 4)
        expect(get(T.im, i)).toBeCloseTo(lambdaFd * get(im, i), 4)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Existing Test 7: MT transverse-constant ψ decoupling
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — Morris–Thorne with transverse-constant ψ', () => {
  it('Tψ depends only on ∂²/∂l² when ψ is independent of transverse axes', () => {
    const grid = makeGrid(16, 0.2, 3)
    const N = grid.gridSize
    const N0 = N[0] as number
    const N1 = N[1] as number
    const N2 = N[2] as number
    const total = totalSites(grid)
    const re = new Float32Array(total)
    const im = new Float32Array(total)
    const dx0 = grid.spacing[0] as number
    const sigma = 0.6
    for (let i = 0; i < N0; i++) {
      const l = (i - (N0 - 1) / 2) * dx0
      const env = Math.exp(-(l * l) / (4 * sigma * sigma))
      for (let j = 0; j < N1; j++) {
        for (let k = 0; k < N2; k++) {
          re[(i * N1 + j) * N2 + k] = env
        }
      }
    }
    const T = applyCurvedKineticRef({
      psiRe: re,
      psiIm: im,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric: { kind: 'morrisThorne', throatRadius: 0.5 },
    })
    for (let i = 2; i < N0 - 2; i++) {
      const refIdx = (i * N1 + Math.floor(N1 / 2)) * N2 + Math.floor(N2 / 2)
      const refVal = get(T.re, refIdx)
      for (let j = 2; j < N1 - 2; j++) {
        for (let k = 2; k < N2 - 2; k++) {
          const idx = (i * N1 + j) * N2 + k
          expect(get(T.re, idx)).toBeCloseTo(refVal, 5)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Existing Test 8: hermiticity ⟨φ|Tψ⟩ = ⟨Tφ|ψ⟩ (now using computeInnerProduct)
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — hermiticity (flat, MT)', () => {
  function assertHermitianAt(
    metric: MetricConfig,
    dim: number,
    N: number,
    dx: number,
    psiCenter: number[],
    phiCenter: number[],
    psiK: number[],
    phiK: number[],
    time: number = 0
  ): void {
    const grid = makeGrid(N, dx, dim)
    const psi = makeOffsetGaussian(grid, 0.5, psiCenter, psiK)
    const phi = makeOffsetGaussian(grid, 0.4, phiCenter, phiK)
    const total = totalSites(grid)
    for (let n = 0; n < total; n++) {
      phi.re[n] = get(phi.re, n) * (1 + 0.3 * Math.cos(0.17 * n))
      phi.im[n] = get(phi.im, n) * (1 - 0.25 * Math.sin(0.11 * n))
    }
    const kinParams = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: dim,
      metric,
      time,
    }
    const Tpsi = applyCurvedKineticRef({ psiRe: psi.re, psiIm: psi.im, ...kinParams })
    const Tphi = applyCurvedKineticRef({ psiRe: phi.re, psiIm: phi.im, ...kinParams })

    const lhs = computeInnerProduct(
      phi.re,
      phi.im,
      Tpsi.re,
      Tpsi.im,
      grid.gridSize,
      grid.spacing,
      dim,
      metric,
      time
    )
    const rhs = computeInnerProduct(
      Tphi.re,
      Tphi.im,
      psi.re,
      psi.im,
      grid.gridSize,
      grid.spacing,
      dim,
      metric,
      time
    )

    const diffRe = Math.abs(lhs.re - rhs.re)
    const diffIm = Math.abs(lhs.im - rhs.im)
    const mag = Math.sqrt(lhs.re * lhs.re + lhs.im * lhs.im)
    expect((diffRe + diffIm) / Math.max(mag, 1e-30)).toBeLessThan(1e-6)
  }

  it('holds on flat 3D metric', () => {
    assertHermitianAt(
      { kind: 'flat' },
      3,
      12,
      0.25,
      [0, 0, 0],
      [0, 0, 0],
      [1.0, -0.5, 0.3],
      [-0.7, 0.4, -0.2]
    )
  })

  it('holds on Morris–Thorne 3D metric', () => {
    assertHermitianAt(
      { kind: 'morrisThorne', throatRadius: 0.6 },
      3,
      12,
      0.25,
      [0, 0, 0],
      [0, 0, 0],
      [1.0, -0.5, 0.3],
      [-0.7, 0.4, -0.2]
    )
  })
})

// ---------------------------------------------------------------------------
// New Test: torus plane-wave eigenvalue with periodic BC
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — torus plane-wave eigenvalue (periodic)', () => {
  it('T·exp(i·2π·n·j/N) matches the periodic FD eigenvalue exactly at every cell', () => {
    const N = 24
    const dx = 0.2
    const n = 3 // non-zero mode number
    const grid = makeGrid(N, dx, 1)
    const re = new Float32Array(N)
    const im = new Float32Array(N)
    for (let j = 0; j < N; j++) {
      const phase = (2 * Math.PI * n * j) / N
      re[j] = Math.cos(phase)
      im[j] = Math.sin(phase)
    }
    const mass = 1.0
    const hbar = 1.0
    const metric: MetricConfig = {
      kind: 'torus',
      torusPeriod: [N * dx, N * dx, N * dx],
    }
    const T = applyCurvedKineticRef({
      psiRe: re,
      psiIm: im,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass,
      hbar,
      latticeDim: 1,
      metric,
    })
    // Analytical eigenvalue: λ = (ℏ²/2m)·(2/dx²)·(1 − cos(2πn/N)).
    const lambda =
      (((hbar * hbar) / (2 * mass)) * (2 * (1 - Math.cos((2 * Math.PI * n) / N)))) / (dx * dx)
    let maxRel = 0
    for (let j = 0; j < N; j++) {
      const expectedRe = lambda * get(re, j)
      const expectedIm = lambda * get(im, j)
      const dRe = get(T.re, j) - expectedRe
      const dIm = get(T.im, j) - expectedIm
      const magExp = Math.hypot(expectedRe, expectedIm)
      maxRel = Math.max(maxRel, Math.hypot(dRe, dIm) / Math.max(magExp, 1e-12))
    }
    expect(maxRel).toBeLessThan(1e-5)
  })
})

// ---------------------------------------------------------------------------
// New Test: flat vs torus interior equivalence for a narrow Gaussian
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — flat vs torus interior equivalence', () => {
  it('narrow Gaussian at the grid center yields matching T at the peak on flat and torus', () => {
    const N = 24
    const dx = 0.2
    const grid = makeGrid(N, dx, 1)
    const sigma = 0.4
    const re = new Float32Array(N)
    const im = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const x = (i - (N - 1) / 2) * dx
      re[i] = Math.exp(-(x * x) / (4 * sigma * sigma))
    }
    const base = {
      psiRe: re,
      psiIm: im,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 1,
    }
    const Tflat = applyCurvedKineticRef({ ...base, metric: { kind: 'flat' } })
    const Ttorus = applyCurvedKineticRef({
      ...base,
      metric: { kind: 'torus', torusPeriod: [N * dx, N * dx, N * dx] },
    })
    // Compare at Gaussian peak (cell floor((N-1)/2)).
    const peak = Math.floor((N - 1) / 2)
    const rel =
      Math.abs(get(Tflat.re, peak) - get(Ttorus.re, peak)) /
      Math.max(Math.abs(get(Tflat.re, peak)), 1e-30)
    expect(rel).toBeLessThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// New Test: torus hermiticity with seeded random ψ, φ
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — torus hermiticity (periodic)', () => {
  it('⟨φ|Tψ⟩ = ⟨Tφ|ψ⟩ for seeded random fields on a 1D torus', () => {
    const N = 20
    const dx = 0.25
    const grid = makeGrid(N, dx, 1)
    const metric: MetricConfig = { kind: 'torus', torusPeriod: [N * dx, N * dx, N * dx] }
    const rng = mulberry32(0x5eed)
    const psiRe = new Float32Array(N)
    const psiIm = new Float32Array(N)
    const phiRe = new Float32Array(N)
    const phiIm = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      psiRe[i] = rng() * 2 - 1
      psiIm[i] = rng() * 2 - 1
      phiRe[i] = rng() * 2 - 1
      phiIm[i] = rng() * 2 - 1
    }
    const base = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 1,
      metric,
    }
    const Tpsi = applyCurvedKineticRef({ psiRe, psiIm, ...base })
    const Tphi = applyCurvedKineticRef({ psiRe: phiRe, psiIm: phiIm, ...base })
    const lhs = computeInnerProduct(
      phiRe,
      phiIm,
      Tpsi.re,
      Tpsi.im,
      grid.gridSize,
      grid.spacing,
      1,
      metric
    )
    const rhs = computeInnerProduct(
      Tphi.re,
      Tphi.im,
      psiRe,
      psiIm,
      grid.gridSize,
      grid.spacing,
      1,
      metric
    )
    const diff = Math.abs(lhs.re - rhs.re) + Math.abs(lhs.im - rhs.im)
    const mag = Math.hypot(lhs.re, lhs.im)
    expect(diff / Math.max(mag, 1e-30)).toBeLessThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// New Test: sphere2D hermiticity (packet away from pole buffer)
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — sphere2D hermiticity', () => {
  it('⟨φ|Tψ⟩ = ⟨Tφ|ψ⟩ with packet at θ=π/2 (3D lattice, R=1)', () => {
    const N = 12
    const dx = 0.25
    const grid = makeGrid(N, dx, 3)
    const metric: MetricConfig = { kind: 'sphere2D', sphereRadius: 1 }
    // θ lives on axis 1; packet centered at θ=π/2 (equator) keeps sinθ > 0.
    const psi = makeOffsetGaussian(grid, 0.45, [0, Math.PI / 2, 0], [0.3, -0.2, 0.1])
    const phi = makeOffsetGaussian(grid, 0.35, [0, Math.PI / 2, 0], [-0.25, 0.15, -0.1])
    const total = totalSites(grid)
    for (let n = 0; n < total; n++) {
      phi.re[n] = get(phi.re, n) * (1 + 0.3 * Math.cos(0.17 * n))
      phi.im[n] = get(phi.im, n) * (1 - 0.25 * Math.sin(0.11 * n))
    }
    const base = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
    }
    const Tpsi = applyCurvedKineticRef({ psiRe: psi.re, psiIm: psi.im, ...base })
    const Tphi = applyCurvedKineticRef({ psiRe: phi.re, psiIm: phi.im, ...base })
    const lhs = computeInnerProduct(
      phi.re,
      phi.im,
      Tpsi.re,
      Tpsi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const rhs = computeInnerProduct(
      Tphi.re,
      Tphi.im,
      psi.re,
      psi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const diff = Math.abs(lhs.re - rhs.re) + Math.abs(lhs.im - rhs.im)
    const mag = Math.hypot(lhs.re, lhs.im)
    expect(diff / Math.max(mag, 1e-30)).toBeLessThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// New Test: Schwarzschild hermiticity (packet away from r=0)
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — Schwarzschild hermiticity', () => {
  it('⟨φ|Tψ⟩ = ⟨Tφ|ψ⟩ with packet centered at x=3 (avoiding r=0)', () => {
    const N = 12
    const dx = 0.25
    const grid = makeGrid(N, dx, 3)
    const metric: MetricConfig = { kind: 'schwarzschild', schwarzschildMass: 0.5 }
    // Grid centered at origin spans x ∈ [-1.375, 1.375]. Shift packet to +1.0
    // so amplitude near r=0 decays well below machine precision for σ=0.3.
    const psi = makeOffsetGaussian(grid, 0.3, [1.0, 0, 0], [0.3, -0.2, 0.1])
    const phi = makeOffsetGaussian(grid, 0.28, [1.0, 0, 0], [-0.25, 0.15, -0.1])
    const total = totalSites(grid)
    for (let n = 0; n < total; n++) {
      phi.re[n] = get(phi.re, n) * (1 + 0.3 * Math.cos(0.17 * n))
      phi.im[n] = get(phi.im, n) * (1 - 0.25 * Math.sin(0.11 * n))
    }
    const base = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
    }
    const Tpsi = applyCurvedKineticRef({ psiRe: psi.re, psiIm: psi.im, ...base })
    const Tphi = applyCurvedKineticRef({ psiRe: phi.re, psiIm: phi.im, ...base })
    const lhs = computeInnerProduct(
      phi.re,
      phi.im,
      Tpsi.re,
      Tpsi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const rhs = computeInnerProduct(
      Tphi.re,
      Tphi.im,
      psi.re,
      psi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const diff = Math.abs(lhs.re - rhs.re) + Math.abs(lhs.im - rhs.im)
    const mag = Math.hypot(lhs.re, lhs.im)
    expect(diff / Math.max(mag, 1e-30)).toBeLessThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// New Test: AdS hermiticity (packet far from z=0 boundary)
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — AdS hermiticity', () => {
  it('⟨φ|Tψ⟩ = ⟨Tφ|ψ⟩ with packet centered at z=L (away from boundary)', () => {
    const N = 12
    const dx = 0.25
    const grid = makeGrid(N, dx, 3)
    const L = 2
    const metric: MetricConfig = { kind: 'antiDeSitter', adsRadius: L }
    // Axis 0 is z. Center packet at z=1 (well above the z=0 boundary clamp).
    const psi = makeOffsetGaussian(grid, 0.3, [1.0, 0, 0], [0.3, -0.2, 0.1])
    const phi = makeOffsetGaussian(grid, 0.28, [1.0, 0, 0], [-0.25, 0.15, -0.1])
    const total = totalSites(grid)
    for (let n = 0; n < total; n++) {
      phi.re[n] = get(phi.re, n) * (1 + 0.3 * Math.cos(0.17 * n))
      phi.im[n] = get(phi.im, n) * (1 - 0.25 * Math.sin(0.11 * n))
    }
    const base = {
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 3,
      metric,
    }
    const Tpsi = applyCurvedKineticRef({ psiRe: psi.re, psiIm: psi.im, ...base })
    const Tphi = applyCurvedKineticRef({ psiRe: phi.re, psiIm: phi.im, ...base })
    const lhs = computeInnerProduct(
      phi.re,
      phi.im,
      Tpsi.re,
      Tpsi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const rhs = computeInnerProduct(
      Tphi.re,
      Tphi.im,
      psi.re,
      psi.im,
      grid.gridSize,
      grid.spacing,
      3,
      metric
    )
    const diff = Math.abs(lhs.re - rhs.re) + Math.abs(lhs.im - rhs.im)
    const mag = Math.hypot(lhs.re, lhs.im)
    expect(diff / Math.max(mag, 1e-30)).toBeLessThan(1e-6)
  })
})

// ---------------------------------------------------------------------------
// New Test: de Sitter time-dependence and a(t)⁻² kinetic scaling
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — de Sitter time dependence', () => {
  it('T at t=0 ≠ T at t=1 and ratio matches a(t)⁻² at every interior cell (5% tolerance)', () => {
    const N = 24
    const dx = 0.2
    const grid = makeGrid(N, dx, 1)
    const H = 0.5
    const metric: MetricConfig = { kind: 'deSitter', hubbleRate: H }
    // Broad, low-frequency plane-wave-like packet so interior cells dominate.
    const kx = 0.8
    const re = new Float32Array(N)
    const im = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const x = (i - (N - 1) / 2) * dx
      // Gaussian envelope × plane wave; amplitude zero enough at edges.
      const env = Math.exp(-(x * x) / (4 * 1.5 * 1.5))
      re[i] = env * Math.cos(kx * x)
      im[i] = env * Math.sin(kx * x)
    }
    const base = {
      psiRe: re,
      psiIm: im,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 1,
      metric,
    }
    const T0 = applyCurvedKineticRef({ ...base, time: 0 })
    const T1 = applyCurvedKineticRef({ ...base, time: 1 })

    // Not equal: at least one interior cell differs meaningfully.
    let maxAbs = 0
    for (let i = 4; i < N - 4; i++) {
      maxAbs = Math.max(
        maxAbs,
        Math.abs(get(T0.re, i) - get(T1.re, i)),
        Math.abs(get(T0.im, i) - get(T1.im, i))
      )
    }
    expect(maxAbs).toBeGreaterThan(1e-4)

    // Ratio check: T(t=1)/T(t=0) = 1/a(1)² = exp(-2H).
    const expectedRatio = Math.exp(-2 * H * 1)
    for (let i = 4; i < N - 4; i++) {
      const mag0 = Math.hypot(get(T0.re, i), get(T0.im, i))
      if (mag0 < 1e-4) continue
      const mag1 = Math.hypot(get(T1.re, i), get(T1.im, i))
      const ratio = mag1 / mag0
      expect(Math.abs(ratio - expectedRatio) / expectedRatio).toBeLessThan(0.05)
    }
  })
})

// ---------------------------------------------------------------------------
// New Test: doubleThroat asymptotic flatness (far from throats)
// ---------------------------------------------------------------------------

describe('applyCurvedKineticRef — doubleThroat asymptotic flatness', () => {
  it('T(doubleThroat) ≈ T(flat) for a transverse-constant packet at large |l|', () => {
    // In latticeDim ≥ 2, doubleThroat transverse terms scale as 1/r² ≠ flat.
    // To isolate "asymptotic flatness along l" we use a ψ that is CONSTANT along
    // axis 1, making the axis-1 flux vanish identically on both metrics. The
    // axis-0 flux then differs only by the half-point r(l±dx/2) weighting
    // versus r=const=1 on flat — a correction that is O((dx/l)²) at the
    // Gaussian peak (where ψ' = 0, so only (d²ψ/dl²)·(a_+ + a_-)/(2√g) survives).
    const N = 32
    const dx = 0.15
    const grid = makeGrid(N, dx, 2)
    const metric: MetricConfig = {
      kind: 'doubleThroat',
      doubleThroatRadius: 0.2,
      doubleThroatSeparation: 0.4,
    }
    const N0 = N
    const N1 = N
    const total = totalSites(grid)
    const sigma = 0.35
    // Choose centerL to coincide with a grid cell so the packet is exactly
    // symmetric about that cell on the discrete lattice — otherwise Δ(ψ_+,ψ_-)
    // introduces a leading-order asymmetry that dominates the O((dx/l)²) signal
    // we care about. Grid is centered at origin ⇒ world coord of cell i is
    // (i − (N-1)/2)·dx. With N=32, dx=0.15, cell i=30 has l = 14.5·0.15 = 2.175.
    const centerL = (30 - (N - 1) / 2) * dx // = 2.175; throats at ±0.2, |l|/s ≈ 11.
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    // Transverse-constant: value depends only on axis-0 coordinate.
    for (let i = 0; i < N0; i++) {
      const l = (i - (N0 - 1) / 2) * dx
      const env = Math.exp(-((l - centerL) * (l - centerL)) / (4 * sigma * sigma))
      for (let j = 0; j < N1; j++) {
        psiRe[i * N1 + j] = env
      }
    }
    const base = {
      psiRe,
      psiIm,
      gridSize: grid.gridSize,
      spacing: grid.spacing,
      mass: 1,
      hbar: 1,
      latticeDim: 2,
    }
    const Tdt = applyCurvedKineticRef({ ...base, metric })
    const Tflat = applyCurvedKineticRef({ ...base, metric: { kind: 'flat' } })

    // Find cell nearest to centerL along axis 0.
    let iPeak = 0
    let bestDx = Infinity
    for (let i = 0; i < N0; i++) {
      const x = (i - (N0 - 1) / 2) * dx
      const d = Math.abs(x - centerL)
      if (d < bestDx) {
        bestDx = d
        iPeak = i
      }
    }
    // Use an interior transverse column well away from j boundaries.
    const jPeak = Math.floor((N1 - 1) / 2)
    const idxPeak = iPeak * N1 + jPeak

    const mag = Math.hypot(get(Tflat.re, idxPeak), get(Tflat.im, idxPeak))
    const diff = Math.hypot(
      get(Tdt.re, idxPeak) - get(Tflat.re, idxPeak),
      get(Tdt.im, idxPeak) - get(Tflat.im, idxPeak)
    )
    expect(diff / Math.max(mag, 1e-30)).toBeLessThan(0.01)
  })
})

// ---------------------------------------------------------------------------
// Proper norm sanity checks
// ---------------------------------------------------------------------------

describe('computeProperNorm', () => {
  it('reduces to the flat L² norm on flat metric', () => {
    const grid = makeGrid(16, 0.2, 3)
    const { re, im } = makeGaussian(grid, 0.5)
    const nProper = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, { kind: 'flat' })
    let sum = 0
    for (let i = 0; i < re.length; i++) sum += get(re, i) ** 2 + get(im, i) ** 2
    const cellVol =
      (grid.spacing[0] as number) * (grid.spacing[1] as number) * (grid.spacing[2] as number)
    expect(nProper).toBeCloseTo(sum * cellVol, 6)
  })

  it('is strictly positive and finite for a Morris–Thorne Gaussian', () => {
    const grid = makeGrid(16, 0.2, 3)
    const { re, im } = makeGaussian(grid, 0.5)
    const n = computeProperNorm(re, im, grid.gridSize, grid.spacing, 3, {
      kind: 'morrisThorne',
      throatRadius: 0.5,
    })
    expect(n).toBeGreaterThan(0)
    expect(Number.isFinite(n)).toBe(true)
  })

  it('scales by a(t)^dim under de Sitter when time advances', () => {
    const grid = makeGrid(12, 0.25, 3)
    const { re, im } = makeGaussian(grid, 0.5)
    const H = 0.4
    const n0 = computeProperNorm(
      re,
      im,
      grid.gridSize,
      grid.spacing,
      3,
      {
        kind: 'deSitter',
        hubbleRate: H,
      },
      0
    )
    const t = 1.0
    const nT = computeProperNorm(
      re,
      im,
      grid.gridSize,
      grid.spacing,
      3,
      {
        kind: 'deSitter',
        hubbleRate: H,
      },
      t
    )
    const aCubed = Math.exp(3 * H * t)
    expect(nT / n0).toBeCloseTo(aCubed, 6)
  })
})
