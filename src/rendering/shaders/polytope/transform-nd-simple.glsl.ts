import { MAX_EXTRA_DIMS } from '../../renderers/Polytope/constants'

/**
 * Simplified N-D Transformation Block for Screen-Space Normal Mode
 *
 * This is a lightweight version of transform-nd.glsl.ts that:
 * 1. Only transforms THIS vertex (no neighbor vertices)
 * 2. Does NOT include modulation (breathing animation disabled)
 * 3. Uses only 3 attribute slots instead of 9
 *
 * Used when dimension >= SCREEN_SPACE_NORMAL_MIN_DIMENSION.
 * Normal computation happens in fragment shader via dFdx/dFdy derivatives.
 *
 * Attribute usage:
 *   - position (vec3) = 1 slot
 *   - aExtraDims0_3 (vec4) = 1 slot (dims 4-7)
 *   - aExtraDims4_6 (vec3) = 1 slot (dims 8-10)
 *   Total: 3 slots (67% reduction from 9 slots in neighbor-based mode)
 *
 * @see transform-nd.glsl.ts for the full version with neighbor support
 * @see constants.ts SCREEN_SPACE_NORMAL_MIN_DIMENSION for threshold config
 */
export const transformNDSimpleBlock = `
    // N-D Transformation uniforms
    uniform mat4 uRotationMatrix4D;
    uniform int uDimension;
    uniform float uUniformScale;  // Applied AFTER projection (like camera zoom)
    uniform float uProjectionDistance;
    uniform float uExtraRotationCols[${MAX_EXTRA_DIMS * 4}];
    uniform float uDepthRowSums[11];
    uniform float uDepthNormFactor;  // Precomputed: dimension > 4 ? sqrt(dimension - 3) : 1.0

    // Extra dimension attributes for THIS vertex only (packed into vec4 + vec3)
    // NO neighbor attributes - normal computed in fragment shader via dFdx/dFdy
    in vec4 aExtraDims0_3;  // dims 4-7 (w component of 4D + first 3 extra)
    in vec3 aExtraDims4_6;  // dims 8-10 (remaining 3 extra dims)

    /**
     * Transform the current vertex from N-D to 3D.
     *
     * IMPORTANT: Scale is applied AFTER projection, not before rotation.
     * This preserves N-D geometry and prevents extreme values during rotation.
     *
     * NO modulation is applied in this version - breathing animation is disabled
     * when using screen-space normals to ensure stable derivative computation.
     */
    vec3 transformND() {
      // Build input array from raw (unscaled) coordinates
      float inputs[11];
      inputs[0] = position.x;
      inputs[1] = position.y;
      inputs[2] = position.z;
      inputs[3] = aExtraDims0_3.x;
      inputs[4] = aExtraDims0_3.y;
      inputs[5] = aExtraDims0_3.z;
      inputs[6] = aExtraDims0_3.w;
      inputs[7] = aExtraDims4_6.x;
      inputs[8] = aExtraDims4_6.y;
      inputs[9] = aExtraDims4_6.z;
      inputs[10] = 0.0;

      // Apply rotation to first 4 dimensions (unscaled)
      vec4 pos4 = vec4(inputs[0], inputs[1], inputs[2], inputs[3]);
      vec4 rotated = uRotationMatrix4D * pos4;

      // Add contribution from extra dimensions (5D+)
      // OPTIMIZATION: Use early break instead of conditional inside loop
      for (int i = 0; i < ${MAX_EXTRA_DIMS}; i++) {
        if (i + 5 > uDimension) break;
        float extraDimValue = inputs[i + 4];
        int baseIdx = i * 4;
        rotated.x += uExtraRotationCols[baseIdx] * extraDimValue;
        rotated.y += uExtraRotationCols[baseIdx + 1] * extraDimValue;
        rotated.z += uExtraRotationCols[baseIdx + 2] * extraDimValue;
        rotated.w += uExtraRotationCols[baseIdx + 3] * extraDimValue;
      }

      // Perspective projection: compute effective depth from higher dimensions
      float effectiveDepth = rotated.w;
      for (int j = 0; j < 11; j++) {
        if (j >= uDimension) break;
        effectiveDepth += uDepthRowSums[j] * inputs[j];
      }
      // Normalize depth for consistent visual scale across dimensions.
      // uDepthNormFactor is precomputed on CPU: dimension > 4 ? sqrt(dimension - 3) : 1.0
      effectiveDepth /= uDepthNormFactor;

      // Guard against division by zero when effectiveDepth approaches projectionDistance
      float denom = uProjectionDistance - effectiveDepth;
      if (abs(denom) < 0.0001) denom = denom >= 0.0 ? 0.0001 : -0.0001;
      float factor = 1.0 / denom;

      // Project to 3D, then apply uniform scale (like camera zoom)
      vec3 projected = rotated.xyz * factor * uUniformScale;

      return projected;
    }
`
