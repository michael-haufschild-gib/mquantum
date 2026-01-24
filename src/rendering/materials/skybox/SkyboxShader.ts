/**
 * Skybox Shader Material
 *
 * Custom shader material for rendering environment skyboxes with
 * configurable visual effects, animations, and procedural generation.
 *
 * Features:
 * - Classic: Cube texture sampling with effects
 * - Procedural Modes: Aurora, Nebula, Crystalline, Horizon, Ocean, Twilight
 * - "Atmospheric Resonance" system (10 delight features)
 * - Cosine Palette Integration
 * - Smooth crossfade transitions
 */

import * as THREE from 'three'

/**
 * Skybox mode constants matching shader uniforms
 * 0=Classic, 1=Aurora, 2=Nebula, 3=Crystalline, 4=Horizon, 5=Ocean, 6=Twilight
 */
export const SKYBOX_MODE_CLASSIC = 0
export const SKYBOX_MODE_AURORA = 1
export const SKYBOX_MODE_NEBULA = 2
export const SKYBOX_MODE_CRYSTALLINE = 3
export const SKYBOX_MODE_HORIZON = 4
export const SKYBOX_MODE_OCEAN = 5
export const SKYBOX_MODE_TWILIGHT = 6

/**
 * Default uniform values for the skybox shader.
 * Wrapped in { value: ... } for Three.js ShaderMaterial.
 * @returns Record of default uniform values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSkyboxShaderDefaults(): Record<string, { value: any }> {
  return {
    uTex: { value: null },
    uRotation: { value: new THREE.Matrix3() },
    uMode: { value: 0 },
    uTime: { value: 0 },
    uIsCapture: { value: 0 },

    uIntensity: { value: 1 },
    uHue: { value: 0 },
    uSaturation: { value: 1 },

    uScale: { value: 1.0 },
    uComplexity: { value: 0.5 },
    uTimeScale: { value: 0.2 },
    uEvolution: { value: 0.0 },

    uColor1: { value: new THREE.Color(0x0000ff) },
    uColor2: { value: new THREE.Color(0xff00ff) },
    uPalA: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uPalB: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uPalC: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uPalD: { value: new THREE.Vector3(0.0, 0.33, 0.67) },
    uUsePalette: { value: 0 },

    uDistortion: { value: 0 },
    uVignette: { value: 0.15 },
    uTurbulence: { value: 0.0 },
    uDualTone: { value: 0.5 },
    uSunIntensity: { value: 0.0 },
    uSunPosition: { value: new THREE.Vector3(10, 10, 10) },

    // Aurora defaults
    uAuroraCurtainHeight: { value: 0.5 },
    uAuroraWaveFrequency: { value: 1.0 },

    // Horizon defaults
    uHorizonGradientContrast: { value: 0.5 },
    uHorizonSpotlightFocus: { value: 0.5 },

    // Ocean defaults
    uOceanCausticIntensity: { value: 0.5 },
    uOceanDepthGradient: { value: 0.5 },
    uOceanBubbleDensity: { value: 0.3 },
    uOceanSurfaceShimmer: { value: 0.4 },
  }
}

/**
 * GLSL version for WebGL2 - Three.js will handle the #version directive
 */
export const skyboxGlslVersion = THREE.GLSL3
