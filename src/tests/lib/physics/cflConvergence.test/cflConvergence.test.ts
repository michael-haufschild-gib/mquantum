/**
 * CFL stability boundary test for the Klein-Gordon leapfrog integrator.
 *
 * Verifies that `computeCflLimit` correctly predicts the stability boundary:
 * - Below the CFL limit: field energy stays bounded (symplectic conservation)
 * - Above the CFL limit: field energy grows exponentially (instability)
 *
 * Uses a minimal 1D Klein-Gordon lattice mirroring the WGSL leapfrog in
 * `freeScalarUpdatePi.wgsl.ts` and `freeScalarUpdatePhi.wgsl.ts`.
 *
 * Reference: Leapfrog stability condition dt < 2/ω_max.
 * See: https://en.wikipedia.org/wiki/Leapfrog_integration
 */
import { describe, expect, it } from 'vitest'

import { computeCflLimit } from '@/stores/slices/geometry/setters/sliceSetterUtils'

/**
 * Run a 1D Klein-Gordon leapfrog for `steps` iterations on a periodic lattice.
 * Returns the total energy H = 0.5 Σ[π² + (∇φ)² + m²φ²] at the end.
 *
 * Mirrors the WGSL compute shaders:
 * - freeScalarUpdatePi: π += dt · (∇²φ - m²φ)
 * - freeScalarUpdatePhi: φ += dt · π
 */
function runLeapfrog1D(
  N: number,
  spacing: number,
  mass: number,
  dt: number,
  steps: number
): { finalEnergy: number; initialEnergy: number } {
  const phi = new Float64Array(N)
  const pi = new Float64Array(N)

  const a2 = spacing * spacing

  // Initial condition: localized Gaussian bump
  const center = N / 2
  const sigma = N * spacing * 0.1
  for (let i = 0; i < N; i++) {
    const x = (i - center) * spacing
    phi[i] = Math.exp((-x * x) / (2 * sigma * sigma))
  }

  const computeEnergy = (): number => {
    let energy = 0
    for (let i = 0; i < N; i++) {
      const fwd = (i + 1) % N
      const grad = (phi[fwd]! - phi[i]!) / spacing
      energy += 0.5 * (pi[i]! * pi[i]! + grad * grad + mass * mass * phi[i]! * phi[i]!)
    }
    return energy * spacing // integrate over lattice
  }

  const initialEnergy = computeEnergy()

  for (let step = 0; step < steps; step++) {
    // Update pi (mirrors freeScalarUpdatePi.wgsl.ts)
    for (let i = 0; i < N; i++) {
      const fwd = (i + 1) % N
      const bwd = (i - 1 + N) % N
      const laplacian = (phi[fwd]! - 2 * phi[i]! + phi[bwd]!) / a2
      pi[i] = pi[i]! + dt * (laplacian - mass * mass * phi[i]!)
    }
    // Update phi (mirrors freeScalarUpdatePhi.wgsl.ts)
    for (let i = 0; i < N; i++) {
      phi[i] = phi[i]! + dt * pi[i]!
    }
  }

  return { finalEnergy: computeEnergy(), initialEnergy }
}

describe('computeCflLimit', () => {
  it('matches the analytical formula dt_max = 2/sqrt(m^2 + (2/a)^2) for 1D', () => {
    const spacing = [0.1]
    const mass = 1.0
    const expected = 2 / Math.sqrt(mass * mass + (2 / 0.1) ** 2)
    expect(computeCflLimit(spacing, 1, mass)).toBeCloseTo(expected, 10)
  })

  it('decreases with more dimensions (more Laplacian eigenvalues)', () => {
    const spacing1D = [0.1]
    const spacing3D = [0.1, 0.1, 0.1]
    const mass = 1.0
    const cfl1D = computeCflLimit(spacing1D, 1, mass)
    const cfl3D = computeCflLimit(spacing3D, 3, mass)
    expect(cfl3D).toBeLessThan(cfl1D)
  })

  it('decreases with smaller spacing (higher frequency modes)', () => {
    const mass = 1.0
    const cflCoarse = computeCflLimit([0.2], 1, mass)
    const cflFine = computeCflLimit([0.05], 1, mass)
    expect(cflFine).toBeLessThan(cflCoarse)
  })
})

describe('CFL stability boundary (1D Klein-Gordon leapfrog)', () => {
  const N = 64
  const spacing = 0.1
  const mass = 1.0
  const cflLimit = computeCflLimit([spacing], 1, mass)
  const steps = 500

  it('below CFL limit: energy stays bounded', () => {
    const dt = cflLimit * 0.8 // 20% below limit
    const { initialEnergy, finalEnergy } = runLeapfrog1D(N, spacing, mass, dt, steps)

    // Symplectic integrator: energy oscillates but stays bounded.
    // Allow 50% relative variation (symplectic energy oscillation).
    const relativeChange = Math.abs(finalEnergy - initialEnergy) / Math.max(initialEnergy, 1e-10)
    expect(relativeChange).toBeLessThan(0.5)
    expect(Number.isFinite(finalEnergy)).toBe(true)
  })

  it('above CFL limit: energy grows exponentially (instability)', () => {
    const dt = cflLimit * 1.2 // 20% above limit
    const { initialEnergy, finalEnergy } = runLeapfrog1D(N, spacing, mass, dt, steps)

    // Unstable: energy should grow by orders of magnitude.
    // With 500 steps at 20% above CFL, exponential growth is dramatic.
    expect(finalEnergy / Math.max(initialEnergy, 1e-10)).toBeGreaterThan(100)
  })

  it('well below CFL limit: energy drift is small (symplectic conservation)', () => {
    const dt = cflLimit * 0.5 // 50% below limit
    const { initialEnergy, finalEnergy } = runLeapfrog1D(N, spacing, mass, dt, steps)

    // Tighter bound: energy should be conserved to within a few percent
    const relativeChange = Math.abs(finalEnergy - initialEnergy) / Math.max(initialEnergy, 1e-10)
    expect(relativeChange).toBeLessThan(0.1)
  })
})
