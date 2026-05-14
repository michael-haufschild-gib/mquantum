import { describe, expect, it } from 'vitest'

import {
  DESKTOP_EXPORT_PRESETS,
  getExportPresetConfig,
  isExportPresetId,
  MOBILE_EXPORT_PRESETS,
} from '@/stores/utils/exportPresetDefinitions'

describe('exportPresetDefinitions', () => {
  describe('isExportPresetId', () => {
    it('returns true for known preset ids', () => {
      expect(isExportPresetId('landscape-1080p')).toBe(true)
      expect(isExportPresetId('high-q')).toBe(true)
    })

    it('returns false for unknown values', () => {
      expect(isExportPresetId('unknown-preset')).toBe(false)
      expect(isExportPresetId(null)).toBe(false)
    })

    it('returns false for inherited Object.prototype keys', () => {
      // `value in obj` would return true for these — the implementation must
      // use hasOwnProperty so attackers cannot smuggle `toString` etc. through
      // the discriminator.
      expect(isExportPresetId('toString')).toBe(false)
      expect(isExportPresetId('hasOwnProperty')).toBe(false)
    })
  })

  describe('getExportPresetConfig', () => {
    it('returns a defensive copy so callers cannot mutate the shared definition', () => {
      // Regression: prior versions returned the module-level
      // EXPORT_PRESET_CONFIGS[id] by reference, so a downstream mutation (e.g.
      // setting cropRatio on the returned config) would silently corrupt the
      // shared definition for every subsequent caller.
      const first = getExportPresetConfig('landscape-1080p')
      expect(first?.bitrate).toBe(12)
      first!.bitrate = 999

      const second = getExportPresetConfig('landscape-1080p')
      expect(second?.bitrate).toBe(12)
    })

    it('returns undefined for unknown ids', () => {
      expect(getExportPresetConfig('not-a-preset')).toBeUndefined()
    })
  })

  describe('preset list config copies', () => {
    it('exposes independent config objects for each preset entry', () => {
      // Same regression contract as `getExportPresetConfig` but for the
      // pre-computed DESKTOP/MOBILE preset lists.
      const desktop = DESKTOP_EXPORT_PRESETS.find((p) => p.id === 'landscape-1080p')
      expect(desktop?.config.bitrate).toBe(12)
      desktop!.config.bitrate = 999

      const refetched = DESKTOP_EXPORT_PRESETS.find((p) => p.id === 'landscape-1080p')
      expect(refetched?.config.bitrate).toBe(999) // same array entry, same object — by design

      const mobile = MOBILE_EXPORT_PRESETS.find((p) => p.id === 'landscape-1080p')
      // ...but the mobile preset must NOT share its config with desktop —
      // each `definePreset` call returns its own copy. Original is 12.
      expect(mobile?.config.bitrate).toBe(12)
    })
  })
})
