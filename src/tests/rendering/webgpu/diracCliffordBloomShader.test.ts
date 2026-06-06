import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import { composeDiracWriteGridShader } from '@/rendering/webgpu/passes/DiracComputePassSetup'
import { writeDiracUniforms } from '@/rendering/webgpu/passes/DiracComputePassUniforms'
import { diracUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl'
import { diracWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl'

function fakeDevice(): GPUDevice {
  return { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice
}

describe('Dirac Clifford Bloom field view', () => {
  it('documents cliffordBloom as append-only fieldView enum 8', () => {
    expect(diracUniformsBlock).toContain('7=axialCharge, 8=cliffordBloom')
  })

  it('packs cliffordBloom to Dirac write-grid fieldView enum 8 without moving axialCharge', () => {
    const uniformData = new ArrayBuffer(592)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    writeDiracUniforms(fakeDevice(), {} as GPUBuffer, uniformData, u32, f32, {
      config: { ...DEFAULT_DIRAC_CONFIG, fieldView: 'cliffordBloom' },
      totalSites: 64 * 64 * 64,
      currentSpinorSize: 4,
      simTime: 0,
      maxDensity: 1,
      strides: [64 * 64, 64, 1],
      boundingRadius: 4.8,
    })
    expect(u32[76]).toBe(8)

    writeDiracUniforms(fakeDevice(), {} as GPUBuffer, uniformData, u32, f32, {
      config: { ...DEFAULT_DIRAC_CONFIG, fieldView: 'axialCharge' },
      totalSites: 64 * 64 * 64,
      currentSpinorSize: 4,
      simTime: 0,
      maxDensity: 1,
      strides: [64 * 64, 64, 1],
      boundingRadius: 4.8,
    })
    expect(u32[76]).toBe(7)
  })

  it('adds a fieldView 8 branch for sector-balanced relative-phase petals', () => {
    const branchStart = diracWriteGridBlock.indexOf('params.fieldView == 8u')
    const branchEnd = diracWriteGridBlock.indexOf('} else if (params.fieldView == 6u)', branchStart)
    const branch = diracWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('let split = upperLowerDensityAt(nnSiteIdx, S, T);')
    expect(branch).toContain('let sectorBalance = clamp(4.0 * split.x * split.y')
    expect(branch).toContain(
      'let relativePhase = atan2(sin(upperPhase - lowerPhase), cos(upperPhase - lowerPhase));'
    )
    expect(branch).toContain('let carrierPhase = 4.0 * phiXY + 2.0 * phiXZ + 3.0 * relativePhase')
    expect(branch).toContain('let radialShellPhase = 5.5 * radius + 2.0 * relativePhase')
    expect(branch).toContain('let angularPetal = carrier * carrier * carrier;')
    expect(branch).toContain('let bloom = sectorBalance * phaseTension * shellFocus')
    expect(branch).toContain(
      'displayScalar = clamp(1.0 - exp(-7.2 * bloom), 0.0, 1.0) * densityGate;'
    )
    expect(branch).toContain('phaseForColor = bloomHuePhase + DIRAC_WG_PI;')
  })

  it('composes the Clifford Bloom branch into Dirac write-grid shaders', () => {
    const wgsl = composeDiracWriteGridShader(3)

    expect(wgsl).toContain('params.fieldView == 8u')
    expect(wgsl).toContain('let sectorBalance = clamp(4.0 * split.x * split.y')
    expect(wgsl).toContain('let carrierPhase = 4.0 * phiXY + 2.0 * phiXZ + 3.0 * relativePhase')
    expect(wgsl).toContain('let radialShellPhase = 5.5 * radius + 2.0 * relativePhase')
    expect(wgsl).toContain(
      'textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phaseForColor, alphaChannel));'
    )
  })
})
