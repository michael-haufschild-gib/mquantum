import { describe, expect, it } from 'vitest'

import { tdseCurvatureHelpersBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseCurvatureHelpers.wgsl'
import {
  tdseCurvedKineticBlock,
  tdseCurvedKineticBlock3D,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseCurvedKinetic.wgsl'
import {
  tdseDiagNormFinalizeBlock,
  tdseDiagNormReduceBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('TDSE curvature WGSL finite guards', () => {
  it('caps deSitter proper-volume exponent before exp in curvature helpers', () => {
    expect(tdseCurvatureHelpersBlock).toContain('const TDSE_CURV_EXP_LIMIT: f32 = 80.0;')
    expect(tdseCurvatureHelpersBlock).toContain('fn tdseCurvatureExpClamped')
    expect(tdseCurvatureHelpersBlock).toContain(
      'return tdseCurvatureExpClamped(H * time * f32(dim));'
    )
    expect(tdseCurvatureHelpersBlock).not.toContain('let a = exp(H * time);')
  })

  it('caps deSitter kinetic exponents before exp in both dispatch variants', () => {
    for (const wgsl of [tdseCurvedKineticBlock, tdseCurvedKineticBlock3D]) {
      expect(wgsl).toContain('const CURVED_EXP_LIMIT: f32 = 80.0;')
      expect(wgsl).toContain('fn curvedExpClamped')
      expect(wgsl).toContain('let invA2 = curvedExpClamped(-2.0 * H * time);')
      expect(wgsl).toContain('out.sqrtDet = curvedExpClamped(H * time * f32(dim));')
      expect(wgsl).not.toContain('let a = exp(H * time);')
    }
  })

  it('uses a separate proper-density peak for proper-volume display normalization', () => {
    expect(tdseDiagNormReduceBlock).toContain('vec2f(density, density * sqrtDet)')
    expect(tdseDiagNormReduceBlock).toContain('partialMax[wid.x * 2u]')
    expect(tdseDiagNormFinalizeBlock).toContain('result[5] = shared_max[0].y;')
    expect(tdseWriteGridBlock).toContain('params.densityDisplayMax')
    expect(tdseWriteGridBlock).toContain('displayScalar = normDensityDisplay;')
  })
})
