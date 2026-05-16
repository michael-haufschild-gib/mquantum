/**
 * Object Type Registry Tests
 *
 * Tests for the centralized object type registry and helper functions.
 * Only 'schroedinger' exists as the sole object type.
 */

import { describe, expect, it } from 'vitest'

import {
  getAvailableQuantumTypes,
  getAvailableTypesForDimension,
  getConfigStoreKey,
  // UI
  getControlsComponentKey,
  // Dimension constraints
  getDimensionConstraints,
  getQuantumTypeEntry,
  getQuantumTypeName,
  getRecommendedDimension,
  hasTimelineControls,
  isAnalyticQuantumType,
  isAvailableForDimension,
  isComputeQuantumType,
  // Rendering capabilities
  isRaymarchingType,
  // Validation
  isValidObjectType,
  // Registry data
  QUANTUM_MODES_3D_ONLY,
  QUANTUM_TYPE_REGISTRY,
  resolveQuantumTypeKey,
  supportsSchroedingerSurfaceMode,
} from '@/lib/geometry/registry'
import { getControlsComponent, hasControlsComponent } from '@/lib/geometry/registry/components'

describe('Object Type Registry', () => {
  describe('Registry Structure', () => {
    it('exposes the three ObjectTypes via the per-dimension helper', () => {
      // The helper enumerates every ObjectType backed by at least one
      // QUANTUM_TYPE_REGISTRY entry — there is no separate ObjectType registry.
      // At 11D only schroedinger is supported (pauliSpinor max=6, bellPair max=3),
      // but the type list itself enumerates all three with availability flags.
      const types = getAvailableTypesForDimension(11).map((t) => t.type)
      expect(types).toContain('schroedinger')
      expect(types).toContain('pauliSpinor')
      expect(types).toContain('bellPair')
      expect(types).toHaveLength(3)
    })

    it('returns derived facts for schroedinger', () => {
      expect(getDimensionConstraints('schroedinger')).toMatchObject({ min: 2, max: 11 })
      expect(getControlsComponentKey('schroedinger')).toBe('SchroedingerControls')
      expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')
    })

    it('returns undefined facts for invalid object type', () => {
      expect(getDimensionConstraints('invalid-type' as never)).toBeUndefined()
      expect(getControlsComponentKey('invalid-type' as never)).toBeUndefined()
      expect(getConfigStoreKey('invalid-type' as never)).toBeUndefined()
    })
  })

  describe('pauliSpinor entry', () => {
    it('returns derived facts for pauliSpinor', () => {
      expect(getDimensionConstraints('pauliSpinor')).toMatchObject({ min: 3, max: 6 })
      expect(getConfigStoreKey('pauliSpinor')).toBe('pauliSpinor')
    })

    it('pauliSpinor recommends 3D', () => {
      expect(getRecommendedDimension('pauliSpinor')).toBe(3)
    })

    it('pauliSpinor controls component key is PauliSpinorControls', () => {
      expect(getControlsComponentKey('pauliSpinor')).toBe('PauliSpinorControls')
    })

    it('pauliSpinor has timeline controls', () => {
      expect(hasTimelineControls('pauliSpinor')).toBe(true)
    })

    it('pauliSpinor config store key is pauliSpinor', () => {
      expect(getConfigStoreKey('pauliSpinor')).toBe('pauliSpinor')
    })

    it('isValidObjectType accepts pauliSpinor', () => {
      expect(isValidObjectType('pauliSpinor')).toBe(true)
    })
  })

  describe('Rendering Capabilities', () => {
    it('isRaymarchingType identifies schroedinger as raymarched', () => {
      expect(isRaymarchingType('schroedinger')).toBe(true)
    })

    it('isRaymarchingType identifies pauliSpinor as raymarched', () => {
      expect(isRaymarchingType('pauliSpinor')).toBe(true)
    })
  })

  describe('Dimension Constraints', () => {
    it('returns dimension constraints for schroedinger', () => {
      const constraints = getDimensionConstraints('schroedinger')
      expect(constraints?.min).toBe(2)
      expect(constraints?.max).toBe(11)
      expect(constraints?.recommended).toBe(4)
    })

    it('isAvailableForDimension checks constraints', () => {
      expect(isAvailableForDimension('schroedinger', 3)).toBe(true)
      expect(isAvailableForDimension('schroedinger', 11)).toBe(true)
    })

    it('getAvailableTypesForDimension returns filtered list', () => {
      const typesAt4D = getAvailableTypesForDimension(4)
      // schroedinger, pauliSpinor, bellPair — all three types are present.
      // schroedinger and pauliSpinor are *available* at 4D; bellPair is not
      // (its range is 3D only, since CHSH lives in the spin sector).
      expect(typesAt4D.length).toBe(3)
      const types = typesAt4D.map((t) => t.type)
      expect(types).toContain('schroedinger')
      expect(types).toContain('pauliSpinor')
      expect(types).toContain('bellPair')
      const availableTypes = typesAt4D.filter((t) => t.available).map((t) => t.type)
      expect(availableTypes).toContain('schroedinger')
      expect(availableTypes).toContain('pauliSpinor')
      expect(availableTypes).not.toContain('bellPair')
    })

    it('getRecommendedDimension returns value for schroedinger', () => {
      expect(getRecommendedDimension('schroedinger')).toBe(4)
    })
  })

  describe('UI Components', () => {
    it('returns controls component key for schroedinger', () => {
      expect(getControlsComponentKey('schroedinger')).toBe('SchroedingerControls')
    })

    it('hasTimelineControls returns true for schroedinger', () => {
      expect(hasTimelineControls('schroedinger')).toBe(true)
    })
  })

  describe('Component Loader', () => {
    it('hasControlsComponent returns true for registered keys', () => {
      expect(hasControlsComponent('SchroedingerControls')).toBe(true)
      expect(hasControlsComponent('PauliSpinorControls')).toBe(true)
    })

    it('hasControlsComponent returns false for unknown keys', () => {
      expect(hasControlsComponent('NonexistentControls')).toBe(false)
      expect(hasControlsComponent('')).toBe(false)
    })

    it('getControlsComponent returns a lazy component for registered keys', () => {
      const component = getControlsComponent('SchroedingerControls')
      // React.lazy components have $$typeof set to the lazy symbol
      expect(component).toHaveProperty('$$typeof')
    })

    it('getControlsComponent returns null for unknown keys', () => {
      const component = getControlsComponent('UnknownControls')
      expect(component).toBe(null)
    })

    it('getControlsComponent caches results (second call returns same ref)', () => {
      const first = getControlsComponent('SchroedingerControls')
      const second = getControlsComponent('SchroedingerControls')
      expect(first).toBe(second)
    })
  })

  describe('Validation', () => {
    it('isValidObjectType validates correctly', () => {
      expect(isValidObjectType('schroedinger')).toBe(true)
      expect(isValidObjectType('invalid')).toBe(false)
      expect(isValidObjectType('')).toBe(false)
      expect(isValidObjectType('hypercube')).toBe(false)
    })

    it('getConfigStoreKey returns correct key', () => {
      expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')
    })
  })
})

describe('Quantum Type Registry (Flat Model)', () => {
  describe('Registry Structure', () => {
    it('contains all expected quantum type entries', () => {
      const keys = Array.from(QUANTUM_TYPE_REGISTRY.keys()).sort()
      expect(keys).toEqual([
        'antiDeSitter',
        'becDynamics',
        'bellTest',
        'diracEquation',
        'freeScalarField',
        'harmonicOscillator',
        'hydrogenND',
        'hydrogenNDCoupled',
        'pauliSpinor',
        'quantumWalk',
        'tdseDynamics',
        'wheelerDeWitt',
      ])
    })

    it('every entry has a valid internal bridge', () => {
      for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
        expect(entry.internal.objectType).toMatch(/^(schroedinger|pauliSpinor|bellPair)$/)
        expect(entry.internal.configStoreKey).toMatch(/^(schroedinger|pauliSpinor|bellPair)$/)
        if (entry.internal.objectType === 'schroedinger') {
          expect(entry.internal.quantumMode).toBe(key)
        }
      }
    })
  })

  describe('Category Classification', () => {
    it('classifies analytic modes correctly', () => {
      expect(isAnalyticQuantumType('harmonicOscillator')).toBe(true)
      expect(isAnalyticQuantumType('hydrogenND')).toBe(true)
    })

    it('classifies compute modes correctly', () => {
      expect(isComputeQuantumType('freeScalarField')).toBe(true)
      expect(isComputeQuantumType('tdseDynamics')).toBe(true)
      expect(isComputeQuantumType('becDynamics')).toBe(true)
      expect(isComputeQuantumType('diracEquation')).toBe(true)
      expect(isComputeQuantumType('quantumWalk')).toBe(true)
      expect(isComputeQuantumType('pauliSpinor')).toBe(true)
    })

    it('analytic and compute are mutually exclusive', () => {
      for (const [key] of QUANTUM_TYPE_REGISTRY) {
        const isAnalytic = isAnalyticQuantumType(key)
        const isCompute = isComputeQuantumType(key)
        // Exactly one must be true — XOR
        expect(isAnalytic).not.toBe(isCompute)
      }
    })
  })

  describe('supportsSchroedingerSurfaceMode', () => {
    it('allows analytic Schroedinger modes in 2D+ non-Wigner representations', () => {
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'harmonicOscillator',
          dimension: 2,
          representation: 'position',
        })
      ).toBe(true)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'hydrogenND',
          dimension: 3,
          representation: 'momentum',
        })
      ).toBe(true)
    })

    it('allows compute modes (density-grid isosurface shader path)', () => {
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'tdseDynamics',
          dimension: 3,
          representation: 'position',
        })
      ).toBe(true)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'freeScalarField',
          dimension: 3,
          representation: 'position',
        })
      ).toBe(true)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'diracEquation',
          dimension: 3,
          representation: 'position',
        })
      ).toBe(true)
    })

    it('allows pauliSpinor object type (density-grid isosurface path)', () => {
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'pauliSpinor',
          dimension: 3,
        })
      ).toBe(true)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'pauliSpinor',
          dimension: 2,
        })
      ).toBe(true)
    })

    it('blocks Wigner representation, bellPair, and dimension < 2', () => {
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'schroedinger',
          quantumMode: 'harmonicOscillator',
          dimension: 3,
          representation: 'wigner',
        })
      ).toBe(false)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'bellPair',
          dimension: 3,
        })
      ).toBe(false)
      expect(
        supportsSchroedingerSurfaceMode({
          objectType: 'pauliSpinor',
          dimension: 1,
        })
      ).toBe(false)
    })
  })

  describe('resolveQuantumTypeKey', () => {
    it('resolves schroedinger + quantumMode to the mode key', () => {
      expect(resolveQuantumTypeKey('schroedinger', 'harmonicOscillator')).toBe('harmonicOscillator')
      expect(resolveQuantumTypeKey('schroedinger', 'tdseDynamics')).toBe('tdseDynamics')
    })

    it('resolves pauliSpinor to pauliSpinor', () => {
      expect(resolveQuantumTypeKey('pauliSpinor')).toBe('pauliSpinor')
    })

    it('returns undefined for schroedinger without quantumMode', () => {
      expect(resolveQuantumTypeKey('schroedinger')).toBeUndefined()
    })

    it('rejects malformed schroedinger quantum modes at runtime', () => {
      expect(resolveQuantumTypeKey('schroedinger', 'pauliSpinor' as never)).toBeUndefined()
      expect(resolveQuantumTypeKey('schroedinger', 'legacyMode' as never)).toBeUndefined()
      expect(resolveQuantumTypeKey('schroedinger', '' as never)).toBeUndefined()
    })
  })

  describe('getQuantumTypeName', () => {
    it('returns display name for known types', () => {
      expect(getQuantumTypeName('harmonicOscillator')).toBe('Harmonic Oscillator')
      expect(getQuantumTypeName('pauliSpinor')).toBe('Pauli Spinor')
    })
  })

  describe('getAvailableQuantumTypes', () => {
    it('all compute modes require 3D+', () => {
      const at2D = getAvailableQuantumTypes(2)
      for (const info of at2D) {
        if (isComputeQuantumType(info.key)) {
          expect(info.available, `${info.key} should not be available at 2D`).toBe(false)
        }
      }
    })

    it('all types available at 3D', () => {
      const at3D = getAvailableQuantumTypes(3)
      expect(at3D.map((t) => t.key).sort()).toEqual(Array.from(QUANTUM_TYPE_REGISTRY.keys()).sort())
      expect(at3D.every((t) => t.available)).toBe(true)
    })
  })

  describe('QUANTUM_MODES_3D_ONLY', () => {
    it('includes all compute modes', () => {
      for (const [key] of QUANTUM_TYPE_REGISTRY) {
        if (isComputeQuantumType(key)) {
          expect(QUANTUM_MODES_3D_ONLY.has(key), `${key} should be marked 3D-only`).toBe(true)
        }
      }
    })

    it('excludes analytic modes with min=2', () => {
      expect(QUANTUM_MODES_3D_ONLY.has('harmonicOscillator')).toBe(false)
      expect(QUANTUM_MODES_3D_ONLY.has('hydrogenND')).toBe(false)
    })
  })
})

describe('Per-ObjectType helpers derive the dimension envelope', () => {
  it('pauliSpinor dimension constraints match the sole quantum entry', () => {
    const derived = getDimensionConstraints('pauliSpinor')
    const flat = getQuantumTypeEntry('pauliSpinor')
    expect(derived?.min).toBe(flat!.dimensions.min)
    expect(derived?.max).toBe(flat!.dimensions.max)
  })

  it('schroedinger dimension constraints match the widest quantum type range', () => {
    // schroedinger wraps all quantum modes — its envelope must be the union.
    let minOfAllModes = Infinity
    let maxOfAllModes = -Infinity
    for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
      if (entry.internal.objectType === 'schroedinger') {
        minOfAllModes = Math.min(minOfAllModes, entry.dimensions.min)
        maxOfAllModes = Math.max(maxOfAllModes, entry.dimensions.max)
      }
    }
    const derived = getDimensionConstraints('schroedinger')
    expect(derived?.min).toBe(minOfAllModes)
    expect(derived?.max).toBe(maxOfAllModes)
  })
})
