/**
 * Horizon skybox mode for WGSL - Clean studio environment
 * Port of: src/rendering/shaders/skybox/modes/horizon.glsl.ts
 */
export const horizonBlock = `
// --- Horizon Mode: Clean Studio Environment ---
// Professional presentation backdrop with smooth multi-band gradient

fn getHorizonGradient(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Vertical position: -1 (bottom) to 1 (top)
  let y = dir.y;

  // Gradient contrast affects zone sharpness
  let contrastMod = 0.5 + uniforms.horizonGradientContrast * 1.0; // 0.5-1.5

  // Create distinct gradient zones for studio look
  // Zone 1: Floor reflection zone (bottom third)
  // Zone 2: Horizon band (middle - the "infinity curve")
  // Zone 3: Upper backdrop (top half)

  let floorZone = smoothstep(-1.0, -0.2 * contrastMod, y);
  var horizonZone = 1.0 - abs(y) * (1.0 + contrastMod * 0.5);
  horizonZone = pow(max(0.0, horizonZone), 1.5 + contrastMod);
  let upperZone = smoothstep(-0.1 * contrastMod, 0.8 * contrastMod, y);

  // Subtle seamless gradient curve (no harsh transitions)
  var gradientPos = y * 0.5 + 0.5;
  gradientPos = pow(clamp(gradientPos, 0.0, 1.0), 0.8 + uniforms.complexity * 0.4);

  // Very subtle horizontal sweep for depth (like studio lighting)
  let sweep = sin(dir.x * PI * 0.5) * 0.05;
  gradientPos += sweep * (1.0 - abs(y));

  // Animation Layer 1: Subtle slow breathing animation
  let breathe = sin(time * 0.2) * 0.02;
  gradientPos += breathe * horizonZone;

  // Animation Layer 2: Color temperature pulse (warm/cool shift)
  let tempPulse = sin(time * 0.12) * 0.08 + sin(time * 0.07) * 0.04;

  // Animation Layer 3: Light sweep across horizon
  let sweepAngle = (time * 0.15) - floor(time * 0.15 / TAU) * TAU; // mod(time * 0.15, TAU)
  let lightSweep_raw = sin(atan2(dir.x, dir.z) - sweepAngle);
  let lightSweep = pow(max(0.0, lightSweep_raw), 8.0) * 0.15 * horizonZone;

  // Animation Layer 4: Ambient brightness variation
  let ambientPulse = sin(time * 0.1 + dir.x * 0.5) * 0.03 + 1.0;

  var col: vec3<f32>;
  if (uniforms.usePalette > 0.5) {
    // 4-point gradient for smooth studio look
    // Apply temperature pulse to palette sampling
    let floorColor = cosinePalette(0.1 + tempPulse * 0.1, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD) * 0.6;
    let horizonColor = cosinePalette(0.4 + tempPulse * 0.05, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    let midColor = cosinePalette(0.6, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    let topColor = cosinePalette(0.85 - tempPulse * 0.05, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);

    // Smooth 4-zone blend
    col = mix(floorColor, horizonColor, floorZone);
    col = mix(col, midColor, smoothstep(-0.1, 0.3, y));
    col = mix(col, topColor, upperZone);

    // Add subtle horizon glow (the "infinity" effect)
    col += horizonColor * horizonZone * 0.2 * uniforms.scale;

    // Add light sweep highlight
    let sweepColor = cosinePalette(0.95, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    col += sweepColor * lightSweep;
  } else {
    // Two-color mode: color1 = floor/dark, color2 = top/light
    // Apply temperature modulation via interpolation shift
    let tempShift = tempPulse * 0.1;
    let floorColor = uniforms.color1 * (0.5 + tempShift);
    let horizonColor = mix(uniforms.color1, uniforms.color2, 0.5 + tempShift);
    let topColor = uniforms.color2 * (1.0 - tempShift * 0.5);

    col = mix(floorColor, horizonColor, floorZone);
    col = mix(col, topColor, upperZone);
    col += horizonColor * horizonZone * 0.15 * uniforms.scale;

    // Add light sweep highlight
    col += mix(uniforms.color1, uniforms.color2, 0.8) * lightSweep;
  }

  // Apply ambient pulse
  col *= ambientPulse;

  // Premium film-like micro-texture (very subtle)
  // Skip when complexity is near zero
  if (uniforms.complexity > 0.01) {
    let microTexture = skyboxNoise(dir * 50.0) * 0.015 * uniforms.complexity;
    col += microTexture;
  }

  // Soft radial falloff from center (spotlight feel)
  // Controlled by spotlight focus uniform
  let spotlightStrength = 0.05 + uniforms.horizonSpotlightFocus * 0.25; // 0.05-0.30
  let spotlight = 1.0 - length(vec2<f32>(dir.x, dir.z)) * spotlightStrength;
  let spotlightMin = 0.7 + (1.0 - uniforms.horizonSpotlightFocus) * 0.25; // 0.7-0.95
  col *= max(spotlightMin, spotlight);

  return col;
}
`
