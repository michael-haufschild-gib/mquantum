/**
 * Skybox Cube Vertex Data
 *
 * Generates the vertex buffer data for the skybox cube geometry.
 * Extracted from WebGPUSkyboxRenderer to manage file size.
 *
 * @module rendering/webgpu/renderers/skyboxVertexData
 */

import type { SkyboxMode, SkyboxProceduralSettings } from '@/stores/defaults/visualDefaults'

import type { SkyboxMode as ShaderSkyboxMode } from '../shaders/skybox/types'

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
 * Maps a store-level skybox mode (e.g. 'procedural_ocean') to the shader-level
 * mode identifier (e.g. 'ocean') used for shader composition and uniform packing.
 * @param storeMode - Store-level skybox mode with 'procedural_' prefix
 * @returns Shader-level mode identifier without prefix
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

const TWO_PI = Math.PI * 2

/**
 * Resolve the active cosine-palette coefficients with the same defaults the
 * shader sees, so CPU-precomputed samples match GPU-computed ones exactly.
 */
function resolvePaletteCoefficients(
  coeffs: { a?: number[]; b?: number[]; c?: number[]; d?: number[] } | undefined
): {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
  d: [number, number, number]
} {
  const pick = (
    src: number[] | undefined,
    d0: number,
    d1: number,
    d2: number
  ): [number, number, number] => [src?.[0] ?? d0, src?.[1] ?? d1, src?.[2] ?? d2]
  return {
    a: pick(coeffs?.a, 0.5, 0.5, 0.5),
    b: pick(coeffs?.b, 0.5, 0.5, 0.5),
    c: pick(coeffs?.c, 1.0, 1.0, 1.0),
    d: pick(coeffs?.d, 0.0, 0.33, 0.67),
  }
}

/** Evaluate cosinePalette(t) on CPU using the same formula as the WGSL fn. */
function evalCosinePalette(
  t: number,
  pal: ReturnType<typeof resolvePaletteCoefficients>
): [number, number, number] {
  const { a, b, c, d } = pal
  return [
    a[0] + b[0] * Math.cos(TWO_PI * (c[0] * t + d[0])),
    a[1] + b[1] * Math.cos(TWO_PI * (c[1] * t + d[1])),
    a[2] + b[2] * Math.cos(TWO_PI * (c[2] * t + d[2])),
  ]
}

/** Write a precomputed vec3 sample at the given Float32Array index (with vec4 padding). */
function writePrecomputedSample(
  data: Float32Array,
  offset: number,
  rgb: [number, number, number]
): void {
  data[offset] = rgb[0]
  data[offset + 1] = rgb[1]
  data[offset + 2] = rgb[2]
  // padding slot at offset+3 stays zero (data.fill(0) at top of pack pass)
}

/**
 * Pack CPU-precomputed dispatch-uniform palette samples (indices 52-107).
 *
 * These hoist `cosinePalette()` calls from the per-pixel hot path of every
 * skybox shader where the t-input is constant or only depends on `time`.
 * Effective time matches the shader: `effectiveTime = t * timeScale`
 * (see main.wgsl.ts line 64 — `let time = uniforms.time * uniforms.timeScale;`).
 *
 * @param data - Float32Array packing buffer (must have ≥108 floats)
 * @param coeffs - Optional palette coefficients (defaults match writeVec3 fallbacks)
 * @param effectiveTime - Already scaled by `timeScale` to match the shader
 */
export function packSkyboxPrecomputedPalettes(
  data: Float32Array,
  coeffs: { a?: number[]; b?: number[]; c?: number[]; d?: number[] } | undefined,
  effectiveTime: number
): void {
  const pal = resolvePaletteCoefficients(coeffs)

  // Time-dependent helpers (mirrors per-mode WGSL inline math exactly).
  const tempPulse = Math.sin(effectiveTime * 0.12) * 0.08 + Math.sin(effectiveTime * 0.07) * 0.04
  const tempShift = Math.sin(effectiveTime * 0.02) * 0.5 + 0.5

  // Aurora — cosinePalette(0.8, ...)
  writePrecomputedSample(data, 52, evalCosinePalette(0.8, pal))
  // Crystalline — cosinePalette(0.9, ...)
  writePrecomputedSample(data, 56, evalCosinePalette(0.9, pal))
  // Nebula — t = 0.1 (deep) and t = 0.85 (knot)
  writePrecomputedSample(data, 60, evalCosinePalette(0.1, pal))
  writePrecomputedSample(data, 64, evalCosinePalette(0.85, pal))
  // Ocean — t = 0.0, 0.5, 1.0 (deep, mid, surface)
  writePrecomputedSample(data, 68, evalCosinePalette(0.0, pal))
  writePrecomputedSample(data, 72, evalCosinePalette(0.5, pal))
  writePrecomputedSample(data, 76, evalCosinePalette(1.0, pal))
  // Horizon — floor(0.1+tp*0.1), horizon(0.4+tp*0.05), mid(0.6), top(0.85-tp*0.05), sweep(0.95)
  writePrecomputedSample(data, 80, evalCosinePalette(0.1 + tempPulse * 0.1, pal))
  writePrecomputedSample(data, 84, evalCosinePalette(0.4 + tempPulse * 0.05, pal))
  writePrecomputedSample(data, 88, evalCosinePalette(0.6, pal))
  writePrecomputedSample(data, 92, evalCosinePalette(0.85 - tempPulse * 0.05, pal))
  writePrecomputedSample(data, 96, evalCosinePalette(0.95, pal))
  // Twilight — horizon(0.5 + tempShift * 0.3), sun(tempShift)
  writePrecomputedSample(data, 100, evalCosinePalette(0.5 + tempShift * 0.3, pal))
  writePrecomputedSample(data, 104, evalCosinePalette(tempShift, pal))
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
