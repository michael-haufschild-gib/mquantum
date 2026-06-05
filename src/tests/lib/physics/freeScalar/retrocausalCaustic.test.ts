import { describe, expect, it } from 'vitest'

import {
  DEFAULT_COSMOLOGY_CONFIG,
  DEFAULT_FREE_SCALAR_CONFIG,
  DEFAULT_KSPACE_VIZ,
  DEFAULT_PREHEATING_CONFIG,
  type FreeScalarConfig,
} from '@/lib/geometry/extended/freeScalar'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import {
  computeRetrocausalCausticAtLatticeSite,
  computeRetrocausalCausticAtPosition,
} from '@/lib/physics/freeScalar/retrocausalCaustic'

function makeConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    kSpaceViz: { ...DEFAULT_KSPACE_VIZ },
    cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
    preheating: { ...DEFAULT_PREHEATING_CONFIG },
    ...overrides,
  }
}

function presetConfig(id: string): FreeScalarConfig {
  const preset = FREE_SCALAR_PRESETS.find((candidate) => candidate.id === id)
  if (!preset) throw new Error(`Missing preset ${id}`)
  return makeConfig(preset.overrides)
}

describe('retrocausal caustic CPU reference', () => {
  it('stays finite and bounded at near-zero width, near-origin, high-mode 4D sites', () => {
    const config = makeConfig({
      latticeDim: 4,
      gridSize: [8, 8, 8, 8],
      spacing: [0.05, 0.05, 0.05, 0.05],
      packetWidth: 0,
      packetAmplitude: 2.75,
      packetCenter: [0, 0, 0, 0],
      modeK: [1_000_000, -999_983, 524_287, -262_147],
      mass: 0,
    })

    const samples = [
      computeRetrocausalCausticAtPosition([0, 0, 0, 0], config),
      computeRetrocausalCausticAtPosition([1e-12, -1e-12, 2e-12, -2e-12], config),
      computeRetrocausalCausticAtLatticeSite([4, 4, 4, 4], config),
    ]

    for (const sample of samples) {
      expect(Number.isFinite(sample.phi), 'phi must not poison the field buffer').toBe(true)
      expect(Number.isFinite(sample.pi), 'pi must not poison the field buffer').toBe(true)
      expect(Math.abs(sample.phi)).toBeLessThanOrEqual(config.packetAmplitude)
      expect(Math.abs(sample.pi)).toBeLessThanOrEqual(config.packetAmplitude * sample.omegaScale)
      expect(sample.omegaScale).toBeLessThanOrEqual(96)
    }
  })

  it('is phi-symmetric and pi-antisymmetric under mode-vector time reversal', () => {
    const forward = makeConfig({
      modeK: [4, -6, 3],
      packetWidth: 0.8,
      packetAmplitude: 1.1,
      mass: 0.4,
    })
    const reversed = makeConfig({ ...forward, modeK: forward.modeK.map((k) => -k) })
    const position = [0.23, -0.41, 0.17]

    const a = computeRetrocausalCausticAtPosition(position, forward)
    const b = computeRetrocausalCausticAtPosition(position, reversed)

    expect(a.phi).toBeCloseTo(b.phi, 12)
    expect(a.pi).toBeCloseTo(-b.pi, 12)
  })

  it('changes deterministically when the mode vector changes', () => {
    const base = makeConfig({
      packetWidth: 0.64,
      packetAmplitude: 1,
      modeK: [2, 5, 7],
      mass: 0.2,
    })
    const shifted = makeConfig({ ...base, modeK: [7, 5, 2] })
    const position = [0.37, -0.22, 0.49]

    const first = computeRetrocausalCausticAtPosition(position, base)
    const repeat = computeRetrocausalCausticAtPosition(position, base)
    const changed = computeRetrocausalCausticAtPosition(position, shifted)

    expect(first).toEqual(repeat)
    expect(Math.abs(first.phi - changed.phi) + Math.abs(first.pi - changed.pi)).toBeGreaterThan(
      0.05
    )
  })

  it('gives both evolving 3D presets a nonzero conjugate-momentum kick', () => {
    const samplePositions = [
      [0, 0, 0],
      [0.31, -0.17, 0.23],
      [-0.42, 0.26, -0.11],
    ]

    for (const id of ['retrocausalCausticFlower', 'retrocausalCausticWeb']) {
      const config = presetConfig(id)
      expect(config.latticeDim).toBe(3)
      expect(config.initialCondition).toBe('retrocausalCaustic')

      const maxKick = Math.max(
        ...samplePositions.map((position) =>
          Math.abs(computeRetrocausalCausticAtPosition(position, config).pi)
        )
      )
      expect(maxKick, `${id} must evolve instead of rendering a static phi shell`).toBeGreaterThan(
        0.05
      )
    }
  })
})
