/**
 * Twilight skybox mode for WGSL - Sunset/sunrise gradient
 */
export const twilightBlock = `
// --- Twilight Mode: Sunset/Sunrise Gradient ---
// Warm and cool tones that slowly evolve with atmospheric layers

fn getTwilight(dir: vec3<f32>, time: f32) -> vec3<f32> {
  // Vertical position
  let y = dir.y;

  // Time-based color temperature shift (very slow, continuous)
  let tempShift = sin(time * 0.02) * 0.5 + 0.5;

  // Horizontal position for sun placement.
  // length((cos(a), 0.1, sin(a))) = sqrt(cos^2 + 0.01 + sin^2) = sqrt(1.01), a constant.
  // Expanding normalize inline saves one dot3 + one sqrt + one divide per pixel.
  let sunAngle = time * 0.01 + uniforms.evolution;
  let SUN_INV_NORM = 0.99503719; // 1 / sqrt(1.01)
  let SUN_Y = 0.09950372;        // 0.1 / sqrt(1.01)
  let sunDir = vec3<f32>(cos(sunAngle) * SUN_INV_NORM, SUN_Y, sin(sunAngle) * SUN_INV_NORM);
  let sunDist = 1.0 - max(0.0, dot(dir, sunDir));

  // Atmospheric scattering simulation (simplified)
  // PERF: Use multiplication instead of pow(x, 2.0)
  let scatterT = 1.0 - abs(y);
  let scatter = scatterT * scatterT;

  // Create layered gradient
  let gradientY = y * 0.5 + 0.5;

  // Color layers
  var col: vec3<f32>;
  // Palette with temperature variation
  var palettePos = gradientY + tempShift * 0.2 - 0.1;
  palettePos = clamp(palettePos, 0.0, 1.0);

  let skyColor = cosinePalette(palettePos, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
  // PERF: hoisted -- horizonColor depends on tempShift = sin(time*0.02)*0.5+0.5, uniform per dispatch.
  let horizonColor = uniforms.twilightHorizonColor;

  // PERF: Use sqrt() instead of pow(x, 0.5)
  col = mix(horizonColor, skyColor, sqrt(abs(y)));

  // Sun glow
  // PERF: Use multiplications instead of pow(x, 4.0)
  let sunDotVal = max(0.0, dot(dir, sunDir));
  let sunDot2 = sunDotVal * sunDotVal;
  let sunGlow = sunDot2 * sunDot2;
  // PERF: hoisted -- sunColor depends only on tempShift (uniform per dispatch).
  let sunColor = uniforms.twilightSunColor * 1.5;
  col = mix(col, sunColor, sunGlow * 0.5);

  // Subtle atmospheric layers and haze (reuse single noise sample)
  let atmNoise = skyboxNoise(dir * 4.0 + time * 0.01);
  let layers = sin(y * 20.0 + atmNoise * 2.0) * 0.02;
  col += layers * scatter;

  // Atmospheric dust/haze (reuse noise).
  // mix(col, col * 1.2, haze) == col * (1.0 + 0.2 * haze) -- one scale beats three fmas.
  let haze = scatter * atmNoise * 0.1;
  col *= 1.0 + 0.2 * haze;

  return col;
}
`
