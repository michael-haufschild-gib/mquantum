/**
 * WGSL Schrödinger Uniforms
 *
 * Port of GLSL schroedinger/uniforms.glsl to WGSL.
 * Defines uniform structures for quantum wavefunction visualization.
 *
 * @module rendering/webgpu/shaders/schroedinger/uniforms.wgsl
 */

// CANONICAL CONSTANTS: These define array sizes for all quantum modules.
export const MAX_DIM = 11
export const MAX_TERMS = 8
export const MAX_EXTRA_DIM = 8

export const schroedingerUniformsBlock = /* wgsl */ `
// ============================================
// Schrödinger Quantum Configuration Uniforms
// ============================================

// CANONICAL DEFINITIONS
const MAX_DIM: i32 = 11;
const MAX_TERMS: i32 = 8;
const MAX_EXTRA_DIM: i32 = 8;

struct SchroedingerUniforms {
  // Quantum mode selection
  quantumMode: i32,              // 0 = harmonic oscillator, 1 = hydrogen orbital

  // Harmonic oscillator state configuration
  termCount: i32,                // Number of superposition terms (1-8)
  omega: array<f32, 11>,         // Per-dimension frequencies (MAX_DIM)
  quantum: array<i32, 88>,       // Quantum numbers n[k][j] (MAX_TERMS * MAX_DIM = 88)
  coeff: array<vec2f, 8>,        // Complex coefficients c_k = (re, im) (MAX_TERMS)
  energy: array<f32, 8>,         // Precomputed energies E_k (MAX_TERMS)

  // Hydrogen orbital configuration
  principalN: i32,               // Principal quantum number n (1-7)
  azimuthalL: i32,               // Azimuthal quantum number l (0 to n-1)
  magneticM: i32,                // Magnetic quantum number m (-l to +l)
  bohrRadius: f32,               // Bohr radius scale factor (0.5-3.0)
  useRealOrbitals: u32,          // Use real orbitals (px/py/pz) vs complex

  // PERF: Precomputed hydrogen density boost factors
  hydrogenBoost: f32,            // Precomputed: 50 * n² * 3^l
  hydrogenNDBoost: f32,          // Precomputed: uHydrogenBoost * dimFactor
  hydrogenRadialThreshold: f32,  // Precomputed: 25 * n * a0 * (1 + 0.1*l)

  // Hydrogen ND configuration (extra dimensions 4-11)
  extraDimN: array<i32, 8>,      // Quantum numbers for dims 4-11 (MAX_EXTRA_DIM)
  extraDimOmega: array<f32, 8>,  // Frequencies for dims 4-11 (MAX_EXTRA_DIM)

  // Phase animation
  phaseAnimationEnabled: u32,    // Enable time-dependent phase rotation

  // Volume rendering parameters
  timeScale: f32,                // Time evolution speed (0.1-2.0)
  fieldScale: f32,               // Coordinate scale into HO basis (0.5-2.0)
  densityGain: f32,              // Absorption coefficient (0.1-5.0)
  powderScale: f32,              // Multiple scattering effect (0.0-2.0)
  emissionIntensity: f32,        // HDR emission intensity (0.0-5.0)
  emissionThreshold: f32,        // Density threshold for emission (0.0-1.0)
  emissionColorShift: f32,       // Emission color temperature shift (-1.0 to 1.0)
  emissionPulsing: u32,          // Enable phase-based emission pulsing
  rimExponent: f32,              // Fresnel rim falloff (1.0-10.0)
  scatteringAnisotropy: f32,     // Henyey-Greenstein phase function g factor

  // Material properties
  roughness: f32,                // GGX roughness (0.0-1.0)

  // SSS
  sssEnabled: u32,               // Enable subsurface scattering
  sssIntensity: f32,             // SSS intensity (0.0-2.0)
  sssColor: vec3f,               // SSS tint color
  _pad1: f32,
  sssThickness: f32,             // SSS thickness factor (0.1-5.0)
  sssJitter: f32,                // SSS jitter amount (0.0-1.0)

  // Erosion
  erosionStrength: f32,          // Edge erosion strength (0.0-1.0)
  erosionScale: f32,             // Edge erosion scale (0.25-4.0)
  erosionTurbulence: f32,        // Edge erosion turbulence (0.0-1.0)
  erosionNoiseType: i32,         // 0=Worley, 1=Perlin, 2=Hybrid

  // Curl
  curlEnabled: u32,              // Enable curl noise flow
  curlStrength: f32,             // Flow strength (0.0-1.0)
  curlScale: f32,                // Flow scale (0.25-4.0)
  curlSpeed: f32,                // Flow speed (0.1-5.0)
  curlBias: i32,                 // Flow bias (0=None, 1=Up, 2=Out, 3=In)

  // Dispersion
  dispersionEnabled: u32,        // Enable chromatic dispersion
  dispersionStrength: f32,       // Dispersion strength (0.0-1.0)
  dispersionDirection: i32,      // 0=Radial, 1=View
  dispersionQuality: i32,        // 0=Fast, 1=High

  // Shadows
  shadowsEnabled: u32,           // Enable volumetric self-shadowing
  shadowStrength: f32,           // Shadow strength (0.0-2.0)
  shadowSteps: i32,              // Shadow march steps (1-8)

  // Ambient Occlusion
  aoStrength: f32,               // AO strength (0.0-2.0)
  aoSteps: i32,                  // AO cones/steps (3-8)
  aoRadius: f32,                 // AO radius (0.1-2.0)
  aoColor: vec3f,                // AO tint color
  _pad2: f32,

  // Nodal surfaces
  nodalEnabled: u32,             // Enable nodal surface highlighting
  nodalColor: vec3f,             // Nodal surface color
  nodalStrength: f32,            // Nodal highlight strength

  // Energy coloring
  energyColorEnabled: u32,       // Enable energy level coloring

  // Shimmer
  shimmerEnabled: u32,           // Enable uncertainty shimmer
  shimmerStrength: f32,          // Shimmer strength

  // Animation time
  time: f32,                     // Scaled animation time

  // Isosurface mode
  isoEnabled: u32,               // Enable isosurface mode
  isoThreshold: f32,             // Log-density threshold for isosurface

  // Sample count (LOD)
  sampleCount: i32,              // Sample count for loop control

  // Phase shift for isosurface SDF (Mandelbulb-style fractals)
  phaseEnabled: u32,             // Enable phase shift
  phaseTheta: f32,               // Phase offset for theta angle
  phasePhi: f32,                 // Phase offset for phi angle
  _pad3: f32,                    // Alignment padding
}

// ============================================
// N-Dimensional Basis Vectors
// ============================================

struct BasisVectors {
  // Each basis vector has up to 11 components (padded to 12)
  // Stored as 3 vec4f each
  basisX: array<vec4f, 3>,
  basisY: array<vec4f, 3>,
  basisZ: array<vec4f, 3>,
  origin: array<vec4f, 3>,
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get component i from a basis vector array.
 */
fn getBasisComponent(basis: array<vec4f, 3>, i: i32) -> f32 {
  let vecIdx = i / 4;
  let compIdx = i % 4;

  if (vecIdx == 0) {
    return basis[0][compIdx];
  } else if (vecIdx == 1) {
    return basis[1][compIdx];
  } else {
    return basis[2][compIdx];
  }
}

/**
 * Transform a 3D point to D-dimensional space using basis vectors.
 */
fn transformToND(
  p: vec3f,
  basisX: array<vec4f, 3>,
  basisY: array<vec4f, 3>,
  basisZ: array<vec4f, 3>,
  origin: array<vec4f, 3>,
  dimension: i32
) -> array<f32, 11> {
  var result: array<f32, 11>;

  for (var i = 0; i < dimension && i < 11; i++) {
    let bx = getBasisComponent(basisX, i);
    let by = getBasisComponent(basisY, i);
    let bz = getBasisComponent(basisZ, i);
    let o = getBasisComponent(origin, i);

    result[i] = p.x * bx + p.y * by + p.z * bz + o;
  }

  return result;
}

/**
 * Compute squared length of an N-dimensional point.
 */
fn lengthSquaredND(p: array<f32, 11>, dimension: i32) -> f32 {
  var sum: f32 = 0.0;
  for (var i = 0; i < dimension && i < 11; i++) {
    sum += p[i] * p[i];
  }
  return sum;
}

/**
 * Compute length of an N-dimensional point.
 */
fn lengthND(p: array<f32, 11>, dimension: i32) -> f32 {
  return sqrt(lengthSquaredND(p, dimension));
}
`
