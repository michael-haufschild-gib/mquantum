import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseQuantumPressureBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseQuantumPressure.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid quantum pressure view', () => {
  it('adds a fieldView 8 branch for Madelung quantum pressure', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 8u')
    const branchEnd = tdseWriteGridBlock.indexOf('} else if (params.fieldView == 3u)', branchStart)
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('tdseQuantumPressureAtSite(idx, density, &nnCoords, &invSpacings)')
    expect(branch).toContain('displayScalar = clamp(quantumPressure, 0.0, 1.0) * densityGate;')
  })

  it('adds a finite-difference helper for quantum pressure curvature', () => {
    expect(tdseQuantumPressureBlock).toContain('sqrt(max(density, 1e-30))')
    expect(tdseQuantumPressureBlock).toContain('var laplacianR: f32 = 0.0;')
    expect(tdseQuantumPressureBlock).toContain('(*invSpacings)[d]')
    expect(tdseQuantumPressureBlock).toContain('let pmlAxis = tdsePmlAxisActive(d);')
    expect(tdseQuantumPressureBlock).toContain('sqrt(max(dot(zF, zF), 1e-30))')
    expect(tdseQuantumPressureBlock).toContain('laplacianR += (rF - 2.0 * rCenter + rB) * invDx2;')
    expect(tdseQuantumPressureBlock).toContain('params.hbar * params.hbar')
    expect(tdseQuantumPressureBlock).toContain('max(params.mass, 1e-6)')
    expect(tdseQuantumPressureBlock).toContain(
      'let qPotential = -qCoeff * laplacianR / max(rCenter, 1e-10);'
    )
    expect(tdseQuantumPressureBlock).toContain('1.0 - exp(-abs(qPotential) / qScale)')
  })

  it('composes the quantum pressure helper into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn tdseQuantumPressureAtSite')
    expect(wgsl).toContain('params.fieldView == 8u')
  })
})
