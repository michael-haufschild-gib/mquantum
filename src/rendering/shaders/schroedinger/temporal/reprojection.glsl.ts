/**
 * Reprojection shader for temporal cloud accumulation
 *
 * Takes the previous frame's accumulated cloud color and reprojects it
 * to the current camera view. Outputs reprojected color and validity mask.
 */

export const reprojectionVertexShader = `
out vec2 vUv;

void main() {
    vUv = uv;
    // Direct NDC output for fullscreen quad
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const reprojectionFragmentShader = `
precision highp float;

in vec2 vUv;

// Previous frame's accumulated cloud color
uniform sampler2D uPrevAccumulation;

// Previous frame's accumulated world positions (xyz = world pos, w = alpha weight)
uniform sampler2D uPrevPositionBuffer;

// Matrices for reprojection
uniform mat4 uPrevViewProjectionMatrix;
uniform mat4 uViewProjectionMatrix;

// Current camera position
uniform vec3 uCameraPosition;

// Resolution
uniform vec2 uAccumulationResolution;

// Disocclusion threshold
uniform float uDisocclusionThreshold;

// Outputs - MRT requires both to be vec4 for consistent format
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragValidity;

void main() {
    /**
     * CORRECT REPROJECTION FOR VOLUMETRIC TEMPORAL ACCUMULATION
     *
     * The goal: For each OUTPUT pixel at vUv, find where to sample HISTORY from.
     *
     * The key insight is that the previous frame stored a world position at each
     * screen location. When the camera moves, that world position now appears at
     * a DIFFERENT screen location. We need to:
     *
     * 1. Get the world position that was stored at vUv in the PREVIOUS accumulation
     * 2. Project it using the CURRENT VP matrix to find where it appears NOW
     * 3. If currentUV != vUv, the content has "moved" on screen
     *
     * But we're doing a GATHER operation (reading from history, writing to current).
     * So we need to INVERT this: for current pixel at vUv, find where to read FROM.
     *
     * The trick: Sample a grid of nearby history positions, project each to current
     * frame, and find which one lands closest to vUv. That's where our history comes from.
     *
     * SIMPLIFIED APPROACH for volumetrics:
     * Since volumetric boundaries are soft and the object fills much of the screen,
     * we use a simpler heuristic: check if the world position at vUv in the previous
     * frame projects to a significantly different location in the current frame.
     * If so, reduce validity (the content has moved away from this pixel).
     */

    // Sample previous frame's data at this screen location
    vec4 prevColor = texture(uPrevAccumulation, vUv);
    vec4 prevPosition = texture(uPrevPositionBuffer, vUv);

    // Early out if no valid history at this location
    if (prevColor.a < 0.001 || prevPosition.w < 0.001) {
        fragColor = vec4(0.0);
        fragValidity = vec4(0.0);
        return;
    }

    vec3 worldPos = prevPosition.xyz;

    // Project this world position to CURRENT frame to see where it went
    vec4 currentClip = uViewProjectionMatrix * vec4(worldPos, 1.0);
    // Guard against division by zero in perspective divide while preserving sign
    // Note: sign(0) = 0 which would cause division by zero, so use ternary instead
    float safeW = abs(currentClip.w) < 0.0001
        ? (currentClip.w >= 0.0 ? 0.0001 : -0.0001)
        : currentClip.w;
    vec2 currentUV = (currentClip.xy / safeW) * 0.5 + 0.5;

    // Compute how far the content has "moved" on screen
    vec2 screenMotion = currentUV - vUv;
    float motionMagnitude = length(screenMotion * uAccumulationResolution); // In pixels

    // Start with full validity
    float validity = 1.0;

    // MOTION-BASED REJECTION:
    // If the world position that WAS at vUv has moved significantly on screen,
    // the history at vUv is no longer valid for the current frame's vUv.
    // This is the key fix for smearing during camera rotation!
    //
    // Threshold: 2 pixels of motion starts reducing validity, 8+ pixels = invalid
    const float MOTION_THRESHOLD_MIN = 2.0;  // Start reducing validity
    const float MOTION_THRESHOLD_MAX = 8.0;  // Fully invalid

    if (motionMagnitude > MOTION_THRESHOLD_MIN) {
        float motionFactor = 1.0 - smoothstep(MOTION_THRESHOLD_MIN, MOTION_THRESHOLD_MAX, motionMagnitude);
        validity *= motionFactor;
    }

    // OFF-SCREEN REJECTION:
    // If the content moved completely off-screen, it's definitely invalid
    if (currentUV.x < -0.1 || currentUV.x > 1.1 || currentUV.y < -0.1 || currentUV.y > 1.1) {
        validity = 0.0;
    }

    // EDGE DETECTION:
    // Check for depth/position discontinuities in the neighborhood
    vec2 texelSize = 1.0 / uAccumulationResolution;

    vec4 posL = texture(uPrevPositionBuffer, vUv - vec2(texelSize.x, 0.0));
    vec4 posR = texture(uPrevPositionBuffer, vUv + vec2(texelSize.x, 0.0));
    vec4 posU = texture(uPrevPositionBuffer, vUv + vec2(0.0, texelSize.y));
    vec4 posD = texture(uPrevPositionBuffer, vUv - vec2(0.0, texelSize.y));

    // Large position differences indicate object edges - reduce validity there
    float maxPosDiff = max(
        max(length(worldPos - posL.xyz), length(worldPos - posR.xyz)),
        max(length(worldPos - posU.xyz), length(worldPos - posD.xyz))
    );

    // Position discontinuity threshold (in world units)
    // Tighter threshold = more aggressive edge rejection
    const float POS_DISCONTINUITY_THRESHOLD = 0.3;
    if (maxPosDiff > POS_DISCONTINUITY_THRESHOLD) {
        validity *= 0.5; // Reduce but don't eliminate - let neighborhood clamping handle it
    }

    // ALPHA DISCONTINUITY:
    // Check for sudden alpha changes (object boundary)
    vec4 colorL = texture(uPrevAccumulation, vUv - vec2(texelSize.x, 0.0));
    vec4 colorR = texture(uPrevAccumulation, vUv + vec2(texelSize.x, 0.0));
    vec4 colorU = texture(uPrevAccumulation, vUv + vec2(0.0, texelSize.y));
    vec4 colorD = texture(uPrevAccumulation, vUv - vec2(0.0, texelSize.y));

    float maxAlphaDiff = max(
        max(abs(prevColor.a - colorL.a), abs(prevColor.a - colorR.a)),
        max(abs(prevColor.a - colorU.a), abs(prevColor.a - colorD.a))
    );

    if (maxAlphaDiff > uDisocclusionThreshold) {
        validity *= 0.5;
    }

    // SCREEN EDGE REJECTION:
    // Reduce validity near screen edges where content may be entering/leaving
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    if (edgeDist < 0.03) {
        validity *= edgeDist / 0.03;
    }

    fragColor = prevColor;
    fragValidity = vec4(validity, 0.0, 0.0, 1.0);
}
`
