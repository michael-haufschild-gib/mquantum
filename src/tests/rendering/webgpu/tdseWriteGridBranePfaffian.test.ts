import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid BEC Pfaffian brane view', () => {
  it('documents branePfaffian as append-only fieldView enum 15', () => {
    expect(tdseUniformsBlock).toContain('14=bornEclipse, 15=branePfaffian')
  })

  it('adds a helper that computes Pf(W) over all 4-axis subsets', () => {
    const start = tdseWriteGridBlock.indexOf('fn computeBranePfaffianScalar')
    const end = tdseWriteGridBlock.indexOf('@compute', start)
    const helper = tdseWriteGridBlock.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(helper).toContain('params.latticeDim < 4u')
    expect(helper).toContain('var pfaffianAbs: f32 = 0.0;')
    expect(helper).toContain('for (var i: u32 = 0u; i + 3u < params.latticeDim; i = i + 1u)')
    expect(helper).toContain('for (var j: u32 = i + 1u; j + 2u < params.latticeDim; j = j + 1u)')
    expect(helper).toContain('for (var k: u32 = j + 1u; k + 1u < params.latticeDim; k = k + 1u)')
    expect(helper).toContain('for (var l: u32 = k + 1u; l < params.latticeDim; l = l + 1u)')
    expect(helper).toContain('let pf = wij * wkl - wik * wjl + wil * wjk;')
    expect(helper).toContain('pfaffianAbs += abs(pf);')
    expect(helper).toContain('let exactPfaffian = clamp(1.0 - exp(-6.0 * pfaffianAbs), 0.0, 1.0);')
    expect(helper).toContain(
      'let braneCaustic = computeSoftBraneIntersectionCaustic(nnCoords, phase);'
    )
    expect(helper).toContain(
      'return clamp(0.58 * max(exactPfaffian, braneCaustic), 0.0, 1.0) * densityGate;'
    )
  })

  it('uses plaquette winding only through valid nondegenerate axes', () => {
    const start = tdseWriteGridBlock.indexOf('fn branePlaquetteWindingOrZero')
    const end = tdseWriteGridBlock.indexOf('fn computeBranePfaffianScalar', start)
    const helper = tdseWriteGridBlock.slice(start, end)

    expect(helper).toContain('axisA == axisB')
    expect(helper).toContain('axisA >= params.latticeDim || axisB >= params.latticeDim')
    expect(helper).toContain('params.gridSize[axisA] <= 1u || params.gridSize[axisB] <= 1u')
    expect(helper).toContain('return plaquetteWinding(idx, nnCoords, axisA, axisB);')
  })

  it('adds a visible caustic envelope only for distinct two-sheet N-D vortex states', () => {
    const start = tdseWriteGridBlock.indexOf('fn computeSoftBraneIntersectionCaustic')
    const end = tdseWriteGridBlock.indexOf('fn computeBranePfaffianScalar', start)
    const helper = tdseWriteGridBlock.slice(start, end)

    expect(helper).toContain('params.initCondition != 6u')
    expect(helper).toContain('params.vortexCount < 2u')
    expect(helper).toContain('!braneAxesAreDistinct(a1, b1, a2, b2)')
    expect(helper).toContain('let sheetGate = exp(-0.5 * (r1Sq + r2Sq) / (sigma * sigma));')
    expect(helper).toContain('let braid = 0.58 + 0.42 * cos(braidPhase);')
    expect(helper).toContain('return clamp(sheetGate * braid, 0.0, 1.0);')
  })

  it('adds fieldView 15 branch before the potential fallback branch', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 15u')
    const potentialBranch = tdseWriteGridBlock.indexOf('params.fieldView == 3u')
    const branch = tdseWriteGridBlock.slice(branchStart, potentialBranch)

    expect(branchStart).toBeGreaterThanOrEqual(0)
    expect(potentialBranch).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeBranePfaffianScalar(idx, &nnCoords, density, phase, densityGate);'
    )
  })

  it('composes the Pfaffian branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn plaquetteWinding')
    expect(wgsl).toContain('fn computeBranePfaffianScalar')
    expect(wgsl).toContain('params.fieldView == 15u')
  })
})
