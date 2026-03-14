import { describe, expect, it } from 'vitest'
import {
  sanitizeLoadedState,
  sanitizeExtendedLoadedState,
  serializeExtendedState,
} from '@/stores/utils/presetSerialization'

describe('sanitizeLoadedState', () => {
  it('removes legacy faceOpacity fields from appearance payloads', () => {
    const sanitized = sanitizeLoadedState({
      faceOpacity: 0.5,
      shaderSettings: {
        wireframe: { lineThickness: 1 },
        surface: {
          faceOpacity: 0.25,
          specularIntensity: 0.8,
        },
      },
    })
    const shaderSettings = sanitized.shaderSettings as {
      surface: Record<string, unknown> & { specularIntensity: number }
    }

    expect('faceOpacity' in sanitized).toBe(false)
    expect('faceOpacity' in shaderSettings.surface).toBe(false)
    expect(shaderSettings.surface.specularIntensity).toBe(0.8)
  })

  it('removes legacy classicSkyboxType from environment payloads', () => {
    const sanitized = sanitizeLoadedState({
      classicSkyboxType: 'sunset',
      skyboxEnabled: false,
      backgroundColor: '#101010',
    })

    expect('classicSkyboxType' in sanitized).toBe(false)
    expect(sanitized.skyboxEnabled).toBe(false)
    expect(sanitized.backgroundColor).toBe('#101010')
  })
})

describe('sanitizeExtendedLoadedState', () => {
  it('strips sqLayer transient fields from nested schroedinger config', () => {
    const input = {
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
        sqLayerEnabled: true,
        sqLayerMode: 'coherent',
        sqLayerCoherentAlphaRe: 2.5,
        sqLayerSelectedModeIndex: 1,
        sqLayerFockQuantumNumber: 4,
      },
    }
    const sanitized = sanitizeExtendedLoadedState(input)
    const config = sanitized.schroedinger as Record<string, unknown>

    // Non-transient fields preserved
    expect(config.quantumMode).toBe('harmonicOscillator')
    expect(config.termCount).toBe(3)

    // Transient sqLayer fields stripped
    expect('sqLayerEnabled' in config).toBe(false)
    expect('sqLayerMode' in config).toBe(false)
    expect('sqLayerCoherentAlphaRe' in config).toBe(false)
    expect('sqLayerSelectedModeIndex' in config).toBe(false)
    expect('sqLayerFockQuantumNumber' in config).toBe(false)
  })

  it('preserves tdse mode while stripping nested tdse runtime flags', () => {
    const input = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 3,
          fieldView: 'density',
          diagnosticsInterval: 9,
          needsReset: true,
        },
      },
    }
    const sanitized = sanitizeExtendedLoadedState(input)
    const config = sanitized.schroedinger as Record<string, unknown>
    const tdse = config.tdse as Record<string, unknown>

    expect(config.quantumMode).toBe('tdseDynamics')
    expect(tdse.latticeDim).toBe(3)
    expect(tdse.fieldView).toBe('density')
    expect(tdse.diagnosticsInterval).toBe(9)
    expect('needsReset' in tdse).toBe(false)
  })
})

describe('serializeExtendedState — pauliSpinor', () => {
  it('round-trips pauliSpinor config through serialize → sanitize → merge', () => {
    const state = {
      pauliSpinor: {
        latticeDim: 3,
        gridSize: [64, 64, 64],
        spacing: [0.15, 0.15, 0.15],
        dt: 0.005,
        stepsPerFrame: 4,
        hbar: 1.0,
        mass: 1.0,
        fieldType: 'uniform',
        fieldStrength: 3.5,
        fieldDirection: [0.5, 1.2],
        gradientStrength: 1.0,
        rotatingFrequency: 1.0,
        initialSpinDirection: [Math.PI / 4, 0],
        initialCondition: 'gaussianSuperposition',
        packetCenter: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        packetWidth: 0.8,
        packetMomentum: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        potentialType: 'harmonicTrap',
        harmonicOmega: 2.0,
        wellDepth: 5.0,
        wellWidth: 1.0,
        showPotential: true,
        fieldView: 'spinExpectation',
        spinUpColor: [0.0, 1.0, 0.5],
        spinDownColor: [1.0, 0.0, 0.5],
        autoScale: false,
        absorberEnabled: true,
        absorberWidth: 0.1,
        absorberStrength: 5.0,
        diagnosticsEnabled: true,
        diagnosticsInterval: 5,
        needsReset: true,
        slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    }

    const serialized = serializeExtendedState(state, 'pauliSpinor')
    const config = serialized.pauliSpinor as Record<string, unknown>

    // Transient field stripped
    expect('needsReset' in config).toBe(false)

    // Physics fields preserved
    expect(config.fieldStrength).toBe(3.5)
    expect(config.fieldDirection).toEqual([0.5, 1.2])
    expect(config.potentialType).toBe('harmonicTrap')
    expect(config.harmonicOmega).toBe(2.0)
    expect(config.fieldView).toBe('spinExpectation')
    expect(config.spinUpColor).toEqual([0.0, 1.0, 0.5])
    expect(config.spinDownColor).toEqual([1.0, 0.0, 0.5])
    expect(config.autoScale).toBe(false)
    expect(config.packetMomentum).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('sanitize strips needsReset from nested pauliSpinor config', () => {
    const loaded = {
      pauliSpinor: {
        fieldStrength: 4.0,
        needsReset: true,
        pauliSpinorVersion: 7,
      },
    }
    const sanitized = sanitizeExtendedLoadedState(loaded)
    const config = sanitized.pauliSpinor as Record<string, unknown>

    expect(config.fieldStrength).toBe(4.0)
    expect('needsReset' in config).toBe(false)
    expect('pauliSpinorVersion' in config).toBe(false)
  })
})

describe('serializeExtendedState', () => {
  it('excludes sqLayer transient fields from serialized schroedinger config', () => {
    const state = {
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
        sqLayerEnabled: true,
        sqLayerMode: 'coherent',
        sqLayerCoherentAlphaRe: 2.5,
        sqLayerCoherentAlphaIm: 0,
        sqLayerSqueezeR: 0.5,
        sqLayerSqueezeTheta: 0,
        sqLayerSelectedModeIndex: 1,
        sqLayerFockQuantumNumber: 4,
        sqLayerShowOccupation: true,
        sqLayerShowUncertainty: false,
      },
    }
    const serialized = serializeExtendedState(state, 'schroedinger')
    const config = serialized.schroedinger as Record<string, unknown>

    // Non-transient fields preserved
    expect(config.quantumMode).toBe('harmonicOscillator')
    expect(config.termCount).toBe(3)

    // All sqLayer transient fields excluded
    expect('sqLayerEnabled' in config).toBe(false)
    expect('sqLayerMode' in config).toBe(false)
    expect('sqLayerCoherentAlphaRe' in config).toBe(false)
    expect('sqLayerCoherentAlphaIm' in config).toBe(false)
    expect('sqLayerSqueezeR' in config).toBe(false)
    expect('sqLayerSqueezeTheta' in config).toBe(false)
    expect('sqLayerSelectedModeIndex' in config).toBe(false)
    expect('sqLayerFockQuantumNumber' in config).toBe(false)
    expect('sqLayerShowOccupation' in config).toBe(false)
    expect('sqLayerShowUncertainty' in config).toBe(false)
  })

  it('preserves tdse config while excluding nested tdse runtime flags', () => {
    const state = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 3,
          packetMomentum: [4, 0, 0],
          potentialType: 'barrier',
          diagnosticsEnabled: true,
          diagnosticsInterval: 6,
          needsReset: true,
        },
      },
    }
    const serialized = serializeExtendedState(state, 'schroedinger')
    const config = serialized.schroedinger as Record<string, unknown>
    const tdse = config.tdse as Record<string, unknown>

    expect(config.quantumMode).toBe('tdseDynamics')
    expect(tdse.latticeDim).toBe(3)
    expect(tdse.packetMomentum).toEqual([4, 0, 0])
    expect(tdse.potentialType).toBe('barrier')
    expect(tdse.diagnosticsEnabled).toBe(true)
    expect(tdse.diagnosticsInterval).toBe(6)
    expect('needsReset' in tdse).toBe(false)
  })
})
