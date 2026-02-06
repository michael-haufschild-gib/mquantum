/**
 * Consolidated “high-signal” tests for visual/appearance-related stores.
 *
 * We focus on invariants and coupling logic that can break rendering badly,
 * not superficial “setter sets value” checks.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { APPEARANCE_INITIAL_STATE } from '@/stores/slices/appearanceSlice'
import { LIGHTING_INITIAL_STATE } from '@/stores/slices/lightingSlice'
import { POST_PROCESSING_INITIAL_STATE } from '@/stores/slices/postProcessingSlice'

describe('Enhanced Features Stores (invariants)', () => {
  beforeEach(() => {
    useAppearanceStore.setState(APPEARANCE_INITIAL_STATE)
    useLightingStore.setState(LIGHTING_INITIAL_STATE)
    usePostProcessingStore.setState(POST_PROCESSING_INITIAL_STATE)
  })

  describe('Appearance coupling invariants', () => {
    it('setShaderType switches between wireframe and surface modes', () => {
      useAppearanceStore.getState().setShaderType('surface')
      expect(useAppearanceStore.getState().shaderType).toBe('surface')
      useAppearanceStore.getState().setShaderType('wireframe')
      expect(useAppearanceStore.getState().shaderType).toBe('wireframe')
    })

  })

  describe('Clamping behavior (prevents invalid uniforms)', () => {
    it('clamps wireframe lineThickness to [1, 5]', () => {
      const cases: Array<{ input: number; expected: number }> = [
        { input: -100, expected: 1 },
        { input: 0, expected: 1 },
        { input: 1, expected: 1 },
        { input: 4, expected: 4 },
        { input: 5, expected: 5 },
        { input: 6, expected: 5 },
        { input: 999, expected: 5 },
      ]

      for (const { input, expected } of cases) {
        useAppearanceStore.setState(APPEARANCE_INITIAL_STATE)
        useAppearanceStore.getState().setWireframeSettings({ lineThickness: input })
        expect(useAppearanceStore.getState().shaderSettings.wireframe.lineThickness).toBe(expected)
      }
    })

    it('clamps surface faceOpacity to [0, 1] and specularIntensity to [0, 2]', () => {
      useAppearanceStore.getState().setSurfaceSettings({
        faceOpacity: 2,
        specularIntensity: 10,
      })
      expect(useAppearanceStore.getState().shaderSettings.surface.faceOpacity).toBe(1)
      expect(useAppearanceStore.getState().shaderSettings.surface.specularIntensity).toBe(2)

      useAppearanceStore.getState().setSurfaceSettings({
        faceOpacity: -1,
        specularIntensity: -5,
      })
      expect(useAppearanceStore.getState().shaderSettings.surface.faceOpacity).toBe(0)
      expect(useAppearanceStore.getState().shaderSettings.surface.specularIntensity).toBe(0)
    })

    it('clamps bloom intensity/threshold/radius to safe ranges', () => {
      usePostProcessingStore.getState().setBloomIntensity(999)
      expect(usePostProcessingStore.getState().bloomIntensity).toBe(2)
      usePostProcessingStore.getState().setBloomIntensity(-1)
      expect(usePostProcessingStore.getState().bloomIntensity).toBe(0)

      usePostProcessingStore.getState().setBloomThreshold(999)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(1)
      usePostProcessingStore.getState().setBloomThreshold(-1)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(0)

      usePostProcessingStore.getState().setBloomRadius(999)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(1)
      usePostProcessingStore.getState().setBloomRadius(-1)
      expect(usePostProcessingStore.getState().bloomRadius).toBe(0)
    })

    it('normalizes/clamps lighting angles to prevent invalid light vectors', () => {
      useLightingStore.getState().setLightHorizontalAngle(400)
      expect(useLightingStore.getState().lightHorizontalAngle).toBe(40)
      useLightingStore.getState().setLightHorizontalAngle(-90)
      expect(useLightingStore.getState().lightHorizontalAngle).toBe(270)

      useLightingStore.getState().setLightVerticalAngle(120)
      expect(useLightingStore.getState().lightVerticalAngle).toBe(90)
      useLightingStore.getState().setLightVerticalAngle(-120)
      expect(useLightingStore.getState().lightVerticalAngle).toBe(-90)
    })
  })
})
