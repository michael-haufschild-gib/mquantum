import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseVorticityBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseVorticity.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid quantized circulation view', () => {
  it('adds phase-plaquette helpers for circulation winding', () => {
    expect(tdseVorticityBlock).toContain('fn phaseAtSite')
    expect(tdseVorticityBlock).toContain('fn wrappedPhaseDelta')
    expect(tdseVorticityBlock).toContain('return atan2(sin(raw), cos(raw));')
    expect(tdseVorticityBlock).toContain('fn forwardPhaseNeighbor')
    expect(tdseVorticityBlock).toContain('tdsePmlAxisActive(axis)')
    expect(tdseVorticityBlock).toContain('fn plaquetteWinding')
    expect(tdseVorticityBlock).toContain('return circulation * TDSE_WG_INV_TAU;')
  })

  it('adds a fieldView 9 branch for density-gated quantized circulation', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 9u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('var circulationAbs: f32 = 0.0;')
    expect(branch).toContain('for (var i: u32 = 0u; i < params.latticeDim; i = i + 1u)')
    expect(branch).toContain('for (var j: u32 = i + 1u; j < params.latticeDim; j = j + 1u)')
    expect(branch).toContain('let winding = plaquetteWinding(idx, &nnCoords, i, j);')
    expect(branch).toContain('circulationAbs += abs(winding);')
    expect(branch).toContain(
      'displayScalar = clamp(1.0 - exp(-circulationAbs), 0.0, 1.0) * densityGate;'
    )
  })

  it('composes the circulation branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn plaquetteWinding')
    expect(wgsl).toContain('params.fieldView == 9u')
  })
})
