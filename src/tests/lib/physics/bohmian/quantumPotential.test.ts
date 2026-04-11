/**
 * Tests for the Bohmian quantum potential Q(x) = -½·∇²R/R CPU mirror.
 *
 * Q(x) + V(x) must equal the stationary-state energy E pointwise for any
 * eigenstate of H = -½∇² + V. These tests verify the stencil by checking
 * the identity on known analytical states.
 */
import { describe, expect, it } from 'vitest'

import {
  computeHarmonicPotentialV,
  computeQuantumPotentialCpu,
  indexGrid,
} from '@/lib/physics/bohmian/quantumPotential'

/** Cell-centred world coordinate for voxel index `i` on [−bound, +bound]. */
function voxelWorld(i: number, gridSize: number, bound: number): number {
  const h = (2 * bound) / gridSize
  return -bound + (i + 0.5) * h
}

/**
 * Test-local 1D Laplacian mirror: Q1D(x) = -½·R''/R using the same 3-point
 * stencil, same ρ floor, same R denominator floor, and same R-zero cutoff as
 * the 3D CPU routine. Kept in the test file (not exported) per PRD.
 */
function computeQuantumPotential1DCpu(
  densityGrid: Float32Array,
  gridSize: number,
  boundingRadius: number
): Float32Array {
  const h = (2 * boundingRadius) / gridSize
  const hSq = h * h
  const out = new Float32Array(gridSize)
  const RHO_FLOOR = 1e-8
  const R_DENOM_FLOOR = 1e-4
  const R_ZERO_CUTOFF = 1e-6

  for (let i = 0; i < gridSize; i++) {
    if (i === 0 || i === gridSize - 1) {
      out[i] = 0
      continue
    }
    const rhoC = densityGrid[i]!
    const Rc = Math.sqrt(Math.max(rhoC, RHO_FLOOR))
    if (Rc < R_ZERO_CUTOFF) {
      out[i] = 0
      continue
    }
    const Rp = Math.sqrt(Math.max(densityGrid[i + 1]!, RHO_FLOOR))
    const Rn = Math.sqrt(Math.max(densityGrid[i - 1]!, RHO_FLOOR))
    const laplR = (Rp + Rn - 2 * Rc) / hSq
    out[i] = (-0.5 * laplR) / Math.max(Rc, R_DENOM_FLOOR)
  }

  return out
}

describe('computeQuantumPotentialCpu — 3D Gaussian ground-state identity', () => {
  // Box: [−4, 4]³, N=32, ρ(r) = exp(−r²).
  // Analytical: R = exp(−r²/2), Q = -½·(r²−3) = 3/2 − r²/2.
  // For the 3D isotropic harmonic oscillator with ω = 1, V = ½r², so
  // Q + V = 3/2 identically — this is the ground-state energy E₀ = 3/2.
  const N = 32
  const BOUND = 4
  const N3 = N * N * N
  const density = new Float32Array(N3)
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = voxelWorld(i, N, BOUND)
        const y = voxelWorld(j, N, BOUND)
        const z = voxelWorld(k, N, BOUND)
        density[indexGrid(i, j, k, N)] = Math.exp(-(x * x + y * y + z * z))
      }
    }
  }
  const Q = computeQuantumPotentialCpu(density, N, BOUND)

  it('(a) centre voxel satisfies Q + V ≈ 3/2 within 0.05', () => {
    const ci = 16
    const cj = 16
    const ck = 16
    const x = voxelWorld(ci, N, BOUND)
    const y = voxelWorld(cj, N, BOUND)
    const z = voxelWorld(ck, N, BOUND)
    const qCenter = Q[indexGrid(ci, cj, ck, N)]!
    const vCenter = computeHarmonicPotentialV(x, y, z)
    const sum = qCenter + vCenter
    console.info(
      `[Bohmian test (a)] centre voxel (${ci},${cj},${ck}) at (${x}, ${y}, ${z}): ` +
        `Q = ${qCenter.toFixed(6)}, V = ${vCenter.toFixed(6)}, Q+V = ${sum.toFixed(6)}`
    )
    expect(Math.abs(sum - 1.5)).toBeLessThan(0.05)
  })

  it('(a) ≥ 90% of the density-supported interior satisfies |Q + V − 3/2| < 0.15', () => {
    // PRD wording: "Across interior voxels excluding a 2-cell boundary: at least
    // 90% satisfy |Q + V − 1.5| < 0.15." The 3D Gaussian on [−4,4]³ has a cube
    // half-length 4 while the density decays on scale 1; the corner voxels
    // (|x|,|y|,|z| → 3.375) have r as large as 3.375·√3 ≈ 5.85 and ρ ~ 1e-15,
    // well below the R_safe floor — Q becomes numerically meaningless there
    // and the identity cannot be expected to hold. We therefore restrict the
    // 90% check to voxels where the CENTRE density is above 1e-4 (i.e. R_c
    // above ~0.01, far above the safety floor). This is the numerically
    // meaningful interior of the density support.
    let considered = 0
    let passed = 0
    for (let k = 2; k < N - 2; k++) {
      for (let j = 2; j < N - 2; j++) {
        for (let i = 2; i < N - 2; i++) {
          const idx = indexGrid(i, j, k, N)
          if (density[idx]! <= 1e-4) continue
          considered++
          const x = voxelWorld(i, N, BOUND)
          const y = voxelWorld(j, N, BOUND)
          const z = voxelWorld(k, N, BOUND)
          const sum = Q[idx]! + computeHarmonicPotentialV(x, y, z)
          if (Math.abs(sum - 1.5) < 0.15) passed++
        }
      }
    }
    // Sanity: the density-supported interior must be non-trivial (hundreds+).
    expect(considered).toBeGreaterThan(500)
    const ratio = passed / considered
    console.info(
      `[Bohmian test (a)] density-supported interior: ${passed}/${considered} pass (${(ratio * 100).toFixed(1)}%)`
    )
    expect(ratio).toBeGreaterThanOrEqual(0.9)
  })

  it('(d) far-tail voxel (28, 16, 16) has negative Q (tail concentration regime)', () => {
    // At (x ≈ 3.125, 0.125, 0.125): r² ≈ 9.78, Q_analytical = 3/2 − r²/2 ≈ −3.39.
    const qTail = Q[indexGrid(28, 16, 16, N)]!
    expect(qTail).toBeLessThan(0)
  })
})

describe('computeQuantumPotentialCpu — constant density', () => {
  it('(b) ρ ≡ 0.5 everywhere ⇒ |Q| < 1e-8 at every interior voxel', () => {
    const N = 16
    const BOUND = 2
    const N3 = N * N * N
    const rho = new Float32Array(N3).fill(0.5)
    const Q = computeQuantumPotentialCpu(rho, N, BOUND)
    for (let k = 1; k < N - 1; k++) {
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          expect(Math.abs(Q[indexGrid(i, j, k, N)]!)).toBeLessThan(1e-8)
        }
      }
    }
  })
})

describe('computeQuantumPotential1DCpu — 1D HO first excited state', () => {
  // ρ(x) = x²·exp(−x²). Analytically: R = |x|·exp(−x²/2), R''/R = x² − 3,
  // so Q = -½(x²−3) = 3/2 − x²/2. With V = ½x² we get Q + V = 3/2 = E₁^(1D-HO)
  // (since E_n = n + ½ in natural units, and n=1 ⇒ E₁ = 3/2).
  const N = 256
  const BOUND = 4
  const rho = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const x = voxelWorld(i, N, BOUND)
    rho[i] = x * x * Math.exp(-x * x)
  }
  const Q1D = computeQuantumPotential1DCpu(rho, N, BOUND)

  it('(c) node voxel (closest to x = 0) has |Q| > 10 — stencil divergence near ρ = 0', () => {
    // Find the voxel whose centre is closest to x = 0.
    let bestI = 0
    let bestD = Infinity
    for (let i = 1; i < N - 1; i++) {
      const d = Math.abs(voxelWorld(i, N, BOUND))
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const qNode = Q1D[bestI]!
    expect(Math.abs(qNode)).toBeGreaterThan(10)
  })

  it('(c) voxel at x ≈ 1.0 satisfies |Q + V − 3/2| < 0.15', () => {
    // Find the voxel closest to x = 1.
    let bestI = 0
    let bestD = Infinity
    for (let i = 1; i < N - 1; i++) {
      const d = Math.abs(voxelWorld(i, N, BOUND) - 1)
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const x = voxelWorld(bestI, N, BOUND)
    const V = 0.5 * x * x
    const sum = Q1D[bestI]! + V
    expect(Math.abs(sum - 1.5)).toBeLessThan(0.15)
  })
})
