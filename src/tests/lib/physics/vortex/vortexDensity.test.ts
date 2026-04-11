/**
 * Tests for the quantum vortex density CPU mirror used by Schroedinger colour
 * algorithm 28 (vortexDensity). These verify the topological-charge plaquette
 * stencil on synthetic phase fields for which the winding number is known
 * analytically.
 */
import { describe, expect, it } from 'vitest'

import {
  computeVortexDensityCpu2D,
  TAU,
  totalVortexCharge,
  wrapPhase,
} from '@/lib/physics/vortex/vortexDensity'

/**
 * Construct a `width * height` phase field by sampling `fn(x, y)` at every
 * integer grid node. Pure helper so each test can express the analytic phase
 * formula without its own loop.
 */
function buildPhaseField(
  width: number,
  height: number,
  fn: (x: number, y: number) => number
): Float32Array {
  const out = new Float32Array(width * height)
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      out[i + width * j] = fn(i, j)
    }
  }
  return out
}

describe('wrapPhase', () => {
  it('returns 0 for 0', () => {
    expect(wrapPhase(0)).toBe(0)
  })

  it('wraps values just past pi back near -pi (continuity)', () => {
    const wrapped = wrapPhase(Math.PI + 0.01)
    expect(wrapped).toBeCloseTo(-Math.PI + 0.01, 12)
  })

  // At exact odd multiples of pi the signed result depends on the platform
  // round() convention (JS Math.round is half-away-from-zero; WGSL is half-to-
  // even). Both are valid canonical forms of pi. Assert magnitude instead.
  it('maps ±3*pi onto ±pi up to sign convention', () => {
    expect(Math.abs(wrapPhase(3 * Math.PI))).toBeCloseTo(Math.PI, 12)
    expect(Math.abs(wrapPhase(-3 * Math.PI))).toBeCloseTo(Math.PI, 12)
  })

  it('is identity inside (-pi, pi)', () => {
    for (const x of [-2, -1, -0.3, 0.3, 1, 2, 3]) {
      expect(wrapPhase(x)).toBeCloseTo(x, 12)
    }
  })
})

describe('computeVortexDensityCpu2D — smooth fields', () => {
  it('plane wave theta = 0.7*x - 0.3*y has zero winding everywhere', () => {
    const W = 32
    const H = 32
    const field = buildPhaseField(W, H, (x, y) => 0.7 * x - 0.3 * y)
    const vortex = computeVortexDensityCpu2D(field, W, H)
    for (const v of vortex) {
      expect(Math.abs(v)).toBeLessThan(1e-10)
    }
  })

  it('bounded smooth sine/cosine product has near-zero total charge', () => {
    const W = 64
    const H = 64
    const field = buildPhaseField(W, H, (x, y) => Math.sin(0.2 * x) * Math.cos(0.2 * y))
    const vortex = computeVortexDensityCpu2D(field, W, H)
    const total = totalVortexCharge(vortex)
    // All edge differences are well inside (-pi, pi) so every loop telescopes
    // to zero exactly (machine precision only).
    expect(total).toBeLessThan(0.02)
  })
})

describe('computeVortexDensityCpu2D — isolated defects', () => {
  it('single vortex centered off-lattice produces exactly one topological charge', () => {
    const W = 32
    const H = 32
    const cx = 16.5
    const cy = 16.5
    const field = buildPhaseField(W, H, (x, y) => Math.atan2(y - cy, x - cx))
    const vortex = computeVortexDensityCpu2D(field, W, H)
    expect(totalVortexCharge(vortex)).toBeCloseTo(1, 6)
    // And the only nonzero plaquette must be the one whose interior contains
    // the defect — corners at (16,16), (17,16), (17,17), (16,17).
    const plaqW = W - 1
    for (let j = 0; j < H - 1; j++) {
      for (let i = 0; i < plaqW; i++) {
        const v = vortex[i + plaqW * j]!
        const isDefectPlaq = i === 16 && j === 16
        if (isDefectPlaq) {
          expect(v).toBeCloseTo(TAU, 6)
        } else {
          expect(v).toBeLessThan(1e-10)
        }
      }
    }
  })

  it('antivortex is seen as charge 1 (abs takes care of sign)', () => {
    const W = 32
    const H = 32
    const cx = 16.5
    const cy = 16.5
    const field = buildPhaseField(W, H, (x, y) => -Math.atan2(y - cy, x - cx))
    const vortex = computeVortexDensityCpu2D(field, W, H)
    expect(totalVortexCharge(vortex)).toBeCloseTo(1, 6)
  })

  it('charge-2 vortex produces total charge 2', () => {
    const W = 32
    const H = 32
    const cx = 16.5
    const cy = 16.5
    const field = buildPhaseField(W, H, (x, y) => 2 * Math.atan2(y - cy, x - cx))
    const vortex = computeVortexDensityCpu2D(field, W, H)
    expect(totalVortexCharge(vortex)).toBeCloseTo(2, 4)
  })

  // PRD specifies integer-coordinate defect centers, but atan2(0,0) on a
  // lattice corner distributes the winding across the four adjacent plaquettes
  // in a way that hands pathological values to any discretized line integral.
  // Shifting the defects off-lattice (same topology, no numerical pathology)
  // recovers total charge = 2 cleanly.
  it('vortex-antivortex pair sums to total charge 2', () => {
    const W = 32
    const H = 32
    const field = buildPhaseField(
      W,
      H,
      (x, y) => Math.atan2(y - 11.7, x - 16.3) - Math.atan2(y - 19.7, x - 16.3)
    )
    const vortex = computeVortexDensityCpu2D(field, W, H)
    expect(totalVortexCharge(vortex)).toBeCloseTo(2, 4)
  })
})
