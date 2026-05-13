/**
 * QualityUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `QualityUniforms` struct embedded in
 * `shaders/shared/core/uniforms.wgsl.ts::uniformsBlock` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from
 * `uniformPackingSupport.ts::packQualityUniforms`.
 *
 * Reserved (`_`-prefixed) fields are bulk-zeroed via `zeroReservedFields`.
 * Most fields here are reserved — only `sdfMaxIterations`, `sdfSurfaceDistance`,
 * and `qualityMultiplier` are live; the rest are slots kept for buffer-layout
 * compatibility with shader code that previously consumed them.
 *
 * @module rendering/webgpu/renderers/qualityLayout
 */

import { computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the QualityUniforms WGSL struct.
 *
 * Order and types must match `QUALITY_UNIFORMS_STRUCT` in
 * `shared/core/uniforms.wgsl.ts` exactly. Fields starting with `_` are
 * reserved (formerly shadow / AO quality controls — removed) and are
 * bulk-zeroed by `zeroReservedFields`.
 */
const QUALITY_FIELDS = [
  // --- SDF raymarching quality (offset 0..7) ---
  { name: 'sdfMaxIterations', type: 'i32' },
  { name: 'sdfSurfaceDistance', type: 'f32' },

  // --- Reserved: formerly shadow + AO quality (offset 8..31) ---
  { name: '_reservedShadowQuality', type: 'i32' },
  { name: '_reservedShadowSoftness', type: 'f32' },
  { name: '_reservedAoEnabled', type: 'i32' },
  { name: '_reservedAoSamples', type: 'i32' },
  { name: '_reservedAoRadius', type: 'f32' },
  { name: '_reservedAoIntensity', type: 'f32' },

  // --- Global quality multiplier (offset 32..39) ---
  { name: 'qualityMultiplier', type: 'f32' },
  { name: '_reservedDebug', type: 'i32' },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for QualityUniforms. */
export const QUALITY_UNIFORMS_LAYOUT = computeStructLayout(QUALITY_FIELDS)

/** Total byte size of the QualityUniforms GPU buffer (derived from layout). */
export const QUALITY_UNIFORMS_SIZE = QUALITY_UNIFORMS_LAYOUT.totalSize
