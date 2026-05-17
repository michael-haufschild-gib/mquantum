/**
 * WebGPU Lighting Uniform Packing Helpers
 *
 * Converts Zustand lighting store state into the packed LightingUniforms layout
 * expected by WGSL shaders.
 *
 * @module rendering/webgpu/utils/lighting
 */

import type { LightSource } from '@/lib/lighting/lightSource'
import {
  clampConeAngle,
  clampDecay,
  clampIntensity,
  clampPenumbra,
  clampRange,
  normalizeRotationTupleSigned,
  rotationToDirection,
} from '@/lib/lighting/lightSource'

import { parseHexColorToLinearRgb } from './color'

const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT
const FLOATS_PER_VEC3 = 3
const FLOATS_PER_VEC4 = 4
const LIGHT_DATA_VEC4_COUNT = 4
const LIGHT_DATA_FLOAT_LENGTH = LIGHT_DATA_VEC4_COUNT * FLOATS_PER_VEC4
const MAX_PACKED_LIGHTS = 8
const MAX_LIGHT_POSITION_COMPONENT = 1_000_000

const roundUpToFloatMultiple = (value: number, multiple: number): number =>
  Math.ceil(value / multiple) * multiple

const LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET = MAX_PACKED_LIGHTS * LIGHT_DATA_FLOAT_LENGTH
const LIGHTING_AMBIENT_INTENSITY_FLOAT_OFFSET =
  LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET + FLOATS_PER_VEC3

/** Float32 index of `LightingUniforms.lightCount`. */
export const LIGHTING_LIGHT_COUNT_FLOAT_OFFSET = LIGHTING_AMBIENT_INTENSITY_FLOAT_OFFSET + 1

/** Byte offset of `LightingUniforms.lightCount`. */
export const LIGHTING_LIGHT_COUNT_BYTE_OFFSET =
  LIGHTING_LIGHT_COUNT_FLOAT_OFFSET * FLOAT32_BYTES

/** Float32 element count for LightingUniforms staging arrays. */
export const LIGHTING_UNIFORMS_FLOAT_LENGTH = roundUpToFloatMultiple(
  LIGHTING_LIGHT_COUNT_FLOAT_OFFSET + 1,
  LIGHT_DATA_FLOAT_LENGTH
)

/** Total byte size of the LightingUniforms GPU buffer. */
export const LIGHTING_UNIFORMS_SIZE = LIGHTING_UNIFORMS_FLOAT_LENGTH * FLOAT32_BYTES

/**
 * Minimal subset of the lighting store used by WebGPU renderers.
 * This keeps renderers decoupled from Zustand slice types.
 */
export interface WebGPULightingState {
  lights?: LightSource[]
  ambientColor?: string
  ambientIntensity?: number
  ambientEnabled?: boolean
  version?: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function finiteNumberInRange(value: unknown, min: number, max: number, fallback: number): number {
  const finite = finiteNumber(value, fallback)
  return Math.max(min, Math.min(max, finite))
}

function sanitizeVector3(
  value: unknown,
  fallback: [number, number, number],
  maxAbs: number
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  return [
    finiteNumberInRange(value[0], -maxAbs, maxAbs, fallback[0]),
    finiteNumberInRange(value[1], -maxAbs, maxAbs, fallback[1]),
    finiteNumberInRange(value[2], -maxAbs, maxAbs, fallback[2]),
  ]
}

function lightTypeToUniform(type: unknown): number {
  if (type === 'point') return 1
  if (type === 'directional') return 2
  if (type === 'spot') return 3
  return 0
}

/**
 * Fill a Float32Array with the packed LightingUniforms layout.
 *
 * WGSL layout (float indices):
 * - lights: 8 × LightData @ 0..127
 * - ambientColor: vec3f @ LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET
 * - ambientIntensity: f32 @ LIGHTING_AMBIENT_INTENSITY_FLOAT_OFFSET
 * - lightCount: i32 @ LIGHTING_LIGHT_COUNT_BYTE_OFFSET
 *
 * LightData layout (LIGHT_DATA_FLOAT_LENGTH floats):
 * - position: vec4f  (xyz=position, w=type)
 * - direction: vec4f (xyz=direction, w=range)
 * - color: vec4f     (rgb=linear color, a=intensity)
 * - params: vec4f    (x=decay, y=spotCosInner, z=spotCosOuter, w=enabled(0/1))
 *
 * @param data Output array (must be length >= LIGHTING_UNIFORMS_FLOAT_LENGTH)
 * @param lighting Lighting state from stores
 */
export function packLightingUniforms(data: Float32Array, lighting: WebGPULightingState): void {
  if (data.length < LIGHTING_UNIFORMS_FLOAT_LENGTH) {
    throw new Error(
      `packLightingUniforms: expected data length >= ${LIGHTING_UNIFORMS_FLOAT_LENGTH}, got ${data.length}`
    )
  }

  data.fill(0)

  const lights = Array.isArray(lighting.lights) ? lighting.lights : []
  const lightCount = Math.min(lights.length, MAX_PACKED_LIGHTS)

  for (let i = 0; i < lightCount; i++) {
    const light = lights[i] as unknown
    if (!light) continue
    const lightRecord = isObject(light) ? light : null
    if (!lightRecord) continue
    const offset = i * LIGHT_DATA_FLOAT_LENGTH

    // position: vec4f (xyz = position, w = type)
    // Must match WGSL constants: LIGHT_TYPE_POINT=1, LIGHT_TYPE_DIRECTIONAL=2, LIGHT_TYPE_SPOT=3
    const lightType = lightTypeToUniform(lightRecord.type)
    const pos = sanitizeVector3(lightRecord.position, [0, 0, 0], MAX_LIGHT_POSITION_COMPONENT)
    data[offset + 0] = pos[0]
    data[offset + 1] = pos[1]
    data[offset + 2] = pos[2]
    data[offset + 3] = lightType

    // direction: vec4f (xyz = direction, w = range)
    // Direction is derived from rotation (matches WebGL rotationToDirection()).
    // Pre-normalized on CPU so WGSL avoids per-pixel fastNormalize on the
    // directional/spot path. Zero-length input falls back to (0, 1, 0) to
    // mirror WGSL's fastNormalize semantics (LEN_SQ_THRESHOLD = EPS_POSITION²).
    const rot = normalizeRotationTupleSigned(
      sanitizeVector3(lightRecord.rotation, [0, 0, 0], Number.MAX_SAFE_INTEGER)
    )
    const direction = rotationToDirection(rot)
    const dx = direction[0]
    const dy = direction[1]
    const dz = direction[2]
    const lenSq = dx * dx + dy * dy + dz * dz
    if (lenSq < 1e-8) {
      data[offset + 4] = 0
      data[offset + 5] = 1
      data[offset + 6] = 0
    } else {
      const invLen = 1 / Math.sqrt(lenSq)
      data[offset + 4] = dx * invLen
      data[offset + 5] = dy * invLen
      data[offset + 6] = dz * invLen
    }
    data[offset + 7] = clampRange(finiteNumber(lightRecord.range, 0))

    // color: vec4f (rgb = linear color, a = intensity)
    const lightColor = parseHexColorToLinearRgb(
      typeof lightRecord.color === 'string' ? lightRecord.color : '#ffffff',
      [1, 1, 1]
    )
    data[offset + 8] = lightColor[0]
    data[offset + 9] = lightColor[1]
    data[offset + 10] = lightColor[2]
    data[offset + 11] = clampIntensity(finiteNumber(lightRecord.intensity, 1))

    // params: vec4f (x = decay, y = spotCosInner, z = spotCosOuter, w = enabled)
    // Spot cone cosines are derived from coneAngle + penumbra (matches WebGL CPU packing).
    const coneAngle = clampConeAngle(finiteNumber(lightRecord.coneAngle, 30))
    const penumbra = clampPenumbra(finiteNumber(lightRecord.penumbra, 0))
    const outerAngleRad = (coneAngle * Math.PI) / 180
    const innerAngleRad = outerAngleRad * (1.0 - penumbra)
    data[offset + 12] = clampDecay(finiteNumber(lightRecord.decay, 2))
    data[offset + 13] = Math.cos(innerAngleRad)
    data[offset + 14] = Math.cos(outerAngleRad)
    data[offset + 15] = lightType === 0 || lightRecord.enabled === false ? 0.0 : 1.0
  }

  // ambientColor: vec3f
  const ambientColor = parseHexColorToLinearRgb(lighting.ambientColor ?? '#ffffff', [1, 1, 1])
  data[LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET] = ambientColor[0]
  data[LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET + 1] = ambientColor[1]
  data[LIGHTING_AMBIENT_COLOR_FLOAT_OFFSET + 2] = ambientColor[2]

  // ambientIntensity: f32 (multiply by enabled flag like WebGL uAmbientEnabled)
  data[LIGHTING_AMBIENT_INTENSITY_FLOAT_OFFSET] =
    (lighting.ambientEnabled !== false ? 1 : 0) *
    finiteNumberInRange(lighting.ambientIntensity, 0, 1, 0.3)

  // lightCount: i32 (use DataView for correct type)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  view.setInt32(LIGHTING_LIGHT_COUNT_BYTE_OFFSET, lightCount, true)
}
