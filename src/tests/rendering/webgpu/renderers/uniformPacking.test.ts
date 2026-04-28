/**
 * Branch-coverage tests for packSchroedingerUniforms.
 *
 * The packer is a fan-out orchestrator over a dozen sub-packers, each with
 * its own fallback ladder for missing store data. We drive several
 * representative configurations through it and pin field-level outputs so
 * regressions in any sub-packer surface here, before they reach a shader.
 */
import { describe, expect, it } from 'vitest'

import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import {
  packSchroedingerUniforms,
  type SchroedingerPackParams,
} from '@/rendering/webgpu/renderers/uniformPacking'

const I = SCHROEDINGER_LAYOUT.index

function makeBuffer(): { floatView: Float32Array; intView: Int32Array } {
  const ab = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
  return { floatView: new Float32Array(ab), intView: new Int32Array(ab) }
}

const baseParams: SchroedingerPackParams = {
  quantumModeInt: 0,
  quantumModeStr: 'harmonicOscillator',
  isUniformComputeMode: false,
  isDensityMatrixMode: false,
  dimension: 3,
  presetTermCount: 1,
  presetData: null,
  boundingRadius: 2.0,
  canonicalDensityCompensation: 1.0,
  cachedPeakDensity: 0.5,
  colorAlgorithm: 0,
  effectiveSampleCount: 64,
  effectiveMomentumScale: 1.0,
  hbar: 1.0,
  animationTime: 0,
  uncertaintyLogRhoThreshold: -3,
  uncertaintyConfidenceMass: 0.95,
  uncertaintyBoundaryWidth: 0.1,
  schroedinger: undefined,
  appearance: undefined,
  pbr: undefined,
  pauliSpinor: undefined,
  rendererOpenQuantumEnabled: false,
  rendererQuantumMode: 'harmonicOscillator',
  rendererTermCount: 1,
}

describe('packSchroedingerUniforms — defaults', () => {
  it('writes quantumMode/termCount and seeds default ground-state coefficient', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, { ...baseParams })

    expect(intView[I.quantumMode]).toBe(0)
    expect(intView[I.termCount]).toBe(1)
    // Default ground-state HO: coeff[0] = (1, 0)
    expect(floatView[I.coeff]).toBe(1)
    expect(floatView[I.coeff + 1]).toBe(0)
    // Default omega = 1 across all 11 dimensions; the 12th slot is fixed pad 0.
    for (let i = 0; i < 11; i++) expect(floatView[I.omega + i]).toBe(1)
    expect(floatView[I.omega + 11]).toBe(0)
  })

  it('clamps invalid hydrogen quantum numbers (n=0 → n=1, l>=n → l=n-1, m beyond ±l clamped)', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      schroedinger: {
        principalQuantumNumber: 0,
        azimuthalQuantumNumber: 5,
        magneticQuantumNumber: 99,
      } as never,
    })
    expect(intView[I.principalN]).toBe(1) // n was 0 → clamped to 1
    expect(intView[I.azimuthalL]).toBe(0) // l < n=1 → 0
    expect(intView[I.magneticM]).toBe(0) // m clamped into [−l, l] = {0}
  })

  it('writes hydrogenBoost = 50·n²·3^l for the default configuration (n=2, l=1)', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, { ...baseParams })
    // schroedinger absent → defaults principalN=2, azimuthalL=1.
    expect(floatView[I.hydrogenBoost]).toBeCloseTo(50 * 4 * 3, 4)
  })

  it('writes Wheeler–DeWitt phase rotation rate when mode is wheelerDeWitt and toggle is on', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      quantumModeStr: 'wheelerDeWitt',
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: true, phaseRotationSpeed: 1.7 },
      } as never,
    })
    expect(floatView[I.wdwPhaseRotationRate]).toBeCloseTo(1.7)
  })

  it('zeros Wheeler–DeWitt phase rate when phaseRotationEnabled is false', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      quantumModeStr: 'wheelerDeWitt',
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: false, phaseRotationSpeed: 99 },
      } as never,
    })
    expect(floatView[I.wdwPhaseRotationRate]).toBe(0)
  })

  it('zeros Wheeler–DeWitt phase rate when quantum mode is not wheelerDeWitt', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      schroedinger: {
        wheelerDeWitt: { phaseRotationEnabled: true, phaseRotationSpeed: 5 },
      } as never,
    })
    expect(floatView[I.wdwPhaseRotationRate]).toBe(0)
  })

  it('writes default branch colors (cyan / magenta) when none provided', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, { ...baseParams })
    expect(floatView[I.branchColorA]).toBe(0)
    expect(floatView[I.branchColorA + 1]).toBe(1)
    expect(floatView[I.branchColorA + 2]).toBe(1)
    expect(floatView[I.branchColorB]).toBe(1)
    expect(floatView[I.branchColorB + 1]).toBe(0)
    expect(floatView[I.branchColorB + 2]).toBe(1)
  })

  it('overrides branch colors and writes branchSeparation', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      branchColorA: [0.2, 0.4, 0.6],
      branchColorB: [0.7, 0.8, 0.9],
      branchSeparation: 0.42,
    })
    expect(floatView[I.branchColorA]).toBeCloseTo(0.2)
    expect(floatView[I.branchColorA + 2]).toBeCloseTo(0.6)
    expect(floatView[I.branchColorB + 1]).toBeCloseTo(0.8)
    expect(floatView[I.branchSeparation]).toBeCloseTo(0.42)
  })

  it('falls back branchTransitionWidth to 0.2 when input is non-finite or non-positive', () => {
    const cases: Array<number | undefined> = [undefined, NaN, -1, 0]
    for (const w of cases) {
      const { floatView, intView } = makeBuffer()
      packSchroedingerUniforms(floatView, intView, { ...baseParams, branchTransitionWidth: w })
      expect(floatView[I.branchTransitionWidth]).toBeCloseTo(0.2)
    }
  })

  it('preserves a positive finite branchTransitionWidth', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, { ...baseParams, branchTransitionWidth: 0.05 })
    expect(floatView[I.branchTransitionWidth]).toBeCloseTo(0.05)
  })
})

describe('packSchroedingerUniforms — hydrogen modes', () => {
  it('hydrogenNDCoupled writes angular chain into extraDimN slots', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      dimension: 5,
      quantumModeStr: 'hydrogenNDCoupled',
      rendererQuantumMode: 'hydrogenNDCoupled',
      schroedinger: {
        principalQuantumNumber: 3,
        azimuthalQuantumNumber: 2,
        magneticQuantumNumber: 1,
        angularChain: [1, 0],
      } as never,
    })
    expect(intView[I.extraDimN + 0]).toBe(1)
    expect(intView[I.extraDimN + 1]).toBe(0)
  })

  it('hydrogenND writes extra-dimension HO numbers (not the angular chain)', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      dimension: 5,
      quantumModeStr: 'hydrogenND',
      rendererQuantumMode: 'hydrogenND',
      schroedinger: {
        principalQuantumNumber: 2,
        azimuthalQuantumNumber: 1,
        magneticQuantumNumber: 0,
        extraDimQuantumNumbers: [3, 4],
        angularChain: [99, 99], // must be ignored in non-coupled mode
      } as never,
    })
    expect(intView[I.extraDimN + 0]).toBe(3)
    expect(intView[I.extraDimN + 1]).toBe(4)
  })

  it('honors useRealOrbitals flag', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      schroedinger: { useRealOrbitals: true } as never,
    })
    expect(intView[I.useRealOrbitals]).toBe(1)
  })

  it('forces emissionColorShift to 0 in Wigner representation (hue-cycling makes no sense in phase space)', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      schroedinger: { representation: 'wigner' } as never,
      appearance: { faceEmissionColorShift: 0.7 } as never,
    })
    expect(floatView[I.emissionColorShift]).toBe(0)
  })

  it('uses appearance.faceEmissionColorShift in non-Wigner representations', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      appearance: { faceEmissionColorShift: 0.4 } as never,
    })
    expect(floatView[I.emissionColorShift]).toBeCloseTo(0.4)
  })

  it('isDensityMatrixMode disables nodal rendering even when nodalEnabled is true', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      isDensityMatrixMode: true,
      schroedinger: { nodalEnabled: true } as never,
    })
    expect(intView[I.nodalEnabled]).toBe(0)
  })

  it('density matrix off + nodalEnabled true → nodal flag = 1', () => {
    const { floatView, intView } = makeBuffer()
    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      isDensityMatrixMode: false,
      schroedinger: { nodalEnabled: true } as never,
    })
    expect(intView[I.nodalEnabled]).toBe(1)
  })

  it('preset data overrides defaults: omega/quantum/coeff/energy', () => {
    const { floatView, intView } = makeBuffer()
    const omega = new Float32Array(11)
    omega.fill(2.5)
    const quantum = new Int32Array(8 * 11)
    quantum[0] = 7
    const coeff = new Float32Array(16) // 8 terms × 2 (re,im)
    coeff[0] = 0.6
    coeff[1] = 0.8
    const energy = new Float32Array(8)
    energy[0] = 1.5

    packSchroedingerUniforms(floatView, intView, {
      ...baseParams,
      presetData: { omega, quantum, coeff, energy },
    })

    expect(floatView[I.omega]).toBeCloseTo(2.5)
    expect(intView[I.quantum]).toBe(7)
    expect(floatView[I.coeff]).toBeCloseTo(0.6)
    expect(floatView[I.coeff + 1]).toBeCloseTo(0.8)
    // Padding floats z/w of the vec4f must be zero.
    expect(floatView[I.coeff + 2]).toBe(0)
    expect(floatView[I.coeff + 3]).toBe(0)
    expect(floatView[I.energy]).toBeCloseTo(1.5)
  })
})
