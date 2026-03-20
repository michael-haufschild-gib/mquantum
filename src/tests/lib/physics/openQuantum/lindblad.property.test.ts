/**
 * Property-based tests for the Lindblad dissipator.
 *
 * Uses fast-check to verify trace conservation and Hermiticity of the
 * dissipator D[L](ρ) across arbitrary density matrices, Hilbert space
 * dimensions, and decay channel configurations.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { applyDissipator, computeDissipator } from '@/lib/physics/openQuantum/lindblad'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zeroDM(K: number): DensityMatrix {
  return { K, elements: new Float64Array(K * K * 2) }
}

/** Trace of a density matrix (sum of real diagonal elements) */
function trace(dm: DensityMatrix): number {
  let tr = 0
  for (let k = 0; k < dm.K; k++) {
    tr += dm.elements[2 * (k * dm.K + k)]!
  }
  return tr
}

/** Check Hermiticity: ρ_{ij} = ρ_{ji}* */
function hermiticity(dm: DensityMatrix): number {
  let maxError = 0
  for (let i = 0; i < dm.K; i++) {
    for (let j = i + 1; j < dm.K; j++) {
      const reIJ = dm.elements[2 * (i * dm.K + j)]!
      const imIJ = dm.elements[2 * (i * dm.K + j) + 1]!
      const reJI = dm.elements[2 * (j * dm.K + i)]!
      const imJI = dm.elements[2 * (j * dm.K + i) + 1]!
      maxError = Math.max(maxError, Math.abs(reIJ - reJI), Math.abs(imIJ + imJI))
    }
  }
  return maxError
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Hilbert space dimension 2-6 */
const arbK = fc.integer({ min: 2, max: 6 })

/** Arbitrary Hermitian positive-semidefinite density matrix (pure state |ψ⟩⟨ψ|) */
function arbDensityMatrix(K: number): fc.Arbitrary<DensityMatrix> {
  return fc
    .array(fc.double({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }), {
      minLength: K * 2,
      maxLength: K * 2,
    })
    .map((coeffs) => {
      let norm2 = 0
      for (let i = 0; i < K; i++) {
        norm2 += coeffs[2 * i]! ** 2 + coeffs[2 * i + 1]! ** 2
      }
      const norm = Math.sqrt(norm2)
      if (norm < 1e-10) {
        const dm = zeroDM(K)
        dm.elements[0] = 1
        return dm
      }
      const dm = zeroDM(K)
      for (let i = 0; i < K; i++) {
        const reI = coeffs[2 * i]! / norm
        const imI = coeffs[2 * i + 1]! / norm
        for (let j = 0; j < K; j++) {
          const reJ = coeffs[2 * j]! / norm
          const imJ = coeffs[2 * j + 1]! / norm
          const idx = 2 * (i * K + j)
          dm.elements[idx] = reI * reJ + imI * imJ
          dm.elements[idx + 1] = imI * reJ - reI * imJ
        }
      }
      return dm
    })
}

/** Arbitrary decay channel for a given K */
function arbChannel(K: number): fc.Arbitrary<LindbladChannel> {
  return fc
    .tuple(
      fc.integer({ min: 0, max: K - 1 }),
      fc.integer({ min: 0, max: K - 1 }),
      fc.double({ min: 0.01, max: 5, noNaN: true, noDefaultInfinity: true })
    )
    .filter(([row, col]) => row !== col)
    .map(([row, col, gamma]) => ({
      row,
      col,
      amplitudeRe: Math.sqrt(gamma),
      amplitudeIm: 0,
    }))
}

/** Arbitrary list of 1-4 decay channels */
function arbChannels(K: number): fc.Arbitrary<LindbladChannel[]> {
  return fc.array(arbChannel(K), { minLength: 1, maxLength: 4 })
}

// Composed arbitraries using .chain()

/** Single ρ + single channel with matched K */
const arbSingleDissipator = arbK.chain((K) =>
  fc.tuple(arbDensityMatrix(K), arbChannel(K)).map(([rho, ch]) => ({ K, rho, ch }))
)

/** ρ + multiple channels with matched K */
const arbMultiDissipator = arbK.chain((K) =>
  fc.tuple(arbDensityMatrix(K), arbChannels(K)).map(([rho, channels]) => ({ K, rho, channels }))
)

// ---------------------------------------------------------------------------
// Trace conservation
// ---------------------------------------------------------------------------

describe('Lindblad trace conservation — property', () => {
  it('Tr(D[L](ρ)) = 0 for a single channel on arbitrary ρ', () => {
    fc.assert(
      fc.property(arbSingleDissipator, ({ K, rho, ch }) => {
        const dRho = zeroDM(K)
        applyDissipator(ch, rho, dRho)
        expect(trace(dRho)).toBeCloseTo(0, 8)
      }),
      { numRuns: 200 }
    )
  })

  it('Tr(D[L](ρ)) = 0 for multiple channels on arbitrary ρ', () => {
    fc.assert(
      fc.property(arbMultiDissipator, ({ K, rho, channels }) => {
        const dRho = zeroDM(K)
        computeDissipator(channels, rho, dRho)
        expect(trace(dRho)).toBeCloseTo(0, 8)
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Hermiticity preservation
// ---------------------------------------------------------------------------

describe('Lindblad Hermiticity — property', () => {
  it('D[L](ρ) is Hermitian when ρ is Hermitian', () => {
    fc.assert(
      fc.property(arbMultiDissipator, ({ K, rho, channels }) => {
        const dRho = zeroDM(K)
        computeDissipator(channels, rho, dRho)
        expect(hermiticity(dRho)).toBeLessThan(1e-10)
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Channel with complex amplitude
// ---------------------------------------------------------------------------

describe('Lindblad complex amplitude — property', () => {
  it('trace conserved with complex L operator amplitude', () => {
    const arb = arbK.chain((K) =>
      fc
        .tuple(
          arbDensityMatrix(K),
          fc.integer({ min: 0, max: K - 1 }),
          fc.integer({ min: 0, max: K - 1 }),
          fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true })
        )
        .filter(([, row, col]) => row !== col)
        .filter(([, , , ampRe, ampIm]) => ampRe * ampRe + ampIm * ampIm > 1e-10)
        .map(([rho, row, col, ampRe, ampIm]) => ({ K, rho, row, col, ampRe, ampIm }))
    )

    fc.assert(
      fc.property(arb, ({ K, rho, row, col, ampRe, ampIm }) => {
        const ch: LindbladChannel = { row, col, amplitudeRe: ampRe, amplitudeIm: ampIm }
        const dRho = zeroDM(K)
        applyDissipator(ch, rho, dRho)
        expect(trace(dRho)).toBeCloseTo(0, 8)
      }),
      { numRuns: 200 }
    )
  })
})
