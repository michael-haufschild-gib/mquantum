/**
 * CameraUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `CameraUniforms` struct in
 * `shaders/shared/core/uniforms.wgsl.ts` exactly. The layout engine computes
 * byte offsets using WGSL alignment rules, eliminating hand-computed magic
 * numbers from `uniformPackingSupport.ts::packCameraUniforms`.
 *
 * `mat4x4f` is encoded as `arr('vec4f', 4)`. Per the WGSL spec
 * (§13.4.1) a `matCxRf` host-shareable type has the same alignment (16) and
 * size (C × stride, with stride = roundUp(16, 4·R) = 16 for R = 4) as
 * `array<vec4f, C>`, so the encoding is layout-equivalent.
 *
 * Validated at test time by parsing the WGSL template literal and comparing
 * field names, types, and computed offsets.
 *
 * @module rendering/webgpu/renderers/cameraLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the CameraUniforms WGSL struct.
 *
 * Order and types must match `shared/core/uniforms.wgsl.ts::CAMERA_UNIFORMS_STRUCT`
 * exactly. Fields starting with `_` are reserved padding required for WGSL
 * alignment of subsequent vec3f fields.
 */
const CAMERA_FIELDS = [
  // --- Camera matrices (offset 0..319) ---
  { name: 'viewMatrix', type: arr('vec4f', 4) },
  { name: 'projectionMatrix', type: arr('vec4f', 4) },
  { name: 'viewProjectionMatrix', type: arr('vec4f', 4) },
  { name: 'inverseViewMatrix', type: arr('vec4f', 4) },
  { name: 'inverseProjectionMatrix', type: arr('vec4f', 4) },

  // --- Model transform matrices (offset 320..447) ---
  { name: 'modelMatrix', type: arr('vec4f', 4) },
  { name: 'inverseModelMatrix', type: arr('vec4f', 4) },

  // --- Camera scalars (offset 448..483) ---
  { name: 'cameraPosition', type: 'vec3f' },
  { name: 'cameraNear', type: 'f32' },
  { name: 'cameraFar', type: 'f32' },
  { name: 'fov', type: 'f32' },
  { name: 'resolution', type: 'vec2f' },
  { name: 'aspectRatio', type: 'f32' },

  // --- Per-frame scalars (offset 484..495) ---
  { name: 'time', type: 'f32' },
  { name: 'deltaTime', type: 'f32' },
  { name: 'frameNumber', type: 'u32' },

  // --- Temporal accumulation support (offset 496..511) ---
  { name: 'bayerOffset', type: 'vec2f' },
  { name: '_padding', type: 'vec2f' },

  // --- CPU-precomputed model-space camera position (offset 512..527) ---
  { name: 'cameraPositionModel', type: 'vec3f' },
  { name: '_paddingEnd', type: 'f32' },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for CameraUniforms. */
export const CAMERA_UNIFORMS_LAYOUT = computeStructLayout(CAMERA_FIELDS)

/** Total byte size of the CameraUniforms GPU buffer (derived from layout). */
export const CAMERA_UNIFORMS_SIZE = CAMERA_UNIFORMS_LAYOUT.totalSize
