import { beforeEach, describe, expect, it } from 'vitest'

import {
  parseAndValidateImport,
  SCENE_IMPORT_KEYS,
  STYLE_IMPORT_KEYS,
} from '@/stores/utils/presetImportExport'

let nextId = 1
beforeEach(() => {
  nextId = 1
})

/** Minimal valid style preset. */
function makeValidStyle(name: string) {
  return {
    id: `test-style-${nextId++}`,
    name,
    timestamp: Date.now(),
    data: {
      appearance: { color: 'red' },
      lighting: { intensity: 1 },
      postProcessing: { bloom: true },
      environment: { sky: 'blue' },
      pbr: { roughness: 0.5 },
    },
  }
}

/** Minimal valid scene preset. */
function makeValidScene(name: string) {
  return {
    id: `test-scene-${nextId++}`,
    name,
    timestamp: Date.now(),
    data: {
      appearance: { color: 'red' },
      lighting: { intensity: 1 },
      postProcessing: { bloom: true },
      environment: { sky: 'blue' },
      pbr: { roughness: 0.5 },
      geometry: { dimension: 3 },
      extended: {},
      transform: { scale: 1 },
      rotation: { x: 0 },
      animation: { speed: 1 },
      camera: { fov: 45 },
      ui: { panel: true },
    },
  }
}

/** Identity sanitizer — no transformation. */
const identitySanitize = <T>(data: T): T => data

describe('parseAndValidateImport', () => {
  describe('valid imports', () => {
    it('accepts a valid style array and regenerates IDs', () => {
      const original = makeValidStyle('My Style')
      const json = JSON.stringify([original])

      const result = parseAndValidateImport(
        json,
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.items).toHaveLength(1)
      // ID should be regenerated (different from original)
      expect(result.items[0]!.id).not.toBe(original.id)
      // Name should be preserved
      expect(result.items[0]!.name).toBe('My Style')
    })

    it('accepts a valid scene array', () => {
      const json = JSON.stringify([makeValidScene('Test Scene')])
      const result = parseAndValidateImport(
        json,
        new Set<string>(),
        SCENE_IMPORT_KEYS,
        identitySanitize,
        'scenes'
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.items).toHaveLength(1)
    })

    it('processes multiple items', () => {
      const json = JSON.stringify([makeValidStyle('A'), makeValidStyle('B'), makeValidStyle('C')])
      const result = parseAndValidateImport(
        json,
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.items).toHaveLength(3)
    })
  })

  describe('name deduplication', () => {
    it('deduplicates names that collide with existing presets', () => {
      const json = JSON.stringify([makeValidStyle('Existing')])
      const existing = new Set(['Existing'])

      const result = parseAndValidateImport(
        json,
        existing,
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      // Name should be changed to avoid collision
      expect(result.items[0]!.name).not.toBe('Existing')
      expect((result.items[0]!.name as string).startsWith('Existing')).toBe(true)
    })

    it('deduplicates names that collide within the import batch', () => {
      const json = JSON.stringify([makeValidStyle('Same'), makeValidStyle('Same')])

      const result = parseAndValidateImport(
        json,
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.items[0]!.name).not.toBe(result.items[1]!.name)
    })
  })

  describe('invalid imports', () => {
    it('rejects malformed JSON', () => {
      const result = parseAndValidateImport(
        'not valid json{{{',
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toContain('Failed to parse JSON')
    })

    it('rejects non-array JSON', () => {
      const result = parseAndValidateImport(
        JSON.stringify({ name: 'not an array' }),
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toContain('expected an array')
    })

    it('rejects items missing required data keys', () => {
      const incomplete = {
        id: 'test-incomplete-1',
        name: 'Bad',
        timestamp: Date.now(),
        data: { appearance: { color: 'red' } }, // missing lighting, postProcessing, environment
      }
      const result = parseAndValidateImport(
        JSON.stringify([incomplete]),
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toContain('corrupted or incompatible')
    })

    it('rejects items missing the name field', () => {
      const noName = {
        id: 'x',
        timestamp: 1,
        data: { appearance: {}, lighting: {}, postProcessing: {}, environment: {}, pbr: {} },
      }
      const result = parseAndValidateImport(
        JSON.stringify([noName]),
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )
      expect(result.success).toBe(false)
    })

    it('rejects items with empty/whitespace name', () => {
      const emptyName = makeValidStyle('   ')
      const result = parseAndValidateImport(
        JSON.stringify([emptyName]),
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        identitySanitize,
        'styles'
      )
      expect(result.success).toBe(false)
    })
  })

  describe('sanitize callback', () => {
    it('applies the sanitize function to each item data', () => {
      const json = JSON.stringify([makeValidStyle('Test')])
      let sanitizeCalled = false
      const result = parseAndValidateImport(
        json,
        new Set<string>(),
        STYLE_IMPORT_KEYS,
        (data: unknown) => {
          sanitizeCalled = true
          return data
        },
        'styles'
      )

      expect(result.success).toBe(true)
      expect(sanitizeCalled).toBe(true)
    })
  })
})
