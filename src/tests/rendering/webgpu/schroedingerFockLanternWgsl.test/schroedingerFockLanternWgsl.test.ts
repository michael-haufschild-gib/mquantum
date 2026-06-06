import { describe, expect, it } from 'vitest'

import { schroedingerUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'
import { volumeIntegrationBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl'
import { volumeRaymarchHQBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchHQ.wgsl'

import { expectOrdered, functionSlice } from '../wgslTestHelpers'

describe('Schroedinger Fock Lantern WGSL composition', () => {
  it('declares Fock Lantern enable gate without growing the uniform struct', () => {
    expect(schroedingerUniformsBlock).toContain('_padEnergy: u32')
  })

  it('defines the parity-cell lantern scalar with density, phase, and gradient gates', () => {
    const active = functionSlice(volumeIntegrationBlock, 'isFockLanternActive')
    expect(active).toContain('uniforms.quantumMode == QUANTUM_MODE_HARMONIC')
    expect(active).toContain('uniforms._padEnergy != 0u')

    const midGate = functionSlice(volumeIntegrationBlock, 'computeFockLanternMidGate')
    expectOrdered(midGate, [
      'let peakDensity =',
      'let normalizedRho =',
      'return smoothstep(0.015, 0.22, normalizedRho)',
    ])

    const body = functionSlice(volumeIntegrationBlock, 'computeFockLanternFromGate')
    expectOrdered(body, [
      'if (midGate <= 1e-5)',
      'let cellScale = 5.4',
      'let parityBias = 0.72',
      'let strength = 1.35',
      'let parityProduct =',
      'let diagonalParity =',
      'let parityGate =',
      'let alignmentGate =',
      'let phaseGate =',
      'let lantern =',
      'let voidGate =',
      'let emissionGain =',
      'let opacityScale =',
    ])

    const wrapper = functionSlice(volumeIntegrationBlock, 'computeFockLantern')
    expect(wrapper).toContain('computeFockLanternMidGate(rho, uniforms)')
  })

  it('wires the lantern into HQ raymarch before effective density and emission', () => {
    const body = functionSlice(volumeRaymarchHQBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let fockLanternActive = isFockLanternActive(uniforms)',
      'USE_ANALYTICAL_GRADIENT && (nodalBandEnabled || fockLanternActive)',
      'if (fockLanternActive && rho >= EMPTY_SKIP_THRESHOLD && alpha > 0.001)',
      'let fockMidGate = computeFockLanternMidGate(rho, uniforms)',
      'if (fockMidGate > 1e-5)',
      'let fockGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'let fockLantern = computeFockLanternFromGate(',
      'fockLantern.opacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'fockLanternEmissionGain',
    ])
  })
})
