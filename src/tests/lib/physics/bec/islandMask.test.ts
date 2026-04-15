/**
 * Unit tests for the analog-Hawking quantum-extremal island membership
 * predicate. Mirrors the WGSL `voxelIsInIsland` logic in
 * `tdseWriteGrid.wgsl.ts` — if any of these tests fail the shader overlay
 * is almost certainly wrong too.
 *
 * @module tests/lib/physics/bec/islandMask
 */

import { describe, expect, it } from 'vitest'

import { isVoxelInIsland } from '@/lib/physics/bec/islandMask'

describe('isVoxelInIsland', () => {
  it('returns false when radius is zero (empty island)', () => {
    const centerX0 = 1.2
    const wx: [number, number, number] = [centerX0, 0, 0]
    expect(isVoxelInIsland(wx, centerX0, 0)).toBe(false)
  })

  it('returns true at the horizon centroid when the radius is positive', () => {
    const centerX0 = 1.2
    const wx: [number, number, number] = [centerX0, 0, 0]
    expect(isVoxelInIsland(wx, centerX0, 3)).toBe(true)
  })

  it('returns false on the subsonic side regardless of radius', () => {
    const centerX0 = 1.2
    // Voxel on the opposite half-axis from the horizon (and its mirror).
    const wx: [number, number, number] = [-5.0, 0, 0]
    // Even with a huge radius the supersonic-side gate must reject.
    expect(isVoxelInIsland(wx, centerX0, 1e6)).toBe(false)
  })

  it('returns false on the supersonic side when the voxel is outside the ball', () => {
    const centerX0 = 1.0
    // Supersonic (same sign, |x| ≥ |cx|) but Euclidean distance exceeds radius.
    const wx: [number, number, number] = [5.0, 0, 0]
    expect(isVoxelInIsland(wx, centerX0, 1.0)).toBe(false)
  })

  it('returns true for a voxel just inside the horizon + ε on the supersonic side', () => {
    const centerX0 = 1.2
    const eps = 1e-3
    const wx: [number, number, number] = [centerX0 + eps, 0, 0]
    expect(isVoxelInIsland(wx, centerX0, 0.5)).toBe(true)
  })

  it('treats centerX0 == 0 as "no horizon" — ball centres at the origin', () => {
    // Voxel anywhere on the sphere of radius 0.5 at origin → inside a ball of radius 1.
    expect(isVoxelInIsland([0.3, 0.2, -0.2], 0, 1)).toBe(true)
    // Voxel far from origin → outside a small ball.
    expect(isVoxelInIsland([5, 0, 0], 0, 1)).toBe(false)
  })

  it('respects the 3D Euclidean ball — y and z also count', () => {
    const centerX0 = 1.0
    // Supersonic side (wx[0] = centerX0, same sign), but y² + z² exceeds r².
    const wx: [number, number, number] = [centerX0, 0.8, 0.8]
    // r = 1 → r² = 1, y² + z² = 1.28 > 1.
    expect(isVoxelInIsland(wx, centerX0, 1)).toBe(false)
    // Same voxel with a larger ball.
    expect(isVoxelInIsland(wx, centerX0, 2)).toBe(true)
  })

  it('rejects non-finite radius, center, or voxel coords', () => {
    const wx: [number, number, number] = [1, 0, 0]
    expect(isVoxelInIsland(wx, 1, Number.NaN)).toBe(false)
    expect(isVoxelInIsland(wx, Number.NaN, 1)).toBe(false)
    expect(isVoxelInIsland([Number.NaN, 0, 0], 1, 1)).toBe(false)
    expect(isVoxelInIsland(wx, 1, Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('mirrors across the origin: negative-sign horizon accepts negative-x voxels', () => {
    // A horizon on the negative x-axis accepts supersonic voxels at x ≤ centerX0.
    const centerX0 = -1.2
    const wxSupersonic: [number, number, number] = [-2, 0, 0]
    const wxSubsonic: [number, number, number] = [2, 0, 0]
    expect(isVoxelInIsland(wxSupersonic, centerX0, 2)).toBe(true)
    expect(isVoxelInIsland(wxSubsonic, centerX0, 2)).toBe(false)
  })
})
