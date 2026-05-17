import { describe, expect, it } from 'vitest'

import { tdseQuantumPressureBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseQuantumPressure.wgsl'
import { tdseVorticityBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseVorticity.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid compact-axis boundary topology', () => {
  it('keeps derivative stencils periodic on compact metric axes even when shared PML is enabled', () => {
    expect(tdseWriteGridBlock).toContain('fn tdsePmlAxisActive(axis: u32) -> bool')
    expect(tdseWriteGridBlock).toContain('params.compactDimsMask & (1u << axis)')
    expect(tdseWriteGridBlock).toContain('let pmlAxis = tdsePmlAxisActive(d);')
    expect(tdseQuantumPressureBlock).toContain('let pmlAxis = tdsePmlAxisActive(d);')
    expect(tdseVorticityBlock).toContain('tdsePmlAxisActive(axis)')
  })
})
