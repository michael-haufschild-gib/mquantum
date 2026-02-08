/**
 * Electric Arc Emission (Artistic Effect)
 *
 * Adds thin, sharp, branching electric discharge filaments on the SURFACE
 * of the quantum cloud. Uses abs(cos(noise * freq)) technique: gradient noise
 * displaces a cosine wave, and abs() creates sharp V-shaped zero crossings
 * that form thin bright lines. Purely artistic — not a physical simulation.
 *
 * Key design decisions:
 * - Uses quantum-space coordinates (via mapPosToND) so arcs rotate with the
 *   wavefunction lobes — same approach as erodeDensity(). Model-space coords
 *   would make arcs static while lobes rotate.
 * - Surface confinement via density band-pass: arcs only appear in a thin shell
 *   around the cloud boundary, not deep inside or in empty space.
 *
 * Runtime-gated: when arcEnabled == 0u, computeArcEmission() returns vec3f(0.0)
 * immediately with negligible cost (uniform branch, all threads take same path).
 * No shader recompilation needed to toggle on/off.
 *
 * Dependencies: gradientNoise() from density.wgsl.ts (already in assembly),
 *               mapPosToND() from density.wgsl.ts (already in assembly).
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/arcs.wgsl
 */

export const arcEmissionBlock = /* wgsl */ `
// ============================================
// Electric Arc Emission (Artistic)
// ============================================

fn computeArcEmission(pos: vec3f, rho: f32, time: f32, uniforms: SchroedingerUniforms) -> vec3f {
  // Runtime gate: early exit when arcs disabled (uniform branch, free when all threads agree)
  if (uniforms.arcEnabled == 0u || uniforms.arcIntensity <= 0.001) {
    return vec3f(0.0);
  }

  // Density gate: suppress arcs in near-empty regions
  if (rho < uniforms.arcDensityGate) {
    return vec3f(0.0);
  }

  // Surface confinement: arcs appear on the cloud SURFACE, not deep inside or in empty space.
  // normalizedRho ≈ per-step optical density (rho * densityGain).
  //   Edge  (normalizedRho ~ 0.02-0.5) → arcs visible (the "surface" shell)
  //   Core  (normalizedRho >> 1)        → arcs suppressed (deep interior)
  //   Empty (normalizedRho ~ 0)         → arcs suppressed (outside cloud)
  let normalizedRho = rho * max(uniforms.densityGain, 0.01);
  let surfaceWeight = smoothstep(0.02, 0.15, normalizedRho) * (1.0 - smoothstep(0.5, 2.5, normalizedRho));
  if (surfaceWeight < 0.01) { return vec3f(0.0); }

  // Use quantum-space coordinates so arcs rotate with the wavefunction lobes.
  // IMPORTANT: Model-space pos would create a static noise field that doesn't
  // follow basis-vector rotations — the exact same problem erodeDensity() solves
  // by using quantum-space coords. See density.wgsl.ts erodeDensity() comments.
  let xND = mapPosToND(pos, uniforms);
  let qPos = vec3f(xND[0], xND[1], xND[2]);

  // Animated position in arc-space
  let t = time * uniforms.arcSpeed;
  let p = qPos * uniforms.arcScale;

  // === Layer 1: Primary arc filaments ===
  // Gradient noise displaces a cosine wave; abs(cos()) creates sharp V-shaped
  // zero crossings that form thin bright lines (electric arc technique).
  let n1 = gradientNoise(p + vec3f(t * 0.7, t * -0.3, t * 0.5));
  let wave1 = abs(cos(n1 * uniforms.arcSharpness * PI));
  // Invert: bright where wave ≈ 0 (the zero crossings are the arcs)
  // pow() sharpens: higher thickness → thinner, sharper filaments
  let arc1 = pow(max(1.0 - wave1, 0.0), uniforms.arcThickness);

  // === Layer 2: Secondary arcs at different scale/speed for complexity ===
  let n2 = gradientNoise(p * 1.7 + vec3f(t * -0.5, t * 0.8, t * -0.2) + vec3f(17.1, -31.7, 8.9));
  let wave2 = abs(cos(n2 * uniforms.arcSharpness * 0.7 * PI));
  let arc2 = pow(max(1.0 - wave2, 0.0), uniforms.arcThickness * 1.5);

  // Combine layers (primary dominant, secondary fills gaps)
  let combined = max(arc1 * 0.7, arc2 * 0.3);

  // Sparsity: threshold controls how many arcs are visible
  let sparse = smoothstep(uniforms.arcSparsity, uniforms.arcSparsity + 0.1, combined);

  let arcValue = sparse * uniforms.arcIntensity * surfaceWeight;

  if (arcValue < 0.001) { return vec3f(0.0); }

  return uniforms.arcColor * arcValue;
}
`
