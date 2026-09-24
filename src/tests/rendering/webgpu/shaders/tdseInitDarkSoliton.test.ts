/**
 * BEC dark-soliton initial condition — grey-soliton family.
 *
 * Regression: the init kernel used β = √(D² − v²) with an imaginary part v,
 * so for a depth D < 1 at rest the notch stayed black while the far-field
 * density fell to D²·n₀ — neither a grey soliton nor the Thomas-Fermi
 * background. Grey solitons satisfy β² + u² = 1 (depth β², speed u·c_s); the
 * kernel now takes u from the velocity or, at rest, from u = √(1 − D).
 *
 * @module tests/rendering/webgpu/shaders/tdseInitDarkSoliton
 */

import { describe, expect, it } from 'vitest'

import { tdseInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl'

/** TS mirror of the kernel's soliton parameter selection (unit background n₀ = 1). */
function solitonParams(depth: number, velocity: number): { u: number; beta: number } {
  const d = Math.min(Math.max(depth, 0), 1)
  const v = Math.min(Math.max(velocity, -0.99), 0.99)
  const u = Math.abs(v) < 1e-6 ? Math.sqrt(Math.max(1 - d, 0)) : v
  return { u, beta: Math.sqrt(Math.max(1 - u * u, 0)) }
}

/** |ψ|²/n₀ of the ansatz i·u + β·tanh(β·s) at the scaled coordinate s. */
function density(depth: number, velocity: number, s: number): number {
  const { u, beta } = solitonParams(depth, velocity)
  const re = beta * Math.tanh(beta * s)
  return re * re + u * u
}

describe('dark soliton initial condition', () => {
  it('keeps the Thomas-Fermi background far from the soliton for every depth / velocity', () => {
    for (const depth of [0, 0.25, 0.5, 0.75, 1]) {
      for (const velocity of [0, 0.3, -0.6]) {
        expect(density(depth, velocity, 60)).toBeCloseTo(1, 6)
      }
    }
  })

  it('carves a notch of the requested depth when at rest', () => {
    for (const depth of [0.25, 0.5, 0.75, 1]) {
      expect(1 - density(depth, 0, 0)).toBeCloseTo(depth, 12)
    }
  })

  it('ties the depth to the velocity (n_min = v²·n₀) when moving', () => {
    expect(density(1, 0.6, 0)).toBeCloseTo(0.36, 12)
  })

  it('emits the β² + u² = 1 parameterisation in the kernel', () => {
    expect(tdseInitBlock).toContain('uSoliton = sqrt(max(1.0 - depthParam, 0.0));')
    expect(tdseInitBlock).toContain('let beta = sqrt(max(1.0 - uSoliton * uSoliton, 0.0));')
    expect(tdseInitBlock).toContain('let solitonIm = uSoliton;')
    expect(tdseInitBlock).not.toContain('depthParam * depthParam - vFrac * vFrac')
  })
})

// Regression: the planeWave branch reused the Gaussian envelope on the
// assumption that the CPU widened packetWidth — it never did, so "Plane Wave"
// was identical to the Gaussian packet.
describe('plane-wave initial condition', () => {
  it('drops the Gaussian envelope', () => {
    const branch = tdseInitBlock.slice(
      tdseInitBlock.indexOf('params.initCondition == 1u'),
      tdseInitBlock.indexOf('params.initCondition == 2u')
    )
    expect(branch).toContain('reVal = params.packetAmplitude * cos(kdotx);')
    expect(branch).toContain('imVal = params.packetAmplitude * sin(kdotx);')
    expect(branch).not.toMatch(/envelope\s*\*/)
  })
})
