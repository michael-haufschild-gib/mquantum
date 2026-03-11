/**
 * WGSL fallback stubs for non-hydrogen shader families.
 *
 * These stubs satisfy symbol resolution for shared volumetric/nodal helpers
 * when hydrogen-specific modules are intentionally excluded at composition time.
 */
export const hydrogenFamilyFallbackBlock = /* wgsl */ `
// ============================================
// Hydrogen Family Fallback Stubs
// ============================================

fn sphericalAngles3D(x: f32, y: f32, z: f32, r3d: f32) -> vec2f {
  return vec2f(0.0, 0.0);
}

fn evalHydrogenNDAngular(l: i32, m: i32, theta: f32, phi: f32, useReal: bool) -> vec2f {
  return vec2f(0.0, 0.0);
}

fn evalHydrogenNDAngularCartesian(l: i32, m: i32, nx: f32, ny: f32, nz: f32, useReal: bool) -> vec2f {
  return vec2f(0.0, 0.0);
}

fn hydrogenRadial(n: i32, l: i32, r: f32, a0: f32) -> f32 {
  return 0.0;
}
`
