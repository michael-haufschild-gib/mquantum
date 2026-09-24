/**
 * Pauli "Double Well" potential must actually have two wells.
 *
 * Regression: potentialType 3 ("Double Well") evaluated
 * V = V₀(1 − exp(−|x|²/W²)) — a single radial Gaussian well with one minimum
 * at the origin, so the advertised tunneling between wells could not occur.
 * It is now the directional quartic V = V₀((x₀² − a²)/a²)², a = W/2 (the same
 * shape family as the TDSE double well), mirrored in the display overlay.
 *
 * @module tests/rendering/webgpu/shaders/pauliDoubleWellPotential
 */

import { describe, expect, it } from 'vitest'

import {
  pauliPotential3DBlock,
  pauliPotentialBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/pauliPotential.wgsl'
import { pauliWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pauliWriteGrid.wgsl'

/** TS mirror of the shader formula. */
function doubleWell(x0: number, wellDepth: number, wellWidth: number): number {
  const a = Math.max(wellWidth * 0.5, 1e-6)
  const q = (x0 * x0 - a * a) / (a * a)
  return wellDepth * q * q
}

describe('Pauli double-well potential', () => {
  it('has two degenerate minima at ±wellWidth/2 separated by a V₀ barrier', () => {
    const v0 = 5
    const w = 1.2
    expect(doubleWell(w / 2, v0, w)).toBe(0)
    expect(doubleWell(-w / 2, v0, w)).toBe(0)
    expect(doubleWell(0, v0, w)).toBe(v0)
    // Local maximum at the origin, rising again outside the wells.
    expect(doubleWell(0.05, v0, w)).toBeLessThan(v0)
    expect(doubleWell(w, v0, w)).toBeGreaterThan(v0)
  })

  it('emits the quartic in both fill variants and the overlay (no radial Gaussian left)', () => {
    for (const wgsl of [pauliPotentialBlock, pauliPotential3DBlock, pauliWriteGridBlock]) {
      expect(wgsl).toContain('let qDw = ')
      expect(wgsl).toContain('params.wellDepth * qDw * qDw')
      expect(wgsl).not.toMatch(/exp\(-r2(pot)? \/ W2\)/)
    }
  })
})
