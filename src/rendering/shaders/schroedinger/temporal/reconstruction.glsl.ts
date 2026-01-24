/**
 * Reconstruction shader for temporal cloud accumulation
 *
 * Combines freshly rendered quarter-res pixels with reprojected history
 * to produce the full-resolution accumulated cloud image.
 */

export const reconstructionVertexShader = `
out vec2 vUv;

void main() {
    vUv = uv;
    // Direct NDC output for fullscreen quad
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const reconstructionFragmentShader = `
precision highp float;

in vec2 vUv;

// New quarter-res cloud render (color)
uniform sampler2D uCloudRender;

// New quarter-res cloud positions (from MRT attachment 1)
uniform sampler2D uCloudPosition;

// Reprojected history color (from reprojection pass)
uniform sampler2D uReprojectedHistory;

// Reprojected history positions (from position accumulation buffer)
uniform sampler2D uReprojectedPositionHistory;

// Validity mask (from reprojection pass)
uniform sampler2D uValidityMask;

// Current Bayer offset (determines which pixel was rendered this frame)
uniform vec2 uBayerOffset;

// Frame index for debugging
uniform int uFrameIndex;

// Resolution
uniform vec2 uCloudResolution;
uniform vec2 uAccumulationResolution;

// Blend weight for history (0.0 = favor new, 1.0 = favor history)
uniform float uHistoryWeight;

// Whether this is one of the first frames (no valid history yet)
uniform bool uHasValidHistory;

// MRT outputs: color (loc 0) and position (loc 1)
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragPosition;

/**
 * Sample color from quarter-res cloud buffer for a given full-res pixel coordinate.
 * Maps full-res pixel to the corresponding quarter-res location.
 */
vec4 sampleCloudColorAtPixel(ivec2 fullResPixel) {
    // Each 2x2 block in full-res maps to one pixel in quarter-res
    // The quarter-res pixel contains the rendered value for one of the 4 pixels
    vec2 quarterUV = (vec2(fullResPixel / 2) + 0.5) / uCloudResolution;
    return texture(uCloudRender, quarterUV);
}

/**
 * Sample position from quarter-res cloud buffer for a given full-res pixel coordinate.
 */
vec4 sampleCloudPositionAtPixel(ivec2 fullResPixel) {
    vec2 quarterUV = (vec2(fullResPixel / 2) + 0.5) / uCloudResolution;
    return texture(uCloudPosition, quarterUV);
}

/**
 * Sample color from neighbors in the quarter-res buffer for spatial interpolation.
 * Used when there's no valid history - reconstructs from nearby rendered pixels.
 */
vec4 spatialInterpolationColorFromCloud(ivec2 fullResPixel) {
    // Find the 2x2 block this pixel belongs to
    ivec2 blockBase = (fullResPixel / 2) * 2;

    // The Bayer offset tells us which pixel in the block was rendered
    ivec2 bayerInt = ivec2(uBayerOffset);
    ivec2 renderedPixel = blockBase + bayerInt;

    // Sample the rendered pixel from quarter-res buffer
    return sampleCloudColorAtPixel(renderedPixel);
}

/**
 * Sample position from neighbors in the quarter-res buffer for spatial interpolation.
 */
vec4 spatialInterpolationPositionFromCloud(ivec2 fullResPixel) {
    ivec2 blockBase = (fullResPixel / 2) * 2;
    ivec2 bayerInt = ivec2(uBayerOffset);
    ivec2 renderedPixel = blockBase + bayerInt;
    return sampleCloudPositionAtPixel(renderedPixel);
}

/**
 * Sample color from neighbors for spatial interpolation using history buffer.
 * Only used when we have valid history data.
 */
vec4 spatialInterpolationColorFromHistory(vec2 uv) {
    vec2 texelSize = 1.0 / uAccumulationResolution;

    // Sample 4 neighbors from history
    vec4 c0 = texture(uReprojectedHistory, uv + vec2(-texelSize.x, 0.0));
    vec4 c1 = texture(uReprojectedHistory, uv + vec2(texelSize.x, 0.0));
    vec4 c2 = texture(uReprojectedHistory, uv + vec2(0.0, -texelSize.y));
    vec4 c3 = texture(uReprojectedHistory, uv + vec2(0.0, texelSize.y));

    // Average valid neighbors
    vec4 sum = vec4(0.0);
    float count = 0.0;

    if (c0.a > 0.001) { sum += c0; count += 1.0; }
    if (c1.a > 0.001) { sum += c1; count += 1.0; }
    if (c2.a > 0.001) { sum += c2; count += 1.0; }
    if (c3.a > 0.001) { sum += c3; count += 1.0; }

    return count > 0.0 ? sum / count : vec4(0.0);
}

/**
 * Sample position from neighbors for spatial interpolation using history buffer.
 */
vec4 spatialInterpolationPositionFromHistory(vec2 uv) {
    vec2 texelSize = 1.0 / uAccumulationResolution;

    vec4 p0 = texture(uReprojectedPositionHistory, uv + vec2(-texelSize.x, 0.0));
    vec4 p1 = texture(uReprojectedPositionHistory, uv + vec2(texelSize.x, 0.0));
    vec4 p2 = texture(uReprojectedPositionHistory, uv + vec2(0.0, -texelSize.y));
    vec4 p3 = texture(uReprojectedPositionHistory, uv + vec2(0.0, texelSize.y));

    // Average valid neighbors (w > 0 indicates valid position)
    vec4 sum = vec4(0.0);
    float count = 0.0;

    if (p0.w > 0.001) { sum += p0; count += 1.0; }
    if (p1.w > 0.001) { sum += p1; count += 1.0; }
    if (p2.w > 0.001) { sum += p2; count += 1.0; }
    if (p3.w > 0.001) { sum += p3; count += 1.0; }

    return count > 0.0 ? sum / count : vec4(0.0);
}

/**
 * NEIGHBORHOOD CLAMPING - Critical for preventing ghosting and smearing artifacts.
 *
 * This technique clamps reprojected history to the bounds of the current frame's
 * neighborhood, providing a per-frame upper bound on reprojection error.
 * (Reference: INSIDE GDC 2016, Brian Karis TAA)
 *
 * Samples a 3x3 neighborhood from the quarter-res cloud buffer and computes
 * min/max bounds. History colors outside these bounds are clamped, preventing
 * stale data from bleeding into the current frame.
 */
void computeNeighborhoodBounds(ivec2 centerPixel, out vec4 minBound, out vec4 maxBound) {
    minBound = vec4(1e10);
    maxBound = vec4(-1e10);

    // Sample 3x3 neighborhood at 2-pixel stride (since we're at quarter-res, this covers the local area)
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            // Sample neighboring 2x2 blocks in full-res space
            ivec2 samplePixel = centerPixel + ivec2(dx, dy) * 2;

            // Clamp to valid range
            samplePixel = clamp(samplePixel, ivec2(0), ivec2(uAccumulationResolution) - 1);

            vec4 neighborColor = sampleCloudColorAtPixel(samplePixel);

            // Only include valid samples in bounds
            if (neighborColor.a > 0.001) {
                minBound = min(minBound, neighborColor);
                maxBound = max(maxBound, neighborColor);
            }
        }
    }

    // If no valid samples found, use defaults that won't clamp
    if (minBound.a > 1e9) {
        minBound = vec4(0.0);
        maxBound = vec4(1.0);
    }
}

/**
 * Clamp a color to neighborhood bounds with optional softening.
 * Uses AABB clamping which is simple but effective.
 */
vec4 clampToNeighborhood(vec4 color, vec4 minBound, vec4 maxBound) {
    return clamp(color, minBound, maxBound);
}

void main() {
    // Use integer math to avoid floating-point precision issues with mod()
    // This is critical for correct Bayer pattern detection
    ivec2 pixelCoordInt = ivec2(floor(vUv * uAccumulationResolution));

    // Determine which pixel in the 2x2 block this is (0 or 1 for each axis)
    ivec2 blockPosInt = pixelCoordInt % 2;

    // Convert Bayer offset to integer for reliable comparison
    ivec2 bayerOffsetInt = ivec2(uBayerOffset);

    // Check if this pixel was rendered this frame
    bool renderedThisFrame = (blockPosInt.x == bayerOffsetInt.x && blockPosInt.y == bayerOffsetInt.y);

    vec4 newColor = vec4(0.0);
    vec4 newPosition = vec4(0.0);
    vec4 historyColor = vec4(0.0);
    vec4 historyPosition = vec4(0.0);
    float validity = 0.0;

    // Get the new rendered color and position (for pixels rendered this frame)
    if (renderedThisFrame) {
        // This pixel was rendered - sample from quarter-res buffer
        newColor = sampleCloudColorAtPixel(pixelCoordInt);
        newPosition = sampleCloudPositionAtPixel(pixelCoordInt);
    }

    // Get reprojected history (only if we have valid history)
    if (uHasValidHistory) {
        historyColor = texture(uReprojectedHistory, vUv);
        historyPosition = texture(uReprojectedPositionHistory, vUv);
        validity = texture(uValidityMask, vUv).r;
    }

    // Combine new and history based on what's available
    vec4 finalColor;
    vec4 finalPosition;

    // For freshly rendered pixels, reduce history influence by this factor.
    // This prioritizes new high-quality data over reprojected history.
    // 0.5 means we trust new data roughly 2x more than reprojected data.
    const float FRESH_PIXEL_HISTORY_REDUCTION = 0.5;

    // NEIGHBORHOOD CLAMPING: Compute bounds from current frame's quarter-res data
    // This is the key technique for preventing ghosting/smearing artifacts
    vec4 neighborMin, neighborMax;
    computeNeighborhoodBounds(pixelCoordInt, neighborMin, neighborMax);

    // Clamp history to neighborhood bounds BEFORE any blending
    // This ensures stale history data cannot deviate more than current frame's local variation
    vec4 clampedHistoryColor = clampToNeighborhood(historyColor, neighborMin, neighborMax);

    if (renderedThisFrame) {
        // This pixel was freshly rendered
        if (uHasValidHistory && validity > 0.5 && historyColor.a > 0.001) {
            // Blend with CLAMPED history for temporal stability without ghosting
            // Give more weight to new data since it's fresh
            float blendWeight = uHistoryWeight * validity * FRESH_PIXEL_HISTORY_REDUCTION;
            finalColor = mix(newColor, clampedHistoryColor, blendWeight);
            // Blend positions weighted by alpha for proper averaging
            finalPosition = mix(newPosition, historyPosition, blendWeight);

            // CRITICAL: Preserve alpha=1.0 for SOLID objects
            // When new pixel has full opacity (SOLID mode), don't let history dilute it
            // This prevents semi-transparency when opacity mode is set to SOLID
            if (newColor.a >= 0.99) {
                finalColor.a = 1.0;
            }
        } else {
            // No valid history - use new data directly
            finalColor = newColor;
            finalPosition = newPosition;
        }
    } else {
        // This pixel was NOT rendered this frame
        if (uHasValidHistory && validity > 0.5 && historyColor.a > 0.001) {
            // Use CLAMPED reprojected history
            // The clamping prevents smearing by limiting history to current frame's neighborhood
            finalColor = clampedHistoryColor;
            finalPosition = historyPosition;

            // CRITICAL: Preserve alpha=1.0 for SOLID objects from history
            // If history had full opacity, keep it full
            if (historyColor.a >= 0.99) {
                finalColor.a = 1.0;
            }
        } else if (uHasValidHistory && historyColor.a > 0.001) {
            // History exists but validity is low - blend with spatial interpolation from history
            vec4 spatialColor = spatialInterpolationColorFromHistory(vUv);
            vec4 spatialPosition = spatialInterpolationPositionFromHistory(vUv);
            // Clamp both history and spatial to neighborhood bounds
            vec4 clampedSpatial = clampToNeighborhood(spatialColor, neighborMin, neighborMax);
            finalColor = mix(clampedSpatial, clampedHistoryColor, validity);
            finalPosition = mix(spatialPosition, historyPosition, validity);

            // Preserve alpha for SOLID objects
            if (historyColor.a >= 0.99 || spatialColor.a >= 0.99) {
                finalColor.a = 1.0;
            }
        } else {
            // No valid history at all - use spatial interpolation from quarter-res cloud buffer
            // This is critical for first few frames before history is built up
            // We sample from the actual rendered data, not the uninitialized history buffer
            finalColor = spatialInterpolationColorFromCloud(pixelCoordInt);
            finalPosition = spatialInterpolationPositionFromCloud(pixelCoordInt);
        }
    }

    // Clamp to valid range
    finalColor = max(finalColor, vec4(0.0));
    // Position w component (alpha weight) should also be clamped
    finalPosition.w = max(finalPosition.w, 0.0);

    fragColor = finalColor;
    fragPosition = finalPosition;
}
`
