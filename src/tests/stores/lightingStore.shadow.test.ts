/**
 * Tests for Visual Store Shadow Actions
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useLightingStore } from '@/stores/lightingStore'
import {
  DEFAULT_SHADOW_ANIMATION_MODE,
  DEFAULT_SHADOW_ENABLED,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SOFTNESS,
  SHADOW_SOFTNESS_RANGE,
} from '@/stores/defaults/visualDefaults'
import { LIGHTING_INITIAL_STATE } from '@/stores/slices/lightingSlice'

describe('Visual Store - Shadow Actions', () => {
  beforeEach(() => {
    useLightingStore.setState(LIGHTING_INITIAL_STATE)
  })

  afterEach(() => {
    useLightingStore.setState(LIGHTING_INITIAL_STATE)
  })

  describe('setShadowEnabled', () => {
    it('should enable shadows', () => {
      useLightingStore.getState().setShadowEnabled(true)
      expect(useLightingStore.getState().shadowEnabled).toBe(true)
    })

    it('should disable shadows', () => {
      useLightingStore.getState().setShadowEnabled(true)
      useLightingStore.getState().setShadowEnabled(false)
      expect(useLightingStore.getState().shadowEnabled).toBe(false)
    })
  })

  describe('setShadowQuality', () => {
    it('should set shadow quality to low', () => {
      useLightingStore.getState().setShadowQuality('low')
      expect(useLightingStore.getState().shadowQuality).toBe('low')
    })

    it('should set shadow quality to medium', () => {
      useLightingStore.getState().setShadowQuality('medium')
      expect(useLightingStore.getState().shadowQuality).toBe('medium')
    })

    it('should set shadow quality to high', () => {
      useLightingStore.getState().setShadowQuality('high')
      expect(useLightingStore.getState().shadowQuality).toBe('high')
    })

    it('should set shadow quality to ultra', () => {
      useLightingStore.getState().setShadowQuality('ultra')
      expect(useLightingStore.getState().shadowQuality).toBe('ultra')
    })
  })

  describe('setShadowSoftness', () => {
    it('should set shadow softness value', () => {
      useLightingStore.getState().setShadowSoftness(1.5)
      expect(useLightingStore.getState().shadowSoftness).toBe(1.5)
    })

    it('should clamp value to minimum', () => {
      useLightingStore.getState().setShadowSoftness(-0.5)
      expect(useLightingStore.getState().shadowSoftness).toBe(SHADOW_SOFTNESS_RANGE.min)
    })

    it('should clamp value to maximum', () => {
      useLightingStore.getState().setShadowSoftness(3.0)
      expect(useLightingStore.getState().shadowSoftness).toBe(SHADOW_SOFTNESS_RANGE.max)
    })

    it('should accept edge values', () => {
      useLightingStore.getState().setShadowSoftness(SHADOW_SOFTNESS_RANGE.min)
      expect(useLightingStore.getState().shadowSoftness).toBe(SHADOW_SOFTNESS_RANGE.min)

      useLightingStore.getState().setShadowSoftness(SHADOW_SOFTNESS_RANGE.max)
      expect(useLightingStore.getState().shadowSoftness).toBe(SHADOW_SOFTNESS_RANGE.max)
    })
  })

  describe('setShadowAnimationMode', () => {
    it('should set animation mode to pause', () => {
      useLightingStore.getState().setShadowAnimationMode('pause')
      expect(useLightingStore.getState().shadowAnimationMode).toBe('pause')
    })

    it('should set animation mode to low', () => {
      useLightingStore.getState().setShadowAnimationMode('low')
      expect(useLightingStore.getState().shadowAnimationMode).toBe('low')
    })

    it('should set animation mode to full', () => {
      useLightingStore.getState().setShadowAnimationMode('full')
      expect(useLightingStore.getState().shadowAnimationMode).toBe('full')
    })
  })

  describe('reset', () => {
    it('should reset shadow settings to defaults', () => {
      // Set custom values
      useLightingStore.getState().setShadowEnabled(true)
      useLightingStore.getState().setShadowQuality('ultra')
      useLightingStore.getState().setShadowSoftness(1.8)
      useLightingStore.getState().setShadowAnimationMode('full')

      // Reset
      useLightingStore.setState(LIGHTING_INITIAL_STATE)

      // Verify defaults
      const state = useLightingStore.getState()
      expect(state.shadowEnabled).toBe(DEFAULT_SHADOW_ENABLED)
      expect(state.shadowQuality).toBe(DEFAULT_SHADOW_QUALITY)
      expect(state.shadowSoftness).toBe(DEFAULT_SHADOW_SOFTNESS)
      expect(state.shadowAnimationMode).toBe(DEFAULT_SHADOW_ANIMATION_MODE)
    })
  })
})
