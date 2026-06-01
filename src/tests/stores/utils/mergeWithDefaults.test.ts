/**
 * Tests for mergeWithDefaults utility
 *
 * Ensures that old saved scenes get default values for new parameters.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_BELL_PAIR_CONFIG } from '@/lib/geometry/extended/bellPair'
import { DIRAC_MAX_TOTAL_SITES } from '@/lib/geometry/extended/dirac'
import { DEFAULT_PAULI_CONFIG, DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { mergeExtendedObjectStateForType } from '@/stores/utils/mergeWithDefaults'

describe('mergeExtendedObjectStateForType — schroedinger', () => {
  describe('handles missing config properties', () => {
    it('fills in missing properties with defaults for schroedinger', () => {
      // Simulate old saved scene without new properties
      const oldSavedState = {
        schroedinger: {
          scale: 1.5, // User's saved value
          quantumMode: 'hydrogenOrbital', // Legacy saved value
          // Many other properties are MISSING (simulating old save)
        },
      }

      const merged = mergeExtendedObjectStateForType(oldSavedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's saved values should be preserved
      expect(schroedinger.scale).toBe(1.5)
      expect(schroedinger.quantumMode).toBe('hydrogenND')

      // Missing values should get defaults
      expect(schroedinger.densityGain).toBe(DEFAULT_SCHROEDINGER_CONFIG.densityGain)
      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
      expect(schroedinger.powderScale).toBe(DEFAULT_SCHROEDINGER_CONFIG.powderScale)
    })
  })

  describe('preserves existing values', () => {
    it('does not override saved values with defaults', () => {
      const savedState = {
        schroedinger: {
          sampleCount: 64, // User explicitly saved this
          densityGain: 5.0, // User explicitly saved this
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's explicit values should NOT be overridden
      expect(schroedinger.sampleCount).toBe(64)
      expect(schroedinger.densityGain).toBe(5.0)
    })

    it('drops unknown loaded keys that are not part of defaults', () => {
      const savedState = {
        schroedinger: {
          sampleCount: 64,
          mysteryExtended: 42,
          cosineParams: {
            a: [0.1, 0.2, 0.3] as [number, number, number],
            mysteryNested: true,
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as Record<string, unknown>
      expect(schroedinger.sampleCount).toBe(64)
      expect(schroedinger.mysteryExtended).toBeUndefined()

      const cosineParams = schroedinger.cosineParams as Record<string, unknown>
      expect(cosineParams.a).toEqual([0.1, 0.2, 0.3])
      expect(cosineParams.mysteryNested).toBeUndefined()
    })

    it('sanitizes loaded harmonic oscillator scalar controls before restore', () => {
      const savedState = {
        schroedinger: {
          seed: 42.9,
          termCount: 99,
          maxQuantumNumber: 99,
          frequencySpread: -2,
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect(schroedinger.seed).toBe(42)
      expect(schroedinger.termCount).toBe(8)
      expect(schroedinger.maxQuantumNumber).toBe(6)
      expect(schroedinger.frequencySpread).toBe(0)
    })

    it('sanitizes loaded open-quantum config that bypasses setters', () => {
      const savedState = {
        schroedinger: {
          openQuantum: {
            enabled: true,
            dt: Infinity,
            substeps: NaN,
            dephasingRate: -1,
            relaxationRate: 99,
            thermalUpRate: Infinity,
            bathTemperature: 0,
            couplingScale: NaN,
            hydrogenBasisMaxN: 99,
            visualizationMode: 'phase',
            dephasingModel: 'bogus',
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const oq = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).openQuantum

      expect(oq.enabled).toBe(true)
      expect(oq.dt).toBe(0.01)
      expect(oq.substeps).toBe(4)
      expect(oq.dephasingRate).toBe(0)
      expect(oq.relaxationRate).toBe(5)
      expect(oq.thermalUpRate).toBe(0)
      expect(oq.bathTemperature).toBe(0.1)
      expect(oq.couplingScale).toBe(1)
      expect(oq.hydrogenBasisMaxN).toBe(3)
      expect(oq.visualizationMode).toBe('density')
      expect(oq.dephasingModel).toBe('uniform')
    })

    it('sanitizes loaded BEC mass before direct restore reaches analysis outputs', () => {
      const savedState = {
        schroedinger: {
          quantumMode: 'becDynamics',
          bec: {
            mass: 0,
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const bec = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).bec

      expect(bec.mass).toBe(DEFAULT_SCHROEDINGER_CONFIG.bec.mass)
    })
  })

  describe('surface-mode invariants', () => {
    it('clears loaded isosurface mode for Wigner representation', () => {
      const savedState = {
        schroedinger: {
          representation: 'wigner',
          isoEnabled: true,
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect(schroedinger.representation).toBe('wigner')
      expect(schroedinger.isoEnabled).toBe(false)
    })

    it('preserves loaded isosurface mode for compute-backed quantum modes', () => {
      const savedState = {
        schroedinger: {
          quantumMode: 'tdseDynamics',
          isoEnabled: true,
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect(schroedinger.quantumMode).toBe('tdseDynamics')
      expect(schroedinger.isoEnabled).toBe(true)
    })
  })

  describe('legacy uncertainty shimmer migration', () => {
    it('maps shimmer fields to uncertainty boundary fields', () => {
      const savedState = {
        schroedinger: {
          shimmerEnabled: true,
          shimmerStrength: 0.72,
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect((schroedinger as unknown as Record<string, unknown>).uncertaintyBoundaryEnabled).toBe(
        true
      )
      expect(
        (schroedinger as unknown as Record<string, unknown>).uncertaintyBoundaryStrength
      ).toBeCloseTo(0.72, 5)
    })
  })

  describe('Wheeler-DeWitt load invariants', () => {
    it('sanitizes loaded WdW solver and display controls that bypass setters', () => {
      const loaded = {
        schroedinger: {
          quantumMode: 'wheelerDeWitt',
          wheelerDeWitt: {
            boundaryCondition: 'bogus',
            inflatonMass: 99,
            cosmologicalConstant: -99,
            inflatonMassAsymmetry: 0,
            gridNa: 1025,
            gridNphi: 2.5,
            streamlineDensity: 99,
            phaseRotationSpeed: -99,
            worldlineSpeed: 99,
            worldlinePulseWidth: 0,
            renderDynamicRange: 0,
            srmtClock: 'bogus',
            srmtCutNormalized: 99,
            srmtRankCap: 2.2,
            srmtHeatmapIntensity: -1,
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
      const wdw = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).wheelerDeWitt

      expect(wdw.boundaryCondition).toBe(DEFAULT_WHEELER_DEWITT_CONFIG.boundaryCondition)
      expect(wdw.inflatonMass).toBe(2)
      expect(wdw.cosmologicalConstant).toBe(-1)
      expect(wdw.inflatonMassAsymmetry).toBe(0.1)
      expect(wdw.gridNa).toBe(1024)
      expect(wdw.gridNphi).toBe(8)
      expect(wdw.streamlineDensity).toBe(16)
      expect(wdw.phaseRotationSpeed).toBe(0)
      expect(wdw.worldlineSpeed).toBe(3)
      expect(wdw.worldlinePulseWidth).toBe(0.02)
      expect(wdw.renderDynamicRange).toBe(1)
      expect(wdw.srmtClock).toBe(DEFAULT_WHEELER_DEWITT_CONFIG.srmtClock)
      expect(wdw.srmtCutNormalized).toBe(0.9)
      expect(wdw.srmtRankCap).toBe(8)
      expect(wdw.srmtHeatmapIntensity).toBe(0)
    })

    it('clamps WdW domain bounds and falls back when a loaded scene has an invalid range', () => {
      const loaded = {
        schroedinger: {
          quantumMode: 'wheelerDeWitt',
          wheelerDeWitt: {
            aMin: 2,
            aMax: 1,
            phiExtent: 0,
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
      const wdw = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).wheelerDeWitt

      expect(wdw.aMin).toBe(DEFAULT_WHEELER_DEWITT_CONFIG.aMin)
      expect(wdw.aMax).toBe(DEFAULT_WHEELER_DEWITT_CONFIG.aMax)
      expect(wdw.phiExtent).toBe(0.5)
    })

    it('clamps loaded WdW domains to solver-safe finite bounds', () => {
      const loaded = {
        schroedinger: {
          quantumMode: 'wheelerDeWitt',
          wheelerDeWitt: {
            aMin: 1e-9,
            aMax: 1e12,
            phiExtent: 1e12,
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
      const wdw = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).wheelerDeWitt

      expect(wdw.aMin).toBe(0.05)
      expect(wdw.aMax).toBe(10)
      expect(wdw.phiExtent).toBe(10)
    })
  })

  describe('handles nested objects', () => {
    it('merges nested cosineParams in schroedinger', () => {
      const savedState = {
        schroedinger: {
          cosineParams: {
            a: [0.3, 0.3, 0.3] as [number, number, number],
            // b, c, d are MISSING
          },
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's saved nested value should be preserved
      expect(schroedinger.cosineParams.a).toEqual([0.3, 0.3, 0.3])

      // Missing nested values should get defaults
      expect(schroedinger.cosineParams.b).toEqual(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.b)
      expect(schroedinger.cosineParams.c).toEqual(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.c)
      expect(schroedinger.cosineParams.d).toEqual(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.d)
    })
  })

  describe('handles arrays correctly', () => {
    it('replaces arrays entirely instead of merging', () => {
      const savedState = {
        schroedinger: {
          parameterValues: [0.5, 0.3], // User's 2-element array
        },
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // Arrays should be replaced, not merged
      expect(schroedinger.parameterValues).toEqual([0.5, 0.3])
    })
  })

  describe('handles undefined/null config', () => {
    it('uses full defaults when config is undefined', () => {
      const savedState = {
        // schroedinger is completely missing
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // Should be full defaults
      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
      expect(schroedinger.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    })

    it('uses full defaults when config is null', () => {
      const savedState = {
        schroedinger: null,
      }

      const merged = mergeExtendedObjectStateForType(savedState, 'schroedinger')
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
    })
  })
})

describe('mergeExtendedObjectStateForType — cosmology invariants', () => {
  it('snaps loaded freeScalar grids to powers of two before store restore', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 3,
          gridSize: [48, 48, 48],
          spacing: [0.25, 0.25, 0.25],
          mass: 0,
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    expect(fs.gridSize).toEqual([64, 64, 64])
  })

  it('sanitizes loaded freeScalar init enums and vectors before direct restore reaches shaders', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 3,
          gridSize: [32, 32, 32],
          initialCondition: 'bogus',
          fieldView: 'bogus',
          packetCenter: [1, Number.NaN, 2],
          modeK: [2, Number.POSITIVE_INFINITY, 0],
          needsReset: false,
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar

    expect(fs.initialCondition).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.initialCondition)
    expect(fs.fieldView).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.fieldView)
    expect(fs.packetCenter).toEqual(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.packetCenter)
    expect(fs.modeK).toEqual(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.modeK)
    expect(fs.needsReset).toBe(true)
  })

  it('sanitizes loaded freeScalar preheating before direct restore reaches mass uniforms', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 3,
          gridSize: [32, 32, 32],
          preheating: {
            enabled: true,
            amplitude: Number.NaN,
            frequency: Number.POSITIVE_INFINITY,
          },
          needsReset: false,
        },
      },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    const preheating = fs.preheating as Record<string, unknown>

    expect(preheating.enabled).toBe(true)
    expect(preheating.amplitude).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.preheating.amplitude)
    expect(preheating.frequency).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.preheating.frequency)
    expect(fs.needsReset).toBe(true)
  })

  it('sanitizes loaded freeScalar scalar controls before direct restore reaches uniforms', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 4,
          gridSize: [32, 32, 32, 16],
          spacing: [0.001, Number.NaN, Number.POSITIVE_INFINITY, 0.2],
          mass: Number.POSITIVE_INFINITY,
          dt: Number.POSITIVE_INFINITY,
          stepsPerFrame: -3.5,
          packetWidth: -4,
          packetAmplitude: Number.NaN,
          vacuumSeed: Number.POSITIVE_INFINITY,
          selfInteractionLambda: Number.POSITIVE_INFINITY,
          selfInteractionVev: -1,
          absorberWidth: Number.POSITIVE_INFINITY,
          pmlTargetReflection: 0,
          diagnosticsInterval: Number.POSITIVE_INFINITY,
          slicePositions: [Number.NaN],
        },
      },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar

    expect(fs.spacing).toEqual([0.01, 0.1, 0.1, 0.2])
    expect(fs.mass).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.mass)
    expect(Number.isFinite(fs.dt as number)).toBe(true)
    expect(fs.stepsPerFrame).toBe(1)
    expect(fs.packetWidth).toBe(0.01)
    expect(fs.packetAmplitude).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.packetAmplitude)
    expect(fs.vacuumSeed).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.vacuumSeed)
    expect(fs.selfInteractionLambda).toBe(
      DEFAULT_SCHROEDINGER_CONFIG.freeScalar.selfInteractionLambda
    )
    expect(fs.selfInteractionVev).toBe(0.1)
    expect(fs.absorberWidth).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.absorberWidth)
    expect(fs.pmlTargetReflection).toBe(1e-12)
    expect(fs.diagnosticsInterval).toBe(DEFAULT_SCHROEDINGER_CONFIG.freeScalar.diagnosticsInterval)
    expect(fs.slicePositions).toEqual([0])
  })

  it('sanitizes loaded shared PML controls before they override compute modes', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        absorberWidth: Number.POSITIVE_INFINITY,
        pmlTargetReflection: 0,
        tdse: {
          absorberEnabled: true,
          absorberWidth: 0.2,
          pmlTargetReflection: 1e-6,
        },
      },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const schro = merged.schroedinger as Record<string, unknown>

    expect(schro.absorberWidth).toBe(DEFAULT_SCHROEDINGER_CONFIG.absorberWidth)
    expect(schro.pmlTargetReflection).toBe(1e-12)
  })

  it('soft-disables cosmology when the loaded latticeDim is out of the supported range', () => {
    // L7 audit: scenes saved with cosmology enabled at latticeDim ∈ [2,6]
    // and loaded onto an unsupported lattice (e.g. 1D after a manual edit)
    // must NOT propagate the cosmology flag through. Without the
    // normalization, the next vacuumNoise reset would feed `n=2`
    // (`spacetimeDim=2`) into computeCosmologyAt and either throw or fall
    // back silently to mass². The reconcile helper soft-disables and
    // forces needsReset.
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 1,
          gridSize: [8],
          spacing: [0.25],
          mass: 0,
          cosmology: { enabled: true, preset: 'deSitter', hubble: 1, eta0: -10, steepness: 5 },
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    const cosmo = fs.cosmology as { enabled: boolean }
    expect(cosmo.enabled).toBe(false)
    expect(fs.needsReset).toBe(true)
  })

  it('soft-disables Bianchi-I when loaded with more than three spatial axes', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 4,
          gridSize: [8, 8, 8, 8],
          spacing: [0.25, 0.25, 0.25, 0.25],
          mass: 0,
          cosmology: {
            enabled: true,
            preset: 'bianchiKasner',
            eta0: 2,
            steepness: 5,
            hubble: 1,
            kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
          },
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    const cosmo = fs.cosmology as { enabled: boolean }
    expect(cosmo.enabled).toBe(false)
    expect(fs.needsReset).toBe(true)
  })

  it('raises eta0 only when the loaded value is below the bare cosmetic floor', () => {
    // Under the canonical δφ formulation the adiabatic vacuum is well-
    // defined at any non-zero η₀ — the old Mukhanov-Sasaki `β(β−1)/η²`
    // tachyonic bound is gone. The reconcile helper still runs clampEta0
    // against the cosmetic `DEFAULT_SAFE_ETA0` constant (0.1), so a
    // loaded `eta0` below that gets raised and `needsReset` fires; a
    // loaded `eta0` in the normal `-10 … -0.5` range is passed through
    // untouched regardless of lattice geometry.
    const loadedUnsafe = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          // eta0 = -0.01 sits below the 0.1 cosmetic floor — clamp raises
          // |eta0| to 0.1 and marks needsReset.
          latticeDim: 3,
          gridSize: [32, 32, 32],
          spacing: [1, 1, 1],
          mass: 0,
          cosmology: { enabled: true, preset: 'deSitter', hubble: 1, eta0: -0.01, steepness: 5 },
        },
      },
    }
    const mergedUnsafe = mergeExtendedObjectStateForType(loadedUnsafe, 'schroedinger')
    const fsUnsafe = (mergedUnsafe.schroedinger as { freeScalar: Record<string, unknown> })
      .freeScalar
    const cosmoUnsafe = fsUnsafe.cosmology as { enabled: boolean; eta0: number }
    expect(cosmoUnsafe.enabled).toBe(true)
    expect(Math.abs(cosmoUnsafe.eta0)).toBeGreaterThanOrEqual(0.1)
    expect(fsUnsafe.needsReset).toBe(true)

    // Symmetric no-clamp path: a user-loaded eta0 well inside the safe
    // range flows through regardless of the lattice geometry.
    const loadedSafe = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 3,
          gridSize: [32, 32, 32],
          spacing: [1, 1, 1],
          mass: 0,
          cosmology: { enabled: true, preset: 'deSitter', hubble: 1, eta0: -1, steepness: 5 },
        },
      },
    }
    const mergedSafe = mergeExtendedObjectStateForType(loadedSafe, 'schroedinger')
    const fsSafe = (mergedSafe.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    const cosmoSafe = fsSafe.cosmology as { enabled: boolean; eta0: number }
    expect(cosmoSafe.enabled).toBe(true)
    expect(cosmoSafe.eta0).toBe(-1)
  })

  it('leaves cosmology untouched when the loaded eta0 is already safe', () => {
    // No-op path: a perfectly valid cosmology config survives normalization
    // unchanged.
    const loaded = {
      schroedinger: {
        quantumMode: 'freeScalarField',
        freeScalar: {
          latticeDim: 3,
          gridSize: [8, 8, 8],
          spacing: [0.25, 0.25, 0.25],
          mass: 0,
          cosmology: { enabled: true, preset: 'deSitter', hubble: 1, eta0: -10, steepness: 5 },
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const fs = (merged.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
    const cosmo = fs.cosmology as { enabled: boolean; eta0: number }
    expect(cosmo.enabled).toBe(true)
    expect(cosmo.eta0).toBe(-10)
  })
})

describe('mergeExtendedObjectStateForType — compute-mode lattice arrays', () => {
  // Regression for the Quantum Walk scene black-screen bug: DEFAULT_QUANTUM_WALK_CONFIG
  // has latticeDim=2 with length-2 arrays. A saved 3D QW scene carries length-3 arrays.
  // Before the fix, deepMerge's length-equality guard dropped the loaded arrays → the
  // stored config ended up with latticeDim=3 but gridSize/spacing/initialPosition of
  // length 2. That fed wrong strides ([64,1,1] instead of [4096,64,1]) into the
  // qwWriteGrid compute shader and rendered an all-zero density texture.

  it('preserves 3D quantumWalk arrays when loaded latticeDim differs from default', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'quantumWalk',
        quantumWalk: {
          latticeDim: 3,
          gridSize: [64, 64, 64],
          spacing: [0.1, 0.1, 0.1],
          initialPosition: [32, 32, 32],
          coinType: 'dft',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const qw = (merged.schroedinger as { quantumWalk: Record<string, unknown> }).quantumWalk
    expect(qw.latticeDim).toBe(3)
    expect(qw.gridSize).toEqual([64, 64, 64])
    expect(qw.spacing).toEqual([0.1, 0.1, 0.1])
    expect(qw.initialPosition).toEqual([32, 32, 32])
    expect(qw.coinType).toBe('dft')
  })

  it('sanitizes loaded quantumWalk grids before direct scene restore reaches shaders', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'quantumWalk',
        quantumWalk: {
          latticeDim: 3,
          gridSize: [30, 17, 999],
          spacing: [0.1, Number.NaN, 0.2],
          initialPosition: [99, -4, 300],
          needsReset: false,
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const qw = (merged.schroedinger as { quantumWalk: Record<string, unknown> }).quantumWalk
    expect(qw.gridSize).toEqual([32, 16, 128])
    expect(qw.spacing).toEqual([0.1, 0.1, 0.2])
    expect(qw.initialPosition).toEqual([31, 0, 127])
    expect(qw.needsReset).toBe(true)
  })

  it('preserves higher-dim tdse arrays when loaded latticeDim > default', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 4,
          gridSize: [32, 32, 32, 32],
          spacing: [0.2, 0.2, 0.2, 0.2],
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const tdse = (merged.schroedinger as { tdse: Record<string, unknown> }).tdse
    expect(tdse.latticeDim).toBe(4)
    expect(tdse.gridSize).toEqual([32, 32, 32, 32])
    expect(tdse.spacing).toEqual([0.2, 0.2, 0.2, 0.2])
  })

  it('sizes slicePositions to max(0, latticeDim - 3) when loaded omits them', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          latticeDim: 5,
          gridSize: [16, 16, 16, 16, 16],
          spacing: [0.1, 0.1, 0.1, 0.1, 0.1],
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const tdse = (merged.schroedinger as { tdse: { slicePositions: number[] } }).tdse
    expect(tdse.slicePositions).toHaveLength(2)
    expect(tdse.slicePositions).toEqual([0, 0])
  })

  it('leaves defaults intact when loaded latticeDim is out of range', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'quantumWalk',
        quantumWalk: {
          latticeDim: 99,
          gridSize: Array(99).fill(64),
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const qw = (merged.schroedinger as { quantumWalk: Record<string, unknown> }).quantumWalk
    expect((qw.gridSize as number[]).length).toBe(2)
    expect(qw.latticeDim).toBe(2)
  })

  it.each([
    { label: 'non-integer', value: 3.5 },
    { label: 'string', value: '3' },
    { label: 'negative', value: -1 },
    { label: 'NaN', value: Number.NaN },
    { label: 'Infinity', value: Number.POSITIVE_INFINITY },
  ])('snaps latticeDim to gridSize.length when loaded is $label', ({ value }) => {
    const loaded = {
      schroedinger: {
        quantumMode: 'quantumWalk',
        quantumWalk: {
          latticeDim: value,
          gridSize: Array(2).fill(64),
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const qw = (merged.schroedinger as { quantumWalk: Record<string, unknown> }).quantumWalk
    expect(qw.latticeDim).toBe(2)
    expect((qw.gridSize as number[]).length).toBe(2)
  })
})

describe('mergeExtendedObjectStateForType — Dirac enum invariants', () => {
  it('normalizes invalid loaded Dirac enums before shader packing can remap them', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'diracEquation',
        dirac: {
          potentialType: 'harmonic',
          initialCondition: 'gaussian',
          fieldView: 'spin',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const dirac = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).dirac

    expect(dirac.potentialType).toBe(DEFAULT_SCHROEDINGER_CONFIG.dirac.potentialType)
    expect(dirac.initialCondition).toBe(DEFAULT_SCHROEDINGER_CONFIG.dirac.initialCondition)
    expect(dirac.fieldView).toBe(DEFAULT_SCHROEDINGER_CONFIG.dirac.fieldView)
  })

  it('preserves valid loaded Dirac enums', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'diracEquation',
        dirac: {
          potentialType: 'coulomb',
          initialCondition: 'planeWave',
          fieldView: 'currentDensity',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const dirac = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).dirac

    expect(dirac.potentialType).toBe('coulomb')
    expect(dirac.initialCondition).toBe('planeWave')
    expect(dirac.fieldView).toBe('currentDensity')
  })

  it('reduces oversized loaded Dirac grids before GPU resources are built', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'diracEquation',
        dirac: {
          latticeDim: 11,
          gridSize: Array(11).fill(4),
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const dirac = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).dirac
    const totalSites = dirac.gridSize
      .slice(0, dirac.latticeDim)
      .reduce((product, axis) => product * axis, 1)

    expect(dirac.latticeDim).toBe(11)
    expect(totalSites).toBeLessThanOrEqual(DIRAC_MAX_TOTAL_SITES)
  })

  it('raises undersized loaded Dirac grids to preserve storage-buffer offset alignment', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'diracEquation',
        dirac: {
          latticeDim: 2,
          gridSize: [2, 2],
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const dirac = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).dirac
    const totalSites = dirac.gridSize
      .slice(0, dirac.latticeDim)
      .reduce((product, axis) => product * axis, 1)

    expect(dirac.gridSize).toEqual([8, 8])
    expect(totalSites).toBeGreaterThanOrEqual(64)
  })
})

describe('mergeExtendedObjectStateForType — TDSE enum invariants', () => {
  it('normalizes invalid loaded TDSE enums before store setters are bypassed', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          potentialType: 'harmonic',
          initialCondition: 'gaussian',
          fieldView: 'spin',
          driveWaveform: 'saw',
          disorderDistribution: 'lorentzian',
          densityView: 'weighted',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const tdse = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).tdse

    expect(tdse.potentialType).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.potentialType)
    expect(tdse.initialCondition).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.initialCondition)
    expect(tdse.fieldView).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.fieldView)
    expect(tdse.driveWaveform).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.driveWaveform)
    expect(tdse.disorderDistribution).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.disorderDistribution)
    expect(tdse.densityView).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.densityView)
  })

  it('preserves valid loaded TDSE enums', () => {
    const loaded = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: {
          potentialType: 'andersonDisorder',
          initialCondition: 'planeWave',
          fieldView: 'quantumPressure',
          driveWaveform: 'chirp',
          disorderDistribution: 'gaussian',
          densityView: 'proper',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const tdse = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).tdse

    expect(tdse.potentialType).toBe('andersonDisorder')
    expect(tdse.initialCondition).toBe('planeWave')
    expect(tdse.fieldView).toBe('quantumPressure')
    expect(tdse.driveWaveform).toBe('chirp')
    expect(tdse.disorderDistribution).toBe('gaussian')
    expect(tdse.densityView).toBe('proper')
  })
})

describe('mergeExtendedObjectStateForType — pauliSpinor', () => {
  it('fills missing Pauli fields with defaults', () => {
    const loaded = {
      pauliSpinor: {
        fieldStrength: 5.0,
        spinUpColor: [1, 0, 0] as [number, number, number],
      },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'pauliSpinor')
    const pauli = merged.pauliSpinor as typeof DEFAULT_PAULI_CONFIG

    // Saved value preserved
    expect(pauli.fieldStrength).toBe(5.0)
    expect(pauli.spinUpColor).toEqual([1, 0, 0])

    // Missing values filled from defaults
    expect(pauli.latticeDim).toBe(DEFAULT_PAULI_CONFIG.latticeDim)
    expect(pauli.gridSize).toEqual(DEFAULT_PAULI_CONFIG.gridSize)
    expect(pauli.dt).toBe(DEFAULT_PAULI_CONFIG.dt)
    expect(pauli.mass).toBe(DEFAULT_PAULI_CONFIG.mass)
    expect(pauli.fieldView).toBe(DEFAULT_PAULI_CONFIG.fieldView)
    expect(pauli.spinDownColor).toEqual(DEFAULT_PAULI_CONFIG.spinDownColor)
    expect(pauli.absorberEnabled).toBe(DEFAULT_PAULI_CONFIG.absorberEnabled)
  })

  it('uses full Pauli defaults when config is missing', () => {
    const loaded = {}
    const merged = mergeExtendedObjectStateForType(loaded, 'pauliSpinor')
    const pauli = merged.pauliSpinor as typeof DEFAULT_PAULI_CONFIG

    expect(pauli.latticeDim).toBe(DEFAULT_PAULI_CONFIG.latticeDim)
    expect(pauli.fieldType).toBe(DEFAULT_PAULI_CONFIG.fieldType)
    expect(pauli.spinUpColor).toEqual(DEFAULT_PAULI_CONFIG.spinUpColor)
    expect(pauli.spinDownColor).toEqual(DEFAULT_PAULI_CONFIG.spinDownColor)
  })

  it('sanitizes loaded Pauli potential and lattice controls', () => {
    const merged = mergeExtendedObjectStateForType(
      {
        pauliSpinor: {
          latticeDim: 5,
          gridSize: [30, 64, Number.POSITIVE_INFINITY, 1024, 4],
          spacing: [0.2, Number.NaN, 0.05, Number.POSITIVE_INFINITY, 0.5],
          potentialType: 'not-a-potential',
          harmonicOmega: Number.POSITIVE_INFINITY,
          wellDepth: -5,
          wellWidth: Number.NaN,
          mass: Number.POSITIVE_INFINITY,
          pmlTargetReflection: 0,
        },
      },
      'pauliSpinor'
    )
    const pauli = merged.pauliSpinor as typeof DEFAULT_PAULI_CONFIG

    expect(pauli.latticeDim).toBe(5)
    expect(pauli.gridSize).toHaveLength(5)
    expect(pauli.gridSize.every((value) => Number.isInteger(value) && value > 0)).toBe(true)
    expect(pauli.spacing).toEqual([0.2, DEFAULT_PAULI_CONFIG.spacing[1], 0.05, 0.15, 0.5])
    expect(pauli.potentialType).toBe(DEFAULT_PAULI_CONFIG.potentialType)
    expect(pauli.harmonicOmega).toBe(DEFAULT_PAULI_CONFIG.harmonicOmega)
    expect(pauli.wellDepth).toBe(0)
    expect(pauli.wellWidth).toBe(DEFAULT_PAULI_CONFIG.wellWidth)
    expect(pauli.mass).toBe(DEFAULT_PAULI_CONFIG.mass)
    expect(pauli.pmlTargetReflection).toBe(1e-12)
  })

  it('does not touch schroedinger config when merging pauliSpinor', () => {
    const loaded = {
      pauliSpinor: { fieldStrength: 3.0 },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'pauliSpinor')

    // Only pauliSpinor key should be present
    expect(Object.keys(merged)).toEqual(['pauliSpinor'])
  })
})

describe('mergeExtendedObjectStateForType — bellPair', () => {
  it('sanitizes invalid Bell trial-loop and Bloch fields from loaded scenes', () => {
    const merged = mergeExtendedObjectStateForType(
      {
        bellPair: {
          visibility: Number.NaN,
          detectionEfficiency: 2,
          aliceAxis: [Number.NaN, Number.POSITIVE_INFINITY],
          fieldA: [Number.POSITIVE_INFINITY, 0.25, -60],
          analysisMode: 'bogus',
          samplerMode: 'mystery',
          targetTrials: -10,
          trialsPerFrame: Number.POSITIVE_INFINITY,
          seed: Number.NaN,
        },
      },
      'bellPair'
    )

    const bellPair = merged.bellPair as typeof DEFAULT_BELL_PAIR_CONFIG
    expect(bellPair.visibility).toBe(DEFAULT_BELL_PAIR_CONFIG.visibility)
    expect(bellPair.detectionEfficiency).toBe(1)
    expect(bellPair.aliceAxis).toEqual(DEFAULT_BELL_PAIR_CONFIG.aliceAxis)
    expect(bellPair.fieldA).toEqual(DEFAULT_BELL_PAIR_CONFIG.fieldA)
    expect(bellPair.analysisMode).toBe(DEFAULT_BELL_PAIR_CONFIG.analysisMode)
    expect(bellPair.samplerMode).toBe(DEFAULT_BELL_PAIR_CONFIG.samplerMode)
    expect(bellPair.targetTrials).toBe(4)
    expect(bellPair.trialsPerFrame).toBe(DEFAULT_BELL_PAIR_CONFIG.trialsPerFrame)
    expect(bellPair.seed).toBe(DEFAULT_BELL_PAIR_CONFIG.seed)
  })
})

describe('mergeExtendedObjectStateForType — adversarial inputs', () => {
  it('handles string where number expected (user-edited JSON)', () => {
    const loaded = {
      schroedinger: {
        sampleCount: '64' as unknown, // string instead of number
        densityGain: true as unknown, // boolean instead of number
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as Record<string, unknown>

    // Wrong primitive types are dropped so corrupted scene JSON cannot inject
    // strings/booleans into numeric renderer fields.
    expect(s.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    expect(s.quantumMode).toBe(DEFAULT_SCHROEDINGER_CONFIG.quantumMode)
    expect(s.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
    expect(s.densityGain).toBe(DEFAULT_SCHROEDINGER_CONFIG.densityGain)
  })

  it('normalizes invalid quality enum ids from loaded scenes', () => {
    const loaded = {
      schroedinger: {
        qualityPreset: 'cinematic',
        raymarchQuality: 'cinematic',
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

    expect(s.qualityPreset).toBe(DEFAULT_SCHROEDINGER_CONFIG.qualityPreset)
    expect(s.raymarchQuality).toBe(DEFAULT_SCHROEDINGER_CONFIG.raymarchQuality)
    expect(s.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
  })

  it('handles empty object for schroedinger (no fields at all)', () => {
    const merged = mergeExtendedObjectStateForType({ schroedinger: {} }, 'schroedinger')
    const s = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

    // Should be entirely defaults
    expect(s.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
    expect(s.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    expect(s.densityGain).toBe(DEFAULT_SCHROEDINGER_CONFIG.densityGain)
  })

  it('normalizes non-finite and out-of-range top-level Schroedinger numeric controls', () => {
    const merged = mergeExtendedObjectStateForType(
      {
        schroedinger: {
          timeScale: Number.NaN,
          fieldScale: Number.POSITIVE_INFINITY,
          densityGain: 999,
          densityContrast: -1,
          powderScale: Number.NEGATIVE_INFINITY,
          sampleCount: 7.2,
          wignerDimensionIndex: Number.NaN,
          wignerXRange: Number.POSITIVE_INFINITY,
          wignerPRange: 0,
          wignerQuadPoints: 200,
          wignerCacheResolution: 2000,
          spectralDimensionFlowStrength: Number.POSITIVE_INFINITY,
          spectralDimensionFlowUvDimension: 9,
          spectralDimensionFlowDiffusionScale: Number.NaN,
        },
      },
      'schroedinger'
    )
    const s = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

    expect(s.timeScale).toBe(DEFAULT_SCHROEDINGER_CONFIG.timeScale)
    expect(s.fieldScale).toBe(DEFAULT_SCHROEDINGER_CONFIG.fieldScale)
    expect(s.densityGain).toBe(5)
    expect(s.densityContrast).toBe(1)
    expect(s.powderScale).toBe(DEFAULT_SCHROEDINGER_CONFIG.powderScale)
    expect(s.sampleCount).toBe(16)
    expect(s.wignerDimensionIndex).toBe(DEFAULT_SCHROEDINGER_CONFIG.wignerDimensionIndex)
    expect(s.wignerXRange).toBe(DEFAULT_SCHROEDINGER_CONFIG.wignerXRange)
    expect(s.wignerPRange).toBe(1)
    expect(s.wignerQuadPoints).toBe(96)
    expect(s.wignerCacheResolution).toBe(1024)
    expect(s.spectralDimensionFlowStrength).toBe(
      DEFAULT_SCHROEDINGER_CONFIG.spectralDimensionFlowStrength
    )
    expect(s.spectralDimensionFlowUvDimension).toBe(3.5)
    expect(s.spectralDimensionFlowDiffusionScale).toBe(
      DEFAULT_SCHROEDINGER_CONFIG.spectralDimensionFlowDiffusionScale
    )
  })

  it('normalizes loaded anti-de Sitter controls before they reach HKLL UI and packers', () => {
    const merged = mergeExtendedObjectStateForType(
      {
        schroedinger: {
          antiDeSitter: {
            d: 99,
            n: -4,
            l: 99,
            m: 99,
            mL: -99,
            branch: 'bad-branch',
            boundaryOverlay: 'yes',
            preset: 'bad-preset',
            btzEnabled: true,
            btzHorizonRadius: 99,
            btzOmega: -10,
            btzAngularM: 99,
            hkllEnabled: true,
            hkllBoundarySource: 'bad-source',
            hkllSourceSigma: 99,
            hkllPlaneWaveM: 99,
          },
        },
      },
      'schroedinger'
    )
    const ads = (merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG).antiDeSitter

    expect(ads.d).toBe(7)
    expect(ads.n).toBe(0)
    expect(ads.l).toBe(3)
    expect(ads.m).toBe(3)
    expect(ads.mL).toBe(-3)
    expect(ads.branch).toBe(DEFAULT_SCHROEDINGER_CONFIG.antiDeSitter.branch)
    expect(ads.boundaryOverlay).toBe(DEFAULT_SCHROEDINGER_CONFIG.antiDeSitter.boundaryOverlay)
    expect(ads.preset).toBe(DEFAULT_SCHROEDINGER_CONFIG.antiDeSitter.preset)
    expect(ads.btzEnabled).toBe(false)
    expect(ads.btzHorizonRadius).toBe(2)
    expect(ads.btzOmega).toBe(0.1)
    expect(ads.btzAngularM).toBe(5)
    expect(ads.hkllEnabled).toBe(true)
    expect(ads.hkllBoundarySource).toBe(DEFAULT_SCHROEDINGER_CONFIG.antiDeSitter.hkllBoundarySource)
    expect(ads.hkllSourceSigma).toBe(1.5)
    expect(ads.hkllPlaneWaveM).toBe(8)
  })

  it('returns mutation-isolated default sub-configs for sparse schroedinger scenes', () => {
    const first = mergeExtendedObjectStateForType({ schroedinger: {} }, 'schroedinger')
      .schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG
    const second = mergeExtendedObjectStateForType({ schroedinger: {} }, 'schroedinger')
      .schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

    expect(first.tdse).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse)
    expect(first.tdse).not.toBe(second.tdse)
    expect(first.tdse.gridSize).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.gridSize)
    expect(first.cosineParams.a).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.a)

    first.tdse.gridSize[0] = 128
    first.cosineParams.a[0] = 1.5

    expect(second.tdse.gridSize[0]).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.gridSize[0])
    expect(second.cosineParams.a[0]).toBe(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.a[0])
  })

  it('preserves default cosineParams when loaded value is a number instead of object', () => {
    const loaded = {
      schroedinger: {
        cosineParams: 42 as unknown, // corrupt: number instead of object
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as Record<string, unknown>
    const cp = s.cosineParams as { a: number[]; b: number[]; c: number[]; d: number[] }
    // cosineParams must remain a valid object with array properties (from defaults)
    expect(cp.a).toBeInstanceOf(Array)
    expect(cp.a).toHaveLength(3)
    expect(cp.b).toBeInstanceOf(Array)
  })

  it('strips keys that exist in loaded but not in defaults', () => {
    const loaded = {
      schroedinger: {
        __proto__: 'ignored',
        constructor: 'ignored',
        sampleCount: 64,
        unknownTopLevel: true,
        cosineParams: {
          a: [0.5, 0.5, 0.5] as [number, number, number],
          unknownNested: 'value',
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as Record<string, unknown>

    expect(s.sampleCount).toBe(64)
    expect(s.unknownTopLevel).toBeUndefined()
    expect((s.cosineParams as Record<string, unknown>).unknownNested).toBeUndefined()
  })

  it('drops numeric arrays with wrong element types', () => {
    const loaded = {
      schroedinger: {
        parameterValues: ['not', 'numbers'] as unknown, // strings instead of numbers
        visualizationAxes: ['0', '1', '2'] as unknown,
        cosineParams: {
          a: ['0.5', 0.5, 0.5] as unknown,
        },
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG
    expect(s.parameterValues).toEqual(DEFAULT_SCHROEDINGER_CONFIG.parameterValues)
    expect(s.visualizationAxes).toEqual(DEFAULT_SCHROEDINGER_CONFIG.visualizationAxes)
    expect(s.cosineParams.a).toEqual(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.a)
  })

  it('preserves default cosineParams when loaded value is null', () => {
    const loaded = {
      schroedinger: {
        cosineParams: null as unknown, // corrupt: null instead of object
      },
    }
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as Record<string, unknown>
    const cp = s.cosineParams as { a: number[]; b: number[]; c: number[]; d: number[] }
    // cosineParams must remain a valid object from defaults, not null
    expect(cp.a).toBeInstanceOf(Array)
    expect(cp.a).toHaveLength(3)
    expect(cp.b).toBeInstanceOf(Array)
  })
})
