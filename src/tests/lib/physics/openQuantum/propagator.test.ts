import { describe, expect, it } from 'vitest'

import type { ComplexMatrix } from '@/lib/physics/openQuantum/complexMatrix'
import { complexMatIdentity, complexMatZero } from '@/lib/physics/openQuantum/complexMatrix'
import { densityMatrixFromCoefficients, MAX_K } from '@/lib/physics/openQuantum/integrator'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import {
  applyPropagator,
  computePropagator,
  evolvePropagatorStep,
} from '@/lib/physics/openQuantum/propagator'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute Tr(ρ) = Σ_k Re(ρ_{kk}) */
function trace(rho: DensityMatrix): number {
  let tr = 0
  for (let k = 0; k < rho.K; k++) {
    tr += rho.elements[2 * (k * rho.K + k)]!
  }
  return tr
}

/** Check Hermiticity: ρ_{kl} = ρ_{lk}* */
function maxHermiticityError(rho: DensityMatrix): number {
  const K = rho.K
  const el = rho.elements
  let maxErr = 0
  for (let k = 0; k < K; k++) {
    for (let l = k + 1; l < K; l++) {
      const idxKL = 2 * (k * K + l)
      const idxLK = 2 * (l * K + k)
      const errRe = Math.abs(el[idxKL]! - el[idxLK]!)
      const errIm = Math.abs(el[idxKL + 1]! + el[idxLK + 1]!)
      maxErr = Math.max(maxErr, errRe, errIm)
    }
  }
  return maxErr
}

/** Clone a density matrix */
function cloneDM(rho: DensityMatrix): DensityMatrix {
  return { K: rho.K, elements: new Float64Array(rho.elements) }
}

/** Create a pure ground-state density matrix |0⟩⟨0| for K basis states */
function groundStateDM(K: number): DensityMatrix {
  const coeffsRe = new Float64Array(K)
  const coeffsIm = new Float64Array(K)
  coeffsRe[0] = 1
  return densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
}

/** Create a superposition density matrix (|0⟩+|1⟩)/√2 for K≥2 */
function superpositionDM(K: number): DensityMatrix {
  const coeffsRe = new Float64Array(K)
  const coeffsIm = new Float64Array(K)
  coeffsRe[0] = 1 / Math.sqrt(2)
  coeffsRe[1] = 1 / Math.sqrt(2)
  return densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
}

// ---------------------------------------------------------------------------
// computePropagator tests
// ---------------------------------------------------------------------------

describe('computePropagator', () => {
  it('with zero Liouvillian and dt=1 returns identity', () => {
    // Bug caught: exp(0) not returning identity due to Padé edge case
    // or scaling bug in the dt*L multiplication.
    const K = 3
    const N = K * K
    const zeroL = complexMatZero(N)
    const P = computePropagator(zeroL, 1.0, K)

    const I = complexMatIdentity(N)
    for (let i = 0; i < N * N; i++) {
      expect(P.real[i]).toBeCloseTo(I.real[i]!, 10)
      expect(P.imag[i]).toBeCloseTo(I.imag[i]!, 10)
    }
  })

  it('with zero Liouvillian and arbitrary dt returns identity', () => {
    // Bug caught: dt scaling produces non-identity even for zero Liouvillian.
    const K = 2
    const N = K * K
    const zeroL = complexMatZero(N)
    const P = computePropagator(zeroL, 0.05, K)

    const I = complexMatIdentity(N)
    for (let i = 0; i < N * N; i++) {
      expect(P.real[i]).toBeCloseTo(I.real[i]!, 10)
      expect(P.imag[i]).toBeCloseTo(I.imag[i]!, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// evolvePropagatorStep tests
// ---------------------------------------------------------------------------

describe('evolvePropagatorStep', () => {
  it('with identity propagator leaves density matrix unchanged', () => {
    // Bug caught: identity propagator modifies density matrix
    // (e.g., Hermitianize/trace-normalize introduces drift on a valid ρ).
    const K = 2
    const N = K * K
    const identityPropagator = complexMatIdentity(N)

    const rho = groundStateDM(K)
    const rhoBefore = cloneDM(rho)

    evolvePropagatorStep(identityPropagator, rho)

    for (let i = 0; i < K * K * 2; i++) {
      expect(rho.elements[i]).toBeCloseTo(rhoBefore.elements[i]!, 10)
    }
  })

  it('preserves trace after evolution with non-trivial Liouvillian', () => {
    // Bug caught: propagator application destroys trace normalization
    // (e.g., matrix-vector multiply indexing error in applyPropagator).
    const K = 2
    const energies = new Float64Array([-1, -0.25]) // hydrogen n=1, n=2
    const channels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: 0.1, amplitudeIm: 0 }, // emission
    ]

    const L = buildLiouvillian(energies, channels, K)
    const dt = 0.01
    const P = computePropagator(L, dt, K)

    const rho = superpositionDM(K)

    // Evolve 100 steps
    for (let step = 0; step < 100; step++) {
      evolvePropagatorStep(P, rho)
    }

    expect(trace(rho)).toBeCloseTo(1.0, 6)
  })

  it('preserves Hermiticity after evolution', () => {
    // Bug caught: propagator breaks Hermiticity of ρ (e.g., asymmetric
    // rounding, or Hermitianize step missing/broken in evolvePropagatorStep).
    const K = 3
    const energies = new Float64Array([-1, -0.25, -1 / 9])
    const channels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: 0.05, amplitudeIm: 0 },
      { row: 1, col: 2, amplitudeRe: 0.03, amplitudeIm: 0 },
    ]

    const L = buildLiouvillian(energies, channels, K)
    const P = computePropagator(L, 0.01, K)

    // Start from a superposition of all three states
    const coeffsRe = new Float64Array([1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)])
    const coeffsIm = new Float64Array(3)
    const rho = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)

    for (let step = 0; step < 50; step++) {
      evolvePropagatorStep(P, rho)
    }

    expect(maxHermiticityError(rho)).toBeLessThan(1e-12)
  })

  it('preserves trace and Hermiticity with complex Lindblad amplitudes', () => {
    // Verifies that non-zero imaginary parts in Lindblad channel amplitudes
    // are actually used. Pure-real assertions (trace/Hermiticity, ground
    // population > 0.5) would all pass even if the propagator silently
    // ignored `amplitudeIm`, so the key check is a differential comparison
    // against an identically-configured control that has `amplitudeIm = 0`.
    const K = 2
    const energies = new Float64Array([-1, -0.25])

    const complexChannels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: 0.1, amplitudeIm: 0.15 }, // |α|² = 0.0325
    ]
    const realOnlyChannels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: 0.1, amplitudeIm: 0 }, // |α|² = 0.01
    ]

    const Lcomplex = buildLiouvillian(energies, complexChannels, K)
    const Lreal = buildLiouvillian(energies, realOnlyChannels, K)
    const Pcomplex = computePropagator(Lcomplex, 0.01, K)
    const Preal = computePropagator(Lreal, 0.01, K)

    const rhoComplex = superpositionDM(K)
    const rhoReal = superpositionDM(K)

    for (let step = 0; step < 100; step++) {
      evolvePropagatorStep(Pcomplex, rhoComplex)
      evolvePropagatorStep(Preal, rhoReal)
    }

    expect(trace(rhoComplex)).toBeCloseTo(1.0, 6)
    expect(maxHermiticityError(rhoComplex)).toBeLessThan(1e-12)
    expect(rhoComplex.elements[0]!).toBeGreaterThan(0.5)

    // Differential check: the larger |α|² from the complex channel must
    // dissipate excited-state population faster, leaving a measurably
    // higher ground-state population than the real-only control. A
    // propagator that ignored `amplitudeIm` would make these values equal.
    expect(rhoComplex.elements[0]!).toBeGreaterThan(rhoReal.elements[0]! + 1e-3)
  })

  it('handles K=1 degenerate case without errors', () => {
    // A single-state system has a 1x1 density matrix that is always ρ = [[1]].
    // No transitions are possible. The propagator should be the 1x1 identity.
    const K = 1
    const energies = new Float64Array([-1])
    const L = buildLiouvillian(energies, [], K)
    const P = computePropagator(L, 0.01, K)

    const rho = groundStateDM(K)

    for (let step = 0; step < 10; step++) {
      evolvePropagatorStep(P, rho)
    }

    expect(trace(rho)).toBeCloseTo(1.0, 10)
    expect(rho.elements[0]).toBeCloseTo(1.0, 10)
    expect(rho.elements[1]).toBeCloseTo(0.0, 10)
  })

  it('handles K = MAX_K at the scratch-buffer boundary', () => {
    // MAX_K (14) is the size the module-scoped scratch buffers are allocated
    // for. K = MAX_K is the largest legal case; a regression that shaved a
    // single element from the scratch allocation would turn the last-row
    // matvec into a NaN-propagating read.
    const K = MAX_K
    const energies = new Float64Array(K)
    for (let k = 0; k < K; k++) energies[k] = -1 / (k + 1)
    // Emission chain: each level decays into the one below it.
    const channels: LindbladChannel[] = []
    for (let k = 0; k < K - 1; k++) {
      channels.push({ row: k, col: k + 1, amplitudeRe: 0.05, amplitudeIm: 0 })
    }
    const L = buildLiouvillian(energies, channels, K)
    const P = computePropagator(L, 0.01, K)

    // Start in |K-1⟩ (the highest excited state).
    const coeffsRe = new Float64Array(K)
    const coeffsIm = new Float64Array(K)
    coeffsRe[K - 1] = 1
    const rho = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)

    for (let step = 0; step < 200; step++) {
      evolvePropagatorStep(P, rho)
    }

    // All populations must be finite and the trace must be 1 — a scratch
    // overflow would turn the last-row sums into NaN and the trace into NaN.
    expect(trace(rho)).toBeCloseTo(1.0, 6)
    for (let k = 0; k < K; k++) {
      const pop = rho.elements[2 * (k * K + k)]!
      expect(Number.isFinite(pop)).toBe(true)
      expect(pop).toBeGreaterThanOrEqual(-1e-12)
    }
  })

  it('rejects K > MAX_K instead of silently corrupting the density matrix', () => {
    // Pre-fix, an oversize K wrote past the scratch buffer (a no-op on
    // TypedArrays) and read `undefined` back, which the `!` non-null
    // assertion happily cast into NaN arithmetic — a density matrix
    // that LOOKED finished but was garbage. Post-fix, the entry points
    // throw at the API boundary.
    const K = MAX_K + 1
    const N = K * K
    const zeroL = complexMatZero(N)
    expect(() => computePropagator(zeroL, 0.01, K)).toThrow(/MAX_K/)

    // applyPropagator should also refuse — even if the caller obtained a
    // valid propagator some other way.
    const smallP = complexMatIdentity(MAX_K * MAX_K)
    const oversize: DensityMatrix = {
      K: MAX_K + 1,
      elements: new Float64Array((MAX_K + 1) * (MAX_K + 1) * 2),
    }
    expect(() => applyPropagator(smallP, oversize)).toThrow(/MAX_K/)
  })

  it('rejects a malformed Liouvillian buffer in computePropagator', () => {
    const K = 2
    const N = K * K
    const undersized: ComplexMatrix = {
      real: new Float64Array(N * N - 1),
      imag: new Float64Array(N * N - 1),
    }
    expect(() => computePropagator(undersized, 0.01, K)).toThrow(/liouvillian buffer/)
  })

  it('rejects malformed buffers in applyPropagator', () => {
    const K = 2
    const N = K * K
    // propagator too small
    const smallProp: ComplexMatrix = {
      real: new Float64Array(N * N - 1),
      imag: new Float64Array(N * N - 1),
    }
    const rho: DensityMatrix = {
      K,
      elements: new Float64Array(2 * N),
    }
    expect(() => applyPropagator(smallProp, rho)).toThrow(/propagator buffer/)

    // rho.elements too small
    const goodProp = complexMatIdentity(N)
    const shortRho: DensityMatrix = {
      K,
      elements: new Float64Array(2 * N - 1),
    }
    expect(() => applyPropagator(goodProp, shortRho)).toThrow(/rho.elements/)
  })

  it('drives population toward ground state under emission-only dissipation', () => {
    // Bug caught: dissipation drives population in wrong direction
    // (e.g., emission channel with swapped row/col pumps excited state).
    const K = 2
    const energies = new Float64Array([-1, -0.25])
    // Strong emission from state 1 → state 0
    const channels: LindbladChannel[] = [{ row: 0, col: 1, amplitudeRe: 0.5, amplitudeIm: 0 }]

    const L = buildLiouvillian(energies, channels, K)
    const P = computePropagator(L, 0.01, K)

    // Start in excited state |1⟩
    const coeffsRe = new Float64Array([0, 1])
    const coeffsIm = new Float64Array(2)
    const rho = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)

    // Initial ground population = 0
    expect(rho.elements[0]).toBeCloseTo(0, 10)

    // Evolve many steps
    for (let step = 0; step < 500; step++) {
      evolvePropagatorStep(P, rho)
    }

    // Ground state population should have increased significantly
    const groundPop = rho.elements[0]! // Re(ρ_{00})
    expect(groundPop).toBeGreaterThan(0.5)
  })
})

// ---------------------------------------------------------------------------
// buildLiouvillian tests
// ---------------------------------------------------------------------------

describe('buildLiouvillian', () => {
  it('with no channels and uniform energies produces zero matrix', () => {
    // Bug caught: Hamiltonian part generates non-zero entries even when
    // all energies are equal (E_k - E_l = 0 for all k,l).
    const K = 3
    const N = K * K
    const energies = new Float64Array([0.5, 0.5, 0.5])
    const L = buildLiouvillian(energies, [], K)

    for (let i = 0; i < N * N; i++) {
      expect(L.real[i]).toBeCloseTo(0, 10)
      expect(L.imag[i]).toBeCloseTo(0, 10)
    }
  })

  it('with no channels and distinct energies produces diagonal -i(Ek-El) entries', () => {
    // Bug caught: Hamiltonian part places entries in wrong positions,
    // uses wrong sign, or confuses real/imaginary parts.
    // L_H[k*K+l, k*K+l] = -i(E_k - E_l), i.e. real=0, imag=-(E_k - E_l)
    const K = 2
    const N = K * K
    const E0 = -1.0
    const E1 = -0.25
    const energies = new Float64Array([E0, E1])
    const L = buildLiouvillian(energies, [], K)

    // Check that L is diagonal (only diagonal entries non-zero)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        expect(L.real[i * N + j]).toBe(0)
        expect(L.imag[i * N + j]).toBe(0)
      }
    }

    // Check diagonal entries: L[kl, kl] where kl = k*K + l
    // (0,0): -i(E0 - E0) = 0
    expect(L.imag[0 * N + 0]).toBeCloseTo(0, 10)
    // (0,1): -i(E0 - E1) = -i(-1 - (-0.25)) = -i(-0.75) → imag = 0.75
    expect(L.imag[1 * N + 1]).toBeCloseTo(-(E0 - E1), 10)
    // (1,0): -i(E1 - E0) = -i(-0.25 - (-1)) = -i(0.75) → imag = -0.75
    expect(L.imag[2 * N + 2]).toBeCloseTo(-(E1 - E0), 10)
    // (1,1): -i(E1 - E1) = 0
    expect(L.imag[3 * N + 3]).toBeCloseTo(0, 10)

    // All real parts of diagonal should be zero (no dissipation)
    for (let i = 0; i < N; i++) {
      expect(L.real[i * N + i]).toBeCloseTo(0, 10)
    }
  })

  it('preserves trace: Tr(L·vec(ρ)) = 0 for any valid ρ', () => {
    // Bug caught: dissipator terms do not sum to trace-preserving form
    // (e.g., the -0.5 anticommutator terms have wrong coefficients).
    //
    // For any ρ, the trace of dρ/dt must be zero (probability conservation).
    // Tr(dρ/dt) = Σ_k (L·vec(ρ))_{k*K+k} = 0
    //
    // This means: Σ_k L[k*K+k, m*K+n] · ρ_{mn} = 0 for all ρ
    // Equivalently: Σ_k L[k*K+k, j] = 0 for every column j.
    const K = 3
    const N = K * K
    const energies = new Float64Array([-1, -0.25, -1 / 9])
    const channels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: 0.3, amplitudeIm: 0 },
      { row: 1, col: 2, amplitudeRe: 0.2, amplitudeIm: 0 },
      { row: 0, col: 0, amplitudeRe: 0.1, amplitudeIm: 0 }, // dephasing
    ]

    const L = buildLiouvillian(energies, channels, K)

    // For each column j, sum the "trace rows" L[k*K+k, j] for k=0..K-1
    for (let j = 0; j < N; j++) {
      let trSumRe = 0
      let trSumIm = 0
      for (let k = 0; k < K; k++) {
        const traceRow = k * K + k
        trSumRe += L.real[traceRow * N + j]!
        trSumIm += L.imag[traceRow * N + j]!
      }
      expect(trSumRe).toBeCloseTo(0, 10)
      expect(trSumIm).toBeCloseTo(0, 10)
    }
  })

  it('dissipator populates correct off-diagonal superoperator entry', () => {
    // Bug caught: Term 1 of dissipator (L ρ L†) placed at wrong index.
    // For L = α|a⟩⟨b|: L[a*K+a, b*K+b] += |α|²
    const K = 2
    const N = K * K
    const energies = new Float64Array([0, 0]) // no Hamiltonian
    const amp = 0.4
    const channels: LindbladChannel[] = [
      { row: 0, col: 1, amplitudeRe: amp, amplitudeIm: 0 }, // |0⟩⟨1|
    ]

    const L = buildLiouvillian(energies, channels, K)

    // Term 1: L[0*2+0, 1*2+1] = L[0, 3] += amp²
    expect(L.real[0 * N + 3]).toBeCloseTo(amp * amp, 10)
  })

  it('dissipator diagonal decay terms are correct', () => {
    // Bug caught: -0.5|α|² terms applied to wrong diagonal entries.
    // For L = α|0⟩⟨1| with K=2:
    //   Term 2: L[1*2+l, 1*2+l] -= 0.5*|α|² for l=0,1 → L[2,2], L[3,3]
    //   Term 3: L[k*2+1, k*2+1] -= 0.5*|α|² for k=0,1 → L[1,1], L[3,3]
    const K = 2
    const N = K * K
    const energies = new Float64Array([0, 0])
    const amp = 0.4
    const ampSq = amp * amp
    const channels: LindbladChannel[] = [{ row: 0, col: 1, amplitudeRe: amp, amplitudeIm: 0 }]

    const L = buildLiouvillian(energies, channels, K)

    // L[0,0] diagonal: only Term 3 with k=0, b=1 → index 0*2+1=1, not 0. So L[0,0]=0
    expect(L.real[0 * N + 0]).toBeCloseTo(0, 10)

    // L[1,1] diagonal: Term 3 contributes -0.5*ampSq (k=0, b=1 → idx=1)
    expect(L.real[1 * N + 1]).toBeCloseTo(-0.5 * ampSq, 10)

    // L[2,2] diagonal: Term 2 contributes -0.5*ampSq (b=1, l=0 → idx=2)
    expect(L.real[2 * N + 2]).toBeCloseTo(-0.5 * ampSq, 10)

    // L[3,3] diagonal: Term 2 (-0.5*ampSq for l=1) + Term 3 (-0.5*ampSq for k=1)
    expect(L.real[3 * N + 3]).toBeCloseTo(-ampSq, 10)
  })
})
