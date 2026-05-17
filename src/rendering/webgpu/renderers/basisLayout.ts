/**
 * BasisVectors struct layout constants.
 *
 * Mirrors `shaders/schroedinger/uniforms.wgsl.ts::BasisVectors`: four
 * D-dimensional vectors packed as `array<vec4f, N>`, where N is derived from
 * `MAX_DIM`.
 *
 * @module rendering/webgpu/renderers/basisLayout
 */

import { MAX_DIM } from '../shaders/schroedinger/uniforms.wgsl'

const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT
const VEC4_FLOAT_LENGTH = 4

/** Number of vec4 slots needed to store one MAX_DIM basis/origin vector. */
export const BASIS_VECTOR_VEC4_LENGTH = Math.ceil(MAX_DIM / VEC4_FLOAT_LENGTH)

/** Float32 stride for one basis/origin vector. */
export const BASIS_VECTOR_FLOAT_STRIDE = BASIS_VECTOR_VEC4_LENGTH * VEC4_FLOAT_LENGTH

/** BasisVectors fields: basisX, basisY, basisZ, origin. */
export const BASIS_VECTOR_FIELD_COUNT = 4

/** Float32 element count for BasisVectors staging arrays. */
export const BASIS_UNIFORMS_FLOAT_LENGTH =
  BASIS_VECTOR_FIELD_COUNT * BASIS_VECTOR_FLOAT_STRIDE

/** Total byte size of the BasisVectors GPU buffer. */
export const BASIS_UNIFORMS_SIZE = BASIS_UNIFORMS_FLOAT_LENGTH * FLOAT32_BYTES
