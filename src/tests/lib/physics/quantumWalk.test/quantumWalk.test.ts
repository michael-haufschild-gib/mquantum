/**
 * Tests for quantum walk physics correctness.
 *
 * Verifies the mathematical properties of the coin operators and shift,
 * using CPU-side reference implementations of the WGSL shader logic.
 *
 * Properties tested:
 * - Grover coin is unitary (preserves norm)
 * - Hadamard coin is unitary (preserves norm)
 * - DFT coin is unitary (preserves norm)
 * - Shift operator preserves total probability
 * - Full coin+shift step preserves total probability
 * - Localized walker produces spreading after steps
 */

import { describe, expect, it } from 'vitest'

import { computeStrides, linearToNDCoords, ndToLinearIdx } from '@/lib/math/ndArray'

// ── CPU reference implementations matching the WGSL shaders ──

/** Apply Grover coin to all sites (CPU reference). */
function applyGroverCoin(
  coinIn: Float32Array,
  coinOut: Float32Array,
  totalSites: number,
  latticeDim: number
): void {
  const numCoinStates = 2 * latticeDim
  for (let site = 0; site < totalSites; site++) {
    const baseIdx = site * numCoinStates * 2
    let sumRe = 0
    let sumIm = 0
    for (let k = 0; k < numCoinStates; k++) {
      sumRe += coinIn[baseIdx + k * 2]!
      sumIm += coinIn[baseIdx + k * 2 + 1]!
    }
    const invN = 2 / numCoinStates
    for (let j = 0; j < numCoinStates; j++) {
      const reIn = coinIn[baseIdx + j * 2]!
      const imIn = coinIn[baseIdx + j * 2 + 1]!
      coinOut[baseIdx + j * 2] = invN * sumRe - reIn
      coinOut[baseIdx + j * 2 + 1] = invN * sumIm - imIn
    }
  }
}

/** Apply Hadamard coin per axis pair (CPU reference). */
function applyHadamardCoin(
  coinIn: Float32Array,
  coinOut: Float32Array,
  totalSites: number,
  latticeDim: number
): void {
  const numCoinStates = 2 * latticeDim
  const invSqrt2 = 1 / Math.sqrt(2)
  for (let site = 0; site < totalSites; site++) {
    const baseIdx = site * numCoinStates * 2
    for (let d = 0; d < latticeDim; d++) {
      const i0 = baseIdx + d * 2 * 2
      const i1 = baseIdx + (d * 2 + 1) * 2
      const aRe = coinIn[i0]!
      const aIm = coinIn[i0 + 1]!
      const bRe = coinIn[i1]!
      const bIm = coinIn[i1 + 1]!
      coinOut[i0] = invSqrt2 * (aRe + bRe)
      coinOut[i0 + 1] = invSqrt2 * (aIm + bIm)
      coinOut[i1] = invSqrt2 * (aRe - bRe)
      coinOut[i1 + 1] = invSqrt2 * (aIm - bIm)
    }
  }
}

/** Apply DFT coin (CPU reference). */
function applyDFTCoin(
  coinIn: Float32Array,
  coinOut: Float32Array,
  totalSites: number,
  latticeDim: number
): void {
  const N = 2 * latticeDim
  const invSqrtN = 1 / Math.sqrt(N)
  const twoPiOverN = (2 * Math.PI) / N
  for (let site = 0; site < totalSites; site++) {
    const baseIdx = site * N * 2
    for (let j = 0; j < N; j++) {
      let outRe = 0
      let outIm = 0
      for (let k = 0; k < N; k++) {
        const phase = twoPiOverN * j * k
        const cosP = Math.cos(phase)
        const sinP = Math.sin(phase)
        const inRe = coinIn[baseIdx + k * 2]!
        const inIm = coinIn[baseIdx + k * 2 + 1]!
        outRe += cosP * inRe - sinP * inIm
        outIm += cosP * inIm + sinP * inRe
      }
      coinOut[baseIdx + j * 2] = outRe * invSqrtN
      coinOut[baseIdx + j * 2 + 1] = outIm * invSqrtN
    }
  }
}

/** Apply conditional shift operator (CPU reference). */
function applyShift(
  coinIn: Float32Array,
  coinOut: Float32Array,
  totalSites: number,
  latticeDim: number,
  gridSize: number[]
): void {
  const numCoinStates = 2 * latticeDim

  const strides = computeStrides(gridSize)

  function ndToLinear(coords: number[]): number {
    return ndToLinearIdx(coords, strides)
  }

  for (let destSite = 0; destSite < totalSites; destSite++) {
    const destBase = destSite * numCoinStates * 2
    const destCoords = linearToNDCoords(destSite, gridSize)

    for (let cs = 0; cs < numCoinStates; cs++) {
      const dim = Math.floor(cs / 2)
      const isPositive = cs % 2 === 0

      const srcCoords = [...destCoords]
      if (isPositive) {
        srcCoords[dim] = (destCoords[dim]! - 1 + gridSize[dim]!) % gridSize[dim]!
      } else {
        srcCoords[dim] = (destCoords[dim]! + 1) % gridSize[dim]!
      }

      const srcSite = ndToLinear(srcCoords)
      const srcBase = srcSite * numCoinStates * 2 + cs * 2

      coinOut[destBase + cs * 2] = coinIn[srcBase]!
      coinOut[destBase + cs * 2 + 1] = coinIn[srcBase + 1]!
    }
  }
}

/** Compute total probability: sum of |c_j(site)|² over all sites and coin states. */
function totalProbability(state: Float32Array, totalSites: number, latticeDim: number): number {
  const numCoinStates = 2 * latticeDim
  let prob = 0
  for (let site = 0; site < totalSites; site++) {
    const baseIdx = site * numCoinStates * 2
    for (let j = 0; j < numCoinStates; j++) {
      const re = state[baseIdx + j * 2]!
      const im = state[baseIdx + j * 2 + 1]!
      prob += re * re + im * im
    }
  }
  return prob
}

/** Create initial state: uniform superposition of coin states at the center site. */
function createInitialState(
  totalSites: number,
  latticeDim: number,
  gridSize: number[]
): Float32Array {
  const numCoinStates = 2 * latticeDim
  const state = new Float32Array(totalSites * numCoinStates * 2)

  // Center site
  let centerSite = 0
  let stride = 1
  for (let d = latticeDim - 1; d >= 0; d--) {
    centerSite += Math.floor(gridSize[d]! / 2) * stride
    stride *= gridSize[d]!
  }

  const amp = 1 / Math.sqrt(numCoinStates)
  for (let j = 0; j < numCoinStates; j++) {
    state[(centerSite * numCoinStates + j) * 2] = amp
  }
  return state
}

describe('Quantum walk coin operators: unitarity', () => {
  const latticeDim = 2
  const gridSize = [8, 8]
  const totalSites = 64

  it('Grover coin preserves total probability', () => {
    const coinIn = createInitialState(totalSites, latticeDim, gridSize)
    const coinOut = new Float32Array(coinIn.length)
    const probBefore = totalProbability(coinIn, totalSites, latticeDim)

    applyGroverCoin(coinIn, coinOut, totalSites, latticeDim)
    const probAfter = totalProbability(coinOut, totalSites, latticeDim)

    expect(probBefore).toBeCloseTo(1.0, 10)
    expect(probAfter).toBeCloseTo(1.0, 10)
  })

  it('Hadamard coin preserves total probability', () => {
    const coinIn = createInitialState(totalSites, latticeDim, gridSize)
    const coinOut = new Float32Array(coinIn.length)
    const probBefore = totalProbability(coinIn, totalSites, latticeDim)

    applyHadamardCoin(coinIn, coinOut, totalSites, latticeDim)
    const probAfter = totalProbability(coinOut, totalSites, latticeDim)

    expect(probBefore).toBeCloseTo(1.0, 6)
    expect(probAfter).toBeCloseTo(1.0, 6)
  })

  it('DFT coin preserves total probability', () => {
    const coinIn = createInitialState(totalSites, latticeDim, gridSize)
    const coinOut = new Float32Array(coinIn.length)
    const probBefore = totalProbability(coinIn, totalSites, latticeDim)

    applyDFTCoin(coinIn, coinOut, totalSites, latticeDim)
    const probAfter = totalProbability(coinOut, totalSites, latticeDim)

    expect(probBefore).toBeCloseTo(1.0, 10)
    expect(probAfter).toBeCloseTo(1.0, 10)
  })
})

describe('Quantum walk shift operator', () => {
  const latticeDim = 2
  const gridSize = [8, 8]
  const totalSites = 64

  it('preserves total probability', () => {
    const coinIn = createInitialState(totalSites, latticeDim, gridSize)
    const coinOut = new Float32Array(coinIn.length)

    applyShift(coinIn, coinOut, totalSites, latticeDim, gridSize)
    const probAfter = totalProbability(coinOut, totalSites, latticeDim)

    expect(probAfter).toBeCloseTo(1.0, 10)
  })

  it('moves amplitude to neighboring sites', () => {
    const coinIn = createInitialState(totalSites, latticeDim, gridSize)
    const coinOut = new Float32Array(coinIn.length)

    // Probability before: all at center
    const numCoinStates = 2 * latticeDim
    let centerSite = 4 * 8 + 4 // row 4, col 4 for 8x8 grid
    let centerProb = 0
    for (let j = 0; j < numCoinStates; j++) {
      const re = coinIn[(centerSite * numCoinStates + j) * 2]!
      centerProb += re * re
    }
    expect(centerProb).toBeCloseTo(1.0, 10)

    // After shift, center site should have 0 probability
    applyShift(coinIn, coinOut, totalSites, latticeDim, gridSize)
    centerProb = 0
    for (let j = 0; j < numCoinStates; j++) {
      const re = coinOut[(centerSite * numCoinStates + j) * 2]!
      const im = coinOut[(centerSite * numCoinStates + j) * 2 + 1]!
      centerProb += re * re + im * im
    }
    expect(centerProb).toBeCloseTo(0.0, 10)
  })
})

/**
 * Run N full coin+shift steps. Coin writes A→B, shift writes B→A,
 * so the final state is always in bufA (ping-pong invariant, matching the GPU pass).
 */
function runSteps(
  coinFn: (inBuf: Float32Array, outBuf: Float32Array, sites: number, dim: number) => void,
  bufA: Float32Array,
  bufB: Float32Array,
  totalSites: number,
  latticeDim: number,
  gridSize: number[],
  numSteps: number
): void {
  for (let step = 0; step < numSteps; step++) {
    coinFn(bufA, bufB, totalSites, latticeDim)
    applyShift(bufB, bufA, totalSites, latticeDim, gridSize)
  }
}

describe('Full quantum walk step (coin + shift)', () => {
  it('preserves probability over multiple steps', () => {
    const latticeDim = 2
    const gridSize = [16, 16]
    const totalSites = 256

    const bufA = createInitialState(totalSites, latticeDim, gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyGroverCoin, bufA, bufB, totalSites, latticeDim, gridSize, 10)

    const prob = totalProbability(bufA, totalSites, latticeDim)
    expect(prob).toBeCloseTo(1.0, 8)
  })

  it('spreads probability beyond the initial site after steps', () => {
    const latticeDim = 2
    const gridSize = [16, 16]
    const totalSites = 256
    const numCoinStates = 2 * latticeDim

    const bufA = createInitialState(totalSites, latticeDim, gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyGroverCoin, bufA, bufB, totalSites, latticeDim, gridSize, 5)

    // Count sites with non-negligible probability
    let occupiedSites = 0
    for (let site = 0; site < totalSites; site++) {
      let siteProb = 0
      const baseIdx = site * numCoinStates * 2
      for (let j = 0; j < numCoinStates; j++) {
        const re = bufA[baseIdx + j * 2]!
        const im = bufA[baseIdx + j * 2 + 1]!
        siteProb += re * re + im * im
      }
      if (siteProb > 1e-12) occupiedSites++
    }

    // After 5 steps in 2D, the walk should have reached multiple sites
    expect(occupiedSites).toBeGreaterThan(1)
  })
})

describe('Quantum walk in 1D', () => {
  it('preserves probability with Hadamard coin on 1D lattice', () => {
    const latticeDim = 1
    const gridSize = [32]
    const totalSites = 32

    const bufA = createInitialState(totalSites, latticeDim, gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyHadamardCoin, bufA, bufB, totalSites, latticeDim, gridSize, 20)

    const prob = totalProbability(bufA, totalSites, latticeDim)
    expect(prob).toBeCloseTo(1.0, 6)
  })

  it('1D Hadamard walk spreads ballistically', () => {
    const latticeDim = 1
    const gridSize = [64]
    const totalSites = 64
    const numCoinStates = 2

    const bufA = createInitialState(totalSites, latticeDim, gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyHadamardCoin, bufA, bufB, totalSites, latticeDim, gridSize, 20)

    // Quantum walk spreads ballistically: support width ~ steps (not sqrt(steps))
    let leftmost = totalSites
    let rightmost = 0
    for (let site = 0; site < totalSites; site++) {
      let siteProb = 0
      const baseIdx = site * numCoinStates * 2
      for (let j = 0; j < numCoinStates; j++) {
        const re = bufA[baseIdx + j * 2]!
        const im = bufA[baseIdx + j * 2 + 1]!
        siteProb += re * re + im * im
      }
      if (siteProb > 1e-10) {
        leftmost = Math.min(leftmost, site)
        rightmost = Math.max(rightmost, site)
      }
    }
    const spread = rightmost - leftmost
    // Ballistic: spread should be proportional to steps, not sqrt(steps)
    // After 20 steps, spread should be at least 15 (ballistic ~= steps)
    expect(spread).toBeGreaterThanOrEqual(15)
  })
})

describe('Quantum walk in 3D', () => {
  it('preserves probability with DFT coin on 3D lattice', () => {
    const latticeDim = 3
    const gridSize = [4, 4, 4]
    const totalSites = 64

    const bufA = createInitialState(totalSites, latticeDim, gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyDFTCoin, bufA, bufB, totalSites, latticeDim, gridSize, 5)

    const prob = totalProbability(bufA, totalSites, latticeDim)
    expect(prob).toBeCloseTo(1.0, 6)
  })
})

// ============================================================================
// Konno Limit Distribution Benchmark
//
// For a 1D discrete-time quantum walk with Hadamard coin and symmetric initial
// state |ψ₀⟩ = (1/√2)(|L⟩ − i|R⟩) ⊗ |center⟩, the scaled position X_t/t
// converges weakly to the Konno distribution as t → ∞.
//
// Konno density (Konno 2005, J. Math. Soc. Japan 57(4), 1179-1195):
//   f_K(x) = 1 / (π(1-x²)√(1-2x²))   for x ∈ (-1/√2, 1/√2)
//
// This is a special case of the general Konno density f_K(v;r) with r = 1/√2
// for the Hadamard coin (confirmed by arXiv:2408.09578, Eq. for v_max = a).
//
// The second moment E[V²] = ∫ v² f_K(v) dv = 1 − 1/√2 ≈ 0.2929
// (computed via substitution v = sin(θ)/√2, reducing to ∫sin²θ/(1+cos²θ)dθ).
//
// Therefore Var(X_t) ~ (1 − 1/√2)·t² as t → ∞.
//
// References:
//   - Konno, N. "A new type of limit theorems for the one-dimensional quantum
//     random walk." J. Math. Soc. Japan 57(4), 1179-1195 (2005).
//     https://projecteuclid.org/euclid.jmsj/1150287309
//   - arXiv:2408.09578 — confirms general Konno density parameterization.
// ============================================================================

/**
 * Create symmetric initial state for 1D Hadamard walk (Konno's convention).
 *
 * |ψ₀⟩ = (1/√2)(|L⟩ − i|R⟩) ⊗ |center⟩
 *
 * This gives a symmetric probability distribution, so E[X_t] = 0 and the
 * unweighted Konno density applies.
 */
function createSymmetricInitialState1D(gridSize: number): Float32Array {
  const numCoinStates = 2
  const state = new Float32Array(gridSize * numCoinStates * 2)
  const center = Math.floor(gridSize / 2)
  const amp = 1 / Math.sqrt(2)

  // Coin state |L⟩ = index 0: amplitude 1/√2 (real)
  state[(center * numCoinStates + 0) * 2] = amp // Re
  state[(center * numCoinStates + 0) * 2 + 1] = 0 // Im

  // Coin state |R⟩ = index 1: amplitude -i/√2
  state[(center * numCoinStates + 1) * 2] = 0 // Re
  state[(center * numCoinStates + 1) * 2 + 1] = -amp // Im

  return state
}

/**
 * Compute E[X²] for a quantum walk state (1D only).
 *
 * Position of site i is (i − center).
 */
function computePositionSecondMoment1D(state: Float32Array, gridSize: number): number {
  const numCoinStates = 2
  const center = Math.floor(gridSize / 2)
  let moment2 = 0

  for (let site = 0; site < gridSize; site++) {
    const pos = site - center
    let siteProb = 0
    const baseIdx = site * numCoinStates * 2
    for (let j = 0; j < numCoinStates; j++) {
      const re = state[baseIdx + j * 2]!
      const im = state[baseIdx + j * 2 + 1]!
      siteProb += re * re + im * im
    }
    moment2 += pos * pos * siteProb
  }
  return moment2
}

/**
 * Numerically integrate the second moment of the Konno density via substitution.
 *
 * f_K(v; r) = √(1-r²) / (π(1-v²)√(r²-v²))  on (-r, r)
 *
 * Substitution v = r·sin(θ) removes the square-root singularity:
 *   E[V²] = (r²√(1-r²)/π) ∫₀^π sin²(θ) / (1 - r²sin²(θ)) dθ
 *
 * Computed with composite Simpson's rule (nPts must be even).
 */
function konnoSecondMomentNumerical(r: number, nPts: number = 10000): number {
  const r2 = r * r
  const prefactor = (r2 * Math.sqrt(1 - r2)) / Math.PI
  const h = Math.PI / nPts

  function integrand(theta: number): number {
    const s = Math.sin(theta)
    return (s * s) / (1 - r2 * s * s)
  }

  // Simpson's 1/3 rule
  let sum = integrand(0) + integrand(Math.PI)
  for (let i = 1; i < nPts; i++) {
    const weight = i % 2 === 0 ? 2 : 4
    sum += weight * integrand(i * h)
  }
  return prefactor * (h / 3) * sum
}

describe('1D Hadamard walk: Konno limit distribution (Konno 2005)', () => {
  it('numerical integration of Konno density second moment equals 1 − 1/√2', () => {
    // Cross-validate: the analytical result E[V²] = 1 - 1/√2 must match
    // the numerical integral of the Konno density.
    const r = 1 / Math.sqrt(2)
    const numerical = konnoSecondMomentNumerical(r, 100000)
    const analytical = 1 - 1 / Math.sqrt(2) // ≈ 0.29289...

    expect(Math.abs(numerical - analytical) / analytical).toBeLessThan(1e-8)
  })

  it('E[X²/t²] converges to Konno second moment (1 − 1/√2) for large t', () => {
    const gridSize = 2048
    const latticeDim = 1
    const numSteps = 1000

    const bufA = createSymmetricInitialState1D(gridSize)
    const bufB = new Float32Array(bufA.length)

    // Run 1000 Hadamard walk steps
    runSteps(applyHadamardCoin, bufA, bufB, gridSize, latticeDim, [gridSize], numSteps)

    const secondMoment = computePositionSecondMoment1D(bufA, gridSize)
    const scaledSecondMoment = secondMoment / (numSteps * numSteps)

    // Konno: E[V²] = 1 - 1/√2 ≈ 0.2929
    const konnoExpected = 1 - 1 / Math.sqrt(2)

    // At t=1000, finite-time corrections are small.
    // Tolerance 5% accounts for O(1/t) corrections to the weak limit.
    const relError = Math.abs(scaledSecondMoment - konnoExpected) / konnoExpected
    expect(relError).toBeLessThan(0.05)
  }, 30_000)

  it('E[X²/t²] convergence improves with more steps', () => {
    const gridSize = 2048
    const latticeDim = 1
    const konnoExpected = 1 - 1 / Math.sqrt(2)

    const errors: number[] = []

    for (const numSteps of [200, 500, 1000]) {
      const bufA = createSymmetricInitialState1D(gridSize)
      const bufB = new Float32Array(bufA.length)

      runSteps(applyHadamardCoin, bufA, bufB, gridSize, latticeDim, [gridSize], numSteps)

      const scaledMoment = computePositionSecondMoment1D(bufA, gridSize) / (numSteps * numSteps)
      errors.push(Math.abs(scaledMoment - konnoExpected) / konnoExpected)
    }

    // Error should decrease monotonically as t increases
    expect(errors[0]).toBeGreaterThan(errors[1]!)
    expect(errors[1]).toBeGreaterThan(errors[2]!)

    // At t=1000 the error should be well below 5%
    expect(errors[2]).toBeLessThan(0.05)
  }, 30_000)

  it('symmetric initial state produces zero first moment (no drift)', () => {
    const gridSize = 2048
    const latticeDim = 1
    const numSteps = 500

    const bufA = createSymmetricInitialState1D(gridSize)
    const bufB = new Float32Array(bufA.length)

    runSteps(applyHadamardCoin, bufA, bufB, gridSize, latticeDim, [gridSize], numSteps)

    const center = Math.floor(gridSize / 2)
    const numCoinStates = 2
    let firstMoment = 0
    for (let site = 0; site < gridSize; site++) {
      const pos = site - center
      let siteProb = 0
      const baseIdx = site * numCoinStates * 2
      for (let j = 0; j < numCoinStates; j++) {
        const re = bufA[baseIdx + j * 2]!
        const im = bufA[baseIdx + j * 2 + 1]!
        siteProb += re * re + im * im
      }
      firstMoment += pos * siteProb
    }

    // Symmetric state ⟹ E[X] = 0 (within numerical precision of f32)
    expect(Math.abs(firstMoment / numSteps)).toBeLessThan(0.01)
  })
})
