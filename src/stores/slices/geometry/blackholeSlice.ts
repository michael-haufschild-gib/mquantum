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

  // === Setter Factories ===
  // Reduce boilerplate for common setter patterns

  /** Factory for simple value setters (no validation) */
  const valueSetter = <K extends keyof BlackHoleConfig>(key: K) =>
    (value: BlackHoleConfig[K]) => {
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, [key]: value },
      }))
    }

  /** Factory for clamped numeric setters */
  const clampedSetter = <K extends keyof BlackHoleConfig>(
    key: K,
    min: number,
    max: number,
    floor = false
  ) => (value: number) => {
    let clamped = Math.max(min, Math.min(max, value))
    if (floor) clamped = Math.floor(clamped)
    setWithVersion((state) => ({
      blackhole: { ...state.blackhole, [key]: clamped },
    }))
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

    setBlackHoleGravityStrength: clampedSetter('gravityStrength', 0, 10),
    setBlackHoleManifoldIntensity: clampedSetter('manifoldIntensity', 0, 20),
    setBlackHoleManifoldThickness: clampedSetter('manifoldThickness', 0, 2),
    setBlackHolePhotonShellWidth: clampedSetter('photonShellWidth', 0, 0.3),
    setBlackHoleTimeScale: clampedSetter('timeScale', 0, 5),
    setBlackHoleBaseColor: valueSetter('baseColor'),
    setBlackHolePaletteMode: valueSetter('paletteMode'),
    setBlackHoleBloomBoost: clampedSetter('bloomBoost', 0, 5),

    // === Lensing ===
    setBlackHoleDimensionEmphasis: clampedSetter('dimensionEmphasis', 0, 2),
    setBlackHoleDistanceFalloff: clampedSetter('distanceFalloff', 0.5, 4),
    setBlackHoleEpsilonMul: clampedSetter('epsilonMul', 1e-5, 0.5),
    setBlackHoleBendScale: clampedSetter('bendScale', 0, 5),
    setBlackHoleBendMaxPerStep: clampedSetter('bendMaxPerStep', 0, 0.8),
    setBlackHoleLensingClamp: clampedSetter('lensingClamp', 0, 100),
    setBlackHoleRayBendingMode: valueSetter('rayBendingMode'),

    // === Photon Shell ===
    setBlackHolePhotonShellRadiusMul: clampedSetter('photonShellRadiusMul', 1.0, 2.0),
    setBlackHolePhotonShellRadiusDimBias: clampedSetter('photonShellRadiusDimBias', 0, 0.5),
    setBlackHoleShellGlowStrength: clampedSetter('shellGlowStrength', 0, 20),
    setBlackHoleShellGlowColor: valueSetter('shellGlowColor'),
    setBlackHoleShellStepMul: clampedSetter('shellStepMul', 0.05, 1),
    setBlackHoleShellContrastBoost: clampedSetter('shellContrastBoost', 0, 3),

    // === Manifold ===
    setBlackHoleManifoldType: valueSetter('manifoldType'),

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

    setBlackHoleRadialSoftnessMul: clampedSetter('radialSoftnessMul', 0, 2),
    setBlackHoleThicknessPerDimMax: clampedSetter('thicknessPerDimMax', 1, 10),
    setBlackHoleHighDimWScale: clampedSetter('highDimWScale', 1, 10),
    setBlackHoleSwirlAmount: clampedSetter('swirlAmount', 0, 2),
    setBlackHoleNoiseScale: clampedSetter('noiseScale', 0.1, 10),
    setBlackHoleNoiseAmount: clampedSetter('noiseAmount', 0, 1),
    setBlackHoleMultiIntersectionGain: clampedSetter('multiIntersectionGain', 0, 3),

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

    setBlackHoleMaxSteps: clampedSetter('maxSteps', 16, 512, true),
    setBlackHoleStepBase: clampedSetter('stepBase', 0.001, 1),
    setBlackHoleStepMin: clampedSetter('stepMin', 0.0001, 0.5),
    setBlackHoleStepMax: clampedSetter('stepMax', 0.001, 5),
    setBlackHoleStepAdaptG: clampedSetter('stepAdaptG', 0, 5),
    setBlackHoleStepAdaptR: clampedSetter('stepAdaptR', 0, 2),
    setBlackHoleEnableAbsorption: valueSetter('enableAbsorption'),
    setBlackHoleAbsorption: clampedSetter('absorption', 0, 10),
    setBlackHoleTransmittanceCutoff: clampedSetter('transmittanceCutoff', 0, 0.2),
    setBlackHoleFarRadius: clampedSetter('farRadius', 1, 100),

    // === Lighting ===
    setBlackHoleLightingMode: valueSetter('lightingMode'),
    setBlackHoleRoughness: clampedSetter('roughness', 0, 1),
    setBlackHoleSpecular: clampedSetter('specular', 0, 1),
    setBlackHoleAmbientTint: clampedSetter('ambientTint', 0, 1),
    setBlackHoleShadowEnabled: valueSetter('shadowEnabled'),
    setBlackHoleShadowSteps: clampedSetter('shadowSteps', 4, 64, true),
    setBlackHoleShadowDensity: clampedSetter('shadowDensity', 0, 10),

    // === Temporal ===
    setBlackHoleTemporalAccumulationEnabled: valueSetter('temporalAccumulationEnabled'),

    // === Doppler Effect ===
    setBlackHoleDopplerEnabled: valueSetter('dopplerEnabled'),
    setBlackHoleDopplerStrength: clampedSetter('dopplerStrength', 0, 2),

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
    setBlackHoleMotionBlurEnabled: valueSetter('motionBlurEnabled'),
    setBlackHoleMotionBlurStrength: clampedSetter('motionBlurStrength', 0, 2),
    setBlackHoleMotionBlurSamples: clampedSetter('motionBlurSamples', 1, 8, true),
    setBlackHoleMotionBlurRadialFalloff: clampedSetter('motionBlurRadialFalloff', 0, 5),

    // === Deferred Lensing ===
    setBlackHoleDeferredLensingEnabled: valueSetter('deferredLensingEnabled'),
    setBlackHoleDeferredLensingStrength: clampedSetter('deferredLensingStrength', 0, 2),
    setBlackHoleDeferredLensingRadius: clampedSetter('deferredLensingRadius', 0, 10),
    setBlackHoleDeferredLensingChromaticAberration: clampedSetter('deferredLensingChromaticAberration', 0, 1),

    setBlackHoleSkyCubemapResolution: (resolution) => {
      const snapped = snapToValidResolution(resolution)
      setWithVersion((state) => ({
        blackhole: { ...state.blackhole, skyCubemapResolution: snapped },
      }))
    },

    // === Screen-Space Lensing ===
    setBlackHoleLensingFalloff: clampedSetter('lensingFalloff', 0.5, 4),

    // === Scene Object Lensing ===
    setBlackHoleSceneObjectLensingEnabled: valueSetter('sceneObjectLensingEnabled'),
    setBlackHoleSceneObjectLensingStrength: clampedSetter('sceneObjectLensingStrength', 0, 2),

    // === Animation ===
    setBlackHolePulseEnabled: valueSetter('pulseEnabled'),
    setBlackHolePulseSpeed: clampedSetter('pulseSpeed', 0, 2),
    setBlackHolePulseAmount: clampedSetter('pulseAmount', 0, 1),
    setBlackHoleSliceAnimationEnabled: valueSetter('sliceAnimationEnabled'),
    setBlackHoleSliceSpeed: clampedSetter('sliceSpeed', 0.01, 0.1),
    setBlackHoleSliceAmplitude: clampedSetter('sliceAmplitude', 0.1, 1),

    // === Keplerian Disk Rotation ===
    setBlackHoleKeplerianDifferential: clampedSetter('keplerianDifferential', 0, 1),

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
