export const oceanBlock = `
// Mode 6: Deep Ocean - Underwater atmosphere with caustic patterns
// Serene, calming, elegant - with bubbles and surface shimmer
// Uses internal contrast boosting to ensure seaweed/plant patterns are visible
// even when user selects smooth harmonic palettes
vec3 getDeepOcean(vec3 dir, float time) {
    // Base gradient from deep to surface - controlled by depth gradient
    float depth = 1.0 - (dir.y * 0.5 + 0.5);
    float depthPow = 0.5 + uOceanDepthGradient * 0.5; // 0.5-1.0 controls gradient steepness
    depth = pow(depth, depthPow);

    // Caustic pattern calculation - creates the seaweed/plant-like structures
    vec3 p = dir * uScale * 4.0;
    p.y *= 0.5; // Stretch vertically

    // Multiple layers of caustics - intensity controlled by uniform
    float caustic1 = 0.0;
    float caustic2 = 0.0;

    // First caustic layer - primary seaweed pattern
    // Clamp to [0,1] before pow() to avoid NaN from negative values
    vec3 c1 = p + vec3(time * 0.03, time * 0.02, 0.0);
    caustic1 = sin(c1.x * 2.0 + sin(c1.z * 3.0)) * sin(c1.z * 2.0 + sin(c1.x * 3.0));
    caustic1 = clamp(caustic1 * 0.5 + 0.5, 0.0, 1.0);
    caustic1 = pow(caustic1, 2.5);

    // Second caustic layer (different frequency) - secondary detail
    vec3 c2 = p * 1.5 + vec3(-time * 0.02, time * 0.015, time * 0.01);
    caustic2 = sin(c2.x * 3.0 + sin(c2.z * 2.0)) * sin(c2.z * 3.0 + sin(c2.x * 2.0));
    caustic2 = clamp(caustic2 * 0.5 + 0.5, 0.0, 1.0);
    caustic2 = pow(caustic2, 2.5);

    // Third layer - fine seaweed detail with sharper edges
    vec3 c3 = p * 2.5 + vec3(time * 0.01, -time * 0.025, time * 0.02);
    float caustic3 = sin(c3.x * 4.0 + sin(c3.z * 5.0 + c3.y * 2.0)) *
                     sin(c3.z * 4.0 + sin(c3.x * 5.0 - c3.y * 2.0));
    caustic3 = clamp(caustic3 * 0.5 + 0.5, 0.0, 1.0);
    // PERF: Use multiplication instead of pow(x, 2.0)
    caustic3 = caustic3 * caustic3;

    // Combine caustics - controlled by caustic intensity uniform
    float caustics = (caustic1 * 0.4 + caustic2 * 0.35 + caustic3 * 0.25);
    caustics *= (1.0 - depth * 0.4); // Stronger near surface, but visible deeper too
    caustics *= uComplexity * uOceanCausticIntensity * 2.5;

    // === INTERNAL CONTRAST BOOSTING ===
    // Generate high-contrast colors internally to ensure seaweed is visible
    // regardless of user's palette choice

    // Base colors from user palette
    vec3 userDeep, userMid, userSurface;
    if (uUsePalette > 0.5) {
        userDeep = cosinePalette(0.0, uPalA, uPalB, uPalC, uPalD);
        userMid = cosinePalette(0.5, uPalA, uPalB, uPalC, uPalD);
        userSurface = cosinePalette(1.0, uPalA, uPalB, uPalC, uPalD);
    } else {
        userDeep = uColor1;
        userMid = mix(uColor1, uColor2, 0.5);
        userSurface = uColor2;
    }

    // Calculate luminance contrast of user's palette
    float deepLum = dot(userDeep, vec3(0.299, 0.587, 0.114));
    float surfLum = dot(userSurface, vec3(0.299, 0.587, 0.114));
    float paletteContrast = abs(surfLum - deepLum);

    // Boost factor: more boost when palette has low contrast
    float contrastBoost = 1.0 + (1.0 - paletteContrast) * 1.5;

    // Create enhanced colors for seaweed visibility
    // Shift hue slightly and boost saturation for the seaweed overlay
    vec3 seaweedHighlight = userSurface;
    vec3 seaweedShadow = userDeep;

    // Enhance color separation - push colors apart
    vec3 colorDir = normalize(userSurface - userDeep + vec3(0.001));
    seaweedHighlight = userMid + colorDir * 0.4 * contrastBoost;
    seaweedShadow = userMid - colorDir * 0.3 * contrastBoost;

    // Add subtle complementary tint to highlights for extra pop
    vec3 complement = vec3(1.0) - normalize(userMid + vec3(0.1));
    seaweedHighlight += complement * 0.15 * contrastBoost;

    // Base water color with enhanced depth gradient
    vec3 col;
    vec3 surfaceColor = userSurface;
    vec3 deepColor = userDeep * (0.15 + 0.1 * contrastBoost); // Darker deep water
    vec3 midColor = userMid * (0.5 + 0.1 * contrastBoost);

    col = mix(surfaceColor, midColor, depth);
    col = mix(col, deepColor, depth * depth);

    // Apply seaweed/caustic pattern with high-contrast overlay
    // Use multiply-screen blend for better visibility
    float seaweedPattern = caustics;
    vec3 seaweedColor = mix(seaweedShadow, seaweedHighlight, seaweedPattern);

    // Blend seaweed into base - stronger effect in mid-depths where seaweed grows
    float seaweedDepthMask = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.5, depth);
    seaweedDepthMask = max(seaweedDepthMask, 0.3); // Always some visibility

    // Overlay blend mode for seaweed (component-wise for GLSL compatibility)
    vec3 seaweedBelow = 2.0 * col * seaweedColor;
    vec3 seaweedAbove = vec3(1.0) - 2.0 * (vec3(1.0) - col) * (vec3(1.0) - seaweedColor);
    vec3 seaweedOverlay = mix(seaweedBelow, seaweedAbove, step(vec3(0.5), col));

    col = mix(col, seaweedOverlay, seaweedDepthMask * uOceanCausticIntensity * 0.8);

    // Add bright caustic highlights on top
    col += caustics * seaweedHighlight * 0.4;

    // Animation Layer 1: Rising Bubbles / Particles
    // Creates subtle ascending particles that drift upward
    if (uOceanBubbleDensity > 0.01) {
        // Multiple bubble streams at different speeds and positions (2 for performance)
        for (int i = 0; i < 2; i++) {
            float fi = float(i);
            // Offset each stream spatially and temporally
            vec3 bubblePos = dir * uScale * (8.0 + fi * 2.0);
            bubblePos.y -= time * (0.05 + fi * 0.02); // Rise upward at varying speeds
            bubblePos.x += sin(time * 0.3 + fi) * 0.2; // Gentle horizontal drift

            // Create bubble pattern using layered noise
            float bubbleNoise = noise(bubblePos * 3.0);
            bubbleNoise = smoothstep(0.55 - uOceanBubbleDensity * 0.15, 0.7, bubbleNoise);

            // Bubbles fade with depth (less visible in deep water)
            float bubbleFade = (1.0 - depth * 0.7) * (0.3 + fi * 0.1);

            // Add bubble glow - use enhanced highlight color
            col += bubbleNoise * seaweedHighlight * bubbleFade * uOceanBubbleDensity * 0.35;
        }
    }

    // Animation Layer 2: Surface Shimmer
    // Creates dancing light patterns near the water surface
    if (uOceanSurfaceShimmer > 0.01) {
        float surfaceProximity = smoothstep(0.5, 0.0, depth); // Strong near surface

        // Layered shimmer patterns at different frequencies
        vec2 shimmerUV = dir.xz * uScale * 6.0;

        // Primary shimmer - larger, slower waves
        // PERF: Use multiplications instead of pow()
        float shimmer1 = sin(shimmerUV.x * 2.0 + time * 0.4) *
                        sin(shimmerUV.y * 2.5 + time * 0.35);
        shimmer1 = shimmer1 * 0.5 + 0.5;
        shimmer1 = shimmer1 * shimmer1; // pow 2

        // Secondary shimmer - smaller, faster ripples
        float shimmer2 = sin(shimmerUV.x * 5.0 - time * 0.6) *
                        sin(shimmerUV.y * 4.5 + time * 0.55);
        shimmer2 = shimmer2 * 0.5 + 0.5;
        shimmer2 = shimmer2 * shimmer2 * shimmer2; // pow 3

        // Combine shimmers with noise modulation for organic feel
        float shimmerNoise = noise(vec3(shimmerUV * 0.5, time * 0.1));
        float shimmer = (shimmer1 * 0.6 + shimmer2 * 0.4) * shimmerNoise;
        shimmer *= surfaceProximity * uOceanSurfaceShimmer;

        // Add shimmer as bright highlights with enhanced color
        col += shimmer * seaweedHighlight * 0.45;
    }

    // Subtle light rays from above - enhanced visibility
    // Skip noise when rays would be zero anyway (dir.y < 0.7)
    if (dir.y > 0.7) {
        float rays = smoothstep(0.7, 1.0, dir.y);
        rays *= noise(vec3(dir.xz * 2.0, time * 0.1)) * 0.35;
        col += rays * seaweedHighlight * (1.0 - depth) * 0.25;
    }

    return col;
}
`
