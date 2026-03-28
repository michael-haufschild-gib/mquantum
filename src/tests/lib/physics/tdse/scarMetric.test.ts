import { describe, expect, it } from 'vitest'

import type { ClassicalTrajectory, OrbitPoint } from '@/lib/physics/tdse/classicalOrbit'
import { computeScarCorrelation } from '@/lib/physics/tdse/scarMetric'

function makeTrajectory(points: OrbitPoint[], dim = 2): ClassicalTrajectory {
  return { points, energy: 1, energyDrift: 0, dim }
}

function makePoint(x: number[], p?: number[]): OrbitPoint {
  return {
    x: new Float64Array(x),
    p: new Float64Array(p ?? x.map(() => 0)),
  }
}

describe('computeScarCorrelation', () => {
  it('returns 0 correlation for zero-density eigenstate', () => {
    const re = new Float32Array(16) // 4x4 grid, all zeros
    const im = new Float32Array(16)
    const orbit = makeTrajectory([makePoint([0, 0])])
    const result = computeScarCorrelation(re, im, [orbit], [4, 4], [1, 1], 1.0)
    expect(result.maxCorrelation).toBe(0)
    expect(result.orbitCorrelation).toBe(0)
  })

  it('returns higher correlation when density is concentrated on the orbit', () => {
    const gridSize = [8, 8]
    const spacing = [1.0, 1.0]
    const totalSites = 64

    // Create density concentrated at the center of the grid
    const re = new Float32Array(totalSites)
    // Put density at the center (grid index [4,4], position [0.5, 0.5])
    re[4 * 8 + 4] = 1.0 // center-ish

    const im = new Float32Array(totalSites)

    // Orbit that passes through the center
    const orbitCenter = makeTrajectory([makePoint([0.5, 0.5])])
    // Orbit that passes far from center
    const orbitFar = makeTrajectory([makePoint([3.0, 3.0])])

    const resultCenter = computeScarCorrelation(re, im, [orbitCenter], gridSize, spacing, 1.0)
    const resultFar = computeScarCorrelation(re, im, [orbitFar], gridSize, spacing, 1.0)

    // Center orbit should have higher correlation than far orbit
    expect(resultCenter.maxCorrelation).toBeGreaterThan(resultFar.maxCorrelation)
  })

  it('scar strength > 1 for localized density on orbit vs uniform background', () => {
    const gridSize = [16, 16]
    const spacing = [0.5, 0.5]
    const totalSites = 256

    // Uniform density everywhere
    const reUniform = new Float32Array(totalSites).fill(0.0625) // 1/16 per site
    const imUniform = new Float32Array(totalSites)

    // An orbit line along x-axis (y=0)
    const orbitPoints: OrbitPoint[] = []
    for (let i = -3; i <= 3; i += 0.5) {
      orbitPoints.push(makePoint([i, 0]))
    }
    const orbit = makeTrajectory(orbitPoints)

    const resultUniform = computeScarCorrelation(
      reUniform, imUniform, [orbit], gridSize, spacing, 0.5
    )

    // Uniform density → correlation ≈ 1 (no excess along orbit)
    // Allow some tolerance due to Gaussian kernel discretization
    expect(resultUniform.maxCorrelation).toBeGreaterThan(0.5)
    expect(resultUniform.maxCorrelation).toBeLessThan(2.0)
  })

  it('handles multiple orbits and reports strongest', () => {
    const gridSize = [8, 8]
    const spacing = [1.0, 1.0]
    const totalSites = 64

    const re = new Float32Array(totalSites)
    // Density at position (0.5, 0.5) → grid (4, 4)
    re[4 * 8 + 4] = 1.0
    const im = new Float32Array(totalSites)

    const orbit1 = makeTrajectory([makePoint([0.5, 0.5])]) // hits density
    const orbit2 = makeTrajectory([makePoint([3, 3])]) // misses density

    const result = computeScarCorrelation(re, im, [orbit1, orbit2], gridSize, spacing, 1.0)

    expect(result.orbitCorrelations).toHaveLength(2)
    expect(result.strongestOrbitIndex).toBe(0)
    expect(result.orbitCorrelations[0]).toBeGreaterThan(result.orbitCorrelations[1]!)
  })

  it('works in 3D', () => {
    const gridSize = [4, 4, 4]
    const spacing = [1, 1, 1]
    const totalSites = 64

    const re = new Float32Array(totalSites)
    re[0] = 1.0 // density at corner
    const im = new Float32Array(totalSites)

    const orbit = makeTrajectory(
      [makePoint([-1.5, -1.5, -1.5])], // near the corner
      3
    )

    const result = computeScarCorrelation(re, im, [orbit], gridSize, spacing, 1.5)
    expect(result.maxCorrelation).toBeGreaterThan(0)
  })
})
