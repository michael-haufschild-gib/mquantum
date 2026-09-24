/**
 * Kink initial condition — static domain wall.
 *
 * Regression: the kinkProfile seed used `v·tanh(x / packetWidth)`, but the
 * UI hides the width slider for this condition and the pi-update force is
 * V'(φ) = 4λφ(φ² − v²), whose static wall has w = 1/(v·√(2λ)). The shipped
 * "Domain Wall (Kink)" preset (λ = 0.5, w = 0.4) therefore started 2.5×
 * too narrow and breathed / radiated instead of being the "stable soliton"
 * it advertises. The shader now derives w (and v_eff with a mass term) from
 * the potential; the preset's λ keeps the intended w = 0.4.
 *
 * @module tests/lib/physics/freeScalar/kinkStaticWall
 */

import { describe, expect, it } from 'vitest'

import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { freeScalarInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'

/** Static-wall width of V = λ(φ² − v²)² (Minkowski, m = 0). */
function staticKinkWidth(lambda: number, vev: number): number {
  return 1 / (Math.abs(vev) * Math.sqrt(2 * lambda))
}

/**
 * max |∇²φ − V'(φ)| / max |V'(φ)| for φ = v·tanh(x / w) on a 1-D lattice with
 * the pi-update's 3-point Laplacian — 0 for an exact static solution up to the
 * O((a/w)²) discretization error.
 */
function staticResidual(lambda: number, vev: number, width: number, spacing: number): number {
  const n = 64
  const phi = Array.from({ length: n }, (_, i) => vev * Math.tanh(((i - n / 2) * spacing) / width))
  let maxResidual = 0
  let maxForce = 0
  for (let i = 1; i < n - 1; i++) {
    const lap = (phi[i + 1]! - 2 * phi[i]! + phi[i - 1]!) / (spacing * spacing)
    const vPrime = 4 * lambda * phi[i]! * (phi[i]! * phi[i]! - vev * vev)
    maxResidual = Math.max(maxResidual, Math.abs(lap - vPrime))
    maxForce = Math.max(maxForce, Math.abs(vPrime))
  }
  return maxResidual / maxForce
}

describe('kink initial condition — static wall', () => {
  it('the Domain Wall preset seeds the static wall of its own potential', () => {
    const preset = FREE_SCALAR_PRESETS.find((p) => p.id === 'domainWall')
    if (!preset) throw new Error('domainWall preset missing')
    const o = preset.overrides
    expect(o.initialCondition).toBe('kinkProfile')
    expect(o.mass).toBe(0)
    expect(staticKinkWidth(o.selfInteractionLambda!, o.selfInteractionVev!)).toBeCloseTo(0.4, 12)
  })

  it('w = 1/(v√(2λ)) solves the lattice static equation; a mismatched width does not', () => {
    const spacing = 0.1
    // Static width at the preset coupling: only lattice discretization error remains.
    expect(staticResidual(3.125, 1, staticKinkWidth(3.125, 1), spacing)).toBeLessThan(0.05)
    // The old preset (λ = 0.5 with w = 0.4): the wall is far from equilibrium.
    expect(staticResidual(0.5, 1, 0.4, spacing)).toBeGreaterThan(1)
  })

  it('derives the width and v_eff from the potential in the shader', () => {
    expect(freeScalarInitBlock).toContain(
      'let vEff2 = v * v - params.mass * params.mass * params.massSquaredScale / (4.0 * lambda);'
    )
    expect(freeScalarInitBlock).toContain('w = sqrt(aPot / (2.0 * lambda * vEff2 * aFull));')
    expect(freeScalarInitBlock).toContain('phiVal = kinkAmp * tanh(dx / w);')
  })
})
