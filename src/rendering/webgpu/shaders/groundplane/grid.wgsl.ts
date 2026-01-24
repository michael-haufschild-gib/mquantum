/**
 * Ground Plane Grid Shader Functions (WGSL)
 * Port of: src/rendering/shaders/groundplane/grid.glsl.ts
 *
 * Procedural grid rendering for ground plane surfaces.
 */

export const gridUniformsBlock = `
// --- Grid Uniforms ---
struct GridUniforms {
  showGrid: u32,  // bool as u32 (0 = false, 1 = true)
  gridSpacing: f32,
  sectionSpacing: f32,
  gridThickness: f32,
  sectionThickness: f32,
  gridFadeDistance: f32,
  gridFadeStrength: f32,
  _pad: f32,
  gridColor: vec3<f32>,
  _pad2: f32,
  sectionColor: vec3<f32>,
  _pad3: f32,
}

@group(2) @binding(0) var<uniform> gridUniforms: GridUniforms;
`

export const gridFunctionsBlock = `
// --- Grid Functions (adapted from drei Grid) ---

/**
 * Compute grid pattern - exact drei algorithm.
 * Uses LOCAL position (before model transformation) for stable grid.
 * Returns grid intensity (0 = no line, 1 = on line).
 *
 * Note: fwidth() in WGSL requires derivative operations which are only
 * available in fragment shaders. We use dpdx/dpdy.
 */
fn getGrid(localXY: vec2<f32>, size: f32, thickness: f32) -> f32 {
  let r = localXY / size;
  // Guard against fwidth() returning zero in flat regions
  // fwidth(x) = abs(dpdx(x)) + abs(dpdy(x))
  let fw = max(abs(dpdx(r)) + abs(dpdy(r)), vec2<f32>(0.0001));
  let grid = abs(fract(r - 0.5) - 0.5) / fw;
  let line = min(grid.x, grid.y) + 1.0 - thickness;
  return 1.0 - min(line, 1.0);
}

/**
 * Apply grid overlay to surface color.
 * Uses LOCAL position for grid calculation.
 * This works for all wall orientations since PlaneGeometry is always XY.
 */
fn applyGrid(surfaceColor: vec3<f32>, localXY: vec2<f32>, worldPos: vec3<f32>, cameraPos: vec3<f32>) -> vec3<f32> {
  if (gridUniforms.showGrid == 0u) {
    return surfaceColor;
  }

  // Compute cell and section grid lines using LOCAL coordinates
  // This ensures consistent grid for all wall orientations
  let g1 = getGrid(localXY, gridUniforms.gridSpacing, gridUniforms.gridThickness);
  let g2 = getGrid(localXY, gridUniforms.sectionSpacing, gridUniforms.sectionThickness);

  // Distance-based fade using world position
  let dist = length(worldPos - cameraPos);
  var d = 1.0 - min(dist / gridUniforms.gridFadeDistance, 1.0);
  d = pow(d, gridUniforms.gridFadeStrength);

  // Color mixing (drei style)
  let color = mix(gridUniforms.gridColor, gridUniforms.sectionColor, min(1.0, gridUniforms.sectionThickness * g2));

  // Alpha calculation (drei style)
  var alpha = (g1 + g2) * d;
  alpha = mix(0.75 * alpha, alpha, g2);

  // Blend grid over surface
  return mix(surfaceColor, color, alpha);
}
`
