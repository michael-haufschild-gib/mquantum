/**
 * Targeted tests for the core preset serialization primitives.
 *
 * The existing `presetSerialization.test.ts` covers transient-field stripping
 * and a Pauli round-trip but leaves the main entry points underspecified:
 *   - `serializeState` deep-cloning isolation
 *   - `serializeAnimationState` (Set → Array)
 *   - `serializeRotationState` (Map → Object)
 *   - non-finite (NaN / Infinity) sanitization across types
 *   - `sanitizeSceneData` / `sanitizeStyleData` orchestrators
 *
 * Bugs in any of these silently corrupt user presets — non-finite values
 * leak into uniforms, mutated saved states track live state, or
 * Set/Map references become unserializable JSON nulls.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  sanitizeExtendedLoadedState,
  sanitizeLoadedState,
  sanitizeSceneData,
  sanitizeStyleData,
  serializeAnimationState,
  serializeExtendedState,
  serializeRotationState,
  serializeState,
} from '@/stores/utils/presetSerialization'

describe('serializeState', () => {
  it('deep-clones the input (mutating the result does not affect the source)', () => {
    const source = { nested: { count: 1 }, arr: [10, 20] }
    const cloned = serializeState(source) as typeof source
    cloned.nested.count = 99
    cloned.arr.push(30)
    expect(source.nested.count).toBe(1)
    expect(source.arr).toEqual([10, 20])
  })

  it('strips function-typed top-level fields', () => {
    const setter = vi.fn()
    const cleaned = serializeState({ value: 42, setValue: setter })
    expect(cleaned).toEqual({ value: 42 })
  })

  it('strips known transient fields (version counters, runtime flags)', () => {
    const cleaned = serializeState({
      value: 7,
      schroedingerVersion: 12, // version counter — must not persist
      pbrVersion: 3,
      maxFps: 60, // device-specific UI preference
    })
    expect(cleaned).toEqual({ value: 7 })
  })

  it('drops non-finite values before JSON serialization can turn them into null', () => {
    const cleaned = serializeState({
      stable: 1,
      badTopLevel: NaN,
      nested: { good: 2, bad: Infinity },
      validVector: [0, 1, 2],
      invalidVector: [0, Number.NEGATIVE_INFINITY, 2],
    })

    expect(cleaned).toEqual({
      stable: 1,
      nested: { good: 2 },
      validVector: [0, 1, 2],
    })
    expect(JSON.stringify(cleaned)).not.toContain('null')
  })

  it('throws when the input contains a circular reference (JSON.stringify behavior)', () => {
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(() => serializeState(cyclic)).toThrow()
  })
})

describe('serializeAnimationState', () => {
  it('converts a Set of plane keys to a JSON-serializable Array', () => {
    const state = {
      animatingPlanes: new Set(['xy', 'xz', 'yz']),
      speed: 1.5,
    }
    const out = serializeAnimationState(state) as typeof state & {
      animatingPlanes: string[] | Set<string>
    }
    expect((out.animatingPlanes as string[]).sort()).toEqual(['xy', 'xz', 'yz'])
  })

  it('leaves non-Set animatingPlanes untouched (already serialized presets)', () => {
    const state = { animatingPlanes: ['xy'], speed: 1 }
    const out = serializeAnimationState(state) as typeof state
    expect(out.animatingPlanes).toEqual(['xy'])
  })

  it('omits animatingPlanes entirely when not present', () => {
    const state = { speed: 2.5 }
    const out = serializeAnimationState(state) as typeof state & {
      animatingPlanes?: unknown
    }
    expect(Object.keys(out)).toEqual(['speed'])
  })
})

describe('serializeRotationState', () => {
  it('converts a Map of rotations to a JSON-serializable plain Object', () => {
    const rotations = new Map<string, number>([
      ['xy', 0.5],
      ['xz', -0.25],
    ])
    const state = { rotations, version: 1 } // version is transient ⇒ stripped
    const out = serializeRotationState(state) as Record<string, unknown>
    expect(out).toEqual({ rotations: { xy: 0.5, xz: -0.25 } })
  })

  it('leaves non-Map rotations untouched (already-serialized presets)', () => {
    const state = { rotations: { xy: 0.1 } }
    const out = serializeRotationState(state) as typeof state
    expect(out.rotations).toEqual({ xy: 0.1 })
  })
})

describe('sanitizeLoadedState — non-finite scrubbing', () => {
  it('drops NaN at the top level', () => {
    const out = sanitizeLoadedState({ a: 1, b: NaN, c: 3 })
    expect(out).toEqual({ a: 1, c: 3 })
  })

  it('drops ±Infinity at the top level', () => {
    const out = sanitizeLoadedState({ a: 1, b: Infinity, c: -Infinity, d: 4 })
    expect(out).toEqual({ a: 1, d: 4 })
  })

  it('drops nested non-finite values inside an object', () => {
    const out = sanitizeLoadedState({
      a: 1,
      nested: { x: 5, y: NaN, z: 7 },
    })
    expect(out).toEqual({ a: 1, nested: { x: 5, z: 7 } })
  })

  it('drops the ENTIRE array when any element is non-finite (preserves shape invariants)', () => {
    // Per source: sanitizeFiniteArray returns undefined when any element
    // fails — preserves [length] invariants downstream.
    const out = sanitizeLoadedState({
      a: 1,
      arr: [1, 2, NaN, 4],
    })
    expect(out).toEqual({ a: 1 }) // arr removed entirely
  })

  it('preserves arrays with all finite values', () => {
    const out = sanitizeLoadedState({ arr: [1, 2, 3.5, -7] })
    expect(out).toEqual({ arr: [1, 2, 3.5, -7] })
  })

  it('preserves non-numeric fields (strings, booleans, null) unchanged', () => {
    const out = sanitizeLoadedState({
      mode: 'harmonicOscillator',
      enabled: true,
      maybe: null,
      n: 42,
    })
    expect(out).toEqual({
      mode: 'harmonicOscillator',
      enabled: true,
      maybe: null,
      n: 42,
    })
  })

  it('combines transient stripping and non-finite scrubbing in one pass', () => {
    const out = sanitizeLoadedState({
      schroedingerVersion: 7, // transient
      density: 0.5,
      bogus: NaN, // non-finite
    })
    expect(out).toEqual({ density: 0.5 })
  })
})

describe('sanitizeStyleData', () => {
  it('orchestrates sanitizeLoadedState across all five style sections', () => {
    const out = sanitizeStyleData({
      appearance: { density: 0.7, schroedingerVersion: 9 },
      lighting: { intensity: 1.0, version: 4 },
      postProcessing: { bloom: 0.4, bloomMode: 'legacy' }, // bloomMode = transient
      environment: { skyboxEnabled: true, classicSkyboxType: 'sunset' }, // classicSkyboxType = transient
      pbr: { metallic: 0.3, pbrVersion: 1 },
    })
    expect(out.appearance).toEqual({ density: 0.7 })
    expect(out.lighting).toEqual({ intensity: 1.0 })
    expect(out.postProcessing).toEqual({ bloom: 0.4 })
    expect(out.environment).toEqual({ skyboxEnabled: true })
    expect(out.pbr).toEqual({ metallic: 0.3 })
  })
})

describe('sanitizeSceneData', () => {
  it('orchestrates sanitization across all 12 scene sections including extended', () => {
    const out = sanitizeSceneData({
      appearance: { x: 1 },
      lighting: { x: 2 },
      postProcessing: { x: 3 },
      environment: { x: 4 },
      pbr: { x: 5 },
      geometry: { x: 6, schroedingerVersion: 9 },
      extended: { schroedinger: { quantumMode: 'harmonicOscillator', needsReset: true } },
      transform: { x: 8 },
      rotation: { x: 9, version: 2 },
      animation: { x: 10 },
      camera: { x: 11, controls: 'should-strip' },
      ui: { x: 12, maxFps: 144 },
    })
    expect(out.geometry).toEqual({ x: 6 })
    expect(out.rotation).toEqual({ x: 9 })
    expect(out.camera).toEqual({ x: 11 })
    expect(out.ui).toEqual({ x: 12 })
    expect(out.extended).toEqual({
      schroedinger: { quantumMode: 'harmonicOscillator' },
    })
  })
})

describe('serializeExtendedState — unknown object type', () => {
  it('returns an empty object when objectType has no mapping', () => {
    const out = serializeExtendedState(
      { schroedinger: { quantumMode: 'harmonicOscillator' } },
      'invalidType' as 'schroedinger'
    )
    expect(out).toEqual({})
  })

  it('returns an empty object when the matching config is missing', () => {
    const out = serializeExtendedState({} as Record<string, unknown>, 'schroedinger')
    expect(out).toEqual({})
  })

  it('returns an empty object when the matching config is non-object (corrupted preset)', () => {
    const out = serializeExtendedState(
      { schroedinger: 'corrupted' as unknown as object },
      'schroedinger'
    )
    expect(out).toEqual({})
  })
})

describe('sanitizeExtendedLoadedState — doubly-nested config sanitation', () => {
  it('strips transient fields three levels deep (extended.schroedinger.tdse.needsReset)', () => {
    const input = {
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: { potentialType: 'barrier', needsReset: true, diagnosticsInterval: 5 },
        version: 9, // transient at level 2
      },
      schroedingerVersion: 1, // transient at level 1
    }
    const out = sanitizeExtendedLoadedState(input)
    expect(out).toEqual({
      schroedinger: {
        quantumMode: 'tdseDynamics',
        tdse: { potentialType: 'barrier', diagnosticsInterval: 5 },
      },
    })
  })

  it('does NOT mutate the input object', () => {
    const input = {
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        sqLayerEnabled: true,
      },
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    sanitizeExtendedLoadedState(input)
    expect(input).toEqual(snapshot)
  })
})
