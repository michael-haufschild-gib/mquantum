import { describe, expect, it } from 'vitest'

import {
  hoCombined5Block,
  hoSpatial5Block,
  hoSuperposition5Block,
} from '@/rendering/webgpu/shaders/schroedinger/quantum/hoSuperpositionVariants.wgsl'
import { psiBlockHarmonic } from '@/rendering/webgpu/shaders/schroedinger/quantum/psi.wgsl'
import { schroedingerUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

import { expectOrdered, functionSlice } from '../wgslTestHelpers'

describe('Schroedinger Hermite Cocycle Inflation WGSL composition', () => {
  it('declares append-only cocycle uniforms', () => {
    expectOrdered(schroedingerUniformsBlock, [
      'bornNullWeaveCirculation: f32',
      'hermiteCocycleInflationEnabled: u32',
      'hermiteCocycleInflationStrength: f32',
      'hermiteCocycleShellRadius: f32',
      'hermiteCocycleInflationTwist: f32',
    ])
  })

  it('defines bounded shell-gated branch phase in the dynamic HO path', () => {
    const phase = functionSlice(psiBlockHarmonic, 'hermiteCocycleInflationPhase')

    expectOrdered(phase, [
      'isHermiteCocycleInflationActive',
      'let strength = clamp',
      'let shellRadius = clamp',
      'let width = max',
      'let shellGate = clamp',
      'let projectedCocycle = a * b * c',
      'let bulkCocycle = select',
      'let obstruction = clamp(tanh',
      'return clamp(strength * shellGate * obstruction',
    ])
  })

  it('rotates dynamic HO spatial and time terms, not just color output', () => {
    const psi = functionSlice(psiBlockHarmonic, 'evalHarmonicOscillatorPsi')
    expect(psi).toContain('applyHermiteCocycleInflation(cmul(coeff, timeFactor), xND, k, uniforms)')

    const spatial = functionSlice(psiBlockHarmonic, 'evalSpatialPhase')
    expect(spatial).toContain(
      'applyHermiteCocycleInflation(getCoeff(uniforms, k), xND, k, uniforms)'
    )

    const combined = functionSlice(psiBlockHarmonic, 'evalPsiWithSpatialPhase')
    expect(combined).toContain(
      'applyHermiteCocycleInflation(cmul(getCoeff(uniforms, k), timeFactor), xND, k, uniforms)'
    )
  })

  it('wires unrolled preset blocks through the same branch rotation helper', () => {
    expect(hoSuperposition5Block).toContain('fn hermiteCocycleInflationPhase')
    expect(hoSuperposition5Block).toContain(
      'applyHermiteCocycleInflation(uniforms.precomputedTerm[0].xy, xND, 0, uniforms)'
    )
    expect(hoSpatial5Block).toContain(
      'applyHermiteCocycleInflation(getCoeff(uniforms, 0), xND, 0, uniforms)'
    )
    expect(hoCombined5Block).toContain(
      'applyHermiteCocycleInflation(uniforms.precomputedTerm[0].xy, xND, 0, uniforms)'
    )
  })
})
