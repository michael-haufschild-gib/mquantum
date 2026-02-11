/**
 * Ocean skybox mode for WGSL - Underwater atmosphere
 * Port of: src/rendering/shaders/skybox/modes/ocean.glsl.ts
 */
export const oceanBlock = `
// --- Ocean Mode: Deep Ocean Underwater Atmosphere ---
// Serene, calming, elegant - with caustic patterns, bubbles and surface shimmer

fn getDeepOcean(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Base gradient from deep to surface - controlled by depth gradient
  var depth = 1.0 - (dir.y * 0.5 + 0.5);
  let depthPow = 0.5 + uniforms.oceanDepthGradient * 0.5; // 0.5-1.0 controls gradient steepness
  depth = pow(depth, depthPow);

  // Caustic pattern calculation - creates the seaweed/plant-like structures
  var p = dir * uniforms.scale * 4.0;
  p.y *= 0.5; // Stretch vertically

  // Multiple layers of caustics - intensity controlled by uniform
  var caustic1 = 0.0;
  var caustic2 = 0.0;

  // First caustic layer - primary seaweed pattern
  let c1 = p + vec3<f32>(time * 0.03, time * 0.02, 0.0);
  caustic1 = sin(c1.x * 2.0 + sin(c1.z * 3.0)) * sin(c1.z * 2.0 + sin(c1.x * 3.0));
  caustic1 = clamp(caustic1 * 0.5 + 0.5, 0.0, 1.0);
  caustic1 = pow(caustic1, 2.5);

  // Second caustic layer (different frequency) - secondary detail
  let c2 = p * 1.5 + vec3<f32>(-time * 0.02, time * 0.015, time * 0.01);
  caustic2 = sin(c2.x * 3.0 + sin(c2.z * 2.0)) * sin(c2.z * 3.0 + sin(c2.x * 2.0));
  caustic2 = clamp(caustic2 * 0.5 + 0.5, 0.0, 1.0);
  caustic2 = pow(caustic2, 2.5);

  // Third layer - fine seaweed detail with sharper edges
  let c3 = p * 2.5 + vec3<f32>(time * 0.01, -time * 0.025, time * 0.02);
  var caustic3 = sin(c3.x * 4.0 + sin(c3.z * 5.0 + c3.y * 2.0)) *
                 sin(c3.z * 4.0 + sin(c3.x * 5.0 - c3.y * 2.0));
  caustic3 = clamp(caustic3 * 0.5 + 0.5, 0.0, 1.0);
  caustic3 = caustic3 * caustic3; // pow 2

  // Combine caustics
  var caustics = (caustic1 * 0.4 + caustic2 * 0.35 + caustic3 * 0.25);
  caustics *= (1.0 - depth * 0.4); // Stronger near surface
  caustics *= uniforms.complexity * uniforms.oceanCausticIntensity * 2.5;

  // === INTERNAL CONTRAST BOOSTING ===
  // Generate high-contrast colors internally to ensure seaweed is visible
  var userDeep: vec3<f32>;
  var userMid: vec3<f32>;
  var userSurface: vec3<f32>;

  userDeep = cosinePalette(0.0, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
  userMid = cosinePalette(0.5, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
  userSurface = cosinePalette(1.0, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);

  // Calculate luminance contrast of user's palette
  let deepLum = dot(userDeep, vec3<f32>(0.299, 0.587, 0.114));
  let surfLum = dot(userSurface, vec3<f32>(0.299, 0.587, 0.114));
  let paletteContrast = abs(surfLum - deepLum);

  // Boost factor: more boost when palette has low contrast
  let contrastBoost = 1.0 + (1.0 - paletteContrast) * 1.5;

  // Create enhanced colors for seaweed visibility
  let colorDir = normalize(userSurface - userDeep + vec3<f32>(0.001));
  let seaweedHighlight = userMid + colorDir * 0.4 * contrastBoost;
  let seaweedShadow = userMid - colorDir * 0.3 * contrastBoost;

  // Add subtle complementary tint to highlights for extra pop
  let complement = vec3<f32>(1.0) - normalize(userMid + vec3<f32>(0.1));
  let seaweedHighlightFinal = seaweedHighlight + complement * 0.15 * contrastBoost;

  // Base water color with enhanced depth gradient
  let surfaceColor = userSurface;
  let deepColor = userDeep * (0.15 + 0.1 * contrastBoost);
  let midColor = userMid * (0.5 + 0.1 * contrastBoost);

  var col = mix(surfaceColor, midColor, depth);
  col = mix(col, deepColor, depth * depth);

  // Apply seaweed/caustic pattern with high-contrast overlay
  let seaweedPattern = caustics;
  let seaweedColor = mix(seaweedShadow, seaweedHighlightFinal, seaweedPattern);

  // Blend seaweed into base - stronger effect in mid-depths
  var seaweedDepthMask = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.5, depth);
  seaweedDepthMask = max(seaweedDepthMask, 0.3);

  // Overlay blend mode for seaweed
  let seaweedBelow = 2.0 * col * seaweedColor;
  let seaweedAbove = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - col) * (vec3<f32>(1.0) - seaweedColor);
  let seaweedOverlay = mix(seaweedBelow, seaweedAbove, step(vec3<f32>(0.5), col));

  col = mix(col, seaweedOverlay, seaweedDepthMask * uniforms.oceanCausticIntensity * 0.8);

  // Add bright caustic highlights on top
  col += caustics * seaweedHighlightFinal * 0.4;

  // Animation Layer 1: Rising Bubbles / Particles
  if (uniforms.oceanBubbleDensity > 0.01) {
    for (var i = 0; i < 2; i++) {
      let fi = f32(i);
      var bubblePos = dir * uniforms.scale * (8.0 + fi * 2.0);
      bubblePos.y -= time * (0.05 + fi * 0.02);
      bubblePos.x += sin(time * 0.3 + fi) * 0.2;

      var bubbleNoise = skyboxNoise(bubblePos * 3.0);
      bubbleNoise = smoothstep(0.55 - uniforms.oceanBubbleDensity * 0.15, 0.7, bubbleNoise);

      let bubbleFade = (1.0 - depth * 0.7) * (0.3 + fi * 0.1);
      col += bubbleNoise * seaweedHighlightFinal * bubbleFade * uniforms.oceanBubbleDensity * 0.35;
    }
  }

  // Animation Layer 2: Surface Shimmer
  if (uniforms.oceanSurfaceShimmer > 0.01) {
    let surfaceProximity = smoothstep(0.5, 0.0, depth);
    let shimmerUV = dir.xz * uniforms.scale * 6.0;

    // Primary shimmer - larger, slower waves
    var shimmer1 = sin(shimmerUV.x * 2.0 + time * 0.4) *
                   sin(shimmerUV.y * 2.5 + time * 0.35);
    shimmer1 = shimmer1 * 0.5 + 0.5;
    shimmer1 = shimmer1 * shimmer1;

    // Secondary shimmer - smaller, faster ripples
    var shimmer2 = sin(shimmerUV.x * 5.0 - time * 0.6) *
                   sin(shimmerUV.y * 4.5 + time * 0.55);
    shimmer2 = shimmer2 * 0.5 + 0.5;
    shimmer2 = shimmer2 * shimmer2 * shimmer2;

    // Combine shimmers with noise modulation
    let shimmerNoise = skyboxNoise(vec3<f32>(shimmerUV * 0.5, time * 0.1));
    var shimmer = (shimmer1 * 0.6 + shimmer2 * 0.4) * shimmerNoise;
    shimmer *= surfaceProximity * uniforms.oceanSurfaceShimmer;

    col += shimmer * seaweedHighlightFinal * 0.45;
  }

  // Subtle light rays from above
  if (dir.y > 0.7) {
    var rays = smoothstep(0.7, 1.0, dir.y);
    rays *= skyboxNoise(vec3<f32>(dir.xz * 2.0, time * 0.1)) * 0.35;
    col += rays * seaweedHighlightFinal * (1.0 - depth) * 0.25;
  }

  return col;
}
`
