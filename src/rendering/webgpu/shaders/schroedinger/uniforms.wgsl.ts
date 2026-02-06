/**
 * WGSL Schrödinger Uniforms
 *
 * Port of GLSL schroedinger/uniforms.glsl to WGSL.
 * Defines uniform structures for quantum wavefunction visualization.
 *
 * NOTE: All arrays use vec4f/vec4i packing for WebGPU 16-byte alignment requirement.
 * Use helper functions (getOmega, getQuantum, getCoeff, getEnergy, etc.) to access values.
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

// Quantum mode constants (used throughout all quantum modules)
const QUANTUM_MODE_HARMONIC: i32 = 0;
const QUANTUM_MODE_HYDROGEN_ND: i32 = 1;

// Physical nodal-definition constants
const NODAL_DEFINITION_PSI_ABS: i32 = 0;
const NODAL_DEFINITION_REAL: i32 = 1;
const NODAL_DEFINITION_IMAG: i32 = 2;
const NODAL_DEFINITION_COMPLEX_INTERSECTION: i32 = 3;

// Hydrogen node-family filter constants
const NODAL_FAMILY_ALL: i32 = 0;
const NODAL_FAMILY_RADIAL: i32 = 1;
const NODAL_FAMILY_ANGULAR: i32 = 2;

// WebGPU uniform buffers require 16-byte alignment for array elements.
// All arrays are packed into vec4f/vec4i types with helper functions for access.
struct SchroedingerUniforms {
  // Quantum mode selection
  quantumMode: i32,              // 0 = harmonic oscillator, 1 = hydrogen ND

  // Harmonic oscillator state configuration
  termCount: i32,                // Number of superposition terms (1-8)
  _padScalar0: i32,              // Padding for alignment
  _padScalar1: i32,              // Padding for alignment

  // Packed arrays (16-byte aligned)
  // omega: 11 f32 values packed into 3 vec4f (12 slots, use 11)
  omega: array<vec4f, 3>,

  // quantum: 88 i32 values (MAX_TERMS * MAX_DIM = 8 * 11) packed into 22 vec4i
  quantum: array<vec4<i32>, 22>,

  // coeff: 8 complex values (vec2f each) packed into 8 vec4f (xy = value, zw = unused)
  coeff: array<vec4f, 8>,

  // energy: 8 f32 values packed into 2 vec4f
  energy: array<vec4f, 2>,

  // Hydrogen configuration (scalar block)
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
  // extraDimN: 8 i32 values packed into 2 vec4i
  extraDimN: array<vec4<i32>, 2>,

  // extraDimOmega: 8 f32 values packed into 2 vec4f
  extraDimOmega: array<vec4f, 2>,

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

  // Reserved (formerly curl noise flow, removed)
  _reservedCurl0: u32,
  _reservedCurl1: f32,
  _reservedCurl2: f32,
  _reservedCurl3: f32,
  _reservedCurl4: i32,

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

  // Color algorithm system (matches WebGL uniform system)
  colorAlgorithm: i32,           // Color algorithm selector (0-13)
  distPower: f32,                // Distribution power for distance-based coloring
  distCycles: f32,               // Distribution cycles
  distOffset: f32,               // Distribution offset

  // Cosine palette coefficients (packed as vec4f for alignment)
  cosineA: vec4f,                // Cosine palette A coefficient (xyz used, w unused)
  cosineB: vec4f,                // Cosine palette B coefficient
  cosineC: vec4f,                // Cosine palette C coefficient
  cosineD: vec4f,                // Cosine palette D coefficient

  // Volumetric fog and erosion quality controls
  fogIntegrationEnabled: u32,    // Enable internal fog integration
  fogContribution: f32,          // Fog contribution strength
  internalFogDensity: f32,       // Internal object-space fog density
  erosionHQ: u32,                // High-quality erosion mode toggle

  // Dynamic bounding radius (replaces fixed BOUND_R constant)
  boundingRadius: f32,           // Bounding sphere radius (physics-based, ≥ 2.0)
  invBoundingRadius: f32,        // Precomputed 1.0 / boundingRadius
  phaseMaterialityEnabled: u32,  // Enable phase-dependent materiality (plasma vs smoke)
  phaseMaterialityStrength: f32, // Blend strength for phase materiality (0.0-1.0)
  interferenceEnabled: u32,      // Enable interference fringing
  interferenceAmp: f32,          // Fringe amplitude (0.0-1.0)
  interferenceFreq: f32,         // Fringe frequency / number of rings (1.0-50.0)
  interferenceSpeed: f32,        // Animation speed of fringe flow

  // Physical nodal controls (appended for stable offsets of existing fields)
  nodalDefinition: i32,          // 0=|psi|, 1=Re, 2=Im, 3=Re∩Im
  nodalTolerance: f32,           // Epsilon in wavefunction-space
  nodalFamilyFilter: i32,        // 0=all, 1=radial, 2=angular (hydrogen only)
  nodalLobeColoringEnabled: u32, // Use sign/lobe color mapping
  nodalColorReal: vec3f,         // Color for Re(psi)=0
  _padNodal0: f32,
  nodalColorImag: vec3f,         // Color for Im(psi)=0
  _padNodal1: f32,
  nodalColorPositive: vec3f,     // Positive lobe color
  _padNodal2: f32,
  nodalColorNegative: vec3f,     // Negative lobe color
  _padNodal3: f32,

  // Probability Current Flow
  probabilityFlowEnabled: u32,    // Enable density-modulated flow noise
  probabilityFlowSpeed: f32,      // Flow animation speed (0.1-5.0)
  probabilityFlowStrength: f32,   // Flow modulation strength (0.0-1.0)
  _padFlow0: f32,                 // Alignment padding

  // LCH perceptual color parameters (algorithm 5)
  lchLightness: f32,              // Oklab perceptual lightness (0.1-1.0)
  lchChroma: f32,                 // Oklab perceptual chroma (0.0-0.4)
  _padLch0: f32,                  // Alignment padding for vec4f
  _padLch1: f32,                  // Alignment padding for vec4f

  // Multi-source blend weights (algorithm 6)
  multiSourceWeights: vec4f,      // xyz = depth/radial/normal weights, w = unused
}

// ============================================
// Packed Array Access Helpers
// ============================================

// Get omega[i] from packed array<vec4f, 3>
fn getOmega(uniforms: SchroedingerUniforms, i: i32) -> f32 {
  let vecIdx = i / 4;
  let compIdx = i % 4;
  let v = uniforms.omega[vecIdx];
  if (compIdx == 0) { return v.x; }
  else if (compIdx == 1) { return v.y; }
  else if (compIdx == 2) { return v.z; }
  else { return v.w; }
}

// Get quantum[k * MAX_DIM + j] from packed array<vec4i, 22>
// quantum numbers are stored as n[k][j] where k is term index, j is dimension
fn getQuantum(uniforms: SchroedingerUniforms, idx: i32) -> i32 {
  let vecIdx = idx / 4;
  let compIdx = idx % 4;
  let v = uniforms.quantum[vecIdx];
  if (compIdx == 0) { return v.x; }
  else if (compIdx == 1) { return v.y; }
  else if (compIdx == 2) { return v.z; }
  else { return v.w; }
}

// Get quantum number n[k][j] for term k, dimension j
fn getQuantumNumber(uniforms: SchroedingerUniforms, termIdx: i32, dimIdx: i32) -> i32 {
  return getQuantum(uniforms, termIdx * MAX_DIM + dimIdx);
}

// Get coeff[k] as vec2f (real, imag) from packed array<vec4f, 8>
fn getCoeff(uniforms: SchroedingerUniforms, k: i32) -> vec2f {
  return uniforms.coeff[k].xy;
}

// Get energy[k] from packed array<vec4f, 2>
fn getEnergy(uniforms: SchroedingerUniforms, k: i32) -> f32 {
  let vecIdx = k / 4;
  let compIdx = k % 4;
  let v = uniforms.energy[vecIdx];
  if (compIdx == 0) { return v.x; }
  else if (compIdx == 1) { return v.y; }
  else if (compIdx == 2) { return v.z; }
  else { return v.w; }
}

// Get extraDimN[i] from packed array<vec4i, 2>
fn getExtraDimN(uniforms: SchroedingerUniforms, i: i32) -> i32 {
  let vecIdx = i / 4;
  let compIdx = i % 4;
  let v = uniforms.extraDimN[vecIdx];
  if (compIdx == 0) { return v.x; }
  else if (compIdx == 1) { return v.y; }
  else if (compIdx == 2) { return v.z; }
  else { return v.w; }
}

// Get extraDimOmega[i] from packed array<vec4f, 2>
fn getExtraDimOmega(uniforms: SchroedingerUniforms, i: i32) -> f32 {
  let vecIdx = i / 4;
  let compIdx = i % 4;
  let v = uniforms.extraDimOmega[vecIdx];
  if (compIdx == 0) { return v.x; }
  else if (compIdx == 1) { return v.y; }
  else if (compIdx == 2) { return v.z; }
  else { return v.w; }
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
