/**
 * Static source-inspection tests guarding Findings 4 and 5: the rendered
 * energy-density view and the singleMode/gaussianPacket initializers must
 * consume the cosmology-aware `params.mEffSq` (not `params.mass * params.mass`)
 * so the on-screen Hamiltonian matches the Mukhanov-Sasaki solver's
 * effective mass at every `η`.
 *
 * Shader sources are plain template literals, so we can grep their text
 * without spinning up WebGPU. These assertions fail if a future edit
 * reintroduces the flat-space `mass²` path.
 */

import { describe, expect, it } from 'vitest'

import { freeScalarInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'

describe('free scalar cosmology shader rewrites', () => {
  it('writeGrid shader energy density uses mEffSq, not mass²', () => {
    // Finding 4: the energy density view must mirror the solver's effective
    // mass so the rendered Hamiltonian tracks M²_eff(η) under cosmology.
    // Regression guard: any reappearance of `params.mass * params.mass`
    // outside of a cosmology-aware context would indicate the bug is back.
    expect(freeScalarWriteGridBlock).not.toContain('params.mass * params.mass')
    expect(freeScalarWriteGridBlock).toContain('params.mEffSq')
  })

  it('init shader singleMode + gaussianPacket branches use mEffSq', () => {
    // Finding 5: the initial conjugate-momentum kick for singleMode and
    // gaussianPacket uses omega = sqrt(k_lat² + M²). Under cosmology this
    // must be the effective mass, otherwise the very first pi-update
    // transitions from flat-space omega to curved-space omega and the
    // initial phase is off by a step.
    expect(freeScalarInitBlock).not.toContain('params.mass * params.mass')
    // Both init branches use mEffSq as the starting omega² accumulator.
    const mEffSqMatches = freeScalarInitBlock.match(/omegaSq: f32 = params\.mEffSq/g) ?? []
    expect(mEffSqMatches.length).toBe(2)
  })

  it('init shader guards sqrt against negative omega²', () => {
    // Tachyonic super-horizon cosmology can drive k_lat² + mEffSq < 0 in
    // pathological parameter combinations. Guard sqrt to keep omega real.
    expect(freeScalarInitBlock).toContain('sqrt(max(omegaSq, 0.0))')
  })
})
