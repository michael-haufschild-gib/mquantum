/**
 * Aurora skybox mode for WGSL - Flowing vertical curtains
 * Port of: src/rendering/shaders/skybox/modes/aurora.glsl.ts
 */
export const auroraBlock = `
// --- Aurora Mode: Flowing Vertical Curtains ---
// Optimized aurora with single curtain layer for better performance

fn getAurora(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Spherical coordinates for proper curtain mapping
  let theta = atan2(dir.x, dir.z); // Horizontal angle
  let phi = asin(clamp(dir.y, -1.0, 1.0)); // Vertical angle

  // Aurora vertical coverage controlled by curtain height uniform
  let heightLow = mix(-0.2, 0.1, uniforms.auroraCurtainHeight);
  let heightHigh = mix(0.3, 0.8, uniforms.auroraCurtainHeight);
  let auroraHeight = smoothstep(heightLow, heightHigh, dir.y);

  // Wave frequency multiplier for curtain density
  let waveFreq = uniforms.auroraWaveFrequency;

  // Single optimized curtain layer combining primary and secondary ribbons
  // Use only integer multipliers of theta for seamless wrapping
  let h1 = theta * 3.0 + uniforms.evolution * TAU;
  let wave1 = sin(h1 + time * 0.3) * cos(theta * 2.0 + time * 0.2);

  // Primary fold with turbulence
  let fold1 = sin(phi * 8.0 * waveFreq + wave1 * 2.0 * uniforms.turbulence + time * 0.5);
  var curtain = smoothstep(0.0, 0.8, fold1) * smoothstep(1.0, 0.3, fold1);

  // Add secondary detail via simple modulation (cheaper than second full layer)
  let detail = sin(phi * 12.0 * waveFreq + theta * 5.0 + time * 0.7) * 0.3;
  curtain += detail * smoothstep(0.2, 0.6, curtain);

  // Simple pulsing glow (single sin instead of dual)
  let pulseGlow = 1.0 + sin(time * 0.18 + theta * 2.0) * 0.15;

  // Vertical fade
  let verticalFade = pow(clamp(dir.y + 0.2, 0.0, 1.0), 0.5);
  let bottomFade = smoothstep(-0.3, 0.2, dir.y);

  // Combined intensity
  let intensity = curtain * verticalFade * bottomFade * pulseGlow * uniforms.scale;
  let v = clamp(intensity, 0.0, 1.0);

  // Dark sky background
  let nightSky = vec3<f32>(0.02, 0.02, 0.05);

  // Color Mapping
  var auroraColor: vec3<f32>;
  let colorShift = sin(time * 0.08) * 0.1; // Subtle color drift

  let paletteT = v * 0.7 + 0.15 + colorShift;
  auroraColor = cosinePalette(paletteT, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);

  // Vertical color variation
  let heightColor = smoothstep(0.0, 0.6, dir.y);
  let topColor = cosinePalette(0.8, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
  auroraColor = mix(auroraColor, topColor, heightColor * 0.4);

  // Final composite
  let col = mix(nightSky, auroraColor, intensity * auroraHeight * 1.5);

  return col;
}
`
