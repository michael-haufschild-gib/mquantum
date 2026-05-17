/**
 * MaterialUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `MaterialUniforms` struct embedded in
 * `shaders/shared/core/uniforms.wgsl.ts::uniformsBlock` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from
 * `uniformPackingSupport.ts::packMaterialUniforms`.
 *
 * Reserved (`_`-prefixed) fields are bulk-zeroed via `zeroReservedFields`.
 *
 * @module rendering/webgpu/renderers/materialLayout
 */

import { computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the MaterialUniforms WGSL struct.
 *
 * Order and types must match `MATERIAL_UNIFORMS_STRUCT` in
 * `shared/core/uniforms.wgsl.ts` exactly. Fields starting with `_` are
 * reserved (formerly Fresnel rim / explicit alignment padding) and are
 * bulk-zeroed by `zeroReservedFields`.
 */
const MATERIAL_FIELDS = [
  // --- Core PBR (offset 0..31) ---
  { name: 'baseColor', type: 'vec4f' },
  { name: 'metallic', type: 'f32' },
  { name: 'roughness', type: 'f32' },
  { name: 'reflectance', type: 'f32' },
  { name: 'ao', type: 'f32' },

  // --- Emissive + transparency (offset 32..63) ---
  { name: 'emissive', type: 'vec3f' },
  { name: 'emissiveIntensity', type: 'f32' },
  { name: 'ior', type: 'f32' },
  { name: 'transmission', type: 'f32' },
  { name: 'thickness', type: 'f32' },
  { name: 'sssEnabled', type: 'u32' },

  // --- Subsurface scattering (offset 64..99) ---
  // sssIntensity (f32) is followed by sssColor (vec3f) — vec3f's 16-byte
  // alignment pushes sssColor from byte 68 → 80, leaving an implicit
  // 12-byte padding gap that no field occupies.
  { name: 'sssIntensity', type: 'f32' },
  { name: 'sssColor', type: 'vec3f' },
  { name: 'sssThickness', type: 'f32' },
  { name: 'sssJitter', type: 'f32' },

  // --- Reserved: formerly Fresnel rim (offset 100..127) ---
  { name: '_reserved_fresnel0', type: 'u32' },
  { name: '_reserved_fresnel1', type: 'f32' },
  { name: '_reserved_fresnel2', type: 'vec3f' },
  { name: '_padding2', type: 'f32' },

  // --- Specular (offset 128..159) ---
  // specularIntensity (f32) is followed by specularColor (vec3f), so vec3f
  // alignment leaves an implicit padding gap before specularColor.
  { name: 'specularIntensity', type: 'f32' },
  { name: 'specularColor', type: 'vec3f' },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for MaterialUniforms. */
export const MATERIAL_UNIFORMS_LAYOUT = computeStructLayout(MATERIAL_FIELDS)

/** Total byte size of the MaterialUniforms GPU buffer (derived from layout). */
export const MATERIAL_UNIFORMS_SIZE = MATERIAL_UNIFORMS_LAYOUT.totalSize

/** Float32 element count for MaterialUniforms staging arrays. */
export const MATERIAL_UNIFORMS_FLOAT_LENGTH =
  MATERIAL_UNIFORMS_SIZE / Float32Array.BYTES_PER_ELEMENT
