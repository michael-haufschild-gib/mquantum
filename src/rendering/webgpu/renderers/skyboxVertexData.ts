/**
 * Skybox Cube Vertex Data
 *
 * Generates the vertex buffer data for the skybox cube geometry.
 * Extracted from WebGPUSkyboxRenderer to manage file size.
 *
 * @module rendering/webgpu/renderers/skyboxVertexData
 */

import type { SkyboxMode, SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

import type { SkyboxMode as ShaderSkyboxMode } from '../shaders/skybox'

/**
 * Resolved KTX2 cubemap asset URLs (eagerly resolved by Vite).
 * Files are named: cubemap_{bc7|astc}.ktx2 and cubemap_hq_{bc7|astc}.ktx2
 */
const ktx2Assets = import.meta.glob<string>('/src/assets/skyboxes/*/cubemap*.ktx2', {
  eager: true,
  import: 'default',
  query: '?url',
})

/**
 * Load a KTX2 cubemap texture for the named skybox.
 * Selects BC7 (Windows/Linux) or ASTC (macOS/mobile) based on device features.
 *
 * @param device - GPU device for texture creation
 * @param textureName - Skybox texture identifier (e.g. 'space_blue')
 * @param highQuality - When true, loads the higher-fidelity variant
 * @returns The GPU cubemap texture, or null if the asset is missing or unsupported
 */
export async function loadSkyboxKTX2Texture(
  device: GPUDevice,
  textureName: string,
  highQuality: boolean
): Promise<GPUTexture | null> {
  const { detectCompressedFormatSuffix, loadKTX2CubeTexture } = await import('../utils/ktx2Loader')
  const suffix = detectCompressedFormatSuffix(device)
  if (!suffix) return null

  const filename = highQuality ? `cubemap_hq_${suffix}` : `cubemap_${suffix}`
  const key = `/src/assets/skyboxes/${textureName}/${filename}.ktx2`
  const url = ktx2Assets[key]
  if (!url) return null

  return loadKTX2CubeTexture(device, url)
}

/**
 * Generate cube vertex data (position-only) for skybox rendering.
 *
 * Creates 36 vertices (6 faces x 2 triangles x 3 vertices per triangle)
 * for a unit cube centered at the origin.
 *
 * @param size - Half-extent of the cube (default 1.0)
 * @returns Float32Array with 108 floats (36 vertices x 3 components)
 */
export function generateSkyboxCubeVertices(size = 1.0): Float32Array {
  return new Float32Array([
    // Front face
    -size,
    -size,
    size,
    size,
    -size,
    size,
    size,
    size,
    size,
    -size,
    -size,
    size,
    size,
    size,
    size,
    -size,
    size,
    size,
    // Back face
    size,
    -size,
    -size,
    -size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    size,
    -size,
    // Top face
    -size,
    size,
    size,
    size,
    size,
    size,
    size,
    size,
    -size,
    -size,
    size,
    size,
    size,
    size,
    -size,
    -size,
    size,
    -size,
    // Bottom face
    -size,
    -size,
    -size,
    size,
    -size,
    -size,
    size,
    -size,
    size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    -size,
    -size,
    size,
    // Right face
    size,
    -size,
    size,
    size,
    -size,
    -size,
    size,
    size,
    -size,
    size,
    -size,
    size,
    size,
    size,
    -size,
    size,
    size,
    size,
    // Left face
    -size,
    -size,
    -size,
    -size,
    -size,
    size,
    -size,
    size,
    size,
    -size,
    -size,
    -size,
    -size,
    size,
    size,
    -size,
    size,
    -size,
  ])
}

/**
 *
 */
export function mapSkyboxModeToShader(storeMode: SkyboxMode): ShaderSkyboxMode {
  switch (storeMode) {
    case 'procedural_aurora':
      return 'aurora'
    case 'procedural_nebula':
      return 'nebula'
    case 'procedural_crystalline':
      return 'crystalline'
    case 'procedural_horizon':
      return 'horizon'
    case 'procedural_ocean':
      return 'ocean'
    case 'procedural_twilight':
      return 'twilight'
    case 'classic':
    default:
      return 'classic'
  }
}

/**
 * Maps shader mode string to numeric mode value for uniforms.
 * @param mode
 */
export function modeToNumeric(mode: ShaderSkyboxMode): number {
  switch (mode) {
    case 'classic':
      return 0
    case 'aurora':
      return 1
    case 'nebula':
      return 2
    case 'crystalline':
      return 4
    case 'horizon':
      return 5
    case 'ocean':
      return 6
    case 'twilight':
      return 7
    default:
      return 0
  }
}

/** Write 3 floats from an optional array with per-component defaults. */
export function writeVec3(
  data: Float32Array,
  offset: number,
  src: number[] | undefined,
  d0: number,
  d1: number,
  d2: number
): void {
  data[offset] = src?.[0] ?? d0
  data[offset + 1] = src?.[1] ?? d1
  data[offset + 2] = src?.[2] ?? d2
}

/** Pack core skybox uniforms (indices 0-15). */
export function packSkyboxCoreUniforms(
  data: Float32Array,
  shaderMode: ShaderSkyboxMode,
  settings: SkyboxProceduralSettings | undefined,
  t: number,
  intensity: number,
  hue: number,
  animDistortion: number
): void {
  data[0] = modeToNumeric(shaderMode)
  data[1] = t
  data[2] = intensity
  data[3] = hue
  data[4] = settings?.saturation ?? 1.0
  data[5] = settings?.scale ?? 1.0
  data[6] = settings?.complexity ?? 0.5
  data[7] = settings?.timeScale ?? 0.2
  data[8] = settings?.evolution ?? 0.0
  data[10] = animDistortion
  data[12] = settings?.turbulence ?? 0.3
  data[13] = settings?.dualToneContrast ?? 0.5
  data[14] = settings?.sunIntensity ?? 0.0
}

/** Pack sun position and mode-specific skybox settings (indices 40-51). */
export function packSkyboxModeSettings(
  data: Float32Array,
  settings: SkyboxProceduralSettings | undefined
): void {
  const sunPos = settings?.sunPosition ?? [10, 10, 10]
  data[40] = sunPos[0]
  data[41] = sunPos[1]
  data[42] = sunPos[2]
  data[44] = settings?.aurora?.curtainHeight ?? 0.5
  data[45] = settings?.aurora?.waveFrequency ?? 1.0
  data[46] = settings?.horizonGradient?.gradientContrast ?? 0.5
  data[47] = settings?.horizonGradient?.spotlightFocus ?? 0.5
  data[48] = settings?.ocean?.causticIntensity ?? 0.5
  data[49] = settings?.ocean?.depthGradient ?? 0.5
  data[50] = settings?.ocean?.bubbleDensity ?? 0.3
  data[51] = settings?.ocean?.surfaceShimmer ?? 0.4
}

/** Pack cosine palette coefficients into skybox uniform data (indices 16-39). */
export function packSkyboxPalette(
  data: Float32Array,
  coeffs: { a?: number[]; b?: number[]; c?: number[]; d?: number[] } | undefined
): void {
  // color1 (= palA), color2 (= palB)
  writeVec3(data, 16, coeffs?.a, 0.5, 0.5, 0.5)
  writeVec3(data, 20, coeffs?.b, 0.5, 0.5, 0.5)

  // palA-D (explicit palette coefficients)
  writeVec3(data, 24, coeffs?.a, 0.5, 0.5, 0.5)
  writeVec3(data, 28, coeffs?.b, 0.5, 0.5, 0.5)
  writeVec3(data, 32, coeffs?.c, 1.0, 1.0, 1.0)
  writeVec3(data, 36, coeffs?.d, 0.0, 0.33, 0.67)
}

/** Compute animation-driven visual effects for the skybox based on animation mode. */
export function computeSkyboxAnimationEffects(
  isPlaying: boolean,
  storeMode: string,
  animationMode: string,
  t: number
): {
  rotX: number
  rotY: number
  rotZ: number
  hue: number
  intensityMul: number
  distortion: number
} {
  const result = { rotX: 0, rotY: 0, rotZ: 0, hue: 0, intensityMul: 1.0, distortion: 0 }
  if (!isPlaying || storeMode !== 'classic' || animationMode === 'none') return result

  switch (animationMode) {
    case 'cinematic':
      result.rotY = t * 0.1
      result.rotX = Math.sin(t * 0.5) * 0.005
      result.rotZ = Math.cos(t * 0.3) * 0.003
      break
    case 'heatwave':
      result.distortion = 1.0 + Math.sin(t * 0.5) * 0.5
      result.rotY = t * 0.02
      break
    case 'tumble':
      result.rotX = t * 0.05
      result.rotY = t * 0.07
      result.rotZ = t * 0.03
      break
    case 'ethereal':
      result.rotY = t * 0.05
      result.hue = Math.sin(t * 0.1) * 0.1
      result.intensityMul = 1.0 + Math.sin(t * 10) * 0.02
      break
    case 'nebula':
      result.hue = (t * 0.05) % 1.0
      result.rotY = t * 0.03
      result.intensityMul = 1.1
      break
  }
  return result
}
