/**
 * Black Hole Store Slice
 *
 * State management for n-dimensional black hole visualization.
 */

import type { SkyCubemapResolution } from '@/lib/geometry/extended/types'

/** Valid sky cubemap resolutions */
const VALID_SKY_RESOLUTIONS: SkyCubemapResolution[] = [256, 512, 1024]

/**\n * Snap a resolution value to the nearest valid SkyCubemapResolution.\n *\n * @param value - Input resolution value\n * @returns Nearest valid SkyCubemapResolution (256, 512, or 1024)\n */
function snapToValidResolution(value: number): SkyCubemapResolution {
  const floored = Math.floor(value)
  // Find nearest valid resolution
  let nearest: SkyCubemapResolution = 512 // Default to middle value
  let minDiff = Math.abs(floored - nearest)
  for (const res of VALID_SKY_RESOLUTIONS) {
    const diff = Math.abs(floored - res)
    if (diff < minDiff) {
      minDiff = diff
      nearest = res
    }
  }
  return nearest
}

/**
 * Clamp a value to min/max range with optional dev warning.
 * Warns in development mode when value is clamped.
 *
 * @param value - Input value
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param paramName - Parameter name for warning message
 * @returns Clamped value
 */
function clampWithWarning(value: number, min: number, max: number, paramName: string): number {
  const clamped = Math.max(min, Math.min(max, value))
  if (import.meta.env.DEV && clamped !== value) {
    console.warn(
      `BlackHole: ${paramName} clamped from ${value} to ${clamped} (range: ${min}-${max})`
    )
  }
  return clamped
}

import { computeKerrRadii, diskTemperatureToColor } from '@/lib/geometry/extended/kerr-physics'
import {
  BLACK_HOLE_QUALITY_PRESETS,
  BlackHoleConfig,
  BlackHoleRayBendingMode,
  DEFAULT_BLACK_HOLE_CONFIG,
} from '@/lib/geometry/extended/types'
import { StateCreator } from 'zustand'
import { BlackHoleSlice, ExtendedObjectSlice } from './types'

export const createBlackHoleSlice: StateCreator<ExtendedObjectSlice, [], [], BlackHoleSlice> = (
  set,
  get
) => {
  /**
   * Wrapped setter that auto-increments blackholeVersion when blackhole state changes.
   * This avoids manually adding version increment to 80+ individual setters.
   */
  const setWithVersion: typeof set = (updater) => {
    set((state) => {
      const update = typeof updater === 'function' ? updater(state) : updater
      // If updating blackhole, also bump version
      if ('blackhole' in update) {
        return { ...update, blackholeVersion: state.blackholeVersion + 1 }
      }
      return update
    })
  }

  return {
    blackhole: { ...DEFAULT_BLACK_HOLE_CONFIG },

    // === Basic Parameters ===
    /**
     * Set Schwarzschild radius (rs = 2M).
     * Automatically recomputes all derived values based on current spin.
     *
     * @param radius - Schwarzschild radius (0.05-20)
     */
    setBlackHoleHorizonRadius: (radius) => {
      const clamped = clampWithWarning(radius, 0.05, 20, 'horizonRadius')
      const state = get()
      const spin = state.blackhole.spin

      // Recompute derived values with new horizon radius
      // Note: _visualEventHorizon is computed on-demand in useBlackHoleUniformUpdates
      const M = clamped / 2
      const kerr = computeKerrRadii(M, spin)

      const diskInnerRadiusMul = kerr.iscoPrograde / clamped
      const photonShellRadiusMul = kerr.photonSpherePrograde / clamped

      setWithVersion((s) => ({
        blackhole: {
          ...s.blackhole,
          horizonRadius: clamped,
          diskInnerRadiusMul,
          photonShellRadiusMul: Math.max(1.0, Math.min(2.0, photonShellRadiusMul)),
        },
      }))
    },

    /**
     * Set black hole spin parameter (Kerr metric).
     * Automatically updates derived values:
     * - diskInnerRadiusMul: ISCO radius
     * - photonShellRadiusMul: photon sphere radius
     *
     * Note: _visualEventHorizon is computed on-demand in useBlackHoleUniformUpdates
     *
     * @param spin - Dimensionless spin chi = a/M (0-0.998)
     */
    setBlackHoleSpin: (spin) => {
      const clamped = clampWithWarning(spin, 0, 0.998, 'spin')
      const state = get()
      const horizonRadius = state.blackhole.horizonRadius

      // Compute Kerr radii from spin (M = rs/2 in geometric units)
      const M = horizonRadius / 2
      const kerr = computeKerrRadii(M, clamped)

      // Convert ISCO to multiplier of horizon radius (rs = 2M)
      // For prograde accretion disk (most common astrophysically)
      const diskInnerRadiusMul = kerr.iscoPrograde / horizonRadius

      // Convert photon sphere to multiplier
      // Use prograde photon sphere (inner photon ring)
      const photonShellRadiusMul = kerr.photonSpherePrograde / horizonRadius

      setWithVersion((s) => ({
        blackhole: {
          ...s.blackhole,
          spin: clamped,
          diskInnerRadiusMul,
          photonShellRadiusMul: Math.max(1.0, Math.min(2.0, photonShellRadiusMul)),
        },
      }))
    },

    /**
     * Set disk temperature in Kelvin.
     * Automatically updates baseColor using blackbody approximation.
     *
     * @param temperature - Temperature in Kelvin (1000-40000)
     */
    setBlackHoleDiskTemperature: (temperature) => {
      const clamped = clampWithWarning(temperature, 1000, 40000, 'diskTemperature')
      const baseColor = diskTemperatureToColor(clamped)
      setWithVersion((state) => ({
        blackhole: {
          ...state.blackhole,
          diskTemperature: clamped,
          baseColor,
        },
      }))
    },

    setBlackHoleGravityStrength: (strength) => {
      const clamped = clampWithWarning(strength, 0, 10, 'gravityStrength')
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, gravityStrength: clamped },
      }))
    },

    setBlackHoleManifoldIntensity: (intensity) => {
      const clamped = clampWithWarning(intensity, 0, 20, 'manifoldIntensity')
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, manifoldIntensity: clamped },
      }))
    },

    setBlackHoleManifoldThickness: (thickness) => {
      const clamped = Math.max(0, Math.min(2, thickness))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, manifoldThickness: clamped },
      }))
    },

    setBlackHolePhotonShellWidth: (width) => {
      const clamped = Math.max(0, Math.min(0.3, width))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, photonShellWidth: clamped },
      }))
    },

    setBlackHoleTimeScale: (scale) => {
      const clamped = Math.max(0, Math.min(5, scale))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, timeScale: clamped },
      }))
    },

    setBlackHoleBaseColor: (color) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, baseColor: color },
      }))
    },

    setBlackHolePaletteMode: (mode) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, paletteMode: mode },
      }))
    },

    setBlackHoleBloomBoost: (boost) => {
      const clamped = Math.max(0, Math.min(5, boost))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, bloomBoost: clamped },
      }))
    },

    // === Lensing ===
    setBlackHoleDimensionEmphasis: (emphasis) => {
      const clamped = Math.max(0, Math.min(2, emphasis))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, dimensionEmphasis: clamped },
      }))
    },

    setBlackHoleDistanceFalloff: (falloff) => {
      const clamped = Math.max(0.5, Math.min(4, falloff))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, distanceFalloff: clamped },
      }))
    },

    setBlackHoleEpsilonMul: (epsilon) => {
      const clamped = Math.max(1e-5, Math.min(0.5, epsilon))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, epsilonMul: clamped },
      }))
    },

    setBlackHoleBendScale: (scale) => {
      const clamped = Math.max(0, Math.min(5, scale))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, bendScale: clamped },
      }))
    },

    setBlackHoleBendMaxPerStep: (max) => {
      const clamped = Math.max(0, Math.min(0.8, max))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, bendMaxPerStep: clamped },
      }))
    },

    setBlackHoleLensingClamp: (clamp) => {
      const clamped = Math.max(0, Math.min(100, clamp))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, lensingClamp: clamped },
      }))
    },

    setBlackHoleRayBendingMode: (mode: BlackHoleRayBendingMode) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, rayBendingMode: mode },
      }))
    },

    // === Photon Shell ===
    setBlackHolePhotonShellRadiusMul: (mul) => {
      const clamped = Math.max(1.0, Math.min(2.0, mul))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, photonShellRadiusMul: clamped },
      }))
    },

    setBlackHolePhotonShellRadiusDimBias: (bias) => {
      const clamped = Math.max(0, Math.min(0.5, bias))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, photonShellRadiusDimBias: clamped },
      }))
    },

    setBlackHoleShellGlowStrength: (strength) => {
      const clamped = Math.max(0, Math.min(20, strength))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shellGlowStrength: clamped },
      }))
    },

    setBlackHoleShellGlowColor: (color) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shellGlowColor: color },
      }))
    },

    setBlackHoleShellStepMul: (mul) => {
      const clamped = Math.max(0.05, Math.min(1, mul))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shellStepMul: clamped },
      }))
    },

    setBlackHoleShellContrastBoost: (boost) => {
      const clamped = Math.max(0, Math.min(3, boost))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shellContrastBoost: clamped },
      }))
    },

    // === Manifold ===
    setBlackHoleManifoldType: (type) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, manifoldType: type },
      }))
    },

    setBlackHoleDiskInnerRadiusMul: (mul) => {
      const state = get()
      // Ensure inner < outer with a minimum gap of 0.1
      const maxInner = Math.max(0, state.blackhole.diskOuterRadiusMul - 0.1)
      const clamped = Math.max(0, Math.min(Math.min(10, maxInner), mul))
      setWithVersion((s) => ({
        blackhole: { ...s.blackhole, diskInnerRadiusMul: clamped },
      }))
    },

    setBlackHoleDiskOuterRadiusMul: (mul) => {
      const state = get()
      // Ensure outer > inner with a minimum gap of 0.1
      const minOuter = state.blackhole.diskInnerRadiusMul + 0.1
      const clamped = Math.max(Math.max(0.1, minOuter), Math.min(200, mul))
      setWithVersion((s) => ({
        blackhole: { ...s.blackhole, diskOuterRadiusMul: clamped },
      }))
    },

    setBlackHoleRadialSoftnessMul: (mul) => {
      const clamped = Math.max(0, Math.min(2, mul))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, radialSoftnessMul: clamped },
      }))
    },

    setBlackHoleThicknessPerDimMax: (max) => {
      const clamped = Math.max(1, Math.min(10, max))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, thicknessPerDimMax: clamped },
      }))
    },

    setBlackHoleHighDimWScale: (scale) => {
      const clamped = Math.max(1, Math.min(10, scale))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, highDimWScale: clamped },
      }))
    },

    setBlackHoleSwirlAmount: (amount) => {
      const clamped = Math.max(0, Math.min(2, amount))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, swirlAmount: clamped },
      }))
    },

    setBlackHoleNoiseScale: (scale) => {
      const clamped = Math.max(0.1, Math.min(10, scale))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, noiseScale: clamped },
      }))
    },

    setBlackHoleNoiseAmount: (amount) => {
      const clamped = Math.max(0, Math.min(1, amount))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, noiseAmount: clamped },
      }))
    },

    setBlackHoleMultiIntersectionGain: (gain) => {
      const clamped = Math.max(0, Math.min(3, gain))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, multiIntersectionGain: clamped },
      }))
    },

    // === Rendering Quality ===
    setBlackHoleRaymarchQuality: (quality) => {
      const preset = BLACK_HOLE_QUALITY_PRESETS[quality]
      setWithVersion((state) => ({
        blackhole: {
          ...state.blackhole,
          raymarchQuality: quality,
          ...preset,
        },
      }))
    },

    setBlackHoleMaxSteps: (steps) => {
      const clamped = Math.max(16, Math.min(512, Math.floor(steps)))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, maxSteps: clamped },
      }))
    },

    setBlackHoleStepBase: (step) => {
      const clamped = Math.max(0.001, Math.min(1, step))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, stepBase: clamped },
      }))
    },

    setBlackHoleStepMin: (step) => {
      const clamped = Math.max(0.0001, Math.min(0.5, step))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, stepMin: clamped },
      }))
    },

    setBlackHoleStepMax: (step) => {
      const clamped = Math.max(0.001, Math.min(5, step))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, stepMax: clamped },
      }))
    },

    setBlackHoleStepAdaptG: (adapt) => {
      const clamped = Math.max(0, Math.min(5, adapt))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, stepAdaptG: clamped },
      }))
    },

    setBlackHoleStepAdaptR: (adapt) => {
      const clamped = Math.max(0, Math.min(2, adapt))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, stepAdaptR: clamped },
      }))
    },

    setBlackHoleEnableAbsorption: (enable) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, enableAbsorption: enable },
      }))
    },

    setBlackHoleAbsorption: (absorption) => {
      const clamped = Math.max(0, Math.min(10, absorption))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, absorption: clamped },
      }))
    },

    setBlackHoleTransmittanceCutoff: (cutoff) => {
      const clamped = Math.max(0, Math.min(0.2, cutoff))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, transmittanceCutoff: clamped },
      }))
    },

    setBlackHoleFarRadius: (radius) => {
      const clamped = Math.max(1, Math.min(100, radius))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, farRadius: clamped },
      }))
    },

    // === Lighting ===
    setBlackHoleLightingMode: (mode) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, lightingMode: mode },
      }))
    },

    setBlackHoleRoughness: (roughness) => {
      const clamped = Math.max(0, Math.min(1, roughness))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, roughness: clamped },
      }))
    },

    setBlackHoleSpecular: (specular) => {
      const clamped = Math.max(0, Math.min(1, specular))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, specular: clamped },
      }))
    },

    setBlackHoleAmbientTint: (tint) => {
      const clamped = Math.max(0, Math.min(1, tint))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, ambientTint: clamped },
      }))
    },

    setBlackHoleShadowEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shadowEnabled: enabled },
      }))
    },

    setBlackHoleShadowSteps: (steps) => {
      const clamped = Math.max(4, Math.min(64, Math.floor(steps)))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shadowSteps: clamped },
      }))
    },

    setBlackHoleShadowDensity: (density) => {
      const clamped = Math.max(0, Math.min(10, density))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, shadowDensity: clamped },
      }))
    },

    // === Temporal ===
    setBlackHoleTemporalAccumulationEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, temporalAccumulationEnabled: enabled },
      }))
    },

    // === Doppler Effect ===
    setBlackHoleDopplerEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, dopplerEnabled: enabled },
      }))
    },

    setBlackHoleDopplerStrength: (strength) => {
      const clamped = Math.max(0, Math.min(2, strength))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, dopplerStrength: clamped },
      }))
    },

    // === Cross-section (4D+) ===
    setBlackHoleParameterValue: (index, value) => {
      const values = [...get().blackhole.parameterValues]
      if (index < 0 || index >= values.length) return
      const clamped = Math.max(-2, Math.min(2, value))
      values[index] = clamped
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, parameterValues: values },
      }))
    },

    setBlackHoleParameterValues: (values) => {
      const clamped = values.map((v) => Math.max(-2, Math.min(2, v)))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, parameterValues: clamped },
      }))
    },

    resetBlackHoleParameters: () => {
      const len = get().blackhole.parameterValues.length
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, parameterValues: new Array(len).fill(0) },
      }))
    },

    // === Motion Blur ===
    setBlackHoleMotionBlurEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, motionBlurEnabled: enabled },
      }))
    },

    setBlackHoleMotionBlurStrength: (strength) => {
      const clamped = Math.max(0, Math.min(2, strength))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, motionBlurStrength: clamped },
      }))
    },

    setBlackHoleMotionBlurSamples: (samples) => {
      const clamped = Math.max(1, Math.min(8, Math.floor(samples)))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, motionBlurSamples: clamped },
      }))
    },

    setBlackHoleMotionBlurRadialFalloff: (falloff) => {
      const clamped = Math.max(0, Math.min(5, falloff))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, motionBlurRadialFalloff: clamped },
      }))
    },

    // === Deferred Lensing ===
    setBlackHoleDeferredLensingEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, deferredLensingEnabled: enabled },
      }))
    },

    setBlackHoleDeferredLensingStrength: (strength) => {
      const clamped = Math.max(0, Math.min(2, strength))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, deferredLensingStrength: clamped },
      }))
    },

    setBlackHoleDeferredLensingRadius: (radius) => {
      const clamped = Math.max(0, Math.min(10, radius))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, deferredLensingRadius: clamped },
      }))
    },

    setBlackHoleDeferredLensingChromaticAberration: (amount) => {
      const clamped = Math.max(0, Math.min(1, amount))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, deferredLensingChromaticAberration: clamped },
      }))
    },

    setBlackHoleSkyCubemapResolution: (resolution) => {
      const snapped = snapToValidResolution(resolution)
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, skyCubemapResolution: snapped },
      }))
    },

    // === Screen-Space Lensing ===
    // NOTE: setBlackHoleScreenSpaceLensingEnabled removed - gravity lensing is now controlled globally

    setBlackHoleLensingFalloff: (falloff) => {
      const clamped = Math.max(0.5, Math.min(4, falloff))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, lensingFalloff: clamped },
      }))
    },

    // === Scene Object Lensing ===
    setBlackHoleSceneObjectLensingEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, sceneObjectLensingEnabled: enabled },
      }))
    },

    setBlackHoleSceneObjectLensingStrength: (strength) => {
      const clamped = Math.max(0, Math.min(2, strength))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, sceneObjectLensingStrength: clamped },
      }))
    },

    // === Animation ===
    setBlackHolePulseEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, pulseEnabled: enabled },
      }))
    },

    setBlackHolePulseSpeed: (speed) => {
      const clamped = Math.max(0, Math.min(2, speed))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, pulseSpeed: clamped },
      }))
    },

    setBlackHolePulseAmount: (amount) => {
      const clamped = Math.max(0, Math.min(1, amount))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, pulseAmount: clamped },
      }))
    },

    setBlackHoleSliceAnimationEnabled: (enabled) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, sliceAnimationEnabled: enabled },
      }))
    },

    setBlackHoleSliceSpeed: (speed) => {
      const clamped = Math.max(0.01, Math.min(0.1, speed))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, sliceSpeed: clamped },
      }))
    },

    setBlackHoleSliceAmplitude: (amplitude) => {
      const clamped = Math.max(0.1, Math.min(1, amplitude))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, sliceAmplitude: clamped },
      }))
    },

    // === Keplerian Disk Rotation ===
    setBlackHoleKeplerianDifferential: (differential) => {
      const clamped = Math.max(0, Math.min(1, differential))
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, keplerianDifferential: clamped },
      }))
    },

    // === Config Operations ===
    setBlackHoleConfig: (config) => {
      // Validate and clamp numeric fields to prevent invalid values
      const validated: Partial<BlackHoleConfig> = {}

      // Physics-based parameters
      if (config.horizonRadius !== undefined) {
        validated.horizonRadius = Math.max(0.05, Math.min(20, config.horizonRadius))
      }
      if (config.spin !== undefined) {
        validated.spin = Math.max(0, Math.min(0.998, config.spin))
      }
      if (config.diskTemperature !== undefined) {
        validated.diskTemperature = Math.max(1000, Math.min(40000, config.diskTemperature))
      }
      if (config.gravityStrength !== undefined) {
        validated.gravityStrength = Math.max(0, Math.min(10, config.gravityStrength))
      }
      if (config.manifoldIntensity !== undefined) {
        validated.manifoldIntensity = Math.max(0, Math.min(20, config.manifoldIntensity))
      }
      if (config.manifoldThickness !== undefined) {
        validated.manifoldThickness = Math.max(0, Math.min(2, config.manifoldThickness))
      }
      if (config.photonShellWidth !== undefined) {
        validated.photonShellWidth = Math.max(0, Math.min(0.3, config.photonShellWidth))
      }
      if (config.timeScale !== undefined) {
        validated.timeScale = Math.max(0, Math.min(5, config.timeScale))
      }
      if (config.bloomBoost !== undefined) {
        validated.bloomBoost = Math.max(0, Math.min(5, config.bloomBoost))
      }

      // Lensing
      if (config.dimensionEmphasis !== undefined) {
        validated.dimensionEmphasis = Math.max(0, Math.min(2, config.dimensionEmphasis))
      }
      if (config.distanceFalloff !== undefined) {
        validated.distanceFalloff = Math.max(0.5, Math.min(4, config.distanceFalloff))
      }
      if (config.epsilonMul !== undefined) {
        validated.epsilonMul = Math.max(1e-5, Math.min(0.5, config.epsilonMul))
      }
      if (config.bendScale !== undefined) {
        validated.bendScale = Math.max(0, Math.min(5, config.bendScale))
      }
      if (config.bendMaxPerStep !== undefined) {
        validated.bendMaxPerStep = Math.max(0, Math.min(0.8, config.bendMaxPerStep))
      }
      if (config.lensingClamp !== undefined) {
        validated.lensingClamp = Math.max(0, Math.min(100, config.lensingClamp))
      }
      if (config.skyCubemapResolution !== undefined) {
        validated.skyCubemapResolution = snapToValidResolution(config.skyCubemapResolution)
      }

      // Photon shell
      if (config.photonShellRadiusMul !== undefined) {
        validated.photonShellRadiusMul = Math.max(1.0, Math.min(2.0, config.photonShellRadiusMul))
      }
      if (config.shellGlowStrength !== undefined) {
        validated.shellGlowStrength = Math.max(0, Math.min(20, config.shellGlowStrength))
      }

      if (config.diskInnerRadiusMul !== undefined) {
        validated.diskInnerRadiusMul = Math.max(0, Math.min(10, config.diskInnerRadiusMul))
      }
      if (config.diskOuterRadiusMul !== undefined) {
        validated.diskOuterRadiusMul = Math.max(0.1, Math.min(200, config.diskOuterRadiusMul))
      }
      if (config.swirlAmount !== undefined) {
        validated.swirlAmount = Math.max(0, Math.min(3, config.swirlAmount))
      }

      // Pass through non-numeric fields directly (strings, booleans, arrays)
      // Using explicit assignments to maintain type safety
      if (config.paletteMode !== undefined) validated.paletteMode = config.paletteMode
      if (config.manifoldType !== undefined) validated.manifoldType = config.manifoldType
      if (config.lightingMode !== undefined) validated.lightingMode = config.lightingMode
      if (config.baseColor !== undefined) validated.baseColor = config.baseColor
      if (config.shellGlowColor !== undefined) validated.shellGlowColor = config.shellGlowColor
      if (config.dopplerEnabled !== undefined) validated.dopplerEnabled = config.dopplerEnabled
      if (config.enableAbsorption !== undefined)
        validated.enableAbsorption = config.enableAbsorption
      if (config.temporalAccumulationEnabled !== undefined)
        validated.temporalAccumulationEnabled = config.temporalAccumulationEnabled
      if (config.swirlAnimationEnabled !== undefined)
        validated.swirlAnimationEnabled = config.swirlAnimationEnabled
      if (config.pulseEnabled !== undefined) validated.pulseEnabled = config.pulseEnabled
      if (config.parameterValues !== undefined) validated.parameterValues = config.parameterValues

      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, ...validated },
      }))
    },

    initializeBlackHoleForDimension: (dimension) => {
      const extraDims = Math.max(0, dimension - 3)
      const parameterValues = new Array(extraDims).fill(0)

      // Adjust thickness based on dimension
      const baseThickness = 0.15
      const thicknessMul = 1 + (dimension - 3) * 0.1 // Thicker in higher dimensions

      setWithVersion((state) => ({
        blackhole: {
          ...state.blackhole,
          parameterValues,
          manifoldThickness: Math.min(baseThickness * thicknessMul, 2.0),
        },
      }))
    },

    getBlackHoleConfig: () => get().blackhole,
  }
}
