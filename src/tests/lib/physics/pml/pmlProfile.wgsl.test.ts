import { describe, it, expect } from 'vitest'
import { pmlProfileBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pmlProfile.wgsl'
import { freeScalarNDIndexBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarNDIndex.wgsl'

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
  it('uses modular decomposition by gridSize (not strides)', () => {
    // linearToND must decompose via repeated mod/div by gridSize:
    //   coords[d] = remaining % gridSize[d]
    //   remaining = remaining / gridSize[d]
    // Using strides instead of gridSize is WRONG for the descending loop
    // and produces garbage coordinates for dim >= 2.
    expect(freeScalarNDIndexBlock).toContain('remaining % gridSize[ud]')
    expect(freeScalarNDIndexBlock).toContain('remaining / gridSize[ud]')
  })

  it('does NOT use strides for decomposition', () => {
    // Strides must NOT appear in the division/modulo operations.
    // The strides parameter is kept for call-site compatibility but unused.
    expect(freeScalarNDIndexBlock).not.toMatch(/remaining [/%] strides/)
  })
})
