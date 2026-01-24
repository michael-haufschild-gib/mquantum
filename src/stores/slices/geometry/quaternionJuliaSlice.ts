/**
 * Quaternion Julia Store Slice
 *
 * State management for Quaternion Julia fractal parameters.
 * Follows the pattern established by mandelbulbSlice.
 *
 * Mathematical basis: z = z^n + c where z and c are quaternions
 * The Julia constant c is fixed (unlike Mandelbulb where c = initial position)
 *
 * @see docs/prd/quaternion-julia-fractal.md
 */

import {
  DEFAULT_QUATERNION_JULIA_CONFIG,
  QUATERNION_JULIA_QUALITY_PRESETS,
} from '@/lib/geometry/extended/types'
import type { StateCreator } from 'zustand'
import type { ExtendedObjectSlice, QuaternionJuliaSlice } from './types'

// ============================================================================
// Slice Implementation
// ============================================================================

export const createQuaternionJuliaSlice: StateCreator<
  ExtendedObjectSlice,
  [],
  [],
  QuaternionJuliaSlice
> = (set, get) => {
  /**
   * Wrapped setter that auto-increments quaternionJuliaVersion on any quaternionJulia change.
   * This avoids manually adding version increment to 40+ individual setters.
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      if ('quaternionJulia' in update) {
        return { ...update, quaternionJuliaVersion: state.quaternionJuliaVersion + 1 }
      }
      return update
    })
  }

  return {
    quaternionJulia: { ...DEFAULT_QUATERNION_JULIA_CONFIG },

    // === Core Parameters ===

    setQuaternionJuliaConstant: (value) => {
      // Clamp each component to [-2, 2]
      const clamped: [number, number, number, number] = [
        Math.max(-2, Math.min(2, value[0])),
        Math.max(-2, Math.min(2, value[1])),
        Math.max(-2, Math.min(2, value[2])),
        Math.max(-2, Math.min(2, value[3])),
      ]
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, juliaConstant: clamped },
      }))
    },

    setQuaternionJuliaPower: (value) => {
      const clamped = Math.max(2, Math.min(8, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, power: clamped },
      }))
    },

    setQuaternionJuliaMaxIterations: (value) => {
      const clamped = Math.max(8, Math.min(512, Math.round(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, maxIterations: clamped },
      }))
    },

    setQuaternionJuliaBailoutRadius: (value) => {
      const clamped = Math.max(2.0, Math.min(16.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, bailoutRadius: clamped },
      }))
    },

    setQuaternionJuliaScale: (value) => {
      const clamped = Math.max(0.5, Math.min(5.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, scale: clamped },
      }))
    },

    // === Quality Parameters ===

    setQuaternionJuliaSurfaceThreshold: (value) => {
      const clamped = Math.max(0.0001, Math.min(0.01, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, surfaceThreshold: clamped },
      }))
    },

    setQuaternionJuliaMaxRaymarchSteps: (value) => {
      const clamped = Math.max(32, Math.min(1024, Math.round(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, maxRaymarchSteps: clamped },
      }))
    },

    setQuaternionJuliaQualityMultiplier: (value) => {
      const clamped = Math.max(0.25, Math.min(1.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, qualityMultiplier: clamped },
      }))
    },

    setQuaternionJuliaQualityPreset: (preset) => {
      const settings = QUATERNION_JULIA_QUALITY_PRESETS[preset]
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, ...settings },
      }))
    },

    // === D-dimensional Parameters ===

    setQuaternionJuliaParameterValue: (index, value) => {
      setWithVersion((state) => {
        const newValues = [...state.quaternionJulia.parameterValues]
        if (index >= 0 && index < newValues.length) {
          newValues[index] = Math.max(-Math.PI, Math.min(Math.PI, value))
        }
        return {
          quaternionJulia: { ...state.quaternionJulia, parameterValues: newValues },
        }
      })
    },

    setQuaternionJuliaParameterValues: (values) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, parameterValues: values },
      }))
    },

    resetQuaternionJuliaParameters: () => {
      setWithVersion((state) => ({
        quaternionJulia: {
          ...state.quaternionJulia,
          parameterValues: state.quaternionJulia.parameterValues.map(() => 0),
        },
      }))
    },

    initializeQuaternionJuliaForDimension: (dimension) => {
      const paramCount = Math.max(0, dimension - 3)
      setWithVersion((state) => ({
        quaternionJulia: {
          ...state.quaternionJulia,
          parameterValues: new Array(paramCount).fill(0),
          // Scale 1.0 maps raymarching BOUND_R directly to fractal space
          // Slightly larger for higher dimensions to capture more structure
          scale: dimension <= 4 ? 1.0 : 1.25,
        },
      }))
    },

    // === Color Parameters ===

    setQuaternionJuliaColorMode: (value) => {
      const clamped = Math.max(0, Math.min(7, Math.round(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, colorMode: clamped },
      }))
    },

    setQuaternionJuliaBaseColor: (value) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, baseColor: value },
      }))
    },

    setQuaternionJuliaCosineCoefficients: (coefficients) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, cosineCoefficients: coefficients },
      }))
    },

    setQuaternionJuliaColorPower: (value) => {
      const clamped = Math.max(0.25, Math.min(4.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, colorPower: clamped },
      }))
    },

    setQuaternionJuliaColorCycles: (value) => {
      const clamped = Math.max(0.5, Math.min(5.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, colorCycles: clamped },
      }))
    },

    setQuaternionJuliaColorOffset: (value) => {
      const clamped = Math.max(0.0, Math.min(1.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, colorOffset: clamped },
      }))
    },

    setQuaternionJuliaLchLightness: (value) => {
      const clamped = Math.max(0.1, Math.min(1.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, lchLightness: clamped },
      }))
    },

    setQuaternionJuliaLchChroma: (value) => {
      const clamped = Math.max(0.0, Math.min(0.4, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, lchChroma: clamped },
      }))
    },

    // === Shadow Parameters ===

    setQuaternionJuliaShadowEnabled: (value) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, shadowEnabled: value },
      }))
    },

    setQuaternionJuliaShadowQuality: (value) => {
      const clamped = Math.max(0, Math.min(3, Math.round(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, shadowQuality: clamped },
      }))
    },

    setQuaternionJuliaShadowSoftness: (value) => {
      const clamped = Math.max(0.0, Math.min(2.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, shadowSoftness: clamped },
      }))
    },

    setQuaternionJuliaShadowAnimationMode: (value) => {
      const clamped = Math.max(0, Math.min(2, Math.round(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, shadowAnimationMode: clamped },
      }))
    },

    // === Utility ===

    getQuaternionJuliaConfig: () => get().quaternionJulia,

    randomizeJuliaConstant: () => {
      const randomComponent = () => (Math.random() * 2 - 1) * 0.8 // Range: -0.8 to 0.8
      const newConstant: [number, number, number, number] = [
        randomComponent(),
        randomComponent(),
        randomComponent(),
        randomComponent(),
      ]
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, juliaConstant: newConstant },
      }))
    },

    // --- Advanced Rendering Actions ---
    setQuaternionJuliaRoughness: (value: number) => {
      const clamped = Math.max(0.0, Math.min(1.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, roughness: clamped },
      }))
    },

    setQuaternionJuliaSssEnabled: (value: boolean) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sssEnabled: value },
      }))
    },

    setQuaternionJuliaSssIntensity: (value: number) => {
      const clamped = Math.max(0.0, Math.min(2.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sssIntensity: clamped },
      }))
    },

    setQuaternionJuliaSssColor: (value: string) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sssColor: value },
      }))
    },

    setQuaternionJuliaSssThickness: (value: number) => {
      const clamped = Math.max(0.1, Math.min(5.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sssThickness: clamped },
      }))
    },

    // --- Atmosphere Actions ---
    setQuaternionJuliaFogEnabled: (value: boolean) => {
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, fogEnabled: value },
      }))
    },

    setQuaternionJuliaFogContribution: (value: number) => {
      const clamped = Math.max(0.0, Math.min(2.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, fogContribution: clamped },
      }))
    },

    setQuaternionJuliaInternalFogDensity: (value: number) => {
      const clamped = Math.max(0.0, Math.min(1.0, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, internalFogDensity: clamped },
      }))
    },

    // --- SDF Render Quality Actions ---
    setQuaternionJuliaSdfMaxIterations: (value: number) => {
      // Range 5-100, clamped to integer
      const clamped = Math.max(5, Math.min(100, Math.floor(value)))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sdfMaxIterations: clamped },
      }))
    },

    setQuaternionJuliaSdfSurfaceDistance: (value: number) => {
      // Range 0.00005-0.01
      const clamped = Math.max(0.00005, Math.min(0.01, value))
      setWithVersion((state) => ({
        quaternionJulia: { ...state.quaternionJulia, sdfSurfaceDistance: clamped },
      }))
    },
    // NOTE: Julia fractals have no animation actions.
    // Smooth shape morphing is achieved via 4D+ rotation (handled by the rotation system).
  }
}
