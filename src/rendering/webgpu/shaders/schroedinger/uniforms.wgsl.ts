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

// Representation-space constants
const REPRESENTATION_POSITION: i32 = 0;
const REPRESENTATION_MOMENTUM: i32 = 1;
const MOMENTUM_UNITS_K: i32 = 0;
const MOMENTUM_UNITS_P: i32 = 1;

// Physical nodal-definition constants
const NODAL_DEFINITION_PSI_ABS: i32 = 0;
const NODAL_DEFINITION_REAL: i32 = 1;
const NODAL_DEFINITION_IMAG: i32 = 2;
const NODAL_DEFINITION_COMPLEX_INTERSECTION: i32 = 3;

// Hydrogen node-family filter constants
const NODAL_FAMILY_ALL: i32 = 0;
const NODAL_FAMILY_RADIAL: i32 = 1;
const NODAL_FAMILY_ANGULAR: i32 = 2;

// Nodal rendering mode constants
const NODAL_RENDER_MODE_BAND: i32 = 0;
const NODAL_RENDER_MODE_SURFACE: i32 = 1;

// Cross-section compositing constants
const CROSS_SECTION_COMPOSITE_OVERLAY: i32 = 0;
const CROSS_SECTION_COMPOSITE_SLICE_ONLY: i32 = 1;

// Cross-section scalar constants
const CROSS_SECTION_SCALAR_DENSITY: i32 = 0;
const CROSS_SECTION_SCALAR_REAL: i32 = 1;
const CROSS_SECTION_SCALAR_IMAG: i32 = 2;

// Physical probability-current style constants
const PROBABILITY_CURRENT_STYLE_MAGNITUDE: i32 = 0;
const PROBABILITY_CURRENT_STYLE_ARROWS: i32 = 1;
const PROBABILITY_CURRENT_STYLE_SURFACE_LIC: i32 = 2;
const PROBABILITY_CURRENT_STYLE_STREAMLINES: i32 = 3;

// Probability-current placement constants
const PROBABILITY_CURRENT_PLACEMENT_ISOSURFACE: i32 = 0;
const PROBABILITY_CURRENT_PLACEMENT_VOLUME: i32 = 1;

// Probability-current color mapping constants
const PROBABILITY_CURRENT_COLOR_MODE_MAGNITUDE: i32 = 0;
const PROBABILITY_CURRENT_COLOR_MODE_DIRECTION: i32 = 1;
const PROBABILITY_CURRENT_COLOR_MODE_CIRCULATION_SIGN: i32 = 2;

// WebGPU uniform buffers require 16-byte alignment for array elements.
// All arrays are packed into vec4f/vec4i types with helper functions for access.
struct SchroedingerUniforms {
  // Quantum mode selection
  quantumMode: i32,              // 0 = harmonic oscillator, 1 = hydrogen ND, 2 = free scalar field

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

  peakDensity: f32,              // Peak |ψ|² for dominant term (auto-computed)
  densityContrast: f32,          // Power-curve exponent for lobe sharpening (1.0=linear, >1=sharper)
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

  // Reserved (formerly erosion, removed)
  _reservedErosion0: f32,
  _reservedErosion1: f32,
  _reservedErosion2: f32,
  _reservedErosion3: i32,

  // Reserved (formerly curl noise flow, removed)
  _reservedCurl0: u32,
  _reservedCurl1: f32,
  _reservedCurl2: f32,
  _reservedCurl3: f32,
  _reservedCurl4: i32,

  // Reserved (formerly dispersion, removed)
  _reservedDispersion0: u32,
  _reservedDispersion1: f32,
  _reservedDispersion2: i32,

  _reservedDispersion3: i32,

  // Reserved (formerly shadows + AO — removed, keeping layout for buffer compatibility)
  _reservedShadow0: u32,
  _reservedShadow1: f32,
  _reservedShadow2: i32,
  _reservedAo0: f32,
  _reservedAo1: i32,
  _reservedAo2: f32,
  _reservedAoColor: vec3f,
  _pad2: f32,

  // Nodal surfaces
  nodalEnabled: u32,             // Enable nodal surface highlighting
  nodalColor: vec3f,             // Nodal surface color
  nodalStrength: f32,            // Nodal highlight strength

  _padEnergy: u32,               // Unused (keeps byte offsets stable)

  // Uncertainty boundary
  uncertaintyBoundaryEnabled: u32,   // Enable confidence-boundary emphasis
  uncertaintyBoundaryStrength: f32,  // Boundary emphasis strength

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
  colorAlgorithm: i32,           // Color algorithm selector (0-11)
  distPower: f32,                // Distribution power for distance-based coloring
  distCycles: f32,               // Distribution cycles
  distOffset: f32,               // Distribution offset

  // Cosine palette coefficients (packed as vec4f for alignment)
  cosineA: vec4f,                // Cosine palette A coefficient (xyz used, w unused)
  cosineB: vec4f,                // Cosine palette B coefficient
  cosineC: vec4f,                // Cosine palette C coefficient
  cosineD: vec4f,                // Cosine palette D coefficient

  // Volumetric fog controls
  fogIntegrationEnabled: u32,    // Enable internal fog integration
  fogContribution: f32,          // Fog contribution strength
  internalFogDensity: f32,       // Internal object-space fog density
  _reservedErosionHQ: u32,       // Reserved (formerly erosionHQ, removed)

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
  uncertaintyConfidenceMass: f32, // Confidence mass used for threshold extraction

  // LCH perceptual color parameters (algorithm 5)
  lchLightness: f32,              // Oklab perceptual lightness (0.1-1.0)
  lchChroma: f32,                 // Oklab perceptual chroma (0.0-0.4)
  uncertaintyBoundaryWidth: f32,  // Boundary width in log-density space
  uncertaintyLogRhoThreshold: f32,// log(rho) threshold at confidence mass

  // Multi-source blend weights (algorithm 6)
  multiSourceWeights: vec4f,      // xyz = depth/radial/normal weights, w = unused

  // Nodal rendering mode controls
  nodalRenderMode: i32,           // 0=band, 1=surface
  _nodalRenderPad0: i32,          // Reserved (kept for stable host buffer offsets)
  _nodalRenderPad1: f32,          // Reserved
  _nodalRenderPad2: f32,          // Reserved

  // Cross-section slice controls
  crossSectionEnabled: u32,       // Enable 2D cross-section plane
  crossSectionCompositeMode: i32, // 0=overlay, 1=slice-only
  crossSectionScalar: i32,        // 0=density, 1=Re(psi), 2=Im(psi)
  crossSectionAutoWindow: u32,    // Auto-map scalar range
  crossSectionPlane: vec4f,       // xyz=normal (unit), w=offset in normalized radius units
  crossSectionWindow: vec4f,      // x=min, y=max, z=opacity, w=thickness
  crossSectionPlaneColor: vec4f,  // rgb=tint, w=reserved

  // Physical probability current (j = Im(conj(psi) * nabla psi))
  probabilityCurrentEnabled: u32,            // Enable j-field overlay
  probabilityCurrentStyle: i32,              // 0=magnitude, 1=arrows, 2=surfaceLIC, 3=streamlines
  probabilityCurrentPlacement: i32,          // 0=isosurface, 1=volume
  probabilityCurrentColorMode: i32,          // 0=magnitude, 1=direction, 2=circulationSign
  probabilityCurrentScale: f32,              // Visual magnitude scale
  probabilityCurrentSpeed: f32,              // Animation speed for pattern advection
  probabilityCurrentDensityThreshold: f32,   // Hide overlay below density threshold
  probabilityCurrentMagnitudeThreshold: f32, // Hide overlay below |j| threshold
  probabilityCurrentLineDensity: f32,        // Glyph/line density
  probabilityCurrentStepSize: f32,           // Integration/sample step size
  probabilityCurrentSteps: i32,              // Integration step count
  probabilityCurrentOpacity: f32,            // Overlay opacity

  // Momentum-space representation controls (appended; keeps legacy offsets stable)
  representationMode: i32,      // 0=position ψ(x), 1=momentum φ(k)
  momentumDisplayMode: i32,     // 0=normalized, 1=k, 2=p
  momentumScale: f32,           // Reciprocal-space zoom factor
  momentumHbar: f32,            // Effective ħ for p=ħk display conversions

  // Radial probability overlay (hydrogen P(r) shells)
  radialProbabilityEnabled: u32,    // offset 1344
  radialProbabilityOpacity: f32,    // offset 1348
  radialProbabilityNorm: f32,       // offset 1352 (CPU-precomputed 1/max(P(r)))
  _padRadialProb0: f32,             // offset 1356
  radialProbabilityColor: vec3f,    // offset 1360 (16-byte aligned: 1360 % 16 = 0)
  _padRadialProb1: f32,             // offset 1372

  // Domain coloring controls (algorithm 8)
  domainColoringParams0: vec4f,     // x=modulusMode(0=log|psi|^2,1=log|psi|), y=contoursEnabled, z=contourDensity, w=contourWidth
  domainColoringParams1: vec4f,     // x=contourStrength, yzw=reserved

  // Diverging palettes:
  // - algorithm 7 (phaseDiverging): uses xyz colors from these vectors
  // - algorithm 9 (diverging Re/Im): also uses w channels below
  divergingNeutralParams: vec4f,    // xyz=neutralColor, w=intensityFloor
  divergingPositiveParams: vec4f,   // xyz=positive wing color, w=component (0=Re, 1=Im)
  divergingNegativeParams: vec4f,   // xyz=negative wing color, w=reserved

  // Wigner phase-space visualization (offset 1456)
  wignerDimensionIndex: i32,        // offset 1456: which dimension to display
  wignerCrossTermsEnabled: u32,     // offset 1460: include cross-Wigner terms
  wignerXRange: f32,                // offset 1464: x-axis half-range (position)
  wignerPRange: f32,                // offset 1468: p-axis half-range (momentum)
  wignerQuadPoints: i32,            // offset 1472: quadrature points for hydrogen
  wignerClassicalOverlay: u32,      // offset 1476: show classical trajectory
  _padWigner0: f32,                 // offset 1480: padding
  _padWigner1: f32,                 // offset 1484: padding
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
