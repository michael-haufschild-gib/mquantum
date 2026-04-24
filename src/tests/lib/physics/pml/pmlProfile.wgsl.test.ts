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
  it('uses stride-based forward decomposition with power-of-2 shift/mask', () => {
    // linearToND decomposes idx using precomputed strides. Compute-lattice grid
    // sizes are snapped to powers of two via sanitizeGridSizes (see
    // computePassUtils.ts), so the derived strides are powers of two too, and
    // the runtime u32 divide/modulo are lowered to a single shift and mask:
    //   coords[d] = remaining >> log2(strides[d])
    //   remaining = remaining & (strides[d] - 1)
    // This is equivalent to `remaining / strides[d]` / `remaining % strides[d]`
    // for power-of-2 strides but ~20× cheaper on GPU. (Note: the density-grid
    // resolution in 'src/constants/densityGrid.ts' is a separate, rendering-only
    // grid and is not subject to this invariant.)
    expect(freeScalarNDIndexBlock).toContain('firstTrailingBit(s)')
    expect(freeScalarNDIndexBlock).toContain('remaining >> logS')
    expect(freeScalarNDIndexBlock).toContain('remaining & (s - 1u)')
  })
})
