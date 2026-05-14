/**
 * Preset import corruption resilience tests.
 *
 * Verifies that the preset import pipeline handles malformed, truncated,
 * and adversarial data without crashing or corrupting application state.
 * Each test verifies a specific class of malformed input that could
 * arrive from a corrupted file, manual editing, or version mismatch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePresetManagerStore } from '@/stores/runtime/presetManagerStore'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useLightingStore } from '@/stores/scene/lightingStore'

// Mock msgBoxStore to prevent actual dialog displays
vi.mock('@/stores/ui/msgBoxStore', () => ({
  useMsgBoxStore: {
    getState: () => ({
      showMsgBox: vi.fn(),
    }),
  },
}))

/** A valid style entry that passes all validation checks. */
function makeValidStyle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-style-1',
    name: 'Valid Style',
    timestamp: Date.now(),
    data: {
      appearance: { edgeColor: '#ff0000' },
      lighting: { lightStrength: 1.0 },
      postProcessing: {},
      environment: {},
    },
    ...overrides,
  }
}

describe('preset import corruption resilience', () => {
  beforeEach(() => {
    usePresetManagerStore.setState({ savedStyles: [], savedScenes: [] })
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()
  })

  describe('style import rejects invalid JSON structures', () => {
    it('rejects truncated JSON', () => {
      const result = usePresetManagerStore.getState().importStyles('[ { "id": "test", "name":')
      expect(result).toBe(false)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
    })

    it('rejects non-array JSON (object)', () => {
      const result = usePresetManagerStore.getState().importStyles('{"id": "test"}')
      expect(result).toBe(false)
    })

    it('rejects non-array JSON (string)', () => {
      const result = usePresetManagerStore.getState().importStyles('"hello"')
      expect(result).toBe(false)
    })

    it('rejects non-array JSON (number)', () => {
      const result = usePresetManagerStore.getState().importStyles('42')
      expect(result).toBe(false)
    })

    it('rejects null JSON', () => {
      const result = usePresetManagerStore.getState().importStyles('null')
      expect(result).toBe(false)
    })

    it('rejects empty string', () => {
      const result = usePresetManagerStore.getState().importStyles('')
      expect(result).toBe(false)
    })

    it('accepts empty array (no styles to import)', () => {
      const result = usePresetManagerStore.getState().importStyles('[]')
      expect(result).toBe(true)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
    })
  })

  describe('style import rejects entries with missing required fields', () => {
    it('rejects null array entries without throwing', () => {
      let result: boolean | undefined
      expect(() => {
        result = usePresetManagerStore.getState().importStyles(JSON.stringify([null]))
      }).not.toThrow()
      expect(result).toBe(false)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(0)
    })

    it('rejects entry missing id', () => {
      const data = [makeValidStyle({ id: undefined })]
      // Remove id entirely since spread with undefined keeps the key
      delete (data[0] as Record<string, unknown>).id
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry missing name', () => {
      const data = [makeValidStyle()]
      delete (data[0] as Record<string, unknown>).name
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry with empty string name', () => {
      const data = [makeValidStyle({ name: '' })]
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry with whitespace-only name', () => {
      const data = [makeValidStyle({ name: '   ' })]
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry missing data object', () => {
      const data = [makeValidStyle()]
      delete (data[0] as Record<string, unknown>).data
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry where data is missing appearance', () => {
      const data = [
        makeValidStyle({
          data: { lighting: {}, postProcessing: {}, environment: {} },
        }),
      ]
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })

    it('rejects entry where data is missing lighting', () => {
      const data = [
        makeValidStyle({
          data: { appearance: {}, postProcessing: {}, environment: {} },
        }),
      ]
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(false)
    })
  })

  describe('style import handles wrong types for known fields', () => {
    it('accepts valid entry as baseline', () => {
      const result = usePresetManagerStore
        .getState()
        .importStyles(JSON.stringify([makeValidStyle()]))
      expect(result).toBe(true)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(1)
    })

    it('rejects entry where data is a string instead of object', () => {
      const corrupt = makeValidStyle({ data: 'not-an-object' })
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify([corrupt]))
      expect(result).toBe(false)
    })

    it('rejects entry where data is null', () => {
      const corrupt = makeValidStyle({ data: null })
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify([corrupt]))
      expect(result).toBe(false)
    })
  })

  describe('style import with extra unknown fields does not crash', () => {
    it('accepts entries with extra top-level fields (forward compatibility)', () => {
      const data = [
        makeValidStyle({
          version: 99,
          futureField: { nested: true },
        }),
      ]
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(result).toBe(true)
      expect(usePresetManagerStore.getState().savedStyles).toHaveLength(1)
    })

    it('accepts entries with extra data fields (forward compatibility)', () => {
      const entry = makeValidStyle()
      ;(entry.data as Record<string, unknown>).futureStore = { enabled: true }
      const result = usePresetManagerStore.getState().importStyles(JSON.stringify([entry]))
      expect(result).toBe(true)
    })
  })

  describe('scene import corruption resilience', () => {
    it('rejects truncated JSON', () => {
      const result = usePresetManagerStore.getState().importScenes('[ { "id": "test')
      expect(result).toBe(false)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
    })

    it('rejects non-array JSON', () => {
      const result = usePresetManagerStore.getState().importScenes('{"id": "test"}')
      expect(result).toBe(false)
    })

    it('accepts empty array', () => {
      const result = usePresetManagerStore.getState().importScenes('[]')
      expect(result).toBe(true)
    })

    it('rejects primitive array entries without throwing', () => {
      let result: boolean | undefined
      expect(() => {
        result = usePresetManagerStore.getState().importScenes(JSON.stringify([42]))
      }).not.toThrow()
      expect(result).toBe(false)
      expect(usePresetManagerStore.getState().savedScenes).toHaveLength(0)
    })
  })

  describe('imported styles do not corrupt store state on load', () => {
    it('loading a style with out-of-range lighting values normalizes them', () => {
      const data = [
        makeValidStyle({
          data: {
            appearance: { edgeColor: '#ff0000' },
            lighting: {
              lightStrength: -999,
              exposure: 999,
              ambientIntensity: 999,
            },
            postProcessing: {},
            environment: {},
          },
        }),
      ]

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      usePresetManagerStore.getState().loadStyle(saved!.id)

      const lighting = useLightingStore.getState()
      expect(lighting.lightStrength).toBeGreaterThanOrEqual(0)
      expect(lighting.exposure).toBeLessThanOrEqual(3)
      expect(lighting.ambientIntensity).toBeLessThanOrEqual(1)
    })

    it('importing multiple styles with duplicate names generates unique names', () => {
      const data = [
        makeValidStyle({ id: 's1', name: 'Duplicate' }),
        makeValidStyle({ id: 's2', name: 'Duplicate' }),
        makeValidStyle({ id: 's3', name: 'Duplicate' }),
      ]

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(ok).toBe(true)

      const names = usePresetManagerStore.getState().savedStyles.map((s) => s.name)
      // All names should be unique
      expect(new Set(names).size).toBe(names.length)
    })

    it('imported style IDs are regenerated (never trusts external IDs)', () => {
      const externalId = 'attacker-controlled-id'
      const data = [makeValidStyle({ id: externalId })]

      const ok = usePresetManagerStore.getState().importStyles(JSON.stringify(data))
      expect(ok).toBe(true)

      const [saved] = usePresetManagerStore.getState().savedStyles
      // ID should have been regenerated
      expect(saved!.id).not.toBe(externalId)
    })
  })
})
