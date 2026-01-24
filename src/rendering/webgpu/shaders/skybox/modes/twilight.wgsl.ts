/**
 * Twilight skybox mode for WGSL - Sunset/sunrise gradient
 * Port of: src/rendering/shaders/skybox/modes/twilight.glsl.ts
 */
export const twilightBlock = `
// --- Twilight Mode: Sunset/Sunrise Gradient ---
// Warm and cool tones that slowly evolve with atmospheric layers

fn getTwilight(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Vertical position
  let y = dir.y;

  // Time-based color temperature shift (very slow, continuous)
  let tempShift = sin(time * 0.02) * 0.5 + 0.5;

  // Horizontal position for sun placement
  let sunAngle = time * 0.01 + uniforms.evolution;
  let sunDir = normalize(vec3<f32>(cos(sunAngle), 0.1, sin(sunAngle)));
  let sunDist = 1.0 - max(0.0, dot(dir, sunDir));

  // Atmospheric scattering simulation (simplified)
  // PERF: Use multiplication instead of pow(x, 2.0)
  let scatterT = 1.0 - abs(y);
  let scatter = scatterT * scatterT;

  // Create layered gradient
  let gradientY = y * 0.5 + 0.5;

  // Color layers
  var col: vec3<f32>;
  if (uniforms.usePalette > 0.5) {
    // Use palette with temperature variation
    var palettePos = gradientY + tempShift * 0.2 - 0.1;
    palettePos = clamp(palettePos, 0.0, 1.0);

    let skyColor = cosinePalette(palettePos, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    let horizonColor = cosinePalette(0.5 + tempShift * 0.3, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);

    // PERF: Use sqrt() instead of pow(x, 0.5)
    col = mix(horizonColor, skyColor, sqrt(abs(y)));

    // Sun glow
    // PERF: Use multiplications instead of pow(x, 4.0)
    let sunDotVal = max(0.0, dot(dir, sunDir));
    let sunDot2 = sunDotVal * sunDotVal;
    let sunGlow = sunDot2 * sunDot2;
    let sunColor = cosinePalette(tempShift, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD) * 1.5;
    col = mix(col, sunColor, sunGlow * 0.5);
  } else {
    // Manual gradient using user colors
    let topColor = mix(uniforms.color1, uniforms.color2, tempShift);
    let horizonColor = mix(uniforms.color2, uniforms.color1, tempShift) * 1.2;
    let bottomColor = uniforms.color1 * 0.3;

    if (y > 0.0) {
      col = mix(horizonColor, topColor, pow(y, 0.7));
    } else {
      // PERF: Use sqrt() instead of pow(x, 0.5)
      col = mix(horizonColor, bottomColor, sqrt(-y));
    }

    // Sun glow using brighter blend of user colors
    // PERF: Use multiplications instead of pow(x, 4.0)
    let sunDotVal = max(0.0, dot(dir, sunDir));
    let sunDot2 = sunDotVal * sunDotVal;
    let sunGlow = sunDot2 * sunDot2;
    let sunColor = mix(uniforms.color2, uniforms.color1, tempShift) * 1.5;
    col = mix(col, sunColor, sunGlow * 0.5);
  }

  // Subtle atmospheric layers and haze (reuse single noise sample)
  let atmNoise = skyboxNoise(dir * 4.0 + time * 0.01);
  let layers = sin(y * 20.0 + atmNoise * 2.0) * 0.02;
  col += layers * scatter;

  // Atmospheric dust/haze (reuse noise)
  let haze = scatter * atmNoise * 0.1;
  col = mix(col, col * 1.2, haze);

  return col;
}
`
