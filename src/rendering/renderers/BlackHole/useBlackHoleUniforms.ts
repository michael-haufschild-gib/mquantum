/**
 * useBlackHoleUniforms Hook
 *
 * Creates and manages the uniform object for the black hole shader.
 * These uniforms are passed to the shader material and updated each frame.
 */

import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { useMemo } from 'react'
import * as THREE from 'three'
import { MAX_DIMENSION } from './types'

/**
 * Type for black hole shader uniforms
 */
export type BlackHoleUniforms = ReturnType<typeof useBlackHoleUniforms>

/**
 * Create black hole shader uniforms
 *
 * This hook creates a stable uniform object that persists across renders.
 * The uniforms are updated each frame in useBlackHoleUniformUpdates.
 *
 * @returns Uniform object for ShaderMaterial
 */
export function useBlackHoleUniforms() {
  return useMemo(
    () => ({
      // Time and resolution
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uCameraPosition: { value: new THREE.Vector3() }, // Used if we want to override Three.js cameraPosition

      // Matrices - Explicitly passed for full control (and scale handling)
      uModelMatrix: { value: new THREE.Matrix4() },
      uInverseModelMatrix: { value: new THREE.Matrix4() },
      uProjectionMatrix: { value: new THREE.Matrix4() },
      uViewMatrix: { value: new THREE.Matrix4() },
      uInverseViewProjectionMatrix: { value: new THREE.Matrix4() },

      // Scale (legacy, now handled via mesh.scale and uInverseModelMatrix)

      // Dimension
      uDimension: { value: 4 },

      // D-dimensional rotated coordinate system
      uBasisX: { value: new Float32Array(MAX_DIMENSION) },
      uBasisY: { value: new Float32Array(MAX_DIMENSION) },
      uBasisZ: { value: new Float32Array(MAX_DIMENSION) },
      uOrigin: { value: new Float32Array(MAX_DIMENSION) },

      // Parameter values for extra dimensions
      uParamValues: { value: new Float32Array(8) },

      // Physics (Kerr black hole)
      // Defaults match DEFAULT_BLACK_HOLE_CONFIG: horizonRadius=0.5, spin=0.3
      // Shadow radius ≈ 1.285 for these values
      uHorizonRadius: { value: 0.5 }, // Schwarzschild radius rs = 2M
      uVisualEventHorizon: { value: 1.285 }, // Shadow radius (where rays are absorbed)
      uSpin: { value: 0.0 }, // Dimensionless spin chi = a/M (0 to 0.998)
      uDiskTemperature: { value: 6500.0 }, // Inner disk temperature in Kelvin
      uGravityStrength: { value: 1.0 }, // Match DEFAULT_GRAVITY_STRENGTH
      uManifoldIntensity: { value: 1.0 },
      uManifoldThickness: { value: 0.15 },
      uPhotonShellWidth: { value: 0.05 },
      uTimeScale: { value: 1.0 },
      uBaseColor: { value: new THREE.Color('#fff5e6').convertSRGBToLinear() },
      uPaletteMode: { value: 0 },
      uBloomBoost: { value: 1.5 },

      // Color Algorithm System
      uColorAlgorithm: { value: 0 },
      uCosineA: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uCosineB: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uCosineC: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uCosineD: { value: new THREE.Vector3(0.0, 0.33, 0.67) },
      uLchLightness: { value: 0.5 },
      uLchChroma: { value: 0.5 },

      // Lensing
      uDimensionEmphasis: { value: 0.8 },
      uDistanceFalloff: { value: 1.6 },
      uEpsilonMul: { value: 0.01 },
      uBendScale: { value: 1.0 },
      uBendMaxPerStep: { value: 0.25 },
      uLensingClamp: { value: 10.0 },
      uRayBendingMode: { value: 0 },
      uDimPower: { value: 1.0 }, // Pre-calculated pow(DIMENSION, emphasis)
      uOriginOffsetLengthSq: { value: 0.0 }, // Pre-calculated lengthSq of extra-dim offset
      // PERF (OPT-BH-26): Pre-computed lensing falloff boundaries
      uLensingFalloffStart: { value: 1.75 }, // Default: 0.5 * 3.5
      uLensingFalloffEnd: { value: 4.0 }, // Default: 0.5 * 8.0
      uHorizonRadiusInv: { value: 2.0 }, // Default: 1.0 / 0.5

      // Photon shell
      uPhotonShellRadiusMul: { value: 1.3 },
      uPhotonShellRadiusDimBias: { value: 0.1 },
      uShellGlowStrength: { value: 3.0 },
      uShellGlowColor: { value: new THREE.Color('#ffffff').convertSRGBToLinear() },
      uShellStepMul: { value: 0.35 },
      uShellContrastBoost: { value: 1.0 },
      // PERF (OPT-BH-5): Pre-calculated shell values to avoid per-pixel log() and multiplications
      // Shell center 15% outside shadow radius (~1.48), width 25% of shadow (~0.32)
      uShellRpPrecomputed: { value: 1.48 }, // Shell center: 1.285 * 1.15
      uShellDeltaPrecomputed: { value: 0.32 }, // Shell width: 1.285 * 0.25

      // Manifold
      uManifoldType: { value: 0 },
      uDensityFalloff: { value: 6.0 },
      uDiskInnerRadiusMul: { value: 4.23 }, // Match store default (ISCO for spin=0.3)
      uDiskOuterRadiusMul: { value: 15.0 }, // Match store default
      // PERF (OPT-BH-6): Pre-computed disk radii (horizonRadius * multiplier)
      uDiskInnerR: { value: 2.115 }, // Default: 0.5 * 4.23
      uDiskOuterR: { value: 7.5 }, // Default: 0.5 * 15.0
      uRadialSoftnessMul: { value: 0.2 },
      uThicknessPerDimMax: { value: 4.0 },
      uHighDimWScale: { value: 2.0 },
      uSwirlAmount: { value: 0.6 },
      uNoiseScale: { value: 1.0 },
      uNoiseAmount: { value: 0.25 },
      uMultiIntersectionGain: { value: 1.0 },

      // Quality
      uMaxSteps: { value: 256 },
      uStepBase: { value: 0.08 },
      uStepMin: { value: 0.01 },
      uStepMax: { value: 0.2 },
      uStepAdaptG: { value: 1.0 },
      uStepAdaptR: { value: 0.2 },
      uEnableAbsorption: { value: false },
      uAbsorption: { value: 1.0 },
      uTransmittanceCutoff: { value: 0.01 },
      uFarRadius: { value: 35.0 }, // Match store default (DEFAULT_BLACK_HOLE_CONFIG.farRadius)
      // PERF (OPT-BH-3): Ultra-fast mode for rapid camera movement
      uUltraFastMode: { value: false },
      // PERF (OPT-BH-1): Pre-baked noise texture for volumetric disk
      tDiskNoise: { value: null as THREE.Data3DTexture | null },
      // PERF (OPT-BH-17): Pre-baked blackbody color LUT
      tBlackbodyLUT: { value: null as THREE.DataTexture | null },

      // Performance mode - enables lower quality during rotation/animation
      uFastMode: { value: false },
      uQualityMultiplier: { value: 1.0 },

      // Lighting
      uLightingMode: { value: 0 },
      uRoughness: { value: 0.6 },
      uSpecular: { value: 0.2 },
      uAmbientTint: { value: 0.1 },

      // Background (uses general skybox system, no built-in fallback)
      uEnvMapReady: { value: 0.0 }, // Set to 1.0 when envMap is valid
      envMap: { value: null },

      // Doppler
      uDopplerEnabled: { value: false },
      uDopplerStrength: { value: 0.6 },

      // Animation
      uPulseEnabled: { value: false },
      uPulseSpeed: { value: 0.3 },
      uPulseAmount: { value: 0.2 },

      // Keplerian disk rotation (from rotation system)
      uDiskRotationAngle: { value: 0 },
      uKeplerianDifferential: { value: 0.5 },

      // Motion blur
      uMotionBlurEnabled: { value: false },
      uMotionBlurStrength: { value: 0.5 },
      uMotionBlurSamples: { value: 4 },
      uMotionBlurRadialFalloff: { value: 1.0 },

      // SSS (Subsurface Scattering - from appearanceStore)
      uSssEnabled: { value: false },
      uSssIntensity: { value: 1.0 },
      uSssColor: { value: new THREE.Color('#ff8844').convertSRGBToLinear() },
      uSssThickness: { value: 1.0 },
      uSssJitter: { value: 0.2 },

      // Fresnel Rim (from appearanceStore - shared uniforms)
      uFresnelEnabled: { value: false },
      uFresnelIntensity: { value: 0.5 },
      uRimColor: { value: new THREE.Color('#ffffff').convertSRGBToLinear() },

      // Ambient Occlusion (from appearanceStore - shared uniforms)
      uAoEnabled: { value: false },

      // Slice animation (for trueND mode)
      uSliceSpeed: { value: 0.02 },
      uSliceAmplitude: { value: 0.3 },

      // Temporal accumulation (matrices are defined above in the Matrices section)
      uBayerOffset: { value: new THREE.Vector2(0, 0) },
      uFullResolution: { value: new THREE.Vector2(1, 1) },

      // Multi-light system (via UniformManager)
      ...UniformManager.getCombinedUniforms(['lighting']),
    }),
    []
  )
}
