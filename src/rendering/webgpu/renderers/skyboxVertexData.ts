/**
 * Skybox Cube Vertex Data
 *
 * Generates the vertex buffer data for the skybox cube geometry.
 * Extracted from WebGPUSkyboxRenderer to manage file size.
 *
 * @module rendering/webgpu/renderers/skyboxVertexData
 */

import {
  DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
  type SkyboxMode,
  type SkyboxProceduralSettings,
} from '@/stores/defaults/visualDefaults'

import type { SkyboxMode as ShaderSkyboxMode } from '../shaders/skybox/types'
import { SKYBOX_UNIFORMS_LAYOUT } from './skyboxLayout'

const SKYBOX_INDEX = SKYBOX_UNIFORMS_LAYOUT.index

const STORE_MODE_TO_SHADER_MODE: Record<SkyboxMode, ShaderSkyboxMode> = {
  classic: 'classic',
  procedural_aurora: 'aurora',
  procedural_nebula: 'nebula',
  procedural_crystalline: 'crystalline',
  procedural_horizon: 'horizon',
  procedural_ocean: 'ocean',
  procedural_twilight: 'twilight',
}

const SHADER_MODE_TO_NUMERIC: Record<ShaderSkyboxMode, number> = {
  classic: 0,
  aurora: 1,
  nebula: 2,
  crystalline: 4,
  horizon: 5,
  ocean: 6,
  twilight: 7,
}

function finiteOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finiteOrFallback(value, fallback)))
}

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
export function generateSkyboxCubeVertices(rawSize: number = 1.0): Float32Array {
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 1.0
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
  return STORE_MODE_TO_SHADER_MODE[storeMode] ?? 'classic'
}

/**
 * Maps shader mode string to numeric mode value for uniforms.
 * @param mode
 */
export function modeToNumeric(mode: ShaderSkyboxMode): number {
  return SHADER_MODE_TO_NUMERIC[mode] ?? 0
}

/** Write 3 floats from an optional array with per-component defaults. */
export function writeVec3(
  data: Float32Array,
  offset: number,
  src: readonly unknown[] | undefined,
  d0: number,
  d1: number,
  d2: number
): void {
  const vector = Array.isArray(src) ? src : undefined
  data[offset] = finiteOrFallback(vector?.[0], d0)
  data[offset + 1] = finiteOrFallback(vector?.[1], d1)
  data[offset + 2] = finiteOrFallback(vector?.[2], d2)
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
  data[SKYBOX_INDEX.mode] = modeToNumeric(shaderMode)
  data[SKYBOX_INDEX.time] = finiteOrFallback(t, 0)
  data[SKYBOX_INDEX.intensity] = clampFinite(intensity, 1.0, 0, 11)
  data[SKYBOX_INDEX.hue] = clampFinite(hue, 0.0, -1, 1)
  data[SKYBOX_INDEX.saturation] = clampFinite(settings?.saturation, 1.0, 0, 2)
  data[SKYBOX_INDEX.scale] = clampFinite(settings?.scale, 1.0, 0.1, 3.0)
  data[SKYBOX_INDEX.complexity] = clampFinite(settings?.complexity, 0.5, 0, 1)
  data[SKYBOX_INDEX.timeScale] = clampFinite(settings?.timeScale, 0.2, 0, 2.0)
  data[SKYBOX_INDEX.evolution] = clampFinite(settings?.evolution, 0.0, 0, 10)
  data[SKYBOX_INDEX.distortion] = clampFinite(animDistortion, 0.0, 0, 2)
  data[SKYBOX_INDEX.turbulence] = clampFinite(settings?.turbulence, 0.3, 0, 1)
  data[SKYBOX_INDEX.dualTone] = clampFinite(settings?.dualToneContrast, 0.5, 0, 1)
  data[SKYBOX_INDEX.sunIntensity] = clampFinite(settings?.sunIntensity, 0.0, 0, 2)
}

/** Pack sun position and mode-specific skybox settings (indices 40-51). */
export function packSkyboxModeSettings(
  data: Float32Array,
  settings: SkyboxProceduralSettings | undefined
): void {
  const defaults = DEFAULT_SKYBOX_PROCEDURAL_SETTINGS
  const sunIdx = SKYBOX_INDEX.sunPosition
  writeVec3(
    data,
    sunIdx,
    settings?.sunPosition as readonly unknown[] | undefined,
    defaults.sunPosition[0],
    defaults.sunPosition[1],
    defaults.sunPosition[2]
  )
  data[SKYBOX_INDEX.auroraCurtainHeight] = clampFinite(
    settings?.aurora?.curtainHeight,
    defaults.aurora.curtainHeight,
    0,
    1
  )
  data[SKYBOX_INDEX.auroraWaveFrequency] = clampFinite(
    settings?.aurora?.waveFrequency,
    defaults.aurora.waveFrequency,
    0.3,
    3
  )
  data[SKYBOX_INDEX.horizonGradientContrast] = clampFinite(
    settings?.horizonGradient?.gradientContrast,
    defaults.horizonGradient.gradientContrast,
    0,
    1
  )
  data[SKYBOX_INDEX.horizonSpotlightFocus] = clampFinite(
    settings?.horizonGradient?.spotlightFocus,
    defaults.horizonGradient.spotlightFocus,
    0,
    1
  )
  data[SKYBOX_INDEX.oceanCausticIntensity] = clampFinite(
    settings?.ocean?.causticIntensity,
    defaults.ocean.causticIntensity,
    0,
    1
  )
  data[SKYBOX_INDEX.oceanDepthGradient] = clampFinite(
    settings?.ocean?.depthGradient,
    defaults.ocean.depthGradient,
    0,
    1
  )
  data[SKYBOX_INDEX.oceanBubbleDensity] = clampFinite(
    settings?.ocean?.bubbleDensity,
    defaults.ocean.bubbleDensity,
    0,
    1
  )
  data[SKYBOX_INDEX.oceanSurfaceShimmer] = clampFinite(
    settings?.ocean?.surfaceShimmer,
    defaults.ocean.surfaceShimmer,
    0,
    1
  )
}

/** Pack cosine palette coefficients into skybox uniform data (indices 16-39). */
export function packSkyboxPalette(
  data: Float32Array,
  coeffs:
    | {
        a?: readonly unknown[]
        b?: readonly unknown[]
        c?: readonly unknown[]
        d?: readonly unknown[]
      }
    | undefined
): void {
  // color1 (= palA), color2 (= palB)
  writeVec3(data, SKYBOX_INDEX.color1, coeffs?.a, 0.5, 0.5, 0.5)
  writeVec3(data, SKYBOX_INDEX.color2, coeffs?.b, 0.5, 0.5, 0.5)

  // palA-D (explicit palette coefficients)
  writeVec3(data, SKYBOX_INDEX.palA, coeffs?.a, 0.5, 0.5, 0.5)
  writeVec3(data, SKYBOX_INDEX.palB, coeffs?.b, 0.5, 0.5, 0.5)
  writeVec3(data, SKYBOX_INDEX.palC, coeffs?.c, 1.0, 1.0, 1.0)
  writeVec3(data, SKYBOX_INDEX.palD, coeffs?.d, 0.0, 0.33, 0.67)
}

const TWO_PI = Math.PI * 2

/**
 * Resolve the active cosine-palette coefficients with the same defaults the
 * shader sees, so CPU-precomputed samples match GPU-computed ones exactly.
 */
function resolvePaletteCoefficients(
  coeffs:
    | {
        a?: readonly unknown[]
        b?: readonly unknown[]
        c?: readonly unknown[]
        d?: readonly unknown[]
      }
    | undefined
): {
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
  d: [number, number, number]
} {
  const pick = (
    src: readonly unknown[] | undefined,
    d0: number,
    d1: number,
    d2: number
  ): [number, number, number] => {
    const vector = Array.isArray(src) ? src : undefined
    return [
      finiteOrFallback(vector?.[0], d0),
      finiteOrFallback(vector?.[1], d1),
      finiteOrFallback(vector?.[2], d2),
    ]
  }
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
  coeffs:
    | {
        a?: readonly unknown[]
        b?: readonly unknown[]
        c?: readonly unknown[]
        d?: readonly unknown[]
      }
    | undefined,
  effectiveTime: number
): void {
  const pal = resolvePaletteCoefficients(coeffs)
  const safeTime = finiteOrFallback(effectiveTime, 0)

  // Time-dependent helpers (mirrors per-mode WGSL inline math exactly).
  const tempPulse = Math.sin(safeTime * 0.12) * 0.08 + Math.sin(safeTime * 0.07) * 0.04
  const tempShift = Math.sin(safeTime * 0.02) * 0.5 + 0.5

  // Aurora — cosinePalette(0.8, ...)
  writePrecomputedSample(data, SKYBOX_INDEX.auroraTopColor, evalCosinePalette(0.8, pal))
  // Crystalline — cosinePalette(0.9, ...)
  writePrecomputedSample(data, SKYBOX_INDEX.crystallineShimmerColor, evalCosinePalette(0.9, pal))
  // Nebula — t = 0.1 (deep) and t = 0.85 (knot)
  writePrecomputedSample(data, SKYBOX_INDEX.nebulaDeepColor, evalCosinePalette(0.1, pal))
  writePrecomputedSample(data, SKYBOX_INDEX.nebulaKnotColor, evalCosinePalette(0.85, pal))
  // Ocean — t = 0.0, 0.5, 1.0 (deep, mid, surface)
  writePrecomputedSample(data, SKYBOX_INDEX.oceanDeepPalette, evalCosinePalette(0.0, pal))
  writePrecomputedSample(data, SKYBOX_INDEX.oceanMidPalette, evalCosinePalette(0.5, pal))
  writePrecomputedSample(data, SKYBOX_INDEX.oceanSurfacePalette, evalCosinePalette(1.0, pal))
  // Horizon — floor(0.1+tp*0.1), horizon(0.4+tp*0.05), mid(0.6), top(0.85-tp*0.05), sweep(0.95)
  writePrecomputedSample(
    data,
    SKYBOX_INDEX.horizonFloorColor,
    evalCosinePalette(0.1 + tempPulse * 0.1, pal)
  )
  writePrecomputedSample(
    data,
    SKYBOX_INDEX.horizonHorizonColor,
    evalCosinePalette(0.4 + tempPulse * 0.05, pal)
  )
  writePrecomputedSample(data, SKYBOX_INDEX.horizonMidColor, evalCosinePalette(0.6, pal))
  writePrecomputedSample(
    data,
    SKYBOX_INDEX.horizonTopColor,
    evalCosinePalette(0.85 - tempPulse * 0.05, pal)
  )
  writePrecomputedSample(data, SKYBOX_INDEX.horizonSweepColor, evalCosinePalette(0.95, pal))
  // Twilight — horizon(0.5 + tempShift * 0.3), sun(tempShift)
  writePrecomputedSample(
    data,
    SKYBOX_INDEX.twilightHorizonColor,
    evalCosinePalette(0.5 + tempShift * 0.3, pal)
  )
  writePrecomputedSample(data, SKYBOX_INDEX.twilightSunColor, evalCosinePalette(tempShift, pal))
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
  const safeTime = finiteOrFallback(t, 0)
  const result = { rotX: 0, rotY: 0, rotZ: 0, hue: 0, intensityMul: 1.0, distortion: 0 }
  if (!isPlaying || storeMode !== 'classic' || animationMode === 'none') return result

  switch (animationMode) {
    case 'cinematic':
      result.rotY = safeTime * 0.1
      result.rotX = Math.sin(safeTime * 0.5) * 0.005
      result.rotZ = Math.cos(safeTime * 0.3) * 0.003
      break
    case 'heatwave':
      result.distortion = 1.0 + Math.sin(safeTime * 0.5) * 0.5
      result.rotY = safeTime * 0.02
      break
    case 'tumble':
      result.rotX = safeTime * 0.05
      result.rotY = safeTime * 0.07
      result.rotZ = safeTime * 0.03
      break
    case 'ethereal':
      result.rotY = safeTime * 0.05
      result.hue = Math.sin(safeTime * 0.1) * 0.1
      result.intensityMul = 1.0 + Math.sin(safeTime * 10) * 0.02
      break
    case 'nebula':
      result.hue = (safeTime * 0.05) % 1.0
      result.rotY = safeTime * 0.03
      result.intensityMul = 1.1
      break
  }
  return result
}
