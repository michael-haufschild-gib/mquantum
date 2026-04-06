/**
 * WGSL Volume integration loop for Schrödinger density field
 *
 * Performs front-to-back compositing along rays through the volume.
 * Uses Beer-Lambert absorption and emission accumulation.
 *
 * Key optimizations:
 * - Early ray termination when transmittance is low
 * - Adaptive step size based on density
 * - Gaussian bounds allow aggressive culling
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/integration.wgsl
 */

/**
 * Tetrahedral gradient sampling - shared between isosurface and volumetric modes.
 * Extracted so both rendering paths can compute surface/volume normals.
 */
export const volumeGradientBlock = /* wgsl */ `
// ============================================
// Tetrahedral Gradient Sampling
// ============================================
// Uses symmetric 4-point stencil for combined density+gradient computation
// More accurate than forward differences (O(h^2) vs O(h)) with same sample count

// Tetrahedral stencil vertices (regular tetrahedron, equidistant from origin)
// Normalized to unit distance: each vertex is 1/sqrt(3) from origin
const TETRA_V0: vec3f = vec3f(1.0, 1.0, -1.0) * 0.5773503;
const TETRA_V1: vec3f = vec3f(1.0, -1.0, 1.0) * 0.5773503;
const TETRA_V2: vec3f = vec3f(-1.0, 1.0, 1.0) * 0.5773503;
const TETRA_V3: vec3f = vec3f(-1.0, -1.0, -1.0) * 0.5773503;

// Result structure for combined density+gradient sampling
struct TetraSample {
  rho: f32,       // Probability density (averaged from 4 samples)
  s: f32,         // Log-density (averaged)
  phase: f32,     // Spatial phase (averaged)
  gradient: vec3f // Gradient of log-density
}

/**
 * Combined density+gradient via tetrahedral finite differences.
 * Samples 4 points in symmetric tetrahedral pattern.
 * Returns: averaged density/phase at center + O(h^2) accurate gradient.
 */
fn sampleWithTetrahedralGradient(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> TetraSample {
  // Sample at 4 tetrahedral vertices
  let d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t, uniforms);
  let d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t, uniforms);
  let d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t, uniforms);
  let d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t, uniforms);

  // Average for center approximation
  let rho = (d0.x + d1.x + d2.x + d3.x) * 0.25;
  let s = (d0.y + d1.y + d2.y + d3.y) * 0.25;
  let phase = (d0.z + d1.z + d2.z + d3.z) * 0.25;

  // Gradient from tetrahedral stencil (scale factor: 3/(4*delta) = 0.75/delta)
  let grad = (TETRA_V0 * d0.y + TETRA_V1 * d1.y +
              TETRA_V2 * d2.y + TETRA_V3 * d3.y) * (0.75 / delta);

  return TetraSample(rho, s, phase, grad);
}

/**
 * Convenience function: gradient-only (for cold path where density already known).
 * Still uses 4 tetrahedral samples for symmetric O(h^2) accuracy.
 */
fn computeGradientTetrahedral(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let s0 = sFromRho(sampleDensity(pos + TETRA_V0 * delta, t, uniforms));
  let s1 = sFromRho(sampleDensity(pos + TETRA_V1 * delta, t, uniforms));
  let s2 = sFromRho(sampleDensity(pos + TETRA_V2 * delta, t, uniforms));
  let s3 = sFromRho(sampleDensity(pos + TETRA_V3 * delta, t, uniforms));

  return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}

/**
 * Tetrahedral gradient sampling of log-density at a position.
 */
fn computeGradientTetrahedralAtPos(pos: vec3f, t: f32, delta: f32, uniforms: SchroedingerUniforms) -> vec3f {
  let s0 = sFromRho(sampleDensityAtPos(pos + TETRA_V0 * delta, t, uniforms));
  let s1 = sFromRho(sampleDensityAtPos(pos + TETRA_V1 * delta, t, uniforms));
  let s2 = sFromRho(sampleDensityAtPos(pos + TETRA_V2 * delta, t, uniforms));
  let s3 = sFromRho(sampleDensityAtPos(pos + TETRA_V3 * delta, t, uniforms));

  return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}
`

/**
 * Core volume integration block: constants, VolumeResult struct, shared helpers.
 * Always included for 3D rendering. Struct definitions (NodalSample, NodalSurfaceHit)
 * remain here so both real and stub blocks can reference them.
 */
export const volumeIntegrationBlock = /* wgsl */ `
// ============================================
// Volume Integration (Beer-Lambert Compositing)
// ============================================

// Maximum samples per ray (iteration budget, clamped by sampleCount from uniforms)
const MAX_VOLUME_SAMPLES: i32 = 128;

// 1% remaining transmittance → max 2.56/256 sRGB levels → below quantization noise.
// Conservative 2.5× margin over minimum perceptible delta (1/255 ≈ 0.004).
const MIN_TRANSMITTANCE: f32 = 0.01;

// Minimum density to consider for accumulation (below f32 precision for alpha)
const MIN_DENSITY: f32 = 1e-8;
// At ρ=1e-7 for Gaussian ψ: r≈4σ (deep tail). 2-point probe guards against missed spikes.
const EMPTY_SKIP_THRESHOLD: f32 = 1e-7;
// 4× step at ρ<1e-7: alpha contribution ≈ σ·1e-7·4·stepLen ≈ 8e-9·σ. Sub-pixel.
const EMPTY_SKIP_FACTOR: f32 = 4.0;
// transmittance × max_remaining_alpha at this threshold < 0.1%. Below 8-bit precision.
const MIN_REMAINING_CONTRIBUTION: f32 = 0.001;
// Upper ρ bound for early-exit estimate. Normalized HO peak ≈ 1/(π^1.5) ≈ 0.18;
// high-n hydrogen peaks ≈ 2-5. 8.0 provides ≥1.5× safety margin. (computeAlpha clamps at 10.)
const MAX_REMAINING_DENSITY_BOUND: f32 = 8.0;

// Note: QUANTUM_MODE_* constants defined in uniforms.wgsl.ts

// Result structure for volume raymarching
// Contains fields for temporal reprojection support
struct VolumeResult {
  color: vec3f,
  alpha: f32,
  iterationCount: i32,   // Number of iterations performed (for debug visualization)
  primaryHitT: f32,      // Model-space ray distance to first significant density hit (for temporal reprojection)
}

/**
 * Compute time value for animation.
 */
fn getVolumeTime(uniforms: SchroedingerUniforms) -> f32 {
  return uniforms.time * uniforms.timeScale;
}

/**
 * Apply density contrast sharpening via smoothstep sigmoid transfer function.
 * Uses smoothstep(0, width, normalized) where width = 1/contrast.
 *
 * Effect: mid-range densities are BOOSTED toward peak (lobes stay same size),
 * while very low tail densities are suppressed to zero (kills blur/noise).
 * This creates a sharper opaque→transparent transition at lobe boundaries
 * without shrinking the visible lobe extent.
 *
 * contrast=1.0: smoothstep with width=1.0 (gentle S-curve sharpening)
 * contrast=1.5: width=0.67, saturates above 67% of peak
 * contrast=2.0: moderate (width=0.50, saturates above 50% of peak)
 * contrast=3.0: aggressive (width=0.33, saturates above 33% of peak)
 */
fn applyDensityContrast(rho: f32, uniforms: SchroedingerUniforms) -> f32 {
  if (uniforms.peakDensity <= 0.0) { return rho; }
  let normalized = clamp(rho / uniforms.peakDensity, 0.0, 1.0);
  let width = 1.0 / uniforms.densityContrast;
  return smoothstep(0.0, width, normalized) * uniforms.peakDensity;
}

// ============================================
// Shared Structs (used by nodal + probability current + stubs)
// ============================================

struct NodalSample {
  intensity: f32,
  signValue: f32,
  colorMode: i32,
  envelopeWeight: f32,
}

struct NodalScalarSample {
  value: f32,
  signValue: f32,
  amplitude: f32,
  colorMode: i32,
}

struct NodalSurfaceHit {
  hitMask: f32,
  t: f32,
  signValue: f32,
  colorMode: i32,
  normal: vec3f,
  _pad: f32,
}

// Combined nodal + gradient result (performance: shares tetrahedral samples)
struct NodalWithGradient {
  nodal: NodalSample,
  gradient: vec3f, // Density gradient from same tetrahedral psi samples
  rho: f32,        // Average density
  s: f32,          // Average log-density
}

// Sample complex wavefunction ψ at world position.
fn samplePsiWithFlow(pos: vec3f, t: f32, uniforms: SchroedingerUniforms) -> vec2f {
  let xND = mapPosToND(pos, uniforms);
  return evalPsi(xND, t, uniforms);
}
`

// Re-export compositing helpers — shared by all three raymarching functions
export { volumeCompositingBlock } from './volumeCompositing.wgsl'

// Re-export nodal surfaces from dedicated module — extracted for file-size management
export { nodalSurfacesBlock, nodalSurfacesStubBlock } from './nodalSurfaces.wgsl'

// Re-export probability current from dedicated module — extracted for file-size management
export { probabilityCurrentBlock, probabilityCurrentStubBlock } from './probabilityCurrent.wgsl'

// Re-export raymarching block from dedicated module
export { volumeRaymarchBlock } from './volumeRaymarch.wgsl'

// Re-export grid raymarching block from dedicated module
export { generateVolumeRaymarchGridBlock } from './volumeRaymarchGrid.wgsl'

// EOF — nodalSurfaces and probabilityCurrent blocks extracted to dedicated files
