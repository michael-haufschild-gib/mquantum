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

  // Compute strides (row-major)
  const strides = new Array<number>(latticeDim)
  strides[latticeDim - 1] = 1
  for (let d = latticeDim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }

  // Decompose linear index to N-D coords
  function linearToND(idx: number): number[] {
    const coords = new Array<number>(latticeDim)
    let remaining = idx
    for (let d = latticeDim - 1; d >= 0; d--) {
      coords[d] = remaining % gridSize[d]!
      remaining = Math.floor(remaining / gridSize[d]!)
    }
    return coords
  }

  function ndToLinear(coords: number[]): number {
    let idx = 0
    for (let d = 0; d < latticeDim; d++) {
      idx += coords[d]! * strides[d]!
    }
    return idx
  }

  for (let destSite = 0; destSite < totalSites; destSite++) {
    const destBase = destSite * numCoinStates * 2
    const destCoords = linearToND(destSite)

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
