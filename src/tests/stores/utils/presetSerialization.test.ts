import { describe, expect, it } from 'vitest'

import { DEFAULT_SKYBOX_PROCEDURAL_SETTINGS } from '@/stores/defaults/visualDefaults'
import { normalizeEnvironmentLoadData } from '@/stores/utils/presetNormalization'
import {
  sanitizeExtendedLoadedState,
  sanitizeLoadedState,
  serializeExtendedState,
} from '@/stores/utils/presetSerialization'

describe('sanitizeLoadedState', () => {
  it('removes legacy faceOpacity fields from appearance payloads', () => {
    const payload = {
      faceOpacity: 0.5,
      shaderSettings: {
        wireframe: { lineThickness: 1 },
        surface: {
          faceOpacity: 0.25,
          specularIntensity: 0.8,
        },
      },
    }
    const before = JSON.parse(JSON.stringify(payload))

    const sanitized = sanitizeLoadedState(payload)

    expect(sanitized).toEqual({
      shaderSettings: {
        wireframe: { lineThickness: 1 },
        surface: { specularIntensity: 0.8 },
      },
    })
    expect(payload).toEqual(before)
  })

  it('removes legacy classicSkyboxType from environment payloads', () => {
    const sanitized = sanitizeLoadedState({
      classicSkyboxType: 'sunset',
      skyboxEnabled: false,
      backgroundColor: '#101010',
    })

    expect(sanitized).toEqual({
      skyboxEnabled: false,
      backgroundColor: '#101010',
    })
  })
})

describe('normalizeEnvironmentLoadData', () => {
  it('normalizes shorthand background colors during scene/style load', () => {
    expect(
      normalizeEnvironmentLoadData({
        backgroundColor: '#0f8',
        skyboxEnabled: false,
      }).backgroundColor
    ).toBe('#00ff88')
  })

  it('drops invalid or translucent background colors during scene/style load', () => {
    expect(
      normalizeEnvironmentLoadData({
        backgroundColor: 'not-a-color',
        skyboxEnabled: false,
      })
    ).not.toHaveProperty('backgroundColor')

    expect(
      normalizeEnvironmentLoadData({
        backgroundColor: '#12345680',
        skyboxEnabled: false,
      })
    ).not.toHaveProperty('backgroundColor')
  })

  it('defaults legacy enabled skybox imports to a visible classic skybox', () => {
    expect(
      normalizeEnvironmentLoadData({
        skyboxEnabled: true,
      })
    ).toMatchObject({
      skyboxSelection: 'space_blue',
      skyboxEnabled: true,
      skyboxMode: 'classic',
      skyboxTexture: 'space_blue',
    })
  })

  it('normalizes skybox scalar fields during scene/style load', () => {
    const normalized = normalizeEnvironmentLoadData({
      skyboxSelection: 'space_blue',
      skyboxIntensity: 99,
      skyboxRotation: -Math.PI / 2,
      skyboxAnimationSpeed: 'fast',
      skyboxAnimationMode: 'warp',
      skyboxHighQuality: 'false',
    })

    expect(normalized.skyboxIntensity).toBe(10)
    expect(normalized.skyboxRotation).toBeCloseTo(1.5 * Math.PI)
    expect(normalized).not.toHaveProperty('skyboxAnimationSpeed')
    expect(normalized).not.toHaveProperty('skyboxAnimationMode')
    expect(normalized).not.toHaveProperty('skyboxHighQuality')
  })

  it('merges partial procedural skybox imports with defaults', () => {
    const normalized = normalizeEnvironmentLoadData({
      skyboxSelection: 'procedural_aurora',
      proceduralSettings: {
        scale: 2,
        timeScale: 'bad',
        sunPosition: [1, 2],
        aurora: {
          curtainHeight: 0.75,
          waveFrequency: 'bad',
        },
      },
    })

    expect(normalized.proceduralSettings).toEqual({
      ...DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
      scale: 2,
      aurora: {
        ...DEFAULT_SKYBOX_PROCEDURAL_SETTINGS.aurora,
        curtainHeight: 0.75,
      },
    })
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

    expect(sanitized).toEqual({
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
      },
    })
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

    expect(sanitized).toEqual({
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 3,
          fieldView: 'density',
          diagnosticsInterval: 9,
        },
      },
    })
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
        pmlTargetReflection: 1e-6,
        diagnosticsEnabled: true,
        diagnosticsInterval: 5,
        needsReset: true,
        slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    }

    const serialized = serializeExtendedState(state, 'pauliSpinor')

    // needsReset stripped; all physics fields preserved exactly
    expect(serialized.pauliSpinor).toEqual({
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
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
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

    expect(sanitized).toEqual({
      pauliSpinor: { fieldStrength: 4.0 },
    })
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

    expect(serialized).toEqual({
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
      },
    })
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

    expect(serialized).toEqual({
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 3,
          packetMomentum: [4, 0, 0],
          potentialType: 'barrier',
          diagnosticsEnabled: true,
          diagnosticsInterval: 6,
        },
      },
    })
  })
})
