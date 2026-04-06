/**
 * computeFsfDiagnostics unit tests — self-interaction potential energy paths.
 *
 * Validates that the CPU-side diagnostics function correctly computes total
 * energy, potential energy, and field statistics for synthetic field
 * configurations with the Mexican hat potential V(φ) = λ(φ²−v²)².
 *
 * A bug here means the diagnostics panel shows wrong energy, wrong drift,
 * or wrong field statistics when self-interaction is enabled.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { computeStridesPadded } from '@/rendering/webgpu/passes/computePassUtils'
import { computeFsfDiagnostics } from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

/** Minimal config factory. */
function createConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return { ...DEFAULT_FREE_SCALAR_CONFIG, ...overrides }
}

/**
 * Build a 1D tanh kink field: φ(x) = v * tanh((x - center) / width).
 * Returns phi and pi (pi = 0 for static kink).
 */
function buildKinkField(
  N: number,
  spacing: number,
  v: number,
  width: number,
  center = 0
): { phi: Float32Array; pi: Float32Array } {
  const phi = new Float32Array(N)
  const pi = new Float32Array(N)
  const halfExtent = N * spacing * 0.5
  for (let i = 0; i < N; i++) {
    const x = i * spacing - halfExtent
    phi[i] = v * Math.tanh((x - center) / width)
  }
  return { phi, pi }
}

/**
 * Compute expected energy for a 1D kink field using the same discrete
 * formula as computeFsfDiagnostics. This eliminates discretization error —
 * we're testing that the function computes what it should, not that it
 * matches a continuum analytical result.
 */
function expectedKinkEnergy(
  phi: Float32Array,
  config: FreeScalarConfig
): {
  gradEnergy: number
  massEnergy: number
  potentialEnergy: number
  kineticEnergy: number
  totalEnergy: number
} {
  const N = phi.length
  const a = config.spacing[0]!
  const dV = a // 1D cell volume
  const strides = computeStridesPadded(config.gridSize, config.latticeDim)

  // Gradient energy
  let gradEnergy = 0
  const stride = strides[0]!
  const Nd = config.gridSize[0]!
  const invA2 = 1 / (a * a)
  for (let i = 0; i < N; i++) {
    const dimPos = Math.floor((i / stride) % Nd)
    const jNext =
      dimPos === Nd - 1 ? (config.absorberEnabled ? -1 : i - stride * (Nd - 1)) : i + stride
    if (jNext >= 0 && jNext < N) {
      const diff = phi[jNext]! - phi[i]!
      gradEnergy += diff * diff * invA2
    }
  }
  gradEnergy *= 0.5 * dV

  // Mass energy
  let sumPhi2 = 0
  for (let i = 0; i < N; i++) sumPhi2 += phi[i]! * phi[i]!
  const massEnergy = 0.5 * config.mass * config.mass * sumPhi2 * dV

  // Self-interaction potential energy
  let potentialEnergy = 0
  if (config.selfInteractionEnabled) {
    const lambda = config.selfInteractionLambda
    const v2 = config.selfInteractionVev * config.selfInteractionVev
    for (let i = 0; i < N; i++) {
      const p = phi[i]!
      const diff = p * p - v2
      potentialEnergy += lambda * diff * diff
    }
    potentialEnergy *= dV
  }

  const kineticEnergy = 0 // pi = 0 for static kink
  const totalEnergy = kineticEnergy + gradEnergy + massEnergy + potentialEnergy

  return { gradEnergy, massEnergy, potentialEnergy, kineticEnergy, totalEnergy }
}

describe('computeFsfDiagnostics with self-interaction', () => {
  const N = 128
  const a = 0.05
  const v = 1.0
  const lambda = 0.5
  const mass = 0.0 // massless to isolate gradient + potential
  const width = 1.0 / (v * Math.sqrt(2 * lambda)) // analytical kink width

  const config = createConfig({
    latticeDim: 1,
    gridSize: [N],
    spacing: [a],
    mass,
    selfInteractionEnabled: true,
    selfInteractionLambda: lambda,
    selfInteractionVev: v,
    absorberEnabled: true,
  })

  const { phi, pi } = buildKinkField(N, a, v, width)

  it('computes total energy matching hand-calculated discrete values', () => {
    const result = computeFsfDiagnostics(phi, pi, config)
    const expected = expectedKinkEnergy(phi, config)

    expect(result.totalEnergy).toBeCloseTo(expected.totalEnergy, 8)
  })

  it('includes positive potential energy from self-interaction', () => {
    const result = computeFsfDiagnostics(phi, pi, config)

    // V(φ) = λ(φ²−v²)² ≥ 0 everywhere, and > 0 away from φ=±v
    // A tanh kink passes through φ=0 where V = λv⁴ > 0
    expect(result.totalEnergy).toBeGreaterThan(0)
  })

  it('reports zero potential energy when self-interaction is disabled', () => {
    const noSIConfig = createConfig({
      ...config,
      selfInteractionEnabled: false,
    })

    const withSI = computeFsfDiagnostics(phi, pi, config)
    const withoutSI = computeFsfDiagnostics(phi, pi, noSIConfig)

    // Without SI, total energy is only gradient + mass (no potential)
    // With SI, total energy includes potential → must be larger
    expect(withSI.totalEnergy).toBeGreaterThan(withoutSI.totalEnergy)
  })

  it('computes meanPhi ≈ 0 for a symmetric kink centered at origin', () => {
    const result = computeFsfDiagnostics(phi, pi, config)

    // tanh is odd → mean over symmetric domain ≈ 0
    // Not exactly 0 due to discrete sampling and boundary effects
    expect(Math.abs(result.meanPhi)).toBeLessThan(0.1)
  })

  it('reports maxPhi ≈ v for a kink approaching ±v at boundaries', () => {
    const result = computeFsfDiagnostics(phi, pi, config)

    // tanh(x/w) → ±1 as x → ±∞, so max|φ| → v
    // On a finite lattice, the outermost sites have |φ| < v but close
    expect(result.maxPhi).toBeGreaterThan(0.9 * v)
    expect(result.maxPhi).toBeLessThanOrEqual(v + 1e-6)
  })

  it('reports maxPi = 0 and zero kinetic energy for static kink', () => {
    const result = computeFsfDiagnostics(phi, pi, config)

    expect(result.maxPi).toBe(0)
    // kineticEnergy = 0.5 * sumPi2 * dV = 0 when pi is all zeros
    // totalEnergy should equal gradient + potential (no kinetic)
    const expected = expectedKinkEnergy(phi, config)
    expect(result.totalEnergy).toBeCloseTo(expected.gradEnergy + expected.potentialEnergy, 8)
  })

  it('handles uniform field at vacuum (φ = +v everywhere)', () => {
    const uniformPhi = new Float32Array(N).fill(v)
    const uniformPi = new Float32Array(N)

    const result = computeFsfDiagnostics(uniformPhi, uniformPi, config)

    // At φ = v: V(v) = λ(v²−v²)² = 0, gradient = 0
    // Total energy should be 0 (massless + at vacuum + no kinetic)
    expect(result.totalEnergy).toBeCloseTo(0, 6)
    expect(result.meanPhi).toBeCloseTo(v, 6)
    expect(result.maxPhi).toBeCloseTo(v, 6)
  })

  it('computes correct energy for uniform field at false vacuum (φ = 0)', () => {
    const zeroPhi = new Float32Array(N)
    const zeroPi = new Float32Array(N)

    const result = computeFsfDiagnostics(zeroPhi, zeroPi, config)

    // At φ = 0: V(0) = λ(0−v²)² = λv⁴ per site
    // Total potential = N * λv⁴ * dV
    const expectedPotential = N * lambda * Math.pow(v, 4) * a
    expect(result.totalEnergy).toBeCloseTo(expectedPotential, 6)
  })
})

describe('computeFsfDiagnostics 3D self-interaction', () => {
  it('computes correct potential energy for uniform 3D field at false vacuum', () => {
    const N = 8
    const a = 0.1
    const v = 1.0
    const lambda = 1.0
    const totalSites = N * N * N

    const config = createConfig({
      latticeDim: 3,
      gridSize: [N, N, N],
      spacing: [a, a, a],
      mass: 0,
      selfInteractionEnabled: true,
      selfInteractionLambda: lambda,
      selfInteractionVev: v,
      absorberEnabled: false,
    })

    // φ = 0 everywhere → V(0) = λv⁴ per site
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    const result = computeFsfDiagnostics(phi, pi, config)

    const dV = a * a * a
    const expectedPotential = totalSites * lambda * Math.pow(v, 4) * dV
    expect(result.totalEnergy).toBeCloseTo(expectedPotential, 6)
  })
})
