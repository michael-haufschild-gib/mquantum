/**
 * Nebula skybox mode for WGSL - Volumetric clouds
 * Port of: src/rendering/shaders/skybox/modes/nebula.glsl.ts
 */
export const nebulaBlock = `
// --- Nebula Mode: Volumetric Clouds ---
// Optimized nebula with reduced fbm calls for better performance

fn getNebula(dir: vec3<f32>, time: f32) -> vec3<f32> {
  var p = dir * uniforms.scale * 2.0;

  // Slow drift animation
  p.x -= time * 0.05;
  p.z += time * 0.03;

  // Evolution offset
  p += uniforms.evolution * 3.0;

  // --- Single combined fbm for main structure ---
  // Reduced from 4 separate fbm calls to 2
  var mainCoord = p * 0.7;
  mainCoord += vec3<f32>(time * 0.05, 0.0, time * 0.03);

  // Main density with 2 octaves (was 3)
  var mainDensity = skyboxFbm3(mainCoord);
  mainDensity = smoothstep(0.25, 0.75, mainDensity);

  // --- Detail layer with turbulence ---
  let detailCoord = p * 1.5 + mainDensity * uniforms.turbulence * 0.5;
  var detailDensity = skyboxFbm3(detailCoord); // 2-3 octaves
  detailDensity = smoothstep(0.3, 0.7, detailDensity);

  // --- Bright knots (cheap noise instead of fbm) ---
  let knotNoise = skyboxNoise(p * 3.0 + time * 0.05);
  let knots = pow(smoothstep(0.6, 0.9, knotNoise), 3.0) * uniforms.complexity;

  // Combined density
  let totalDensity = mainDensity * 0.6 + detailDensity * 0.25 + knots * 0.25;

  // Simple dust absorption from main density variation
  let absorption = (1.0 - mainDensity) * detailDensity * 0.3;

  // Coloring
  var col: vec3<f32>;
  if (uniforms.usePalette > 0.5) {
    let deepColor = cosinePalette(0.1, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD) * 0.1;
    let emissionColor = cosinePalette(mainDensity * 0.6 + 0.2, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    let knotColor = cosinePalette(0.85, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD) * 1.5;

    col = deepColor;
    col = mix(col, emissionColor, mainDensity * 0.8);
    col = mix(col, deepColor, absorption);
    col += knotColor * knots;
    col *= smoothstep(0.0, 0.4, totalDensity) * 0.7 + 0.3;
  } else {
    let deepColor = uniforms.color1 * 0.1;
    let emissionColor = mix(uniforms.color1, uniforms.color2, mainDensity);
    let knotColor = uniforms.color2 * 1.5;

    col = deepColor;
    col = mix(col, emissionColor, mainDensity * 0.8);
    col = mix(col, deepColor, absorption);
    col += knotColor * knots;
    col *= smoothstep(0.0, 0.4, totalDensity) * 0.7 + 0.3;
  }

  return col;
}
`
