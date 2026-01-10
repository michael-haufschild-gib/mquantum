export const temporalBlock = `
// ============================================
// Temporal Reprojection (Position-Based)
// ============================================
// Uses actual per-pixel world position from previous frame's gPosition buffer
// and RECALCULATES the distance along the CURRENT ray. This correctly handles
// camera rotation where the ray at UV (0.5, 0.5) points in a different
// direction than it did last frame.

/**
 * Get temporal depth hint for raymarching acceleration.
 *
 * Algorithm:
 * 1. Sample previous frame's gPosition at current UV to get model-space position
 * 2. Calculate distance along the CURRENT ray to that point
 * 3. Validate that the point is actually on the current ray (perpendicular distance check)
 * 4. Return distance as skip hint
 *
 * Returns model-space ray distance, or -1.0 if invalid/unavailable.
 */
float getTemporalDepth(vec3 ro, vec3 rd, vec3 worldRayDir) {
    if (!uTemporalEnabled) {
        return -1.0;
    }

    // CRITICAL: Use screen coordinates for sampling the previous frame's MRT
    // uPrevPositionTexture is a screen-space render target, so we must use
    // gl_FragCoord to get actual screen position (not mesh texture coordinates)
    // Use uDepthBufferResolution (temporal buffer size) not uResolution (may differ)
    vec2 screenUV = gl_FragCoord.xy / uDepthBufferResolution;

    // Sample previous frame's position buffer at current screen position
    // gPosition.xyz = model-space position, gPosition.w = model-space ray distance
    vec4 prevPositionData = texture(uPrevPositionTexture, screenUV);

    // Check if we have valid position data (.w > 0 indicates valid hit)
    // Discarded fragments or sky will have .w = 0
    float storedDist = prevPositionData.w;
    if (storedDist <= 0.01) {
        return -1.0;  // No valid hit in previous frame at this pixel
    }

    // Get the MODEL-SPACE position that was hit at this screen location in the previous frame
    vec3 prevModelPos = prevPositionData.xyz;

    // Calculate distance along CURRENT ray to the previous hit point
    // Project the hit point onto the current ray: d = dot(P - O, D) for normalized D
    vec3 toHit = prevModelPos - ro;
    float projDistance = dot(toHit, rd);

    // Early rejection: point is behind the camera
    if (projDistance <= 0.0) {
        return -1.0;
    }

    // Validation: Is the previous hit actually ON the current ray?
    // Calculate perpendicular distance from hit point to ray
    vec3 closestOnRay = ro + rd * projDistance;
    float perpDist = length(prevModelPos - closestOnRay);

    // Reject if perpendicular distance is too large
    // This happens when camera rotates - the old hit is no longer along the new ray
    // Threshold: 5% of distance or 0.1 minimum, whichever is larger
    float threshold = max(0.1, projDistance * 0.05);

    if (perpDist > threshold) {
        return -1.0;  // Previous hit not along current ray (camera rotated too much)
    }

    // PERF: Disocclusion detection using 2 diagonal samples instead of 4 orthogonal
    // Diagonals still detect edges effectively while reducing texture reads by 40%
    vec2 texelSize = 1.0 / uDepthBufferResolution;
    float distTopLeft = texture(uPrevPositionTexture, screenUV + vec2(-texelSize.x, texelSize.y)).w;
    float distBottomRight = texture(uPrevPositionTexture, screenUV + vec2(texelSize.x, -texelSize.y)).w;

    // Use relative threshold for discontinuity detection
    float avgDist = (distTopLeft + distBottomRight + storedDist) * 0.333;
    float maxNeighborDiff = max(
        abs(storedDist - distTopLeft),
        abs(storedDist - distBottomRight)
    );

    // Threshold: 20% relative difference indicates edge/discontinuity
    float relativeThreshold = max(0.20 * avgDist, 0.05);  // At least 0.05 absolute
    if (maxNeighborDiff > relativeThreshold) {
        return -1.0;  // Depth discontinuity - temporal data unreliable
    }

    // Return the stored distance directly
    // Safety margin is applied in core.glsl.ts via uTemporalSafetyMargin uniform
    return max(0.0, storedDist);
}
`
