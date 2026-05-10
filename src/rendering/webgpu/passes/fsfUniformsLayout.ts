/**
 * FreeScalarUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `FreeScalarUniforms` struct in
 * `shaders/schroedinger/compute/freeScalarInit.wgsl.ts` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from `FreeScalarFieldComputePassUniforms.ts`.
 *
 * Validated at test time by parsing the WGSL template literal and comparing
 * field names, types, and computed offsets.
 *
 * @module rendering/webgpu/passes/fsfUniformsLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the FreeScalarUniforms WGSL struct.
 *
 * Order and types must match `freeScalarInit.wgsl.ts` exactly.
 * No fields begin with `_`; the struct contains no padding/reserved slots.
 */
const FSF_UNIFORMS_FIELDS = [
  // --- Scalars (offset 0-15) ---
  { name: 'latticeDim', type: 'u32' },
  { name: 'totalSites', type: 'u32' },
  { name: 'mass', type: 'f32' },
  { name: 'dt', type: 'f32' },

  // --- Per-dimension arrays (offset 16-159) ---
  { name: 'gridSize', type: arr('u32', 12) },
  { name: 'strides', type: arr('u32', 12) },
  { name: 'spacing', type: arr('f32', 12) },

  // --- Init/display scalars (offset 160-191) ---
  { name: 'initCondition', type: 'u32' },
  { name: 'fieldView', type: 'u32' },
  { name: 'stepsPerFrame', type: 'u32' },
  { name: 'packetWidth', type: 'f32' },
  { name: 'packetAmplitude', type: 'f32' },
  { name: 'maxFieldValue', type: 'f32' },
  { name: 'boundingRadius', type: 'f32' },
  { name: 'analysisMode', type: 'u32' },

  // --- Per-dimension init arrays (offset 192-335) ---
  { name: 'packetCenter', type: arr('f32', 12) },
  { name: 'modeK', type: arr('i32', 12) },
  { name: 'slicePositions', type: arr('f32', 12) },

  // --- Basis vectors for N-D -> 3D projection (offset 336-479) ---
  { name: 'basisX', type: arr('f32', 12) },
  { name: 'basisY', type: arr('f32', 12) },
  { name: 'basisZ', type: arr('f32', 12) },

  // --- Self-interaction parameters (offset 480-495) ---
  { name: 'selfInteractionEnabled', type: 'u32' },
  { name: 'selfInteractionLambda', type: 'f32' },
  { name: 'selfInteractionVev', type: 'f32' },
  { name: 'absorberEnabled', type: 'u32' },

  // --- PML absorber + cosmology coefficients (offset 496-511) ---
  { name: 'absorberWidth', type: 'f32' },
  { name: 'absorberStrength', type: 'f32' },
  { name: 'aKinetic', type: 'f32' },
  { name: 'aPotential', type: 'f32' },

  // --- Cosmology + preheating + Bianchi-I anisotropy (offset 512-527) ---
  { name: 'aFull', type: 'f32' },
  { name: 'massSquaredScale', type: 'f32' },
  { name: 'aPotentialRatio1', type: 'f32' },
  { name: 'aPotentialRatio2', type: 'f32' },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for FreeScalarUniforms. */
export const FSF_UNIFORMS_LAYOUT = computeStructLayout(FSF_UNIFORMS_FIELDS)

/** Total byte size of the FreeScalarUniforms GPU buffer (derived from layout). */
export const FSF_UNIFORMS_SIZE = FSF_UNIFORMS_LAYOUT.totalSize
