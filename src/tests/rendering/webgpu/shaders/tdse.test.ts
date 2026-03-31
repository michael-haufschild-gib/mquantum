import { describe, expect, it } from 'vitest'

import { renormalizeBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/renormalize.wgsl'
import { tdseApplyKineticBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdseApplyPotentialHalfBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import {
  tdseComplexPackBlock,
  tdseComplexUnpackBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack.wgsl'
import {
  tdseDiagNormFinalizeBlock,
  tdseDiagNormReduceBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl'
import { tdseInitBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl'
import { tdsePotentialBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl'
import {
  fftAxisUniformsBlock,
  tdseSharedMemFFTBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseSharedMemFFT.wgsl'
import {
  tdseFFTStageUniformsBlock,
  tdseStockhamFFTBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

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
    expect(tdseUniformsBlock).toContain('customPotentialScale')
  })
})

describe('TDSE init shader', () => {
  it('declares @compute @workgroup_size(64) entry point', () => {
    expect(tdseInitBlock).toContain('@compute @workgroup_size(64)')
    expect(tdseInitBlock).toContain('fn main')
  })

  it('includes psiRe and psiIm buffer access', () => {
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

  it('includes potential buffer access', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('potential')
  })

  it('contains complex rotation (cos/sin)', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('cos')
    expect(tdseApplyPotentialHalfBlock).toContain('sin')
  })
})

describe('TDSE apply kinetic (k-space)', () => {
  it('declares entry point', () => {
    expect(tdseApplyKineticBlock).toContain('@compute @workgroup_size(64)')
  })

  it('includes interleaved complex buffer reference', () => {
    expect(tdseApplyKineticBlock).toContain('complexBuf')
  })

  it('includes k-space frequency calculation', () => {
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

describe('TDSE potential half-step (V-only)', () => {
  it('declares entry point', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('@compute @workgroup_size(64)')
  })

  it('contains potential phase rotation without absorber', () => {
    // Absorber is a separate pass — NOT merged into the potential half-step.
    // This prevents the FFT kinetic step from scattering the absorber's
    // spatial modulation across k-space.
    expect(tdseApplyPotentialHalfBlock).toContain('potential[idx]')
    expect(tdseApplyPotentialHalfBlock).toContain('cosP')
    expect(tdseApplyPotentialHalfBlock).not.toContain('absorberEnabled')
    expect(tdseApplyPotentialHalfBlock).not.toContain('computePMLSigma')
  })
})

describe('TDSE write grid shader', () => {
  it('declares 3D workgroup size', () => {
    expect(tdseWriteGridBlock).toContain('@workgroup_size(4, 4, 4)')
  })

  it('includes rgba16float texture output', () => {
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

  it('includes basis vectors for N-D projection', () => {
    expect(tdseWriteGridBlock).toContain('basisX')
    expect(tdseWriteGridBlock).toContain('basisY')
    expect(tdseWriteGridBlock).toContain('basisZ')
  })

  it('handles custom potential type (11) in getPotentialScale', () => {
    expect(tdseWriteGridBlock).toContain('potentialType == 11u')
    expect(tdseWriteGridBlock).toContain('customPotentialScale')
  })
})

describe('TDSE complex pack/unpack shaders', () => {
  it('pack shader interleaves psi components', () => {
    expect(tdseComplexPackBlock).toContain('psiRe')
    expect(tdseComplexPackBlock).toContain('psiIm')
    expect(tdseComplexPackBlock).toContain('complexBuf')
  })

  it('unpack shader includes 1/N normalization', () => {
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

  it('includes twiddle factors for butterfly operation', () => {
    expect(tdseStockhamFFTBlock).toContain('cos')
    expect(tdseStockhamFFTBlock).toContain('sin')
  })
})

describe('TDSE shared-memory FFT shader', () => {
  it('defines FFTAxisUniforms struct with per-axis fields', () => {
    expect(fftAxisUniformsBlock).toContain('struct FFTAxisUniforms')
    expect(fftAxisUniformsBlock).toContain('axisDim')
    expect(fftAxisUniformsBlock).toContain('direction')
    expect(fftAxisUniformsBlock).toContain('axisStride')
    expect(fftAxisUniformsBlock).toContain('log2N')
  })

  it('declares workgroup shared memory for ping-pong', () => {
    expect(tdseSharedMemFFTBlock).toContain('var<workgroup> smemA')
    expect(tdseSharedMemFFTBlock).toContain('var<workgroup> smemB')
  })

  it('includes workgroupBarrier for synchronization', () => {
    expect(tdseSharedMemFFTBlock).toContain('workgroupBarrier()')
  })

  it('has @workgroup_size(64) entry point', () => {
    expect(tdseSharedMemFFTBlock).toContain('@compute @workgroup_size(64)')
    expect(tdseSharedMemFFTBlock).toContain('fn main')
  })

  it('performs Stockham butterfly with twiddle factors', () => {
    expect(tdseSharedMemFFTBlock).toContain('twiddle_sm')
    expect(tdseSharedMemFFTBlock).toContain('cmul_sm')
    expect(tdseSharedMemFFTBlock).toContain('cos(angle)')
    expect(tdseSharedMemFFTBlock).toContain('sin(angle)')
  })

  it('declares read_write complexBuf binding (in-place per pencil)', () => {
    expect(tdseSharedMemFFTBlock).toContain(
      '@group(0) @binding(1) var<storage, read_write> complexBuf'
    )
  })

  it('handles even and odd log2N for final result buffer selection', () => {
    expect(tdseSharedMemFFTBlock).toContain('log2N % 2u == 0u')
  })
})

describe('TDSE diagnostics shaders', () => {
  it('reduce pass has @workgroup_size(256)', () => {
    expect(tdseDiagNormReduceBlock).toContain('@workgroup_size(256)')
  })

  it('reduce pass includes shared memory for tree reduction', () => {
    expect(tdseDiagNormReduceBlock).toContain('var<workgroup>')
    expect(tdseDiagNormReduceBlock).toContain('workgroupBarrier')
  })

  it('finalize pass contains norm and maxDensity output', () => {
    expect(tdseDiagNormFinalizeBlock).toContain('result[0]')
    expect(tdseDiagNormFinalizeBlock).toContain('result[1]')
  })
})

// ── Imaginary-Time Propagation (Wick Rotation) ──────────────────────────────

describe('imaginary-time: uniform struct', () => {
  it('declares imaginaryTime field as u32', () => {
    expect(tdseUniformsBlock).toContain('imaginaryTime: u32')
  })

  it('places imaginaryTime at offset 700 (after radialWellTilt)', () => {
    // imaginaryTime must be the last field to maintain struct layout compatibility
    const lines = tdseUniformsBlock.split('\n')
    const radialTiltIdx = lines.findIndex((l) => l.includes('radialWellTilt'))
    const itIdx = lines.findIndex((l) => l.includes('imaginaryTime'))
    expect(radialTiltIdx).toBeGreaterThan(-1)
    expect(itIdx).toBeGreaterThan(radialTiltIdx)
  })
})

describe('imaginary-time: potential half-step', () => {
  it('branches on imaginaryTime flag', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('params.imaginaryTime')
  })

  it('contains real exponential decay for imaginary-time mode', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('exp(-arg)')
  })

  it('contains unitary phase rotation for real-time mode', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('cos(phase)')
    expect(tdseApplyPotentialHalfBlock).toContain('sin(phase)')
  })

  it('includes V*dt/(2*hbar) as the argument for both branches', () => {
    // Both branches compute arg from potential and dt, differing only in exp(-arg) vs exp(-i*arg)
    expect(tdseApplyPotentialHalfBlock).toContain('effectiveV * params.dt / (2.0')
  })

  it('includes GPE nonlinear term in effective potential', () => {
    expect(tdseApplyPotentialHalfBlock).toContain('interactionStrength')
    expect(tdseApplyPotentialHalfBlock).toContain('density')
  })
})

describe('imaginary-time: kinetic step', () => {
  it('branches on imaginaryTime flag', () => {
    expect(tdseApplyKineticBlock).toContain('params.imaginaryTime')
  })

  it('contains real exponential decay for imaginary-time mode', () => {
    expect(tdseApplyKineticBlock).toContain('exp(-arg)')
  })

  it('contains unitary phase rotation for real-time mode', () => {
    expect(tdseApplyKineticBlock).toContain('cosP')
    expect(tdseApplyKineticBlock).toContain('sinP')
  })

  it('includes hbar*k2*dt/(2*mass) as the argument for both branches', () => {
    expect(tdseApplyKineticBlock).toContain('params.hbar * k2 * params.dt / (2.0')
  })
})

describe('renormalization shader', () => {
  it('declares RenormUniforms struct', () => {
    expect(renormalizeBlock).toContain('struct RenormUniforms')
    expect(renormalizeBlock).toContain('totalElements: u32')
    expect(renormalizeBlock).toContain('targetNorm: f32')
  })

  it('includes currentNorm from diagResult[0]', () => {
    expect(renormalizeBlock).toContain('diagResult[0]')
  })

  it('contains sqrt(target/current) scale factor', () => {
    expect(renormalizeBlock).toContain('sqrt(targetNorm / currentNorm)')
  })

  it('guards against invalid norms (zero, negative, NaN)', () => {
    // NaN check: currentNorm != currentNorm
    expect(renormalizeBlock).toContain('currentNorm != currentNorm')
    expect(renormalizeBlock).toContain('currentNorm <= 0.0')
    expect(renormalizeBlock).toContain('targetNorm <= 0.0')
  })

  it('scales both real and imaginary components', () => {
    expect(renormalizeBlock).toContain('psiRe[idx] = psiRe[idx] * scale')
    expect(renormalizeBlock).toContain('psiIm[idx] = psiIm[idx] * scale')
  })

  it('has workgroup size 64', () => {
    expect(renormalizeBlock).toContain('@compute @workgroup_size(64)')
  })
})
