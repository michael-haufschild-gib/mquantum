import { describe, expect, it } from 'vitest'

import { tdseDiagNormReduceBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl'

describe('TDSE diagnostics shader contracts', () => {
  it('integrates norm and IPR with coordinate cell volume', () => {
    expect(tdseDiagNormReduceBlock).toContain('fn tdseDiagCellMeasure(idx: u32) -> f32')
    expect(tdseDiagNormReduceBlock).toContain('var dV: f32 = 1.0;')
    expect(tdseDiagNormReduceBlock).toContain('dV *= params.spacing[d];')
    expect(tdseDiagNormReduceBlock).toContain('return dV;')
    expect(tdseDiagNormReduceBlock).toContain(
      'return max(tdseCurvatureSqrtDet(coords, params.latticeDim, metricTime), 0.0) * dV;'
    )
    expect(tdseDiagNormReduceBlock).toContain('val = density * cellMeasure;')
    expect(tdseDiagNormReduceBlock).toContain(
      'shared_add[local] = vec4f(val, leftVal, rightVal, val * val);'
    )
    expect(tdseDiagNormReduceBlock).not.toContain('density * volumeWeight')
  })
})
