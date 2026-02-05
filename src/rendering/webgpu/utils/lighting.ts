/**
 * WebGPU Lighting Uniform Packing Helpers
 *
 * Converts Zustand lighting store state into the packed LightingUniforms layout
 * expected by WGSL shaders.
 *
 * @module rendering/webgpu/utils/lighting
 */

import type { LightSource } from '../../lights/types'
import { rotationToDirection } from '../../lights/types'
import { parseHexColorToLinearRgb } from './color'

/**
 * Minimal subset of the lighting store used by WebGPU renderers.
 * This keeps renderers decoupled from Zustand slice types.
 */
export interface WebGPULightingState {
  lights?: LightSource[]
  ambientColor?: string
  ambientIntensity?: number
  ambientEnabled?: boolean
}

/**
 * Fill a Float32Array with the packed LightingUniforms layout.
 *
 * WGSL layout (float indices):
 * - lights: 8 × LightData @ 0..127 (each LightData = 16 floats)
 * - ambientColor: vec3f @ 128..130
 * - ambientIntensity: f32 @ 131
 * - lightCount: i32 @ byte offset 132*4
 * - padding @ 133..143
 *
 * LightData layout (16 floats):
 * - position: vec4f  (xyz=position, w=type)
 * - direction: vec4f (xyz=direction, w=range)
 * - color: vec4f     (rgb=linear color, a=intensity)
 * - params: vec4f    (x=decay, y=spotCosInner, z=spotCosOuter, w=enabled(0/1))
 *
 * @param data Output array (must be length >= 144)
 * @param lighting Lighting state from stores
 */
export function packLightingUniforms(data: Float32Array, lighting: WebGPULightingState): void {
  if (data.length < 144) {
    throw new Error(`packLightingUniforms: expected data length >= 144, got ${data.length}`)
  }

  data.fill(0)

  const lights = lighting.lights ?? []
  const lightCount = Math.min(lights.length, 8)

  for (let i = 0; i < lightCount; i++) {
    const light = lights[i]
    if (!light) continue
    const offset = i * 16

    // position: vec4f (xyz = position, w = type)
    // Must match WGSL constants: LIGHT_TYPE_POINT=1, LIGHT_TYPE_DIRECTIONAL=2, LIGHT_TYPE_SPOT=3
    const lightType = light.type === 'directional' ? 2 : light.type === 'spot' ? 3 : 1
    const pos = light.position ?? [0, 0, 0]
    data[offset + 0] = pos[0]
    data[offset + 1] = pos[1]
    data[offset + 2] = pos[2]
    data[offset + 3] = lightType

    // direction: vec4f (xyz = direction, w = range)
    // Direction is derived from rotation (matches WebGL rotationToDirection()).
    const rot = light.rotation ?? [0, 0, 0]
    const direction = rotationToDirection(rot)
    data[offset + 4] = direction[0]
    data[offset + 5] = direction[1]
    data[offset + 6] = direction[2]
    data[offset + 7] = light.range ?? 0

    // color: vec4f (rgb = linear color, a = intensity)
    const lightColor = parseHexColorToLinearRgb(light.color, [1, 1, 1])
    data[offset + 8] = lightColor[0]
    data[offset + 9] = lightColor[1]
    data[offset + 10] = lightColor[2]
    data[offset + 11] = light.intensity ?? 1

    // params: vec4f (x = decay, y = spotCosInner, z = spotCosOuter, w = enabled)
    // Spot cone cosines are derived from coneAngle + penumbra (matches WebGL CPU packing).
    const coneAngle = light.coneAngle ?? 30
    const penumbra = light.penumbra ?? 0
    const outerAngleRad = (coneAngle * Math.PI) / 180
    const innerAngleRad = outerAngleRad * (1.0 - penumbra)
    data[offset + 12] = light.decay ?? 2
    data[offset + 13] = Math.cos(innerAngleRad)
    data[offset + 14] = Math.cos(outerAngleRad)
    data[offset + 15] = light.enabled !== false ? 1.0 : 0.0
  }

  // ambientColor: vec3f at offset 128
  const ambientColor = parseHexColorToLinearRgb(lighting.ambientColor ?? '#ffffff', [1, 1, 1])
  data[128] = ambientColor[0]
  data[129] = ambientColor[1]
  data[130] = ambientColor[2]

  // ambientIntensity: f32 at offset 131 (multiply by enabled flag like WebGL uAmbientEnabled)
  data[131] = (lighting.ambientEnabled !== false ? 1 : 0) * (lighting.ambientIntensity ?? 0.3)

  // lightCount: i32 at offset 132 (use DataView for correct type)
  const view = new DataView(data.buffer)
  view.setInt32(132 * 4, lightCount, true)
}
