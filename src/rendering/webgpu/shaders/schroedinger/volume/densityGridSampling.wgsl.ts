/**
 * Density Grid Sampling Utilities
 *
 * WGSL functions for sampling pre-computed quantum density values from a 3D texture.
 * These replace expensive per-pixel wavefunction evaluations (Laguerre + Legendre +
 * spherical harmonics, ~85-90 cycles per step) with cheap texture lookups during raymarching.
 *
 * The grid texture format depends on device capability:
 * - rgba16float: R=rho, G=logRho, B=spatialPhase, A=relativePhase
 * - r16float: R=rho only (fallback)
 *
 * Coordinate mapping: world pos in [-boundingRadius, +boundingRadius] → UVW [0, 1]
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/densityGridSampling
 */

/**
 * Bind group declarations for density grid texture.
 * Added to Group 2 (object-specific) alongside Schroedinger uniforms + basis + eigencache.
 *
 * @param startBinding The binding index to start from (after object uniforms)
 */
export function generateDensityGridFragmentBindings(startBinding: number = 4): string {
  return /* wgsl */ `
// ============================================
// Density Grid Texture Bindings (Fragment)
// ============================================

@group(2) @binding(${startBinding}) var densityGridTexture: texture_3d<f32>;
@group(2) @binding(${startBinding + 1}) var densityGridSampler: sampler;
`
}

/**
 * Bind group declaration + sampling function for pre-computed gradient normals.
 * Only included when USE_PRECOMPUTED_NORMALS is true (analytic modes with density grid).
 */
export function generateNormalGridFragmentBinding(startBinding: number = 7): string {
  return /* wgsl */ `
@group(2) @binding(${startBinding}) var normalGridTexture: texture_3d<f32>;

/**
 * Sample pre-computed gradient normal from the normal grid texture.
 * Returns vec3f normal direction. Returns zero-length vector when
 * gradient magnitude is too small (density peak / empty region),
 * signaling the caller to fall back to viewDir.
 */
fn sampleNormalFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let uvw = worldToDensityGridUVW(pos, uniforms);
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec3f(0.0, 1.0, 0.0);
  }
  let packed = textureSampleLevel(normalGridTexture, densityGridSampler, uvw, 0.0);
  if (packed.w < 0.01) {
    return vec3f(0.0);
  }
  return packed.xyz;
}
`
}

/**
 * Bind group declarations for free-scalar analysis texture.
 * Reuses the same sampler as the density grid (trilinear filtering).
 * Added to Group 2 (object-specific) after density grid bindings.
 *
 * @param startBinding The binding index for the analysis texture
 */
export function generateAnalysisTextureBindings(startBinding: number = 6): string {
  return /* wgsl */ `
// ============================================
// Analysis Texture Bindings (Fragment)
// ============================================

@group(2) @binding(${startBinding}) var analysisTexture: texture_3d<f32>;
`
}

/**
 * Analysis texture sampling function for fragment-shader educational color modes.
 * Samples per-voxel physics observables from the analysis 3D texture.
 */
export const analysisTextureSamplingBlock = /* wgsl */ `
// ============================================
// Analysis Texture Sampling Functions
// ============================================

/**
 * Sample analysis data from the free-scalar analysis 3D texture.
 * Contents depend on the active educational mode:
 *   Hamiltonian/Character: R=K, G=gradE, B=V, A=E
 *   Energy Flux: R=Sx, G=Sy, B=Sz, A=|S|
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return vec4f with analysis data channels
 */
fn sampleAnalysisFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  let uvw = worldToDensityGridUVW(pos, uniforms);

  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec4f(0.0);
  }

  return textureSampleLevel(analysisTexture, densityGridSampler, uvw, 0.0);
}
`

/**
 * Density grid sampling functions for fragment-shader raymarching.
 * Replaces inline wavefunction evaluation with texture lookups.
 */
export const densityGridSamplingBlock = /* wgsl */ `
// ============================================
// Density Grid Sampling Functions
// ============================================

/**
 * Convert world position to density grid UVW coordinates.
 * Maps [-boundingRadius, +boundingRadius] to [0, 1].
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return UVW coordinates for texture sampling
 */
fn worldToDensityGridUVW(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let bound = uniforms.boundingRadius;
  var gridPos = pos;

  // Free-scalar density textures are now written in model space by the writeGrid
  // compute shader (which applies basis-rotated N-D slicing). No additional
  // basis remap is needed here — gridPos = pos (identity).
  // Hydrogen/HO density textures also bake basis/origin during compute write
  // (mapPosToND), so gridPos = pos is correct for all modes.

  return (gridPos + vec3f(bound)) / (2.0 * bound);
}

/**
 * Sample density data from pre-computed 3D grid texture.
 *
 * Returns (rho, logRho, spatialPhase, relativePhase) when rgba16float format is available.
 * Returns (rho, 0, 0, 0) for r16float fallback.
 *
 * When position is outside grid bounds, returns zero density.
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return vec4f with density data channels
 */
fn sampleDensityFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  let uvw = worldToDensityGridUVW(pos, uniforms);

  // Clamp check: positions outside [0,1] UVW are outside the grid
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec4f(0.0);
  }

  // Use textureSampleLevel (explicit LOD=0) instead of textureSample
  // to avoid non-uniform control flow issues in the raymarching loop.
  // The density grid has a single mip level, so level 0 is always correct.
  return textureSampleLevel(densityGridTexture, densityGridSampler, uvw, 0.0);
}

/**
 * Compute log-density gradient from grid using central differences.
 * Returns ∇s = ∇log(ρ+ε), consistent with tetrahedral and analytical gradient methods.
 * Uses 6 axis-aligned texture samples (2 per axis) for gradient estimation.
 *
 * @param pos World-space position
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return Gradient vector (ds/dx, ds/dy, ds/dz) where s = log(ρ + ε)
 */
fn computeGradientFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // PERF: Compute base UVW once, then offset in UVW space directly.
  // This avoids 6 redundant worldToDensityGridUVW calls (each does div + add).
  let bound = uniforms.boundingRadius;
  let invDiameter = uniforms.invBoundingRadius * 0.5; // = 1 / (2 * bound)

  // Step size in UVW space: 2 texels / gridSize
  let uvwStep = 2.0 / DENSITY_GRID_SIZE;
  let baseUVW = (pos + vec3f(bound)) * invDiameter;

  // Sample 6 neighbors in UVW space with zero-outside-grid semantics.
  // Matches sampleDensityFromGrid: positions outside [0,1] return zero,
  // preventing clamp-to-edge from creating spurious gradients at the boundary.
  let uxp = baseUVW + vec3f(uvwStep, 0.0, 0.0);
  let uxn = baseUVW - vec3f(uvwStep, 0.0, 0.0);
  let uyp = baseUVW + vec3f(0.0, uvwStep, 0.0);
  let uyn = baseUVW - vec3f(0.0, uvwStep, 0.0);
  let uzp = baseUVW + vec3f(0.0, 0.0, uvwStep);
  let uzn = baseUVW - vec3f(0.0, 0.0, uvwStep);
  let sxp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxp, 0.0), all(uxp >= vec3f(0.0)) && all(uxp <= vec3f(1.0)));
  let sxn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxn, 0.0), all(uxn >= vec3f(0.0)) && all(uxn <= vec3f(1.0)));
  let syp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyp, 0.0), all(uyp >= vec3f(0.0)) && all(uyp <= vec3f(1.0)));
  let syn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyn, 0.0), all(uyn >= vec3f(0.0)) && all(uyn <= vec3f(1.0)));
  let szp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzp, 0.0), all(uzp >= vec3f(0.0)) && all(uzp <= vec3f(1.0)));
  let szn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzn, 0.0), all(uzn >= vec3f(0.0)) && all(uzn <= vec3f(1.0)));

  // World-space half-distance between sample points (each offset is ±uvwStep
  // = ±2 texels in UVW = ±(2/N * 2*bound) in world, total 2h = 8*bound/N).
  let eps = bound * (4.0 / DENSITY_GRID_SIZE);

  if (IS_DUAL_CHANNEL) {
    let gradX = (sxp.r + sxp.g) - (sxn.r + sxn.g);
    let gradY = (syp.r + syp.g) - (syn.r + syn.g);
    let gradZ = (szp.r + szp.g) - (szn.r + szn.g);
    let gradRho = vec3f(gradX, gradY, gradZ) / (2.0 * eps);
    let rhoCenter = textureSampleLevel(densityGridTexture, densityGridSampler, baseUVW, 0.0);
    let rhoTotal = rhoCenter.r + rhoCenter.g;
    return gradRho / max(rhoTotal + 1e-8, 1e-8);
  } else if (DENSITY_GRID_HAS_PHASE) {
    let gradX = sxp.g - sxn.g;
    let gradY = syp.g - syn.g;
    let gradZ = szp.g - szn.g;
    return vec3f(gradX, gradY, gradZ) / (2.0 * eps);
  } else {
    let gradX = sxp.r - sxn.r;
    let gradY = syp.r - syn.r;
    let gradZ = szp.r - szn.r;
    let gradRho = vec3f(gradX, gradY, gradZ) / (2.0 * eps);
    let rho = textureSampleLevel(densityGridTexture, densityGridSampler, baseUVW, 0.0).r;
    return gradRho / max(rho + 1e-8, 1e-8);
  }
}

/**
 * Compute the Bohmian quantum potential Q(x) = -½·∇²R(x)/R(x), where R = sqrt(ρ),
 * via a 7-point second-order central-difference Laplacian on the density grid.
 *
 * World half-step h = 2·boundingRadius / DENSITY_GRID_SIZE (one texel). The
 * Laplacian denominator is h·h. For any stationary state of H = -½∇² + V the
 * identity Q + V = E holds where R is numerically well-defined. Boundary
 * handling: voxels whose CENTRE falls outside the grid return 0 up front;
 * individual neighbours that fall outside the grid are treated as rho=0
 * samples via select(vec4f(0.0), ..., inBounds) and still contribute to the
 * stencil (matching the CPU mirror). Voxels where the raw density is below
 * the near-vacuum cutoff (rho < 1e-12 which is R < 1e-6) also return 0 so
 * the colour-mode branch paints them as neutral grey.
 *
 * The helper reads ρ from the R channel exclusively. The Dirac strategy forces
 * fieldView=totalDensity and Pauli mode hides quantumPotential from the selector
 * when this algorithm is active, so the R channel is guaranteed to hold total
 * density (not a dual-channel spinor split or a non-density scalar like spin /
 * current / phase). Summing r + g on a dual-channel grid would be physically
 * wrong for anything other than particleAntiparticleSplit anyway, so the helper
 * does not attempt to do so.
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return Q at pos as f32
 */
fn computeQuantumPotentialFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> f32 {
  let bound = uniforms.boundingRadius;
  let invDiameter = uniforms.invBoundingRadius * 0.5;

  // Single-texel step in UVW space — gives higher spatial resolution than
  // the 2-texel stencil used by computeGradientFromGrid.
  let uvwStep = 1.0 / DENSITY_GRID_SIZE;
  let baseUVW = (pos + vec3f(bound)) * invDiameter;

  // If the centre itself falls outside the grid, the voxel is meaningless.
  if (any(baseUVW < vec3f(0.0)) || any(baseUVW > vec3f(1.0))) {
    return 0.0;
  }

  let uxp = baseUVW + vec3f(uvwStep, 0.0, 0.0);
  let uxn = baseUVW - vec3f(uvwStep, 0.0, 0.0);
  let uyp = baseUVW + vec3f(0.0, uvwStep, 0.0);
  let uyn = baseUVW - vec3f(0.0, uvwStep, 0.0);
  let uzp = baseUVW + vec3f(0.0, 0.0, uvwStep);
  let uzn = baseUVW - vec3f(0.0, 0.0, uvwStep);

  let sc  = textureSampleLevel(densityGridTexture, densityGridSampler, baseUVW, 0.0);
  let sxp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxp, 0.0), all(uxp >= vec3f(0.0)) && all(uxp <= vec3f(1.0)));
  let sxn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxn, 0.0), all(uxn >= vec3f(0.0)) && all(uxn <= vec3f(1.0)));
  let syp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyp, 0.0), all(uyp >= vec3f(0.0)) && all(uyp <= vec3f(1.0)));
  let syn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyn, 0.0), all(uyn >= vec3f(0.0)) && all(uyn <= vec3f(1.0)));
  let szp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzp, 0.0), all(uzp >= vec3f(0.0)) && all(uzp <= vec3f(1.0)));
  let szn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzn, 0.0), all(uzn >= vec3f(0.0)) && all(uzn <= vec3f(1.0)));

  let rhoC  = sc.r;
  let rhoXp = sxp.r;
  let rhoXn = sxn.r;
  let rhoYp = syp.r;
  let rhoYn = syn.r;
  let rhoZp = szp.r;
  let rhoZn = szn.r;

  // Raw-density cutoff: compare unfloored rhoC against R_ZERO_CUTOFF² = 1e-12.
  // Applying the 1e-8 floor first would make sqrt(max(·,1e-8)) ≥ 1e-4 > 1e-6,
  // so the near-vacuum gate would never trigger and the caller would see
  // stencil noise on numerically-zero density regions instead of a zeroed Q.
  if (rhoC < 1e-12) {
    return 0.0;
  }
  let Rc  = sqrt(max(rhoC,  1e-8));

  let Rxp = sqrt(max(rhoXp, 1e-8));
  let Rxn = sqrt(max(rhoXn, 1e-8));
  let Ryp = sqrt(max(rhoYp, 1e-8));
  let Ryn = sqrt(max(rhoYn, 1e-8));
  let Rzp = sqrt(max(rhoZp, 1e-8));
  let Rzn = sqrt(max(rhoZn, 1e-8));

  // World half-step h = 2·bound / DENSITY_GRID_SIZE (one texel).
  let h = (2.0 * bound) / DENSITY_GRID_SIZE;
  let hSq = h * h;
  let laplR = (Rxp + Rxn + Ryp + Ryn + Rzp + Rzn - 6.0 * Rc) / hSq;
  return (-0.5 * laplR) / max(Rc, 1e-4);
}

// ------------------------------------------------------------------
// Vortex density — plaquette line integral of ∇θ · dl
// ------------------------------------------------------------------
//
// Topological charge per voxel: sum the wrapped phase winding of the three
// coordinate-plane plaquettes anchored at the voxel corner,
//
//     nu(x) = (|W_xy| + |W_yz| + |W_zx|) / (2*pi)
//
// where W is the sum of four wrapped edge phase differences around a unit
// plaquette. Smooth regions produce nu ≈ 0; vortex cores quantize to multiples
// of 1. Phase is read from the density grid's B channel — only rgba16float
// density grids carry it, so r16float fallbacks shortcut to 0.

/**
 * Wrap a raw phase difference into the principal branch (-pi, pi].
 * Classic shortest-arc formula: dTheta - 2*pi * round(dTheta / (2*pi)).
 */
fn wrapPhase(dTheta: f32) -> f32 {
  return dTheta - TAU * round(dTheta * INV_TAU);
}

/**
 * True when all four texel-indexed corners of a plaquette lie inside the
 * density grid ([0, N-1]^3, where N = DENSITY_GRID_SIZE). Used to discard
 * boundary plaquettes whose winding is ambiguous.
 */
fn allInBounds4(a: vec3i, b: vec3i, c: vec3i, d: vec3i) -> bool {
  let N = i32(DENSITY_GRID_SIZE);
  return all(a >= vec3i(0)) && all(a < vec3i(N)) &&
         all(b >= vec3i(0)) && all(b < vec3i(N)) &&
         all(c >= vec3i(0)) && all(c < vec3i(N)) &&
         all(d >= vec3i(0)) && all(d < vec3i(N));
}

/**
 * Fetch the spatial phase stored in the density grid's B channel at a
 * discrete texel index. Returns 0 for out-of-grid texels. r16float grids
 * always return 0 because their B channel is a constant-zero swizzle.
 *
 * Uses textureLoad (nearest-texel fetch) rather than textureSampleLevel
 * because linear filtering interpolates across the ±pi branch cut, which
 * corrupts wrapped edge differences and the quantised plaquette winding.
 * The plaquette winding formula is only topologically well-defined when the
 * four corner phases come from discrete texel centres.
 */
fn samplePhaseOrZero(ti: vec3i) -> f32 {
  let N = i32(DENSITY_GRID_SIZE);
  if (any(ti < vec3i(0)) || any(ti >= vec3i(N))) { return 0.0; }
  let s = textureLoad(densityGridTexture, ti, 0);
  return s.b;
}

/**
 * Compute the discrete line integral of ∇theta around a single four-corner
 * unit-texel plaquette using wrapped edge differences between textureLoad
 * samples at the corner texels. Returns 0 if any corner falls outside the
 * density grid.
 *
 * Corners traverse the loop c00 → c10 → c11 → c01 → c00. Sign depends on the
 * traversal direction and the defect orientation, but the caller only uses
 * |W| so sign is irrelevant.
 *
 * The bounds check runs BEFORE the four texture fetches so out-of-grid
 * plaquettes incur zero texture bandwidth.
 */
fn plaquetteWinding(c00: vec3i, c10: vec3i, c11: vec3i, c01: vec3i) -> f32 {
  if (!allInBounds4(c00, c10, c11, c01)) { return 0.0; }
  let p00 = samplePhaseOrZero(c00);
  let p10 = samplePhaseOrZero(c10);
  let p11 = samplePhaseOrZero(c11);
  let p01 = samplePhaseOrZero(c01);
  let d0 = wrapPhase(p10 - p00);
  let d1 = wrapPhase(p11 - p10);
  let d2 = wrapPhase(p01 - p11);
  let d3 = wrapPhase(p00 - p01);
  return d0 + d1 + d2 + d3;
}

/**
 * Compute the per-voxel topological-charge magnitude by summing the wrapped
 * plaquette windings across the three coordinate planes anchored at pos.
 * Returns 0 for density grids that carry no phase (r16float fallback).
 */
fn computeVortexDensityFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> f32 {
  if (!DENSITY_GRID_HAS_PHASE) { return 0.0; }

  let bound = uniforms.boundingRadius;
  let invDiameter = uniforms.invBoundingRadius * 0.5;
  let baseUVW = (pos + vec3f(bound)) * invDiameter;

  // Quantise to the nearest texel corner. Phase must be read from discrete
  // texel centres via textureLoad (see samplePhaseOrZero); linear filtering
  // across the ±pi branch cut would corrupt the winding. floor() anchors
  // the plaquette to the bottom-left corner of the enclosing texel cell,
  // and negative out-of-grid positions produce negative texel indices that
  // allInBounds4 will reject.
  let baseTi = vec3i(floor(baseUVW * DENSITY_GRID_SIZE));

  // xy plaquette at fixed z — corners offset in x and y.
  let xy00 = baseTi;
  let xy10 = baseTi + vec3i(1, 0, 0);
  let xy11 = baseTi + vec3i(1, 1, 0);
  let xy01 = baseTi + vec3i(0, 1, 0);
  let w_xy = plaquetteWinding(xy00, xy10, xy11, xy01);

  // yz plaquette at fixed x — corners offset in y and z.
  let yz00 = baseTi;
  let yz10 = baseTi + vec3i(0, 1, 0);
  let yz11 = baseTi + vec3i(0, 1, 1);
  let yz01 = baseTi + vec3i(0, 0, 1);
  let w_yz = plaquetteWinding(yz00, yz10, yz11, yz01);

  // zx plaquette at fixed y — corners offset in z and x.
  let zx00 = baseTi;
  let zx10 = baseTi + vec3i(0, 0, 1);
  let zx11 = baseTi + vec3i(1, 0, 1);
  let zx01 = baseTi + vec3i(1, 0, 0);
  let w_zx = plaquetteWinding(zx00, zx10, zx11, zx01);

  return (abs(w_xy) + abs(w_yz) + abs(w_zx)) * INV_TAU;
}
`
