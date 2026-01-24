/**
 * Crystalline skybox mode for WGSL - Geometric Voronoi patterns
 * Port of: src/rendering/shaders/skybox/modes/crystalline.glsl.ts
 */
export const crystallineBlock = `
// --- Crystalline Mode: Geometric Voronoi Patterns ---
// Creates an elegant, abstract mathematical feel with iridescent coloring

// Standard 3D Voronoi with 3x3x3 neighborhood for seamless cell boundaries
fn voronoi(x: vec3<f32>) -> vec2<f32> {
  let p = floor(x);
  let f = fract(x);

  var minDist = 1.0;
  var secondDist = 1.0;

  // Full 3x3x3 neighborhood required for seamless cell boundaries
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let b = vec3<f32>(f32(i), f32(j), f32(k));
        let r = b - f + skyboxHash(p + b);
        let d = dot(r, r);

        if (d < minDist) {
          secondDist = minDist;
          minDist = d;
        } else if (d < secondDist) {
          secondDist = d;
        }
      }
    }
  }

  return vec2<f32>(sqrt(minDist), sqrt(secondDist));
}

fn getCrystalline(dir: vec3<f32>, time: f32) -> vec3<f32> {
  var p = dir * uniforms.scale * 3.0;

  // Very slow rotation of the entire pattern
  let rotAngle = time * 0.02;
  let c = cos(rotAngle);
  let s = sin(rotAngle);
  // 2D rotation in xz plane (manual mat2 multiplication)
  let rotatedX = c * p.x - s * p.z;
  let rotatedZ = s * p.x + c * p.z;
  p.x = rotatedX;
  p.z = rotatedZ;

  // Add evolution offset
  p += uniforms.evolution * 2.0;

  // Multi-layer voronoi for depth
  let v1 = voronoi(p * 1.0);
  let v2 = voronoi(p * 2.0 + 100.0);

  // Edge detection - creates the crystal facet lines
  let edge1 = smoothstep(0.02, 0.08, v1.y - v1.x);
  let edge2 = smoothstep(0.02, 0.06, v2.y - v2.x);

  // Cell value for color variation
  let cellValue = v1.x * 0.6 + v2.x * 0.4;

  // Iridescent color based on viewing angle
  var iridescence = dot(dir, vec3<f32>(0.0, 1.0, 0.0)) * 0.5 + 0.5;
  iridescence += sin(cellValue * TAU + time * 0.1) * 0.2;

  var col: vec3<f32>;
  if (uniforms.usePalette > 0.5) {
    col = cosinePalette(iridescence, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    // Add subtle facet highlights
    col = mix(col * 0.3, col, edge1 * edge2);
    // Shimmer on edges using palette highlight color
    // PERF: Use multiplication instead of pow(x, 2.0)
    let shimmerColor = cosinePalette(0.9, uniforms.palA, uniforms.palB, uniforms.palC, uniforms.palD);
    col += shimmerColor * 0.15 * (1.0 - edge1) * iridescence * iridescence;
  } else {
    col = mix(uniforms.color1, uniforms.color2, iridescence);
    col = mix(col * 0.2, col, edge1 * edge2);
    // Shimmer using secondary color
    // PERF: Use multiplication instead of pow(x, 2.0)
    col += uniforms.color2 * 0.15 * (1.0 - edge1) * iridescence * iridescence;
  }

  return col;
}
`
