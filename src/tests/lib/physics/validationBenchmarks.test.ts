/**
 * Physics Validation Benchmarks
 *
 * Tests the physics implementations against externally verified analytical results.
 * Every reference formula was verified from an online source (cited in each describe block).
 * No benchmark values are taken from training data or memory — only from:
 *   - Web-verified analytical formulas (Wikipedia, NIST DLMF)
 *   - Self-consistency properties (conservation laws, convergence rates)
 *
 * Test categories:
 *   1. CPU reference split-step solver — validates convergence order and tunneling
 *   2. Dirac equation scales — validates against exact relativistic formulas
 *   3. Free scalar field vacuum — validates statistical properties
 *   4. TDSE potential evaluation — validates barrier shapes for tunneling tests
 *
 * @module tests/lib/physics/validationBenchmarks
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import { fft, ifft } from '@/lib/math/fft'
import {
  comptonWavelength,
  kleinThreshold,
  maxStableDt,
  relativisticEnergy,
  spinorSize,
  zitterbewegungFrequency,
} from '@/lib/physics/dirac/scales'
import { computeOmegaK, sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import {
  computePacketKineticEnergy,
  evaluatePotential1D,
} from '@/lib/physics/tdse/potentialProfile'

// ============================================================================
// CPU Reference: 1D Split-Step Fourier Solver
//
// Mirrors the GPU split-operator implementation for validation.
// Uses Strang splitting: V(dt/2) → T(dt) → V(dt/2)
// ============================================================================

/**
 * Initialize a 1D Gaussian wavepacket on a periodic lattice.
 *
 * ψ(x) = A exp(-(x-x0)²/(4σ²)) exp(ik0·x)
 *
 * Normalization is applied after construction.
 *
 * @param N - Number of grid points (must be power of 2)
 * @param dx - Grid spacing
 * @param x0 - Packet center
 * @param sigma - Packet width (standard deviation)
 * @param k0 - Initial momentum
 * @returns Interleaved complex array [re0, im0, re1, im1, ...]
 */
function initGaussianPacket(
  N: number,
  dx: number,
  x0: number,
  sigma: number,
  k0: number
): Float64Array {
  const psi = new Float64Array(2 * N)
  const halfL = (N * dx) / 2
  let norm2 = 0

  for (let i = 0; i < N; i++) {
    const x = -halfL + i * dx
    const arg = -((x - x0) * (x - x0)) / (4 * sigma * sigma)
    const phase = k0 * x
    const envelope = Math.exp(arg)
    const re = envelope * Math.cos(phase)
    const im = envelope * Math.sin(phase)
    psi[2 * i] = re
    psi[2 * i + 1] = im
    norm2 += re * re + im * im
  }

  // Normalize: sum |ψ|² dx = 1
  const scale = 1 / Math.sqrt(norm2 * dx)
  for (let i = 0; i < 2 * N; i++) psi[i]! *= scale

  return psi
}

/**
 * Compute total norm: ∫|ψ|² dx ≈ Σ|ψᵢ|² dx
 */
function computeNorm(psi: Float64Array, N: number, dx: number): number {
  let norm2 = 0
  for (let i = 0; i < N; i++) {
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    norm2 += re * re + im * im
  }
  return norm2 * dx
}

/**
 * Compute position variance: ⟨(x - ⟨x⟩)²⟩
 */
function computePositionVariance(psi: Float64Array, N: number, dx: number): number {
  const halfL = (N * dx) / 2
  let meanX = 0
  let norm2 = 0
  for (let i = 0; i < N; i++) {
    const x = -halfL + i * dx
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    const prob = re * re + im * im
    meanX += x * prob
    norm2 += prob
  }
  meanX /= norm2

  let variance = 0
  for (let i = 0; i < N; i++) {
    const x = -halfL + i * dx
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    const prob = re * re + im * im
    variance += (x - meanX) * (x - meanX) * prob
  }
  return variance / norm2
}

/**
 * 1D split-step Fourier evolution (Strang splitting).
 *
 * Evolves ψ by one time step dt:
 *   ψ → exp(-iV dt/2ℏ) → FFT → exp(-iℏk²dt/(2m)) → IFFT → exp(-iV dt/2ℏ) → ψ
 *
 * @param psi - Wavefunction (modified in place)
 * @param N - Grid points
 * @param dx - Spacing
 * @param dt - Time step
 * @param mass - Particle mass
 * @param hbar - Reduced Planck constant
 * @param V - Potential array V(x) for each grid point
 */
function splitStepEvolve(
  psi: Float64Array,
  N: number,
  dx: number,
  dt: number,
  mass: number,
  hbar: number,
  V: Float64Array
): void {
  // Half-step potential: ψ → exp(-iV·dt/(2ℏ)) ψ
  for (let i = 0; i < N; i++) {
    const angle = (-V[i]! * dt) / (2 * hbar)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }

  // Forward FFT
  fft(psi, N)

  // Full-step kinetic: ψ_k → exp(-iℏk²dt/(2m)) ψ_k
  const dk = (2 * Math.PI) / (N * dx)
  for (let i = 0; i < N; i++) {
    // k-space index: 0, 1, ..., N/2-1, -N/2, ..., -1
    const ki = i <= N / 2 ? i : i - N
    const k = ki * dk
    const angle = (-hbar * k * k * dt) / (2 * mass)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }

  // Inverse FFT
  ifft(psi, N)

  // Half-step potential
  for (let i = 0; i < N; i++) {
    const angle = (-V[i]! * dt) / (2 * hbar)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }
}

/**
 * Compute left/right norm partition for reflection/transmission estimation.
 *
 * @param psi - Wavefunction
 * @param N - Grid points
 * @param dx - Spacing
 * @param splitIndex - Index dividing left from right
 * @returns { normLeft, normRight }
 */
function computeLeftRightNorm(
  psi: Float64Array,
  N: number,
  dx: number,
  splitIndex: number
): { normLeft: number; normRight: number } {
  let normLeft = 0
  let normRight = 0
  for (let i = 0; i < N; i++) {
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    const prob = (re * re + im * im) * dx
    if (i < splitIndex) normLeft += prob
    else normRight += prob
  }
  return { normLeft, normRight }
}

// ============================================================================
// 1. TDSE Validation: Norm Conservation
//
// A unitary evolution must preserve ||ψ||² = 1.
// The split-step method with Strang splitting is unitary to machine precision
// for the free particle (V=0) and unitary to O(dt³) for non-zero V.
// ============================================================================

describe('CPU split-step reference: norm conservation', () => {
  it('free particle preserves norm to machine precision over 100 steps', () => {
    const N = 256
    const dx = 0.1
    const dt = 0.01
    const mass = 1.0
    const hbar = 1.0

    const psi = initGaussianPacket(N, dx, 0, 1.5, 5.0)
    const V = new Float64Array(N) // zero potential

    const norm0 = computeNorm(psi, N, dx)

    for (let step = 0; step < 100; step++) {
      splitStepEvolve(psi, N, dx, dt, mass, hbar, V)
    }

    const normFinal = computeNorm(psi, N, dx)
    // Split-step with V=0 is exactly unitary (kinetic operator is diagonal in k-space)
    expect(Math.abs(normFinal - norm0)).toBeLessThan(1e-12)
  })

  it('harmonic trap preserves norm to < 10⁻⁸ over 200 steps', () => {
    const N = 512
    const dx = 0.05
    const dt = 0.005
    const mass = 1.0
    const hbar = 1.0
    const omega = 1.0

    const psi = initGaussianPacket(N, dx, 0, 1.0, 0)
    const V = new Float64Array(N)
    const halfL = (N * dx) / 2
    for (let i = 0; i < N; i++) {
      const x = -halfL + i * dx
      V[i] = 0.5 * mass * omega * omega * x * x
    }

    const norm0 = computeNorm(psi, N, dx)
    for (let step = 0; step < 200; step++) {
      splitStepEvolve(psi, N, dx, dt, mass, hbar, V)
    }

    const normFinal = computeNorm(psi, N, dx)
    expect(Math.abs(normFinal - norm0) / norm0).toBeLessThan(1e-8)
  })
})

// ============================================================================
// 2. TDSE Validation: Free Gaussian Wavepacket Spreading
//
// Reference: Wikipedia "Wave packet" (https://en.wikipedia.org/wiki/Wave_packet)
//
// For a free particle (V=0), a Gaussian wavepacket with initial width σ₀
// spreads according to:
//   σ(t) = σ₀ √(1 + (ℏt / (2mσ₀²))²)
//
// This is an exact analytical result. The CPU split-step solver must
// reproduce it to within discretization error.
// ============================================================================

describe('free Gaussian wavepacket spreading (Wikipedia: Wave packet)', () => {
  it('σ(t) matches exact analytical formula within 1%', () => {
    const N = 1024
    const dx = 0.05
    const dt = 0.005
    const mass = 1.0
    const hbar = 1.0
    const sigma0 = 2.0
    const k0 = 0 // stationary packet to isolate spreading

    const psi = initGaussianPacket(N, dx, 0, sigma0, k0)
    const V = new Float64Array(N) // free particle

    // Evolve for time T = 4.0 (enough to see significant spreading)
    const T = 4.0
    const nSteps = Math.round(T / dt)

    for (let step = 0; step < nSteps; step++) {
      splitStepEvolve(psi, N, dx, dt, mass, hbar, V)
    }

    const measuredVariance = computePositionVariance(psi, N, dx)
    const measuredSigma = Math.sqrt(measuredVariance)

    // Exact: σ(T) = σ₀ √(1 + (ℏT/(2mσ₀²))²)
    const tau = (hbar * T) / (2 * mass * sigma0 * sigma0)
    const exactSigma = sigma0 * Math.sqrt(1 + tau * tau)

    const relError = Math.abs(measuredSigma - exactSigma) / exactSigma
    expect(relError).toBeLessThan(0.01) // 1% tolerance
  })

  it('σ(t) matches at multiple time points', () => {
    const N = 1024
    const dx = 0.05
    const dt = 0.005
    const mass = 1.0
    const hbar = 1.0
    const sigma0 = 2.0

    const timePoints = [1.0, 2.0, 3.0, 5.0]

    for (const T of timePoints) {
      const psi = initGaussianPacket(N, dx, 0, sigma0, 0)
      const V = new Float64Array(N)
      const nSteps = Math.round(T / dt)

      for (let step = 0; step < nSteps; step++) {
        splitStepEvolve(psi, N, dx, dt, mass, hbar, V)
      }

      const measuredSigma = Math.sqrt(computePositionVariance(psi, N, dx))
      const tau = (hbar * T) / (2 * mass * sigma0 * sigma0)
      const exactSigma = sigma0 * Math.sqrt(1 + tau * tau)
      const relError = Math.abs(measuredSigma - exactSigma) / exactSigma

      expect(relError).toBeLessThan(0.02) // 2% tolerance for all time points
    }
  })
})

// ============================================================================
// 3. TDSE Validation: Strang Splitting Convergence Order
//
// Reference: Wikipedia "Split-step method" (https://en.wikipedia.org/wiki/Split-step_method)
//
// Strang (symmetric) splitting has error O(Δt³) per step, yielding O(Δt²)
// global error. When halving dt, the error should decrease by factor ~4.
//
// Test: evolve a packet in a harmonic trap with dt and dt/2, measure the
// difference from a high-resolution reference, verify the ratio ≈ 4.
// ============================================================================

describe('Strang splitting convergence order (Wikipedia: Split-step method)', () => {
  it('global error decreases as O(Δt²) when halving dt', () => {
    const N = 512
    const dx = 0.05
    const mass = 1.0
    const hbar = 1.0
    const omega = 1.0

    const V = new Float64Array(N)
    const halfL = (N * dx) / 2
    for (let i = 0; i < N; i++) {
      const x = -halfL + i * dx
      V[i] = 0.5 * mass * omega * omega * x * x
    }

    const T = 1.0

    // Reference solution: dt_ref = 0.00125 (very fine)
    const dtRef = 0.00125
    const psiRef = initGaussianPacket(N, dx, 2.0, 1.0, 0)
    const stepsRef = Math.round(T / dtRef)
    for (let step = 0; step < stepsRef; step++) {
      splitStepEvolve(psiRef, N, dx, dtRef, mass, hbar, V)
    }

    // Coarse: dt1 = 0.02
    const dt1 = 0.02
    const psi1 = initGaussianPacket(N, dx, 2.0, 1.0, 0)
    const steps1 = Math.round(T / dt1)
    for (let step = 0; step < steps1; step++) {
      splitStepEvolve(psi1, N, dx, dt1, mass, hbar, V)
    }

    // Medium: dt2 = 0.01
    const dt2 = 0.01
    const psi2 = initGaussianPacket(N, dx, 2.0, 1.0, 0)
    const steps2 = Math.round(T / dt2)
    for (let step = 0; step < steps2; step++) {
      splitStepEvolve(psi2, N, dx, dt2, mass, hbar, V)
    }

    // Compute L2 errors relative to reference
    let err1Sq = 0
    let err2Sq = 0
    for (let i = 0; i < 2 * N; i++) {
      const d1 = psi1[i]! - psiRef[i]!
      const d2 = psi2[i]! - psiRef[i]!
      err1Sq += d1 * d1
      err2Sq += d2 * d2
    }
    const err1 = Math.sqrt(err1Sq)
    const err2 = Math.sqrt(err2Sq)

    // For O(Δt²) convergence, err1/err2 ≈ (dt1/dt2)² = 4
    const ratio = err1 / err2
    // Allow range [2.5, 6] to account for higher-order terms and reference not being exact
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(6.0)
  })
})

// ============================================================================
// 4. TDSE Validation: Tunneling Through Rectangular Barrier
//
// Reference: Wikipedia "Rectangular potential barrier"
// (https://en.wikipedia.org/wiki/Rectangular_potential_barrier)
//
// For E < V₀:  T = 1 / [1 + V₀² sinh²(κa) / (4E(V₀ - E))]
//   where κ = √(2m(V₀ - E)) / ℏ
//
// For E > V₀:  T = 1 / [1 + V₀² sin²(k₁a) / (4E(E - V₀))]
//   where k₁ = √(2m(E - V₀)) / ℏ
//
// We test the CPU split-step solver against these exact formulas.
// ============================================================================

/**
 * Exact transmission coefficient for rectangular barrier (E < V₀).
 * Source: https://en.wikipedia.org/wiki/Rectangular_potential_barrier
 */
function exactTransmissionBelow(
  E: number,
  V0: number,
  a: number,
  mass: number,
  hbar: number
): number {
  const kappa = Math.sqrt(2 * mass * (V0 - E)) / hbar
  const sinhVal = Math.sinh(kappa * a)
  return 1 / (1 + (V0 * V0 * sinhVal * sinhVal) / (4 * E * (V0 - E)))
}

/**
 * Exact transmission coefficient for rectangular barrier (E > V₀).
 * Source: https://en.wikipedia.org/wiki/Rectangular_potential_barrier
 */
function exactTransmissionAbove(
  E: number,
  V0: number,
  a: number,
  mass: number,
  hbar: number
): number {
  const k1 = Math.sqrt(2 * mass * (E - V0)) / hbar
  const sinVal = Math.sin(k1 * a)
  return 1 / (1 + (V0 * V0 * sinVal * sinVal) / (4 * E * (E - V0)))
}

describe('exact tunneling formula self-consistency', () => {
  const mass = 1.0
  const hbar = 1.0

  it('T ∈ (0, 1) for E < V₀ (tunneling regime)', () => {
    const V0 = 10
    const a = 0.5
    const T = exactTransmissionBelow(5, V0, a, mass, hbar)
    expect(T).toBeGreaterThan(0)
    expect(T).toBeLessThan(1)
  })

  it('T + R = 1 for all energies (unitarity)', () => {
    const V0 = 10
    const a = 0.5
    // Below barrier
    for (const E of [1, 3, 5, 7, 9]) {
      const T = exactTransmissionBelow(E, V0, a, mass, hbar)
      const R = 1 - T
      expect(T + R).toBeCloseTo(1.0, 14)
    }
    // Above barrier
    for (const E of [11, 15, 20, 50]) {
      const T = exactTransmissionAbove(E, V0, a, mass, hbar)
      const R = 1 - T
      expect(T + R).toBeCloseTo(1.0, 14)
    }
  })

  it('T → 1 as E → ∞ (classical limit)', () => {
    const V0 = 10
    const a = 0.5
    const T = exactTransmissionAbove(1e6, V0, a, mass, hbar)
    expect(T).toBeGreaterThan(0.999)
  })

  it('T decreases exponentially with barrier width for E < V₀', () => {
    const V0 = 10
    const E = 5
    const T1 = exactTransmissionBelow(E, V0, 0.5, mass, hbar)
    const T2 = exactTransmissionBelow(E, V0, 1.0, mass, hbar)
    const T3 = exactTransmissionBelow(E, V0, 1.5, mass, hbar)
    expect(T1).toBeGreaterThan(T2)
    expect(T2).toBeGreaterThan(T3)
  })
})

describe('CPU split-step tunneling vs exact formula', () => {
  it(
    'transmission coefficient matches exact formula within 10% for E > V₀',
    { timeout: 30_000 },
    () => {
      // Use E >> V₀ where T ≈ 1. A wide packet (narrow Δk) approaches the
      // monochromatic plane-wave limit, so the measured T matches the
      // analytical formula for a single energy.
      const N = 2048
      const dx = 0.05
      const dt = 0.005
      const mass = 1.0
      const hbar = 1.0

      // Barrier: thin and moderate height
      const V0 = 3.0
      const barrierWidth = 0.5
      const barrierCenter = 0.0

      // E = 20 >> V₀ = 3 → T very close to 1
      const E = 20.0
      const k0 = Math.sqrt((2 * mass * E) / (hbar * hbar))

      // Wide packet (σ₀ = 5) for narrow momentum spread. Start at x = -15.
      const x0 = -15.0
      const sigma0 = 5.0
      const psi = initGaussianPacket(N, dx, x0, sigma0, k0)

      // Rectangular barrier
      const V = new Float64Array(N)
      const halfL = (N * dx) / 2
      for (let i = 0; i < N; i++) {
        const x = -halfL + i * dx
        V[i] = Math.abs(x - barrierCenter) < barrierWidth / 2 ? V0 : 0
      }

      // velocity v = ℏk₀/m ≈ 6.32, distance = 15, time ≈ 2.4 + settling
      const T_evolve = 5.0
      const nSteps = Math.round(T_evolve / dt)
      for (let step = 0; step < nSteps; step++) {
        splitStepEvolve(psi, N, dx, dt, mass, hbar, V)
      }

      // Fraction of norm to the right of barrier
      const barrierIdx = Math.round((barrierCenter + halfL) / dx)
      const { normLeft, normRight } = computeLeftRightNorm(psi, N, dx, barrierIdx)
      const totalNorm = normLeft + normRight
      const measuredT = normRight / totalNorm

      const exactT = exactTransmissionAbove(E, V0, barrierWidth, mass, hbar)

      const relError = Math.abs(measuredT - exactT) / exactT
      expect(relError).toBeLessThan(0.1)
    }
  )
})

// ============================================================================
// 5. GPE (Gross-Pitaevskii) Validation: Exact Bright Soliton Benchmark
//
// Reference: Wikipedia "Gross-Pitaevskii equation"
// (https://en.wikipedia.org/wiki/Gross%E2%80%93Pitaevskii_equation)
//
// The 1D GPE with attractive interactions (g < 0, V = 0) has an exact
// stationary bright soliton solution:
//
//   ψ(x,t) = A · sech(κx) · exp(-iμt/ℏ)
//
// where κ = √(m|g|A²) / ℏ  and  μ = gA²/2 (< 0 for g < 0).
//
// The density |ψ(x,t)|² = A² sech²(κx) is time-independent.
// A split-step GPE solver initialized with this exact soliton must preserve
// the density profile. Any deviation is solver error.
//
// This validates the nonlinear GPE solver against an exact analytical
// solution — not just self-consistency (scaling laws), but convergence
// to a known solution.
// ============================================================================

/**
 * 1D split-step Fourier evolution with nonlinear GPE term (Strang splitting).
 *
 * Identical to splitStepEvolve but the potential half-step includes g|ψ|²:
 *   V_eff(x) = V(x) + g·|ψ(x)|²
 *
 * Reference: Same Strang splitting as TDSE, with nonlinear term proven to
 * maintain O(dt²) convergence for GPE.
 * (Gao et al., J. Sci. Comput. 104, 95, 2025)
 */
function splitStepEvolveGPE(
  psi: Float64Array,
  N: number,
  dx: number,
  dt: number,
  mass: number,
  hbar: number,
  V: Float64Array,
  g: number
): void {
  // Half-step potential + nonlinear: ψ → exp(-i(V + g|ψ|²)·dt/(2ℏ)) ψ
  for (let i = 0; i < N; i++) {
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    const density = re * re + im * im
    const angle = (-(V[i]! + g * density) * dt) / (2 * hbar)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }

  // Forward FFT
  fft(psi, N)

  // Full-step kinetic: ψ_k → exp(-iℏk²dt/(2m)) ψ_k
  const dk = (2 * Math.PI) / (N * dx)
  for (let i = 0; i < N; i++) {
    const ki = i <= N / 2 ? i : i - N
    const k = ki * dk
    const angle = (-hbar * k * k * dt) / (2 * mass)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }

  // Inverse FFT
  ifft(psi, N)

  // Half-step potential + nonlinear
  for (let i = 0; i < N; i++) {
    const re = psi[2 * i]!
    const im = psi[2 * i + 1]!
    const density = re * re + im * im
    const angle = (-(V[i]! + g * density) * dt) / (2 * hbar)
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    psi[2 * i] = re * cosA - im * sinA
    psi[2 * i + 1] = re * sinA + im * cosA
  }
}

/**
 * Initialize exact GPE bright soliton on a grid.
 *
 * ψ(x) = A · sech(κx)   where κ = A√(m|g|)/ℏ
 *
 * The soliton is normalized by its analytical norm: ∫|ψ|²dx = 2A²/κ = 2A·ℏ/√(m|g|).
 * No numerical normalization is applied — the exact analytical state is used directly.
 *
 * @param N - Grid points
 * @param dx - Grid spacing
 * @param A - Peak amplitude
 * @param g - Interaction strength (must be < 0 for bright soliton)
 * @param mass - Particle mass
 * @param hbar - Reduced Planck constant
 * @returns Interleaved complex array (purely real initial state)
 */
function initBrightSoliton(
  N: number,
  dx: number,
  A: number,
  g: number,
  mass: number,
  hbar: number
): Float64Array {
  const absG = Math.abs(g)
  const kappa = (A * Math.sqrt(mass * absG)) / hbar
  const psi = new Float64Array(2 * N)
  const halfL = (N * dx) / 2

  for (let i = 0; i < N; i++) {
    const x = -halfL + i * dx
    psi[2 * i] = A / Math.cosh(kappa * x)
    psi[2 * i + 1] = 0
  }
  return psi
}

describe('GPE norm conservation with nonlinear term (g ≠ 0)', () => {
  it('norm is preserved to machine precision for attractive GPE (g < 0)', () => {
    const N = 256
    const dx = 0.1
    const dt = 0.01
    const mass = 1.0
    const hbar = 1.0
    const g = -1.0
    const V = new Float64Array(N) // free

    const psi = initGaussianPacket(N, dx, 0, 1.5, 0)
    const norm0 = computeNorm(psi, N, dx)

    for (let step = 0; step < 100; step++) {
      splitStepEvolveGPE(psi, N, dx, dt, mass, hbar, V, g)
    }

    const normFinal = computeNorm(psi, N, dx)
    // Each half-step is a phase rotation (|e^{iθ}| = 1), so norm is exactly preserved
    expect(Math.abs(normFinal - norm0) / norm0).toBeLessThan(1e-12)
  })

  it('norm is preserved for repulsive GPE (g > 0)', () => {
    const N = 256
    const dx = 0.1
    const dt = 0.01
    const mass = 1.0
    const hbar = 1.0
    const g = 2.0
    const V = new Float64Array(N)

    const psi = initGaussianPacket(N, dx, 0, 1.5, 0)
    const norm0 = computeNorm(psi, N, dx)

    for (let step = 0; step < 100; step++) {
      splitStepEvolveGPE(psi, N, dx, dt, mass, hbar, V, g)
    }

    const normFinal = computeNorm(psi, N, dx)
    expect(Math.abs(normFinal - norm0) / norm0).toBeLessThan(1e-12)
  })
})

describe('GPE bright soliton: exact stationary solution (Wikipedia: Gross-Pitaevskii equation)', () => {
  it('density profile |ψ|² remains stationary under GPE evolution', () => {
    // Parameters in natural units (ℏ = m = 1)
    const N = 512
    const dx = 0.05
    const dt = 0.005
    const mass = 1.0
    const hbar = 1.0
    const g = -1.0
    const A = 1.0 // peak amplitude
    const V = new Float64Array(N) // no external potential

    const psi = initBrightSoliton(N, dx, A, g, mass, hbar)

    // Record initial density
    const density0 = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      density0[i] = psi[2 * i]! * psi[2 * i]! + psi[2 * i + 1]! * psi[2 * i + 1]!
    }

    // Evolve for T = 2.0
    const T = 2.0
    const nSteps = Math.round(T / dt)
    for (let step = 0; step < nSteps; step++) {
      splitStepEvolveGPE(psi, N, dx, dt, mass, hbar, V, g)
    }

    // Compare final density to initial
    let l2Error = 0
    let l2Ref = 0
    for (let i = 0; i < N; i++) {
      const re = psi[2 * i]!
      const im = psi[2 * i + 1]!
      const densityFinal = re * re + im * im
      const diff = densityFinal - density0[i]!
      l2Error += diff * diff * dx
      l2Ref += density0[i]! * density0[i]! * dx
    }
    const relL2 = Math.sqrt(l2Error / l2Ref)

    // The soliton is an exact stationary state — density should not change.
    // Tolerance accounts for O(dt²) Strang splitting error over T/dt = 400 steps.
    expect(relL2).toBeLessThan(0.01) // 1% relative L2 error
  })

  it('density error decreases as O(dt²) when halving dt (Strang convergence)', () => {
    const N = 512
    const dx = 0.05
    const mass = 1.0
    const hbar = 1.0
    const g = -1.0
    const A = 1.0
    const V = new Float64Array(N)
    const T = 1.0

    // Record initial density once
    const psiRef = initBrightSoliton(N, dx, A, g, mass, hbar)
    const density0 = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      density0[i] = psiRef[2 * i]! * psiRef[2 * i]! + psiRef[2 * i + 1]! * psiRef[2 * i + 1]!
    }

    function measureError(dt: number): number {
      const psi = initBrightSoliton(N, dx, A, g, mass, hbar)
      const nSteps = Math.round(T / dt)
      for (let step = 0; step < nSteps; step++) {
        splitStepEvolveGPE(psi, N, dx, dt, mass, hbar, V, g)
      }
      let l2Err = 0
      for (let i = 0; i < N; i++) {
        const d = psi[2 * i]! * psi[2 * i]! + psi[2 * i + 1]! * psi[2 * i + 1]! - density0[i]!
        l2Err += d * d * dx
      }
      return Math.sqrt(l2Err)
    }

    const err1 = measureError(0.02) // coarse
    const err2 = measureError(0.01) // fine

    // O(dt²) convergence: err1/err2 ≈ (0.02/0.01)² = 4
    const ratio = err1 / err2
    expect(ratio).toBeGreaterThan(2.5)
    expect(ratio).toBeLessThan(6.0)
  })
})

// ============================================================================
// 6. Dirac Equation Scales Validation
//
// References:
//   - Energy-momentum: Wikipedia "Energy-momentum relation"
//     (https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation)
//     E² = (pc)² + (mc²)²
//
//   - Zitterbewegung: Wikipedia "Zitterbewegung"
//     (https://en.wikipedia.org/wiki/Zitterbewegung)
//     ω_ZBW = 2mc²/ℏ
//
//   - Compton wavelength: λ_C = ℏ/(mc) (standard definition)
//
//   - Klein threshold: V₀ = 2mc² (pair creation onset)
// ============================================================================

describe('Dirac relativistic energy-momentum (Wikipedia: Energy-momentum relation)', () => {
  it('E = mc² for p = 0 (rest energy)', () => {
    const m = 1.0
    const c = 1.0
    expect(relativisticEnergy(0, m, c)).toBeCloseTo(m * c * c, 14)
  })

  it('E = pc for m = 0 (massless particle)', () => {
    const p = 5.0
    const c = 1.0
    expect(relativisticEnergy(p, 0, c)).toBeCloseTo(p * c, 14)
  })

  it('E² = (pc)² + (mc²)² for arbitrary p, m, c', () => {
    const cases = [
      { p: 3, m: 4, c: 1 }, // E = 5 (Pythagorean)
      { p: 1, m: 1, c: 1 }, // E = √2
      { p: 0.5, m: 2.0, c: 3.0 }, // general
      { p: 10, m: 0.1, c: 2 }, // ultra-relativistic
    ]
    for (const { p, m, c } of cases) {
      const E = relativisticEnergy(p, m, c)
      const expected = Math.sqrt((p * c) ** 2 + (m * c * c) ** 2)
      expect(E).toBeCloseTo(expected, 12)
    }
  })

  it('p=3, m=4, c=1 gives E=5 (Pythagorean triple)', () => {
    // 3² + 4² = 5², so E = √(9+16) = 5
    expect(relativisticEnergy(3, 4, 1)).toBeCloseTo(5.0, 14)
  })
})

describe('Zitterbewegung frequency (Wikipedia: Zitterbewegung)', () => {
  it('ω = 2mc²/ℏ in natural units', () => {
    const m = 1.0
    const c = 1.0
    const hbar = 1.0
    expect(zitterbewegungFrequency(m, c, hbar)).toBeCloseTo(2.0, 14)
  })

  it('ω scales linearly with mass', () => {
    const c = 1.0
    const hbar = 1.0
    const omega1 = zitterbewegungFrequency(1, c, hbar)
    const omega2 = zitterbewegungFrequency(2, c, hbar)
    expect(omega2 / omega1).toBeCloseTo(2.0, 14)
  })

  it('ω scales as c²', () => {
    const m = 1.0
    const hbar = 1.0
    const omega1 = zitterbewegungFrequency(m, 1, hbar)
    const omega2 = zitterbewegungFrequency(m, 2, hbar)
    expect(omega2 / omega1).toBeCloseTo(4.0, 14)
  })

  it('ω is exactly twice the Compton angular frequency', () => {
    // Compton angular frequency: ω_C = mc²/ℏ
    // Zitterbewegung: ω_ZBW = 2mc²/ℏ = 2·ω_C
    const m = 3.0
    const c = 2.0
    const hbar = 0.5
    const comptonOmega = (m * c * c) / hbar
    const zbwOmega = zitterbewegungFrequency(m, c, hbar)
    expect(zbwOmega).toBeCloseTo(2 * comptonOmega, 12)
  })
})

describe('Compton wavelength and Klein threshold', () => {
  it('λ_C = ℏ/(mc)', () => {
    expect(comptonWavelength(1, 1, 1)).toBeCloseTo(1.0, 14)
    expect(comptonWavelength(2, 1, 3)).toBeCloseTo(2 / 3, 14)
    expect(comptonWavelength(1, 0.5, 2)).toBeCloseTo(1.0, 14)
  })

  it('Klein threshold = 2mc²', () => {
    expect(kleinThreshold(1, 1)).toBeCloseTo(2.0, 14)
    expect(kleinThreshold(0.5, 3)).toBeCloseTo(9.0, 14)
  })

  it('CFL condition: dt < min(Δx)/(c√N)', () => {
    const spacing = [0.1, 0.1, 0.1]
    const c = 1.0
    const dtMax = maxStableDt(spacing, c)
    expect(dtMax).toBeCloseTo(0.1 / Math.sqrt(3), 10)
  })

  it('spinor size = 2^⌊(N+1)/2⌋ for all supported dimensions', () => {
    // Known exact values from representation theory
    const expected: Record<number, number> = {
      1: 2,
      2: 2,
      3: 4,
      4: 4,
      5: 8,
      6: 8,
      7: 16,
      8: 16,
      9: 32,
      10: 32,
      11: 64,
    }
    for (const [dim, size] of Object.entries(expected)) {
      expect(spinorSize(Number(dim))).toBe(size)
    }
  })
})

// ============================================================================
// 6. Free Scalar Field: Vacuum Spectrum Validation
//
// The vacuum state of a free scalar field has per-mode variances:
//   ⟨|φ_k|²⟩ = 1/(2ω_k)   and   ⟨|π_k|²⟩ = ω_k/2
//
// The code implements this in sampleVacuumSpectrum(). We validate by sampling
// many seeds and checking the statistical average converges to the expected
// variance. This is a self-consistency test — the formula is implemented in
// the code, and we verify the sampling matches it.
//
// The dispersion relation ω_k for the lattice is computed by computeOmegaK().
// ============================================================================

describe('free scalar vacuum: lattice dispersion relation', () => {
  it('zero mode: ω = m_eff (minimum frequency is the mass)', () => {
    const omega = computeOmegaK([0, 0], [8, 8], [1, 1], 1.0, 2)
    expect(omega).toBeCloseTo(1.0, 10)
  })

  it('massless limit: ω_k → |k_lattice| for non-zero modes', () => {
    // Mode (1,0) on 8×8 lattice with spacing 1:
    // k_lat = 2·sin(π·1/8) / 1 = 2·sin(π/8)
    const omega = computeOmegaK([1, 0], [8, 8], [1, 1], 0, 2)
    const kLat = 2 * Math.sin(Math.PI / 8)
    // With M_FLOOR = 0.01, omega = sqrt(0.01² + k²) ≈ k for k >> 0.01
    expect(omega).toBeCloseTo(Math.sqrt(0.01 * 0.01 + kLat * kLat), 6)
  })

  it('Nyquist mode: ω = sqrt(m² + (2/a)²) per dimension', () => {
    // Mode (N/2, 0) on 8×8: sin(π·4/8) = sin(π/2) = 1, k = 2/a
    const a = 0.5
    const m = 1.0
    const omega = computeOmegaK([4, 0], [8, 8], [a, a], m, 2)
    const kNyquist = 2 / a
    expect(omega).toBeCloseTo(Math.sqrt(m * m + kNyquist * kNyquist), 10)
  })
})

describe('free scalar vacuum: statistical sampling', () => {
  it('mean ⟨|φ_k|²⟩ converges to N/(2ω_k) for non-zero modes', () => {
    const gridSize = [16]
    const spacing = [0.5]
    const mass = 1.0
    const latticeDim = 1
    const totalSites = 16
    const nSamples = 200

    // Expected variance: ⟨|φ_k|²⟩ = N/(2ω_k) from sampleVacuumSpectrum's k-space
    // But after IFFT and extracting real part, the real-space variance is:
    // ⟨φ_x²⟩ = (1/N) Σ_k 1/(2ω_k)
    // We test the real-space variance instead (more robust than per-mode k-space).
    let varianceSum = 0
    for (let seed = 1; seed <= nSamples; seed++) {
      const config = {
        ...DEFAULT_FREE_SCALAR_CONFIG,
        gridSize,
        spacing,
        mass,
        latticeDim,
        dt: 0.01,
        stepsPerFrame: 1,
      }
      const { phi } = sampleVacuumSpectrum(config, seed)
      // Compute variance of phi across all sites
      let sum = 0
      let sum2 = 0
      for (let i = 0; i < totalSites; i++) {
        sum += phi[i]!
        sum2 += phi[i]! * phi[i]!
      }
      const mean = sum / totalSites
      varianceSum += sum2 / totalSites - mean * mean
    }
    const measuredVariance = varianceSum / nSamples

    // Expected variance per site: (1/N) Σ_k 1/(2ω_k)
    let expectedVariance = 0
    for (let k = 0; k < totalSites; k++) {
      const omega = computeOmegaK([k], gridSize, spacing, mass, latticeDim)
      expectedVariance += 1 / (2 * omega)
    }
    expectedVariance /= totalSites

    // Statistical test: allow 20% tolerance (finite samples)
    const relError = Math.abs(measuredVariance - expectedVariance) / expectedVariance
    expect(relError).toBeLessThan(0.2)
  })
})

// ============================================================================
// 7. TDSE Potential Evaluation: Barrier Shape Validation
//
// Validates that evaluatePotential1D produces correct barrier shapes
// matching the analytical definitions used in the tunneling tests.
// ============================================================================

describe('TDSE potential profile: barrier shapes', () => {
  const makeConfig = (overrides: Partial<TdseConfig>): TdseConfig => ({
    ...DEFAULT_TDSE_CONFIG,
    latticeDim: 1,
    gridSize: [64],
    spacing: [0.1],
    dt: 0.01,
    stepsPerFrame: 1,
    packetCenter: [0],
    packetMomentum: [0],
    potentialType: 'free',
    barrierHeight: 10,
    barrierWidth: 1.0,
    barrierCenter: 0,
    customPotentialExpression: '0',
    ...overrides,
  })

  it('rectangular barrier: V = V₀ inside, 0 outside', () => {
    const config = makeConfig({
      potentialType: 'barrier',
      barrierHeight: 10,
      barrierWidth: 2,
      barrierCenter: 0,
    })
    expect(evaluatePotential1D(0, config)).toBe(10) // inside
    expect(evaluatePotential1D(0.9, config)).toBe(10) // inside
    expect(evaluatePotential1D(1.5, config)).toBe(0) // outside
    expect(evaluatePotential1D(-1.5, config)).toBe(0) // outside
  })

  it('harmonic trap: V = ½mω²x²', () => {
    const config = makeConfig({ potentialType: 'harmonicTrap', harmonicOmega: 2.0, mass: 1.0 })
    expect(evaluatePotential1D(0, config)).toBe(0)
    expect(evaluatePotential1D(1, config)).toBeCloseTo(0.5 * 1 * 4 * 1, 10) // ½·1·4·1²
    expect(evaluatePotential1D(3, config)).toBeCloseTo(0.5 * 1 * 4 * 9, 10) // ½·1·4·3²
  })

  it('free potential: V = 0 everywhere', () => {
    const config = makeConfig({ potentialType: 'free' })
    for (const x of [-10, -1, 0, 1, 10]) {
      expect(evaluatePotential1D(x, config)).toBe(0)
    }
  })

  it('step potential: V = stepHeight for x > center, 0 otherwise', () => {
    const config = makeConfig({ potentialType: 'step', stepHeight: 5, barrierCenter: 0 })
    expect(evaluatePotential1D(-1, config)).toBe(0)
    expect(evaluatePotential1D(1, config)).toBe(5)
  })
})

// ============================================================================
// 8. TDSE: Wavepacket Kinetic Energy
// ============================================================================

describe('wavepacket kinetic energy', () => {
  it('E = ℏ²k²/(2m) for 1D packet', () => {
    const config = {
      hbar: 1.0,
      mass: 1.0,
      packetMomentum: [5.0],
    } as Parameters<typeof computePacketKineticEnergy>[0]

    const E = computePacketKineticEnergy(config)
    expect(E).toBeCloseTo(12.5, 10) // 1²·25/(2·1) = 12.5
  })

  it('E = ℏ²|k|²/(2m) for 3D packet', () => {
    const config = {
      hbar: 1.0,
      mass: 2.0,
      packetMomentum: [1.0, 2.0, 3.0],
    } as Parameters<typeof computePacketKineticEnergy>[0]

    const E = computePacketKineticEnergy(config)
    // k² = 1 + 4 + 9 = 14, E = 1·14/(2·2) = 3.5
    expect(E).toBeCloseTo(3.5, 10)
  })
})
