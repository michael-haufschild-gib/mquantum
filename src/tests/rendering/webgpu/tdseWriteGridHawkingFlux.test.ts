import { describe, expect, it } from 'vitest'

import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid Hawking flux view', () => {
  it('adds a fieldView 7 branch that gates surface gravity to the sonic horizon', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 7u')
    const branchEnd = tdseWriteGridBlock.indexOf('} else if (params.fieldView == 3u)', branchStart)
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('params.initCondition != 7u')
    expect(branch).toContain('let mach = vs / cs;')
    expect(branch).toContain('let horizonGate =')
    expect(branch).toContain('params.hawkingVmax')
    expect(branch).toContain('params.hawkingLh')
    expect(branch).toContain('params.hawkingDeltaN')
    expect(branch).toContain('let lBox = max(f32(params.gridSize[0]) * params.spacing[0], 1e-4);')
    expect(branch).toContain('let edgeT = tanh(lBox / (2.0 * lh));')
    expect(branch).toContain('2.0 * edgeT / lBox')
    expect(branch).toContain('sin(TDSE_WG_PI * x0 / lBox)')
    expect(branch).toContain('cos(TDSE_WG_PI * x0 / lBox)')
    expect(branch).toContain('let acousticGradient = dCsSqDx - dVsSqDx;')
    expect(branch).toContain('let surfaceGravity =')
    expect(branch).toContain('let hawkingTemperatureProxy = surfaceGravity * TDSE_WG_INV_TAU;')
    expect(branch).toContain('* densityGate')
  })
})
