import { describe, expect, it } from 'vitest'

import { freeScalarNDIndexBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pmlProfile.wgsl'

describe('pmlProfile WGSL block', () => {
  it('defines computePMLSigma function with correct signature', () => {
    expect(pmlProfileBlock).toContain('fn computePMLSigma(')
    expect(pmlProfileBlock).toContain('coords: array<u32, 12>')
    expect(pmlProfileBlock).toContain('gridSize: array<u32, 12>')
    expect(pmlProfileBlock).toContain('latticeDim: u32')
    expect(pmlProfileBlock).toContain('pmlWidth: f32')
    expect(pmlProfileBlock).toContain('sigmaMax: f32')
  })

  it('uses cubic polynomial grading (ratio^3)', () => {
    // The WGSL must use exactly ratio * ratio * ratio (cubic, p=3)
    // This must match the CPU-side computePMLSigmaMax which uses order=3
    expect(pmlProfileBlock).toContain('ratio * ratio * ratio')
  })

  it('sums damping additively across dimensions', () => {
    // PML damping must be additive (sigma += ...) to handle corner overlap
    expect(pmlProfileBlock).toContain('sigma += sigmaMax * ratio')
  })

  it('computes penetration depth from nearest boundary', () => {
    expect(pmlProfileBlock).toContain('min(pos, N - 1.0 - pos)')
  })
})

describe('linearToND WGSL correctness', () => {
  it('uses stride-based forward decomposition', () => {
    // linearToND decomposes idx using precomputed strides:
    //   coords[d] = remaining / strides[d]
    //   remaining = remaining % strides[d]
    // This is equivalent to repeated mod/div by gridSize (backward iteration)
    // but uses strides for forward iteration, which the GPU compiler can optimize
    // for power-of-2 grid sizes.
    expect(freeScalarNDIndexBlock).toContain('remaining / s')
    expect(freeScalarNDIndexBlock).toContain('remaining % s')
  })
})
