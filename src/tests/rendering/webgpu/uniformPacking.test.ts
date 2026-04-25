import { describe, expect, it } from 'vitest'

import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import type { SchroedingerPackParams } from '@/rendering/webgpu/renderers/uniformPacking'
import {
  applyHOMomentumTransform,
  computeCanonicalCompensation,
  packBasisVectors,
  packCameraUniforms,
  packMaterialUniforms,
  packQualityUniforms,
  packSchroedingerUniforms,
} from '@/rendering/webgpu/renderers/uniformPacking'
import { MAX_DIM, MAX_TERMS } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

describe('packQualityUniforms', () => {
  it('packs maxSamples from quality multiplier at int offset 0', () => {
    const buffer = new ArrayBuffer(48)
    const dataView = new DataView(buffer)
    const floatView = new Float32Array(buffer)

    packQualityUniforms(floatView, dataView, 1.0)

    expect(dataView.getInt32(0, true)).toBe(128)
    expect(floatView[1]).toBeCloseTo(0.001)
    expect(floatView[8]).toBe(1.0)
  })

  it('scales maxSamples proportionally to quality multiplier', () => {
    const buffer = new ArrayBuffer(48)
    const dataView = new DataView(buffer)
    const floatView = new Float32Array(buffer)

    packQualityUniforms(floatView, dataView, 0.5)

    expect(dataView.getInt32(0, true)).toBe(64)
    expect(floatView[1]).toBeCloseTo(0.002)
    expect(floatView[8]).toBe(0.5)
  })
})

describe('packBasisVectors', () => {
  it('initializes with identity basis when no vectors provided', () => {
    const data = new Float32Array(48)

    packBasisVectors(data, {
      dimension: 3,
      sliceAnimationEnabled: false,
      sliceSpeed: 1,
      sliceAmplitude: 0.5,
      accumulatedTime: 0,
    })

    // X axis = [1, 0, 0, ...]
    expect(data[0]).toBe(1.0)
    expect(data[1]).toBe(0.0)
    expect(data[2]).toBe(0.0)

    // Y axis = [0, 1, 0, ...]
    expect(data[13]).toBe(1.0)
    expect(data[12]).toBe(0.0)

    // Z axis = [0, 0, 1, ...]
    expect(data[26]).toBe(1.0)
    expect(data[24]).toBe(0.0)
  })

  it('uses provided basis vectors', () => {
    const data = new Float32Array(48)
    const basisX = new Float32Array([0.707, 0.707, 0])
    const basisY = new Float32Array([-0.707, 0.707, 0])

    packBasisVectors(data, {
      dimension: 3,
      basisX,
      basisY,
      sliceAnimationEnabled: false,
      sliceSpeed: 1,
      sliceAmplitude: 0.5,
      accumulatedTime: 0,
    })

    expect(data[0]).toBeCloseTo(0.707)
    expect(data[1]).toBeCloseTo(0.707)
    expect(data[12]).toBeCloseTo(-0.707)
    expect(data[13]).toBeCloseTo(0.707)
  })

  it('adds slice animation offsets for dimensions > 3', () => {
    const data = new Float32Array(48)

    packBasisVectors(data, {
      dimension: 5,
      sliceAnimationEnabled: true,
      sliceSpeed: 1,
      sliceAmplitude: 1.0,
      accumulatedTime: 1.0,
    })

    // Origin offset = 12 * 3 = 36
    // Dims 3 and 4 (indices 39, 40) should have non-zero animation offsets
    expect(data[39]).not.toBe(0)
    expect(data[40]).not.toBe(0)
  })

  it('does not add slice animation for 3D', () => {
    const data = new Float32Array(48)

    packBasisVectors(data, {
      dimension: 3,
      sliceAnimationEnabled: true,
      sliceSpeed: 1,
      sliceAmplitude: 1.0,
      accumulatedTime: 1.0,
    })

    // Origin should remain zero
    for (let i = 36; i < 48; i++) {
      expect(data[i]).toBe(0)
    }
  })
})

describe('packMaterialUniforms', () => {
  it('packs default material values when stores are undefined', () => {
    const buffer = new ArrayBuffer(160)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    packMaterialUniforms(data, dataView, {
      appearance: undefined,
      pbr: undefined,
    })

    // baseColor alpha = 1.0
    expect(data[3]).toBe(1.0)

    // Default roughness, metallic, reflectance
    expect(data[5]).toBeCloseTo(0.5) // roughness
    expect(data[4]).toBeCloseTo(0.0) // metallic
    expect(data[6]).toBeCloseTo(0.5) // reflectance
  })
})

describe('packCameraUniforms', () => {
  const mockCamera = {
    position: { x: 0, y: 0, z: 8 },
    target: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 1000,
    fov: 50,
    viewMatrix: { elements: new Float32Array(16) },
    projectionMatrix: { elements: new Float32Array(16) },
    viewProjectionMatrix: { elements: new Float32Array(16) },
    inverseViewMatrix: { elements: new Float32Array(16) },
    inverseProjectionMatrix: { elements: new Float32Array(16) },
  }

  it('packs camera position at offset 112', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    packCameraUniforms(data, dataView, {
      camera: mockCamera,
      animationTime: 1.5,
      is2D: false,
      bayerOffset: [0, 0],
      size: { width: 1920, height: 1080 },
      frameDelta: 0.016,
      frameNumber: 42,
    })

    expect(data[112]).toBe(0) // x
    expect(data[113]).toBe(0) // y
    expect(data[114]).toBe(8) // z
    expect(data[115]).toBeCloseTo(0.1) // near
    expect(data[116]).toBe(1000) // far
  })

  it('packs screen size and aspect ratio', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    packCameraUniforms(data, dataView, {
      camera: mockCamera,
      animationTime: 0,
      is2D: false,
      bayerOffset: [0, 0],
      size: { width: 1920, height: 1080 },
      frameDelta: 0.016,
      frameNumber: 0,
    })

    expect(data[118]).toBe(1920)
    expect(data[119]).toBe(1080)
    expect(data[120]).toBeCloseTo(1920 / 1080)
  })

  it('builds model matrix from transform in 3D mode', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    packCameraUniforms(data, dataView, {
      camera: mockCamera,
      animationTime: 0,
      is2D: false,
      transform: { uniformScale: 2.0, position: [1, 2, 3] },
      bayerOffset: [0, 0],
      size: { width: 1920, height: 1080 },
      frameDelta: 0.016,
      frameNumber: 0,
    })

    // Model matrix diagonal = scale = 2.0
    expect(data[80]).toBe(2.0)
    expect(data[85]).toBe(2.0)
    expect(data[90]).toBe(2.0)

    // Model matrix translation
    expect(data[92]).toBe(1)
    expect(data[93]).toBe(2)
    expect(data[94]).toBe(3)
  })

  it('packs frame number as uint32', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    packCameraUniforms(data, dataView, {
      camera: mockCamera,
      animationTime: 0,
      is2D: false,
      bayerOffset: [0, 0],
      size: { width: 100, height: 100 },
      frameDelta: 0.016,
      frameNumber: 12345,
    })

    expect(dataView.getUint32(123 * 4, true)).toBe(12345)
  })

  it('precomputes cameraPositionModel at offset 128 (inverseModelMatrix * cameraPosition)', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    // Camera at (0, 0, 8), transform scale=2, position=(1, 2, 3).
    // inverseModelMatrix is diag(1/2) + translate(-pos/2).
    // cameraPositionModel = (0.5*0 + (-0.5), 0.5*0 + (-1), 0.5*8 + (-1.5)) = (-0.5, -1, 2.5).
    packCameraUniforms(data, dataView, {
      camera: mockCamera, // position=(0,0,8)
      animationTime: 0,
      is2D: false,
      transform: { uniformScale: 2.0, position: [1, 2, 3] },
      bayerOffset: [0, 0],
      size: { width: 100, height: 100 },
      frameDelta: 0.016,
      frameNumber: 0,
    })

    expect(data[128]).toBeCloseTo(-0.5)
    expect(data[129]).toBeCloseTo(-1.0)
    expect(data[130]).toBeCloseTo(2.5)
    // Final padding slot zeroed
    expect(data[131]).toBe(0)
  })

  it('recomputes cameraPositionModel when model matrix changes (scale)', () => {
    const buffer = new ArrayBuffer(528)
    const data = new Float32Array(buffer)
    const dataView = new DataView(buffer)

    // First pack: scale=1 → cameraPositionModel equals cameraPosition
    packCameraUniforms(data, dataView, {
      camera: mockCamera, // position=(0,0,8)
      animationTime: 0,
      is2D: false,
      transform: { uniformScale: 1.0, position: [0, 0, 0] },
      bayerOffset: [0, 0],
      size: { width: 100, height: 100 },
      frameDelta: 0.016,
      frameNumber: 0,
    })
    expect(data[130]).toBeCloseTo(8.0)

    // Repack with scale=4 → cameraPositionModel.z = 8 / 4 = 2
    packCameraUniforms(data, dataView, {
      camera: mockCamera,
      animationTime: 0,
      is2D: false,
      transform: { uniformScale: 4.0, position: [0, 0, 0] },
      bayerOffset: [0, 0],
      size: { width: 100, height: 100 },
      frameDelta: 0.016,
      frameNumber: 0,
    })
    expect(data[130]).toBeCloseTo(2.0)
  })
})

describe('applyHOMomentumTransform', () => {
  it('inverts omega values by 1/(hbar^2 * omega)', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    // Set omega at offset 16/4 = 4
    floatView[4] = 2.0
    floatView[5] = 4.0
    intView[1] = 1 // termCount

    applyHOMomentumTransform(floatView, intView, 2, 1.0)

    expect(floatView[4]).toBeCloseTo(0.5) // 1/(1*2)
    expect(floatView[5]).toBeCloseTo(0.25) // 1/(1*4)
  })

  it('applies (-i)^n rotation to coefficients', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1 // termCount

    // Set quantum number n=1 for first dim
    intView[64 / 4] = 1

    // Set omega (needed but not under test here)
    floatView[4] = 1.0

    // Set coeff = (1, 0) (real)
    const coeffOff = 416 / 4
    floatView[coeffOff] = 1.0
    floatView[coeffOff + 1] = 0.0

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    // (-i)^1 * (1+0i) = -i = (0, -1)
    expect(floatView[coeffOff]).toBeCloseTo(0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(-1)
  })

  it('forces representationMode to 0 (position)', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 1.0
    intView[SCHROEDINGER_LAYOUT.index.representationMode] = 1 // momentum mode

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    expect(intView[SCHROEDINGER_LAYOUT.index.representationMode]).toBe(0)
  })
})

describe('computeCanonicalCompensation', () => {
  it('returns 1.0 compensation for empty preset', () => {
    const result = computeCanonicalCompensation(
      { termCount: 0, coefficients: [], quantumNumbers: [], omega: [], energies: [] },
      3,
      5.0
    )
    expect(result.compensation).toBe(1.0)
    expect(result.peakDensity).toBe(0.1)
  })

  it('returns positive compensation for ground state HO', () => {
    const result = computeCanonicalCompensation(
      {
        termCount: 1,
        coefficients: [[1, 0]],
        quantumNumbers: [[0, 0, 0]],
        omega: [1.0, 1.0, 1.0],
        energies: [1.5],
      },
      3,
      5.0
    )
    expect(result.compensation).toBeGreaterThan(0)
    expect(result.peakDensity).toBeGreaterThan(0)
  })

  it('produces lower peakDensity for higher quantum numbers (probability spreads)', () => {
    const ground = computeCanonicalCompensation(
      {
        termCount: 1,
        coefficients: [[1, 0]],
        quantumNumbers: [[0]],
        omega: [1.0],
        energies: [0.5],
      },
      1,
      3.0
    )

    const excited = computeCanonicalCompensation(
      {
        termCount: 1,
        coefficients: [[1, 0]],
        quantumNumbers: [[4]],
        omega: [1.0],
        energies: [4.5],
      },
      1,
      10.0
    )

    // Higher quantum number spreads density → lower peak density
    expect(excited.peakDensity).toBeLessThan(ground.peakDensity)
  })

  it('finds dominant term by coefficient magnitude', () => {
    const result = computeCanonicalCompensation(
      {
        termCount: 2,
        coefficients: [
          [0.1, 0], // weak
          [0.9, 0], // dominant
        ],
        quantumNumbers: [[0], [2]],
        omega: [1.0],
        energies: [0.5, 2.5],
      },
      1,
      5.0
    )
    // Should be based on the n=2 term (dominant)
    expect(result.peakDensity).toBeGreaterThan(0)
    expect(result.compensation).toBeGreaterThan(0)
  })
})

// ============================================================================
// packSchroedingerUniforms — core quantum uniform packing
// ============================================================================

function createBuffer(bytes: number) {
  const buffer = new ArrayBuffer(bytes)
  return {
    floatView: new Float32Array(buffer),
    intView: new Int32Array(buffer),
  }
}

function makeBaseParams(overrides: Partial<SchroedingerPackParams> = {}): SchroedingerPackParams {
  return {
    quantumModeInt: 0,
    quantumModeStr: 'harmonicOscillator',
    isUniformComputeMode: false,
    isDensityMatrixMode: false,
    dimension: 4,
    presetTermCount: 1,
    presetData: {
      omega: new Float32Array(MAX_DIM).fill(1.0),
      quantum: new Int32Array(MAX_TERMS * MAX_DIM),
      coeff: new Float32Array(MAX_TERMS * 2),
      energy: new Float32Array(MAX_TERMS).fill(0.5),
    },
    boundingRadius: 5.0,
    canonicalDensityCompensation: 1.0,
    cachedPeakDensity: 0.1,
    colorAlgorithm: 4,
    effectiveSampleCount: 128,
    effectiveMomentumScale: 1.0,
    hbar: 1.0,
    animationTime: 0,
    uncertaintyLogRhoThreshold: -4.0,
    uncertaintyConfidenceMass: 0.95,
    uncertaintyBoundaryWidth: 1.0,
    schroedinger: undefined,
    appearance: undefined,
    pbr: undefined,
    pauliSpinor: undefined,
    rendererOpenQuantumEnabled: false,
    rendererQuantumMode: 'harmonicOscillator',
    rendererTermCount: 1,
    ...overrides,
  }
}

describe('packSchroedingerUniforms', () => {
  // The buffer must be large enough for the entire SchroedingerUniforms struct.
  // The struct extends to ~1600 bytes. Use 2000 to be safe.
  const BUFFER_SIZE = 2000

  it('writes quantumMode and termCount at byte offsets 0 and 4', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({ quantumModeInt: 1, presetTermCount: 3 })
    params.presetData!.coeff[0] = 1.0

    packSchroedingerUniforms(floatView, intView, params)

    expect(intView[0]).toBe(1) // quantumMode
    expect(intView[1]).toBe(3) // termCount
  })

  it('packs omega array at byte offset 16 (MAX_DIM values)', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const omega = new Float32Array(MAX_DIM)
    omega[0] = 2.0
    omega[1] = 3.0
    omega[2] = 0.5
    const params = makeBaseParams({
      presetData: {
        omega,
        quantum: new Int32Array(MAX_TERMS * MAX_DIM),
        coeff: (() => {
          const c = new Float32Array(MAX_TERMS * 2)
          c[0] = 1.0
          return c
        })(),
        energy: new Float32Array(MAX_TERMS).fill(0.5),
      },
    })

    packSchroedingerUniforms(floatView, intView, params)

    const omegaOff = 16 / 4
    expect(floatView[omegaOff]).toBe(2.0)
    expect(floatView[omegaOff + 1]).toBe(3.0)
    expect(floatView[omegaOff + 2]).toBe(0.5)
  })

  it('packs quantum numbers at byte offset 64 (MAX_TERMS * MAX_DIM ints)', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const quantum = new Int32Array(MAX_TERMS * MAX_DIM)
    quantum[0] = 2 // term 0, dim 0
    quantum[1] = 1 // term 0, dim 1
    quantum[MAX_DIM] = 3 // term 1, dim 0
    const params = makeBaseParams({
      presetTermCount: 2,
      presetData: {
        omega: new Float32Array(MAX_DIM).fill(1.0),
        quantum,
        coeff: (() => {
          const c = new Float32Array(MAX_TERMS * 2)
          c[0] = 0.7
          c[4] = 0.7 // term 1 re
          return c
        })(),
        energy: new Float32Array(MAX_TERMS).fill(0.5),
      },
    })

    packSchroedingerUniforms(floatView, intView, params)

    const qOff = 64 / 4
    expect(intView[qOff]).toBe(2)
    expect(intView[qOff + 1]).toBe(1)
    expect(intView[qOff + MAX_DIM]).toBe(3)
  })

  it('packs coefficients at byte offset 416 with vec4f layout (re, im, pad, pad)', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const coeff = new Float32Array(MAX_TERMS * 2)
    coeff[0] = 0.6 // term 0 re
    coeff[1] = 0.4 // term 0 im
    coeff[2] = 0.3 // term 1 re
    coeff[3] = -0.2 // term 1 im
    const params = makeBaseParams({
      presetTermCount: 2,
      presetData: {
        omega: new Float32Array(MAX_DIM).fill(1.0),
        quantum: new Int32Array(MAX_TERMS * MAX_DIM),
        coeff,
        energy: new Float32Array(MAX_TERMS).fill(0.5),
      },
    })

    packSchroedingerUniforms(floatView, intView, params)

    const cOff = 416 / 4
    expect(floatView[cOff]).toBeCloseTo(0.6) // term 0 re
    expect(floatView[cOff + 1]).toBeCloseTo(0.4) // term 0 im
    expect(floatView[cOff + 2]).toBe(0) // padding
    expect(floatView[cOff + 3]).toBe(0) // padding
    expect(floatView[cOff + 4]).toBeCloseTo(0.3) // term 1 re
    expect(floatView[cOff + 5]).toBeCloseTo(-0.2) // term 1 im
  })

  it('validates hydrogen quantum numbers: 0 <= l < n, -l <= m <= l', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)

    // Set invalid quantum numbers: n=2, l=5 (should clamp to l=1), m=10 (should clamp to m=1)
    const params = makeBaseParams({
      quantumModeInt: 1,
      quantumModeStr: 'hydrogenND',
      schroedinger: {
        principalQuantumNumber: 2,
        azimuthalQuantumNumber: 5, // invalid: should be clamped to n-1=1
        magneticQuantumNumber: 10, // invalid: should be clamped to l=1
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(intView[576 / 4]).toBe(2) // n
    expect(intView[580 / 4]).toBe(1) // l clamped to n-1
    expect(intView[584 / 4]).toBe(1) // m clamped to l
  })

  it('validates hydrogen quantum numbers: negative m clamped to -l', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)

    const params = makeBaseParams({
      quantumModeInt: 1,
      schroedinger: {
        principalQuantumNumber: 3,
        azimuthalQuantumNumber: 2,
        magneticQuantumNumber: -10, // should clamp to -l = -2
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(intView[576 / 4]).toBe(3) // n
    expect(intView[580 / 4]).toBe(2) // l
    expect(intView[584 / 4]).toBe(-2) // m clamped to -l
  })

  it('validates hydrogen quantum numbers: n=0 clamped to n=1', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)

    const params = makeBaseParams({
      schroedinger: {
        principalQuantumNumber: 0,
        azimuthalQuantumNumber: 0,
        magneticQuantumNumber: 0,
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(intView[576 / 4]).toBe(1) // n clamped to 1
    expect(intView[580 / 4]).toBe(0) // l = 0 (valid for n=1)
    expect(intView[584 / 4]).toBe(0) // m = 0 (valid for l=0)
  })

  it('computes hydrogenBoost = 50 * n^2 * 3^l', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)

    const params = makeBaseParams({
      schroedinger: {
        principalQuantumNumber: 3,
        azimuthalQuantumNumber: 2,
        magneticQuantumNumber: 0,
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    // hydrogenBoost = 50 * 3^2 * 3^2 = 50 * 9 * 9 = 4050
    expect(floatView[596 / 4]).toBeCloseTo(4050)
  })

  it('packs extraDimOmega with frequency spread applied', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const extraDimOmega = [2.0, 3.0, 1.5, 0.5]

    const params = makeBaseParams({
      dimension: 7, // 7D = 3D core + 4 extra dims
      schroedinger: {
        extraDimOmega,
        extraDimFrequencySpread: 0.1,
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    const extraOmegaOff = 640 / 4
    for (let i = 0; i < 4; i++) {
      const expected = extraDimOmega[i]! * (1.0 + (i - 3.5) * 0.1)
      expect(floatView[extraOmegaOff + i]).toBeCloseTo(expected)
    }
  })

  it('defaults to safe values when schroedinger config is undefined', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({ schroedinger: undefined })

    // Should not throw
    packSchroedingerUniforms(floatView, intView, params)

    // Default hydrogen n = 2
    expect(intView[576 / 4]).toBe(2)
  })

  it('packs energy array at byte offset 544', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const energy = new Float32Array(MAX_TERMS)
    energy[0] = 1.5
    energy[1] = 2.5
    energy[2] = 3.5
    const params = makeBaseParams({
      presetTermCount: 3,
      presetData: {
        omega: new Float32Array(MAX_DIM).fill(1.0),
        quantum: new Int32Array(MAX_TERMS * MAX_DIM),
        coeff: (() => {
          const c = new Float32Array(MAX_TERMS * 2)
          c[0] = 1.0
          return c
        })(),
        energy,
      },
    })

    packSchroedingerUniforms(floatView, intView, params)

    const eOff = 544 / 4
    expect(floatView[eOff]).toBeCloseTo(1.5)
    expect(floatView[eOff + 1]).toBeCloseTo(2.5)
    expect(floatView[eOff + 2]).toBeCloseTo(3.5)
  })

  it('applies canonicalDensityCompensation to densityGain', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      canonicalDensityCompensation: 2.5,
      schroedinger: {
        densityGain: 3.0,
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    // densityGain at offset 684: gain * compensation = 3.0 * 2.5 = 7.5
    expect(floatView[684 / 4]).toBeCloseTo(7.5)
  })

  // Wheeler–DeWitt render-only phase rotation rate: 0 unless mode+enabled.
  it('writes wdwPhaseRotationRate = 0 for non-WdW modes even when flag set', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'harmonicOscillator',
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: true, phaseRotationSpeed: 4.2 },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.wdwPhaseRotationRate]).toBe(0)
  })

  it('writes wdwPhaseRotationRate = 0 when WdW but flag disabled', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'wheelerDeWitt',
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: false, phaseRotationSpeed: 3.7 },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.wdwPhaseRotationRate]).toBe(0)
  })

  it('writes wdwPhaseRotationRate = phaseRotationSpeed when WdW + enabled', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'wheelerDeWitt',
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: true, phaseRotationSpeed: 2.75 },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.wdwPhaseRotationRate]).toBeCloseTo(2.75)
  })

  // Anti-de Sitter render-time time evolution uniforms. adsEnergy drives phase
  // rotation for stable bound states; adsGrowthRate drives |ψ|² amplification
  // for tachyons. The two slots are mutually exclusive and zeroed for every
  // non-AdS mode.
  it('writes adsEnergy = 0 and adsGrowthRate = 0 for non-AdS modes', () => {
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'harmonicOscillator',
      schroedinger: {
        antiDeSitter: { d: 4, n: 0, l: 0, m: 0, mL: 0, branch: 'standard' },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.adsEnergy]).toBe(0)
    expect(floatView[SCHROEDINGER_LAYOUT.index.adsGrowthRate]).toBe(0)
  })

  it('writes adsEnergy = E = Δ + ℓ + 2n for stable AdS states', () => {
    // d=4, mL=0 ⇒ Δ=3; n=0, ℓ=0 ⇒ E=3. Stable (above BF) ⇒ growthRate=0.
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'antiDeSitter',
      schroedinger: {
        antiDeSitter: { d: 4, n: 0, l: 0, m: 0, mL: 0, branch: 'standard' },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.adsEnergy]).toBeCloseTo(3)
    expect(floatView[SCHROEDINGER_LAYOUT.index.adsGrowthRate]).toBe(0)
  })

  it('writes adsGrowthRate = γ and adsEnergy = 0 for tachyonic AdS states', () => {
    // d=3, mL=-1.1 ⇒ m²L²=-1.21, BF=-1 ⇒ below BF (tachyon).
    // γ = √(|1 + (-1.21)|) = √0.21 ≈ 0.4583.
    const { floatView, intView } = createBuffer(BUFFER_SIZE)
    const params = makeBaseParams({
      quantumModeStr: 'antiDeSitter',
      schroedinger: {
        antiDeSitter: { d: 3, n: 0, l: 0, m: 0, mL: -1.1, branch: 'standard' },
      } as never,
    })

    packSchroedingerUniforms(floatView, intView, params)

    expect(floatView[SCHROEDINGER_LAYOUT.index.adsEnergy]).toBe(0)
    expect(floatView[SCHROEDINGER_LAYOUT.index.adsGrowthRate]).toBeCloseTo(Math.sqrt(0.21), 5)
  })
})

// ============================================================================
// applyHOMomentumTransform — exhaustive (-i)^n rotation tests
// ============================================================================

describe('applyHOMomentumTransform — all rotation cases', () => {
  it('(-i)^0 = 1: no rotation when sum of quantum numbers is 0 mod 4', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 1.0

    // n=0 for all dims → totalN = 0 → mod 4 = 0 → multiply by 1
    const coeffOff = 416 / 4
    floatView[coeffOff] = 3.0
    floatView[coeffOff + 1] = 2.0

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    expect(floatView[coeffOff]).toBeCloseTo(3.0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(2.0)
  })

  it('(-i)^2 = -1: negates both components when sum is 2 mod 4', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 1.0

    // Set quantum numbers so sum = 2
    const qOff = 64 / 4
    intView[qOff] = 2 // n=2 in dim 0

    const coeffOff = 416 / 4
    floatView[coeffOff] = 1.0
    floatView[coeffOff + 1] = 0.5

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    // (-i)^2 = -1: (re, im) → (-re, -im)
    expect(floatView[coeffOff]).toBeCloseTo(-1.0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(-0.5)
  })

  it('(-i)^3 = i: rotates (re, im) → (-im, re)', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 1.0

    const qOff = 64 / 4
    intView[qOff] = 3 // n=3

    const coeffOff = 416 / 4
    floatView[coeffOff] = 2.0
    floatView[coeffOff + 1] = 1.0

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    // (-i)^3 = i: (re, im) → (-im, re)
    expect(floatView[coeffOff]).toBeCloseTo(-1.0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(2.0)
  })

  it('handles multi-term superposition with different rotation phases', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 2 // 2 terms
    floatView[4] = 1.0

    const qOff = 64 / 4
    intView[qOff] = 1 // term 0: n=1 → (-i)^1
    intView[qOff + MAX_DIM] = 2 // term 1: n=2 → (-i)^2

    const coeffOff = 416 / 4
    floatView[coeffOff] = 1.0 // term 0 re
    floatView[coeffOff + 1] = 0.0 // term 0 im
    floatView[coeffOff + 4] = 1.0 // term 1 re (stride = 4 floats per vec4f)
    floatView[coeffOff + 5] = 0.0 // term 1 im

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    // Term 0: (-i)^1 * (1+0i) = (0, -1)
    expect(floatView[coeffOff]).toBeCloseTo(0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(-1)
    // Term 1: (-i)^2 * (1+0i) = (-1, 0)
    expect(floatView[coeffOff + 4]).toBeCloseTo(-1)
    expect(floatView[coeffOff + 5]).toBeCloseTo(0)
  })

  it('sums quantum numbers across multiple dimensions', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 1.0
    floatView[5] = 1.0
    floatView[6] = 1.0

    const qOff = 64 / 4
    // n=(1, 1, 1) → totalN = 3 → mod 4 = 3 → multiply by i
    intView[qOff] = 1
    intView[qOff + 1] = 1
    intView[qOff + 2] = 1

    const coeffOff = 416 / 4
    floatView[coeffOff] = 1.0
    floatView[coeffOff + 1] = 0.0

    applyHOMomentumTransform(floatView, intView, 3, 1.0)

    // (-i)^3 = i: (1, 0) → (0, 1) ... wait, check the switch:
    // case 3: re = -im, im = re → (-0, 1) = (0, 1)
    // Actually: re = -im = 0, im = re = 1
    expect(floatView[coeffOff]).toBeCloseTo(0)
    expect(floatView[coeffOff + 1]).toBeCloseTo(1)
  })

  it('respects hbar parameter in omega inversion', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 2.0 // omega[0]

    applyHOMomentumTransform(floatView, intView, 1, 2.0)

    // omega → 1/(hbar^2 * omega) = 1/(4 * 2) = 0.125
    expect(floatView[4]).toBeCloseTo(0.125)
  })

  it('clamps omega to minimum 0.01 before inversion', () => {
    const buffer = new ArrayBuffer(6000)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)

    intView[1] = 1
    floatView[4] = 0.0 // omega = 0 → would be division by zero

    applyHOMomentumTransform(floatView, intView, 1, 1.0)

    // omega → 1/(1 * max(0, 0.01)) = 100
    expect(floatView[4]).toBeCloseTo(100)
  })
})
