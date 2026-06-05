import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import { generateDiracMatricesFallback } from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { composeDiracWriteGridShader } from '@/rendering/webgpu/passes/DiracComputePassSetup'
import { writeDiracUniforms } from '@/rendering/webgpu/passes/DiracComputePassUniforms'
import { diracAxialChargeBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracAxialCharge.wgsl'
import { diracWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl'

type Complex = readonly [number, number]
type Matrix = Complex[][]

function fakeDevice(): GPUDevice {
  return { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice
}

function extractMatrix(data: Float32Array, s: number, matrixIndex: number): Matrix {
  const matSize = s * s * 2
  const offset = 1 + matrixIndex * matSize
  return Array.from({ length: s }, (_, row) =>
    Array.from({ length: s }, (_, col): Complex => {
      const i = offset + (row * s + col) * 2
      return [data[i]!, data[i + 1]!]
    })
  )
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const s = a.length
  return Array.from({ length: s }, (_, row) =>
    Array.from({ length: s }, (_, col): Complex => {
      let re = 0
      let im = 0
      for (let k = 0; k < s; k++) {
        const [ar, ai] = a[row]![k]!
        const [br, bi] = b[k]![col]!
        re += ar * br - ai * bi
        im += ar * bi + ai * br
      }
      return [re, im]
    })
  )
}

function scaleByMinusI(a: Matrix): Matrix {
  return a.map((row) => row.map(([re, im]): Complex => [im, -re]))
}

function expectComplex(actual: Complex, re: number, im: number): void {
  expect(actual[0]).toBeCloseTo(re, 6)
  expect(actual[1]).toBeCloseTo(im, 6)
}

describe('Dirac axial charge field view', () => {
  it('packs axialCharge to Dirac write-grid fieldView enum 7', () => {
    const uniformData = new ArrayBuffer(592)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

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

  it('computes the expected 3D gamma5 matrix from -i alpha0 alpha1 alpha2', () => {
    const { gammaData, spinorSize } = generateDiracMatricesFallback(3)
    expect(spinorSize).toBe(4)

    const alpha0Alpha1 = multiply(extractMatrix(gammaData, 4, 0), extractMatrix(gammaData, 4, 1))
    const gamma5 = scaleByMinusI(multiply(alpha0Alpha1, extractMatrix(gammaData, 4, 2)))

    expectComplex(gamma5[0]![2]!, 1, 0)
    expectComplex(gamma5[1]![3]!, -1, 0)
    expectComplex(gamma5[2]![0]!, 1, 0)
    expectComplex(gamma5[3]![1]!, -1, 0)
  })

  it('adds a fieldView 7 shader branch for normalized axial charge', () => {
    const branchStart = diracWriteGridBlock.indexOf('params.fieldView == 7u')
    const branchEnd = diracWriteGridBlock.indexOf('} else if (params.fieldView == 6u)', branchStart)
    const branch = diracWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('diracAxialChargeAtSite(nnSiteIdx, S, T, matStride)')
    expect(branch).toContain('displayScalar = clamp(axialNorm, 0.0, 1.0) * densityGate')
  })

  it('adds a gamma-product helper for -i alpha0 alpha1 alpha2 axial charge', () => {
    expect(diracAxialChargeBlock).toContain('γ5 = -i α0 α1 α2')
    expect(diracAxialChargeBlock).toContain('fn diracAxialChargeAtSite')
    expect(diracAxialChargeBlock).toContain('params.latticeDim < 3u')
    expect(diracAxialChargeBlock).toContain('DIRAC_USE_SPARSE_GAMMA')
    expect(diracAxialChargeBlock).toContain('gammaMatrices')
    expect(diracAxialChargeBlock).toContain(
      'axialCharge += psiRe[row] * tmp0Im[row] - psiIm[row] * tmp0Re[row]'
    )
  })

  it('composes the axial helper into Dirac write-grid shaders', () => {
    const wgsl = composeDiracWriteGridShader(3)
    expect(wgsl).toContain('fn diracAxialChargeAtSite')
    expect(wgsl).toContain('params.fieldView == 7u')
  })
})
