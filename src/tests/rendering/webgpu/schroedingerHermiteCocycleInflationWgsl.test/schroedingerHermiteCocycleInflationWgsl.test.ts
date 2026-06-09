import { describe, expect, it } from 'vitest'

import {
  getHOUnrolledBlocks,
  hermiteCocycleInflationHelpersBlock,
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

  it('hoists term-independent shell gating into a once-per-sample gate eval', () => {
    const gate = functionSlice(psiBlockHarmonic, 'hermiteCocycleGateEval')

    expectOrdered(gate, [
      'isHermiteCocycleInflationActive',
      'let strength = clamp',
      'let shellRadius = clamp',
      'let width = max',
      'let shellGate = clamp',
      'if (shellGate <= 1e-8)',
      'gate.gateScale = strength * shellGate',
    ])
  })

  it('defines bounded per-term branch phase reading the hoisted gate', () => {
    const phase = functionSlice(psiBlockHarmonic, 'hermiteCocycleInflationPhase')

    expectOrdered(phase, [
      'gate: HermiteCocycleGate',
      'let projectedCocycle = a * b * c',
      'let bulkCocycle = select',
      'let obstruction = clamp(tanh',
      'return gate.gateScale * obstruction',
    ])
  })

  it('rotates dynamic HO spatial and time terms, not just color output', () => {
    const psi = functionSlice(psiBlockHarmonic, 'evalHarmonicOscillatorPsi')
    expect(psi).toContain('let cocycleGate = hermiteCocycleGateEval(xND, uniforms)')
    expect(psi).toContain(
      'applyHermiteCocycleInflation(cmul(coeff, timeFactor), cocycleGate, k, uniforms)'
    )

    const spatial = functionSlice(psiBlockHarmonic, 'evalSpatialPhase')
    expect(spatial).toContain(
      'applyHermiteCocycleInflation(getCoeff(uniforms, k), cocycleGate, k, uniforms)'
    )

    // The combined evaluator rotates the spatial-reference coefficient and the
    // time-evolved term with ONE shared phase evaluation per term.
    const combined = functionSlice(psiBlockHarmonic, 'evalPsiWithSpatialPhase')
    expect(combined).toContain('applyHermiteCocycleInflationPair(')
    expect(combined).toContain('vec4f(coeff, cmul(coeff, timeFactor)), cocycleGate, k, uniforms)')
    expect(combined).not.toContain('applyHermiteCocycleInflation(getCoeff')
  })

  it('wires unrolled preset blocks through the same branch rotation helper', () => {
    const unrolled = getHOUnrolledBlocks(5)

    expect(unrolled.helpers).toBe(hermiteCocycleInflationHelpersBlock)
    expect(hermiteCocycleInflationHelpersBlock).toContain('fn hermiteCocycleGateEval')
    expect(hermiteCocycleInflationHelpersBlock).toContain('fn hermiteCocycleInflationPhase')
    expect(hermiteCocycleInflationHelpersBlock).toContain('fn applyHermiteCocycleInflationPair')
    expect(hoSuperposition5Block).toContain(
      'applyHermiteCocycleInflation(uniforms.precomputedTerm[0].xy, cocycleGate, 0, uniforms)'
    )
    expect(hoSpatial5Block).toContain(
      'applyHermiteCocycleInflation(getCoeff(uniforms, 0), cocycleGate, 0, uniforms)'
    )
    expect(hoCombined5Block).toContain(
      'vec4f(getCoeff(uniforms, 0), uniforms.precomputedTerm[0].xy), cocycleGate, 0, uniforms)'
    )
  })

  it('evaluates the cocycle gate exactly once per unrolled eval function', () => {
    // One hoisted gate eval per generated function — the per-sample shell
    // windowing (sqrt/exp/smoothstep) must not be repeated per term.
    expect(hoSuperposition5Block.match(/hermiteCocycleGateEval\(/g)).toHaveLength(1)
    expect(hoSpatial5Block.match(/hermiteCocycleGateEval\(/g)).toHaveLength(1)
    expect(hoCombined5Block.match(/hermiteCocycleGateEval\(/g)).toHaveLength(1)
    // Combined block: exactly one rotation application per term (Pair), never
    // the single-term helper that would double the phase evaluation.
    expect(hoCombined5Block.match(/applyHermiteCocycleInflationPair\(/g)).toHaveLength(5)
    expect(hoCombined5Block).not.toContain('applyHermiteCocycleInflation(uniforms.precomputedTerm')
  })
})
