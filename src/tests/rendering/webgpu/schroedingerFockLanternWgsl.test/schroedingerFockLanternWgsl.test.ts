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

    const body = functionSlice(volumeIntegrationBlock, 'computeFockLantern')
    expectOrdered(body, [
      'let midGate =',
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
  })

  it('wires the lantern into HQ raymarch before effective density and emission', () => {
    const body = functionSlice(volumeRaymarchHQBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let fockLanternActive = isFockLanternActive(uniforms)',
      'if (fockLanternActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'let fockGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'let fockLantern = computeFockLantern(samplePos, rho, phase, fockGradient, uniforms)',
      'fockLanternOpacityScale',
      'computeEffectiveDensity(',
      'fockLanternOpacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'fockLanternEmissionGain',
    ])
  })
})
