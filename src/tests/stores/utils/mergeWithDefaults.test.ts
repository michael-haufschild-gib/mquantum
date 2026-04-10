/**
 * Tests for mergeWithDefaults utility
 *
 * Ensures that old saved scenes get default values for new parameters.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_PAULI_CONFIG, DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
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
    const fsUnsafe = (mergedUnsafe.schroedinger as { freeScalar: Record<string, unknown> }).freeScalar
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

  it('does not touch schroedinger config when merging pauliSpinor', () => {
    const loaded = {
      pauliSpinor: { fieldStrength: 3.0 },
    }

    const merged = mergeExtendedObjectStateForType(loaded, 'pauliSpinor')

    // Only pauliSpinor key should be present
    expect(Object.keys(merged)).toEqual(['pauliSpinor'])
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

    // deepMerge replaces values by key — the wrong type will be passed through.
    // The key assertion is that no exception is thrown and the rest of the
    // config still has correct defaults for the untouched fields.
    expect(s.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    expect(s.quantumMode).toBe(DEFAULT_SCHROEDINGER_CONFIG.quantumMode)
  })

  it('handles empty object for schroedinger (no fields at all)', () => {
    const merged = mergeExtendedObjectStateForType({ schroedinger: {} }, 'schroedinger')
    const s = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

    // Should be entirely defaults
    expect(s.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
    expect(s.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    expect(s.densityGain).toBe(DEFAULT_SCHROEDINGER_CONFIG.densityGain)
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

  it('handles array with wrong element types', () => {
    const loaded = {
      schroedinger: {
        parameterValues: ['not', 'numbers'] as unknown, // strings instead of numbers
      },
    }
    // Should not throw — arrays are replaced wholesale
    const merged = mergeExtendedObjectStateForType(loaded, 'schroedinger')
    const s = merged.schroedinger as Record<string, unknown>
    expect(s.parameterValues).toEqual(['not', 'numbers'])
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
