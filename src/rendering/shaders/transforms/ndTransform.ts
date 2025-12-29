/**
 * N-Dimensional GPU Transform System
 *
 * Provides utilities for performing N-dimensional transformations on the GPU:
 * - Rotation matrix application in vertex shaders
 * - Perspective projection
 * - Scale transformations
 *
 * Architecture:
 * - CPU: Compose rotation matrix from individual plane rotations
 * - GPU: Apply composed matrix to vertices via vertex shader
 *
 * This hybrid approach keeps the complex matrix composition on CPU
 * while parallelizing the per-vertex multiplication on GPU.
 *
 * ## N-Dimensional Depth Normalization
 *
 * When projecting from N dimensions to 3D, we need to compute an "effective depth"
 * from the higher dimensions (4D+). This depth is used for perspective division:
 *
 * ```
 * projectedXYZ = xyz / (projectionDistance - effectiveDepth)
 * ```
 *
 * ### The Normalization Problem
 *
 * The naive approach sums all higher-dimension coordinates:
 * ```
 * effectiveDepth = sum(coord[3], coord[4], ..., coord[n-1])
 * ```
 *
 * However, this causes problems: as dimension increases, the sum magnitude grows
 * proportionally, causing inconsistent visual scaling across dimensions.
 *
 * ### Mathematical Justification for sqrt(n-3) Normalization
 *
 * We normalize by `sqrt(n-3)` where n is the dimension count. This is based on
 * standard deviation scaling from probability theory:
 *
 * If we model each higher-dimension coordinate as an independent random variable
 * with mean μ and variance σ², then:
 * - Sum of (n-3) coordinates has variance: (n-3) × σ²
 * - Standard deviation of sum: sqrt(n-3) × σ
 *
 * Dividing by sqrt(n-3) normalizes the effective depth to have similar expected
 * magnitude regardless of dimension count, assuming coordinates are similarly
 * distributed.
 *
 * ### Normalization Factor by Dimension
 *
 * | Dimension | Higher Dims (n-3) | sqrt(n-3) | Effect |
 * |-----------|-------------------|-----------|--------|
 * | 4D        | 1                 | 1.000     | Direct w usage |
 * | 5D        | 2                 | 1.414     | Moderate normalization |
 * | 6D        | 3                 | 1.732     | |
 * | 7D        | 4                 | 2.000     | |
 * | 11D       | 8                 | 2.828     | Maximum normalization |
 *
 * ### Implementation Notes
 *
 * - GPU shaders use: `sqrt(max(1.0, float(dimension - 3)))`
 * - The max(1.0, ...) ensures safe operation for dimension ≤ 4
 * - CPU code uses: `Math.sqrt(Math.max(1, dimension - 3))`
 * - Both must stay synchronized for consistent rendering
 *
 * @see {@link DEPTH_NORMALIZATION_BASE_DIMENSION} - The dimension offset (3)
 * @see {@link generateDepthNormalizationGLSL} - GLSL code generator
 * @see src/lib/math/projection.ts - CPU-side equivalent implementation
 */

import type { MatrixND } from '@/lib/math/types'
import { Matrix4 } from 'three'

/**
 * Maximum dimension supported for GPU transforms.
 * WebGL uniform limits constrain array sizes.
 */
export const MAX_GPU_DIMENSION = 11

/**
 * Size of extra dimensions array (dimensions beyond 4D).
 * For 11D max: 11 - 4 = 7 extra dimensions per vertex.
 */
export const EXTRA_DIMS_SIZE = MAX_GPU_DIMENSION - 4

/**
 * Base dimension for depth normalization calculation.
 *
 * The normalization factor is `sqrt(dimension - DEPTH_NORMALIZATION_BASE_DIMENSION)`.
 * Using 3 means we start normalizing at 4D (one higher dimension).
 *
 * Mathematical basis: We're combining (dimension - 3) coordinate values into
 * a single depth, and dividing by sqrt of count normalizes the variance.
 *
 * @see Module documentation for full mathematical justification
 */
export const DEPTH_NORMALIZATION_BASE_DIMENSION = 3

/**
 * Generates GLSL code for calculating the depth normalization factor.
 *
 * This centralizes the normalization logic to ensure consistency across all shaders.
 * The formula `sqrt(max(1.0, dimension - 3))` provides:
 * - Safe handling of dimensions ≤ 4 (returns 1.0)
 * - Proper sqrt normalization for 5D+ dimensions
 *
 * @param dimensionUniform - Name of the dimension uniform variable
 * @returns GLSL expression string for the normalization factor
 *
 * @example
 * ```glsl
 * float normFactor = ${generateDepthNormalizationGLSL('uDimension')};
 * effectiveDepth /= normFactor;
 * ```
 */
export function generateDepthNormalizationGLSL(dimensionUniform: string = 'uDimension'): string {
  return `(${dimensionUniform} > 4 ? sqrt(max(1.0, float(${dimensionUniform} - ${DEPTH_NORMALIZATION_BASE_DIMENSION}))) : 1.0)`
}

/**
 * Calculates the depth normalization factor for CPU-side projection.
 *
 * Must match the GPU implementation in {@link generateDepthNormalizationGLSL}.
 *
 * @param dimension - Current dimension (3-11)
 * @returns Normalization factor (1.0 for dimension ≤ 4, sqrt(n-3) otherwise)
 */
export function calculateDepthNormalizationFactor(dimension: number): number {
  if (dimension <= 4) return 1.0
  return Math.sqrt(Math.max(1, dimension - DEPTH_NORMALIZATION_BASE_DIMENSION))
}

/**
 * Interface for the GPU uniform data structure to support object reuse
 */
export interface NDTransformGPUData {
  rotationMatrix4D: Matrix4
  extraRotationData: Float32Array
  extraRotationCols: Float32Array
  depthRowSums: Float32Array
  dimension: number
}

/**
 * Converts an N-dimensional rotation matrix to GPU-compatible uniforms.
 *
 * For dimensions 1-4: Uses a single mat4
 * For dimensions 5-11: Uses mat4 for first 4x4 block + extra arrays for:
 *   - extraRotationCols: How dimensions 5+ affect the first 4 outputs (x,y,z,w)
 *   - depthRowSums: For each input dim, sum of how it contributes to dims 4+
 *
 * @param matrix - N-dimensional rotation matrix
 * @param dimension - Current dimension
 * @param out - Optional output object to avoid allocation
 * @returns Object with mat4 and extra rotation data for full N-D rotation
 */
export function matrixToGPUUniforms(
  matrix: MatrixND,
  dimension: number,
  out?: NDTransformGPUData
): NDTransformGPUData {
  const result = out ?? {
    rotationMatrix4D: new Matrix4(),
    extraRotationData: new Float32Array(
      Math.max((MAX_GPU_DIMENSION - 4) * MAX_GPU_DIMENSION * 2, 1)
    ),
    extraRotationCols: new Float32Array(EXTRA_DIMS_SIZE * 4),
    depthRowSums: new Float32Array(MAX_GPU_DIMENSION),
    dimension: dimension,
  }

  result.dimension = dimension

  // Create mat4 for first 4x4 block (row-major to column-major for Three.js)
  const mat4Elements = result.rotationMatrix4D.elements

  // Copy the first 4x4 block (or smaller if dimension < 4)
  const size = Math.min(dimension, 4)

  // Clear matrix first (identity)
  result.rotationMatrix4D.identity()

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Three.js Matrix4 uses column-major order
      // Access flat matrix: matrix[row * dimension + col]
      mat4Elements[col * 4 + row] = matrix[row * dimension + col] ?? (row === col ? 1 : 0)
    }
  }

  // Clear extra arrays
  result.extraRotationData.fill(0)
  result.extraRotationCols.fill(0)
  result.depthRowSums.fill(0)

  if (dimension > 4) {
    let idx = 0
    // Store extra rows (rows 4+)
    for (let row = 4; row < dimension; row++) {
      for (let col = 0; col < dimension; col++) {
        result.extraRotationData[idx++] = matrix[row * dimension + col] ?? 0
      }
    }
    // Store extra columns for first 4 rows (cols 4+)
    for (let row = 0; row < 4; row++) {
      for (let col = 4; col < dimension; col++) {
        result.extraRotationData[idx++] = matrix[row * dimension + col] ?? 0
      }
    }

    // Build extraRotationCols in shader-friendly format
    const numExtraDims = Math.max(dimension - 4, 0)
    // For each extra dimension i (0 = dim 5, 1 = dim 6, etc.)
    for (let extraIdx = 0; extraIdx < numExtraDims; extraIdx++) {
      const col = extraIdx + 4 // The actual column in the matrix
      // Store how this extra dimension affects outputs 0,1,2,3 (x,y,z,w)
      for (let row = 0; row < 4; row++) {
        result.extraRotationCols[extraIdx * 4 + row] = matrix[row * dimension + col] ?? 0
      }
    }

    // Build depthRowSums: for each input column j, sum matrix[i][j] for i >= 4
    for (let col = 0; col < dimension; col++) {
      let sum = 0
      for (let row = 4; row < dimension; row++) {
        sum += matrix[row * dimension + col] ?? 0
      }
      result.depthRowSums[col] = sum
    }
  }

  return result
}

/**
 * Generates GLSL code for N-dimensional vertex transformation.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * The shader expects:
 * - position: vec3 (first 3 components)
 * - extraDimensions: float[7] attribute (components 4-11)
 * - rotationMatrix4D: mat4 uniform
 * - extraRotationData: float[] uniform (for dims > 4)
 * - uUniformScale: float uniform (applied after projection)
 *
 * @param maxDimension - Maximum dimension to support (default: 11)
 * @returns GLSL vertex shader code for transformation
 */
export function generateNDTransformVertexShader(maxDimension: number = MAX_GPU_DIMENSION): string {
  const extraDims = maxDimension - 4

  return `
// N-Dimensional Transform Vertex Shader
// Supports dimensions 3 to ${maxDimension}
// IMPORTANT: Scale is applied AFTER projection (like camera zoom)

// Uniforms
uniform mat4 uRotationMatrix4D;
uniform int uDimension;
uniform float uUniformScale;  // Applied AFTER projection (like camera zoom)
uniform float uExtraRotationCols[${extraDims * 4}];
uniform float uDepthRowSums[11];

// Projection uniforms
uniform float uProjectionDistance;

// Attributes for extra dimensions (beyond xyz)
in float aExtraDim0; // W (4th dimension)
${Array.from({ length: extraDims - 1 }, (_, i) => `in float aExtraDim${i + 1}; // ${i + 5}th dimension`).join('\n')}

// Outputs for fragment shader
out vec3 vNormal;
out float vDepth;

vec4 applyNDRotation(vec3 pos3, float w, float extraDims[${extraDims}]) {
  // Build full N-dimensional position vector (unscaled)
  vec4 pos4 = vec4(pos3, w);

  // Apply 4x4 rotation to first 4 dimensions
  vec4 rotated4 = uRotationMatrix4D * pos4;

  // Apply contribution from extra dimensions to the first 4 output dimensions
  // extraRotationCols stores columns 4..10 of rows 0..3
  for (int i = 0; i < ${extraDims}; i++) {
    if (i + 5 <= uDimension) {
       float val = extraDims[i];
       rotated4.x += uExtraRotationCols[i * 4 + 0] * val;
       rotated4.y += uExtraRotationCols[i * 4 + 1] * val;
       rotated4.z += uExtraRotationCols[i * 4 + 2] * val;
       rotated4.w += uExtraRotationCols[i * 4 + 3] * val;
    }
  }

  return rotated4;
}

void main() {
  // Collect extra dimensions into array (unscaled)
  float extraDims[${extraDims}];
  ${Array.from({ length: extraDims }, (_, i) => `extraDims[${i}] = aExtraDim${i};`).join('\n  ')}

  // Apply Rotation (no pre-scaling - scale is applied after projection)
  vec4 rotatedPos4 = applyNDRotation(position, aExtraDim0, extraDims);
  vec3 rotatedPos = rotatedPos4.xyz;

  // Calculate depth for projection using unscaled inputs
  float inputs[11];
  inputs[0] = position.x;
  inputs[1] = position.y;
  inputs[2] = position.z;
  inputs[3] = aExtraDim0;
  for(int i=0; i<${extraDims}; i++) inputs[4+i] = extraDims[i];

  // Initialize with W component (4th dimension)
  float rotatedDepth = rotatedPos4.w;
  for(int i=0; i<11; i++) {
     if (i < uDimension) {
        rotatedDepth += inputs[i] * uDepthRowSums[i];
     }
  }

  // Normalize depth by sqrt(dimension - 3) to maintain consistent visual scale
  // across different dimensions. See module documentation for mathematical justification.
  // Uses max(1.0, ...) to safely handle dimension <= 4 edge cases.
  float normFactor = uDimension > 4 ? sqrt(max(1.0, float(uDimension - ${DEPTH_NORMALIZATION_BASE_DIMENSION}))) : 1.0;
  float finalDepth = rotatedDepth / normFactor;

  // Guard against division by zero
  float denom = uProjectionDistance - finalDepth;
  if (abs(denom) < 0.0001) denom = denom >= 0.0 ? 0.0001 : -0.0001;
  float factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale (like camera zoom)
  vec3 projectedPos = rotatedPos * factor * uUniformScale;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(projectedPos, 1.0);

  // Pass depth for simple shading
  vDepth = (aExtraDim0 + extraDims[0]) * 0.5 + 0.5;
}
`
}

/**
 * Generates a simple fragment shader for N-dimensional objects.
 *
 * @returns GLSL fragment shader code
 */
export function generateNDTransformFragmentShader(): string {
  return `
// N-Dimensional Transform Fragment Shader
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;

in vec3 vNormal;
in float vDepth;

layout(location = 0) out vec4 fragColor;

void main() {
  // Simple depth-based color variation
  vec3 color = uColor * (0.5 + 0.5 * vDepth);

  fragColor = vec4(color, uOpacity);
}
`
}

/**
 * Creates uniforms object for N-dimensional transform shader.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @param dimension - Current dimension
 * @returns Three.js uniforms object
 */
export function createNDTransformUniforms(dimension: number): Record<string, { value: unknown }> {
  const extraDims = MAX_GPU_DIMENSION - 4

  return {
    rotationMatrix4D: { value: new Matrix4() },
    uDimension: { value: dimension },
    uUniformScale: { value: 1.0 },  // Applied AFTER projection (like camera zoom)
    uExtraRotationCols: { value: new Float32Array(extraDims * 4).fill(0) },
    uDepthRowSums: { value: new Float32Array(MAX_GPU_DIMENSION).fill(0) },
    uProjectionDistance: { value: 5.0 },
    uColor: { value: [1, 1, 1] },
    uOpacity: { value: 1.0 },
  }
}

/**
 * Updates N-dimensional transform uniforms with current state.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @param uniforms - Uniforms object to update
 * @param rotationMatrix - Composed rotation matrix
 * @param dimension - Current dimension
 * @param uniformScale - Uniform scale (applied after projection)
 * @param projectionDistance - Projection distance
 */
export function updateNDTransformUniforms(
  uniforms: Record<string, { value: unknown }>,
  rotationMatrix: MatrixND,
  dimension: number,
  uniformScale: number,
  projectionDistance: number
): void {
  // Note: This still creates garbage if not passed a target.
  // Ideally this function should be deprecated in favor of manual update
  // using matrixToGPUUniforms with a persistent target object.
  const gpuData = matrixToGPUUniforms(rotationMatrix, dimension)

  uniforms.rotationMatrix4D!.value = gpuData.rotationMatrix4D
  uniforms.uDimension!.value = dimension
  uniforms.uExtraRotationCols!.value = gpuData.extraRotationCols
  uniforms.uDepthRowSums!.value = gpuData.depthRowSums
  uniforms.uProjectionDistance!.value = projectionDistance
  uniforms.uUniformScale!.value = uniformScale
}
