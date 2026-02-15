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

    it('clamps domain-coloring contour settings to safe ranges', () => {
      useAppearanceStore.getState().setDomainColoringSettings({
        contourDensity: 999,
        contourWidth: 0,
        contourStrength: 2,
      })

      expect(useAppearanceStore.getState().domainColoring.contourDensity).toBe(32)
      expect(useAppearanceStore.getState().domainColoring.contourWidth).toBe(0.005)
      expect(useAppearanceStore.getState().domainColoring.contourStrength).toBe(1)

      useAppearanceStore.getState().setDomainColoringSettings({
        contourDensity: 0,
        contourWidth: 1,
        contourStrength: -1,
      })

      expect(useAppearanceStore.getState().domainColoring.contourDensity).toBe(1)
      expect(useAppearanceStore.getState().domainColoring.contourWidth).toBe(0.25)
      expect(useAppearanceStore.getState().domainColoring.contourStrength).toBe(0)
    })

    it('updates diverging real/imag midpoint settings and clamps intensity floor', () => {
      const appearance = useAppearanceStore.getState() as unknown as {
        divergingPsi: {
          neutralColor: string
          positiveColor: string
          negativeColor: string
          intensityFloor: number
        }
        setDivergingPsiSettings: (settings: {
          neutralColor?: string
          positiveColor?: string
          negativeColor?: string
          intensityFloor?: number
        }) => void
      }

      appearance.setDivergingPsiSettings({
        neutralColor: '#d9d9d9',
        positiveColor: '#e83b3b',
        negativeColor: '#3166f5',
        intensityFloor: -1,
      })

      const next = useAppearanceStore.getState() as unknown as typeof appearance
      expect(next.divergingPsi.neutralColor).toBe('#d9d9d9')
      expect(next.divergingPsi.positiveColor).toBe('#e83b3b')
      expect(next.divergingPsi.negativeColor).toBe('#3166f5')
      expect(next.divergingPsi.intensityFloor).toBe(0)

      next.setDivergingPsiSettings({ intensityFloor: 2 })
      expect((useAppearanceStore.getState() as unknown as typeof appearance).divergingPsi.intensityFloor).toBe(1)
    })

    it('keeps signed phase diverging palette independent from Re/Im diverging settings', () => {
      useAppearanceStore.getState().setDivergingPsiSettings({
        neutralColor: '#d9d9d9',
        positiveColor: '#e83b3b',
        negativeColor: '#3166f5',
        intensityFloor: 0.42,
        component: 'imag',
      })

      useAppearanceStore.getState().setPhaseDivergingSettings({
        neutralColor: '#fafafa',
        positiveColor: '#ff5500',
        negativeColor: '#0033ff',
      })

      const next = useAppearanceStore.getState()
      expect(next.phaseDiverging.neutralColor).toBe('#fafafa')
      expect(next.phaseDiverging.positiveColor).toBe('#ff5500')
      expect(next.phaseDiverging.negativeColor).toBe('#0033ff')

      expect(next.divergingPsi.neutralColor).toBe('#d9d9d9')
      expect(next.divergingPsi.positiveColor).toBe('#e83b3b')
      expect(next.divergingPsi.negativeColor).toBe('#3166f5')
      expect(next.divergingPsi.intensityFloor).toBe(0.42)
      expect(next.divergingPsi.component).toBe('imag')
    })

    it('preserves all color-algorithm settings when switching algorithms', () => {
      const store = useAppearanceStore.getState()

      store.setCosineCoefficients({
        a: [0.9, 0.1, 0.4],
        b: [0.2, 0.8, 0.6],
        c: [1.2, 0.7, 0.5],
        d: [0.33, 0.2, 0.1],
      })
      store.setDistribution({ power: 2.2, cycles: 3.3, offset: 0.44 })
      store.setLchLightness(0.41)
      store.setLchChroma(0.29)
      store.setMultiSourceWeights({ depth: 0.2, orbitTrap: 0.5, normal: 0.3 })
      store.setDomainColoringSettings({
        modulusMode: 'logPsiAbs',
        contoursEnabled: false,
        contourDensity: 7.5,
        contourWidth: 0.11,
        contourStrength: 0.66,
      })
      store.setPhaseDivergingSettings({
        neutralColor: '#121212',
        positiveColor: '#ef5400',
        negativeColor: '#0f3fff',
      })
      store.setDivergingPsiSettings({
        neutralColor: '#cccccc',
        positiveColor: '#ff4400',
        negativeColor: '#003cff',
        intensityFloor: 0.37,
        component: 'imag',
      })

      store.setColorAlgorithm('phaseDiverging')
      store.setColorAlgorithm('domainColoringPsi')
      store.setColorAlgorithm('diverging')
      store.setColorAlgorithm('lch')
      store.setColorAlgorithm('mixed')

      const next = useAppearanceStore.getState()
      expect(next.cosineCoefficients).toEqual({
        a: [0.9, 0.1, 0.4],
        b: [0.2, 0.8, 0.6],
        c: [1.2, 0.7, 0.5],
        d: [0.33, 0.2, 0.1],
      })
      expect(next.distribution).toEqual({ power: 2.2, cycles: 3.3, offset: 0.44 })
      expect(next.lchLightness).toBe(0.41)
      expect(next.lchChroma).toBe(0.29)
      expect(next.multiSourceWeights).toEqual({ depth: 0.2, orbitTrap: 0.5, normal: 0.3 })
      expect(next.domainColoring).toEqual({
        modulusMode: 'logPsiAbs',
        contoursEnabled: false,
        contourDensity: 7.5,
        contourWidth: 0.11,
        contourStrength: 0.66,
      })
      expect(next.phaseDiverging).toEqual({
        neutralColor: '#121212',
        positiveColor: '#ef5400',
        negativeColor: '#0f3fff',
      })
      expect(next.divergingPsi).toEqual({
        neutralColor: '#cccccc',
        positiveColor: '#ff4400',
        negativeColor: '#003cff',
        intensityFloor: 0.37,
        component: 'imag',
      })
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

    it('clamps surface specularIntensity to [0, 2]', () => {
      useAppearanceStore.getState().setSurfaceSettings({
        specularIntensity: 10,
      })
      expect(useAppearanceStore.getState().shaderSettings.surface.specularIntensity).toBe(2)

      useAppearanceStore.getState().setSurfaceSettings({
        specularIntensity: -5,
      })
      expect(useAppearanceStore.getState().shaderSettings.surface.specularIntensity).toBe(0)
    })

    it('clamps bloom v2 controls to safe ranges', () => {
      usePostProcessingStore.getState().setBloomGain(999)
      expect(usePostProcessingStore.getState().bloomGain).toBe(3)
      usePostProcessingStore.getState().setBloomGain(-1)
      expect(usePostProcessingStore.getState().bloomGain).toBe(0)

      usePostProcessingStore.getState().setBloomThreshold(999)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(5)
      usePostProcessingStore.getState().setBloomThreshold(-999)
      expect(usePostProcessingStore.getState().bloomThreshold).toBe(0)

      usePostProcessingStore.getState().setBloomKnee(999)
      expect(usePostProcessingStore.getState().bloomKnee).toBe(5)
      usePostProcessingStore.getState().setBloomKnee(-999)
      expect(usePostProcessingStore.getState().bloomKnee).toBe(0)

      usePostProcessingStore.getState().setBloomBandSize(0, 999)
      expect(usePostProcessingStore.getState().bloomBands[0]!.size).toBe(4)
      usePostProcessingStore.getState().setBloomBandSize(0, -999)
      expect(usePostProcessingStore.getState().bloomBands[0]!.size).toBe(0.25)
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
