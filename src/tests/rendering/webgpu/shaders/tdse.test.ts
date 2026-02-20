import { describe, expect, it } from 'vitest'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl'
import { tdseApplyPotentialHalfBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import { tdseApplyKineticBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdsePotentialBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl'
import { tdseAbsorberBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'
import { tdseComplexPackBlock, tdseComplexUnpackBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack.wgsl'
import { tdseFFTStageUniformsBlock, tdseStockhamFFTBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { tdseDiagNormReduceBlock, tdseDiagNormFinalizeBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl'

describe('TDSE uniform struct', () => {
  it('declares TDSEUniforms struct', () => {
    expect(tdseUniformsBlock).toContain('struct TDSEUniforms')
  })

  it('contains required lattice fields', () => {
    expect(tdseUniformsBlock).toContain('latticeDim')
    expect(tdseUniformsBlock).toContain('totalSites')
    expect(tdseUniformsBlock).toContain('gridSize')
    expect(tdseUniformsBlock).toContain('strides')
    expect(tdseUniformsBlock).toContain('spacing')
  })

  it('contains physics fields', () => {
    expect(tdseUniformsBlock).toContain('mass')
    expect(tdseUniformsBlock).toContain('hbar')
    expect(tdseUniformsBlock).toContain('dt')
    expect(tdseUniformsBlock).toContain('boundingRadius')
  })

  it('contains potential fields', () => {
    expect(tdseUniformsBlock).toContain('potentialType')
    expect(tdseUniformsBlock).toContain('barrierHeight')
    expect(tdseUniformsBlock).toContain('barrierWidth')
    expect(tdseUniformsBlock).toContain('wellDepth')
    expect(tdseUniformsBlock).toContain('harmonicOmega')
  })
})

describe('TDSE init shader', () => {
  it('declares @compute @workgroup_size(64) entry point', () => {
    expect(tdseInitBlock).toContain('@compute @workgroup_size(64)')
    expect(tdseInitBlock).toContain('fn main')
  })

  it('writes psiRe and psiIm buffers', () => {
    expect(tdseInitBlock).toContain('psiRe[idx]')
    expect(tdseInitBlock).toContain('psiIm[idx]')
  })

  it('binds uniform and storage buffers', () => {
    expect(tdseInitBlock).toContain('@group(0) @binding(0)')
    expect(tdseInitBlock).toContain('@group(0) @binding(1)')
    expect(tdseInitBlock).toContain('@group(0) @binding(2)')
  })
})

describe('TDSE apply potential half-step', () => {
  it('declares entry point', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('@compute @workgroup_size(64)')
    expect(tdseApplyPotentialHalfBlock).toContain('fn main')
  })

  it('reads potential buffer', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('potential')
  })

  it('applies complex rotation', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('cos')
    expect(tdseApplyPotentialHalfBlock).toContain('sin')
  })
})

describe('TDSE apply kinetic (k-space)', () => {
  it('declares entry point', () => {
    expect(tdseApplyKineticBlock).toContain('@compute @workgroup_size(64)')
  })

  it('operates on interleaved complex buffer', () => {
    expect(tdseApplyKineticBlock).toContain('complexBuf')
  })

  it('uses k-space frequency calculation', () => {
    expect(tdseApplyKineticBlock).toContain('kGridScale')
    expect(tdseApplyKineticBlock).toContain('k2')
  })
})

describe('TDSE potential shader', () => {
  it('supports all potential types (0-5)', () => {
    expect(tdsePotentialBlock).toContain('potentialType == 0u')
    expect(tdsePotentialBlock).toContain('potentialType == 1u')
    expect(tdsePotentialBlock).toContain('potentialType == 2u')
    expect(tdsePotentialBlock).toContain('potentialType == 3u')
    expect(tdsePotentialBlock).toContain('potentialType == 4u')
    expect(tdsePotentialBlock).toContain('potentialType == 5u')
  })

  it('supports driven waveforms', () => {
    expect(tdsePotentialBlock).toContain('driveWaveform')
    expect(tdsePotentialBlock).toContain('driveFrequency')
  })
})

describe('TDSE absorber shader', () => {
  it('declares entry point', () => {
    expect(tdseAbsorberBlock).toContain('@compute @workgroup_size(64)')
  })

  it('applies exponential damping near boundaries', () => {
    expect(tdseAbsorberBlock).toContain('absorberWidth')
    expect(tdseAbsorberBlock).toContain('absorberStrength')
    expect(tdseAbsorberBlock).toContain('exp(-')
  })

  it('checks absorberEnabled flag', () => {
    expect(tdseAbsorberBlock).toContain('absorberEnabled')
  })
})

describe('TDSE write grid shader', () => {
  it('uses 3D workgroup size', () => {
    expect(tdseWriteGridBlock).toContain('@workgroup_size(4, 4, 4)')
  })

  it('writes rgba16float texture output', () => {
    expect(tdseWriteGridBlock).toContain('textureStore(outputTex')
  })

  it('binds potential buffer and output texture', () => {
    expect(tdseWriteGridBlock).toContain('@group(0) @binding(3) var<storage, read> potential')
    expect(tdseWriteGridBlock).toContain('@group(0) @binding(4) var outputTex')
  })

  it('encodes selected field scalar, log-density, and phase', () => {
    expect(tdseWriteGridBlock).toContain('normDensity')
    expect(tdseWriteGridBlock).toContain('logDensity')
    expect(tdseWriteGridBlock).toContain('phase')
  })

  it('branches on fieldView modes', () => {
    expect(tdseWriteGridBlock).toContain('params.fieldView == 0u')
    expect(tdseWriteGridBlock).toContain('params.fieldView == 1u')
    expect(tdseWriteGridBlock).toContain('params.fieldView == 2u')
  })

  it('uses basis vectors for N-D projection', () => {
    expect(tdseWriteGridBlock).toContain('basisX')
    expect(tdseWriteGridBlock).toContain('basisY')
    expect(tdseWriteGridBlock).toContain('basisZ')
  })
})

describe('TDSE complex pack/unpack shaders', () => {
  it('pack shader interleaves psi components', () => {
    expect(tdseComplexPackBlock).toContain('psiRe')
    expect(tdseComplexPackBlock).toContain('psiIm')
    expect(tdseComplexPackBlock).toContain('complexBuf')
  })

  it('unpack shader applies 1/N normalization', () => {
    expect(tdseComplexUnpackBlock).toContain('invN')
    expect(tdseComplexUnpackBlock).toContain('complexBuf')
  })
})

describe('TDSE Stockham FFT shaders', () => {
  it('defines FFTStageUniforms struct', () => {
    expect(tdseFFTStageUniformsBlock).toContain('struct FFTStageUniforms')
    expect(tdseFFTStageUniformsBlock).toContain('axisDim')
    expect(tdseFFTStageUniformsBlock).toContain('stage')
    expect(tdseFFTStageUniformsBlock).toContain('direction')
  })

  it('butterfly kernel has @workgroup_size(64)', () => {
    expect(tdseStockhamFFTBlock).toContain('@compute @workgroup_size(64)')
  })

  it('uses twiddle factors for butterfly operation', () => {
    expect(tdseStockhamFFTBlock).toContain('cos')
    expect(tdseStockhamFFTBlock).toContain('sin')
  })
})

describe('TDSE diagnostics shaders', () => {
  it('reduce pass has @workgroup_size(256)', () => {
    expect(tdseDiagNormReduceBlock).toContain('@workgroup_size(256)')
  })

  it('reduce pass uses shared memory for tree reduction', () => {
    expect(tdseDiagNormReduceBlock).toContain('var<workgroup>')
    expect(tdseDiagNormReduceBlock).toContain('workgroupBarrier')
  })

  it('finalize pass computes final norm and maxDensity', () => {
    expect(tdseDiagNormFinalizeBlock).toContain('result[0]')
    expect(tdseDiagNormFinalizeBlock).toContain('result[1]')
  })
})
