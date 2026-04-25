/**
 * Density Grid Compute Shader
 *
 * Pre-computes a 3D density texture from the quantum wavefunction.
 * This replaces expensive per-pixel density evaluations during raymarching
 * with cheap texture lookups.
 *
 * Architecture:
 * - Input: Quantum uniforms, basis vectors, grid parameters
 * - Output: 64×64×64 (or configurable) r16float/rgba16float 3D texture
 * - Workgroup: 8×8×8 threads
 * - Dispatch: (gridSize/8)³ workgroups
 *
 * Expected performance improvement: 3-6x FPS increase by reducing
 * ~480 density evaluations per pixel to ~96 texture lookups.
 */

/**
 * Grid parameters uniform struct
 */
export const gridParamsBlock = /* wgsl */ `
// ============================================
// Density Grid Compute Parameters
// ============================================

struct GridParams {
  gridSize: vec3u,      // Grid resolution (e.g., 64, 64, 64)
  _pad0: u32,           // Padding for 16-byte alignment
  worldMin: vec3f,      // World-space minimum (e.g., -2, -2, -2)
  _pad1: f32,           // Padding
  worldMax: vec3f,      // World-space maximum (e.g., +2, +2, +2)
  _pad2: f32,           // Padding
}
`

/**
 * Compute shader bind group layout block.
 *
 * Base bindings (always included):
 * - Group 0, Binding 0: SchroedingerUniforms
 * - Group 0, Binding 1: BasisVectors
 * - Group 0, Binding 2: GridParams
 * - Group 0, Binding 3: Output texture (storage)
 *
 * Optional bindings:
 * - Binding 4: OpenQuantumUniforms (when `includeOpenQuantum` is true)
 * - Binding 5: HydrogenBasisUniforms (when `includeHydrogenBasis` is true)
 *
 * @param opts.storageFormat - Texture format: 'r16float' (density-only) or 'rgba16float' (phase-capable)
 * @param opts.includeOpenQuantum - Include open quantum density matrix uniforms at binding 4
 * @param opts.includeHydrogenBasis - Include hydrogen basis quantum numbers at binding 5
 */
export function generateDensityGridBindingsBlock(
  opts: {
    storageFormat?: 'r16float' | 'rgba16float'
    includeOpenQuantum?: boolean
    includeHydrogenBasis?: boolean
  } = {}
): string {
  const {
    storageFormat = 'rgba16float',
    includeOpenQuantum = false,
    includeHydrogenBasis = false,
  } = opts

  if (includeHydrogenBasis && !includeOpenQuantum) {
    throw new Error('includeHydrogenBasis requires includeOpenQuantum')
  }

  let wgsl = /* wgsl */ `
// ============================================
// Compute Shader Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;

// Output texture (write-only)
@group(0) @binding(3) var densityGrid: texture_storage_3d<${storageFormat}, write>;
`

  if (includeOpenQuantum) {
    wgsl += /* wgsl */ `
// Open quantum density matrix uniforms
@group(0) @binding(4) var<uniform> oq: OpenQuantumUniforms;
`
  }

  if (includeHydrogenBasis) {
    wgsl += /* wgsl */ `
// Hydrogen per-basis quantum numbers
@group(0) @binding(5) var<uniform> hydrogenBasis: HydrogenBasisUniforms;
`
  }

  return wgsl
}

// Backward-compatible default bindings block (rgba16float payload)
export const densityGridBindingsBlock = generateDensityGridBindingsBlock()

/**
 * Main compute shader entry point
 *
 * Each thread computes density for one grid cell.
 * The density value is stored in a 3D texture for later
 * sampling during raymarching.
 */
export const densityGridComputeBlock = /* wgsl */ `
// ============================================
// Density Grid Compute Shader Entry Point
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check - skip threads outside grid
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate directly to world-space.
  // PERF: fold uvw + mix into one fma so the per-thread cost is
  // 1 vec3 add + 1 vec3 fma. The uniform gridToWorld is computed from
  // two uniforms and is hoistable by the driver.
  let gridToWorld = (gridParams.worldMax - gridParams.worldMin) / vec3f(gridParams.gridSize);
  let worldPos = fma(vec3f(gid) + 0.5, gridToWorld, gridParams.worldMin);

  // Check if position is within the bounding sphere (dynamic radius).
  // PERF: precompute boundR² once so the per-thread compare is a scalar no-op.
  let boundR = schroedinger.boundingRadius;
  let boundR2 = boundR * boundR;
  let dist2 = dot(worldPos, worldPos);
  if (dist2 > boundR2) {
    // Outside bounding sphere - store zero density
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time (matching fragment shader convention)
  let t = schroedinger.time * schroedinger.timeScale;

  // Sample density at this grid point using existing quantum functions.
  // sampleDensityWithPhaseComponents returns vec4f(rho, logRho, spatialPhase, relativePhase).
  let densityResult = sampleDensityWithPhaseComponents(worldPos, t, schroedinger);

  // Extract density value only in r16 mode.
  let rho = densityResult.x;

  // Store density in the 3D texture
  textureStore(densityGrid, gid, vec4f(rho, 0.0, 0.0, 0.0));
}
`

/**
 * Extended compute shader that also stores phase information
 * for phase-based coloring during rendering.
 *
 * Output format (rgba16float):
 * - R: density (rho)
 * - G: log density (s)
 * - B: spatial phase
 * - A: relative phase to spatial reference arg(conj(psi_ref)*psi)
 */
export const densityGridWithPhaseComputeBlock = /* wgsl */ `
// ============================================
// Density Grid with Phase - Compute Shader
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate to world-space position.
  // PERF: 1/gridSize hoisted so per-thread cost is a vec3 multiply, not a vec3 divide.
  let gridSizeF = vec3f(gridParams.gridSize);
  let invGridSize = 1.0 / gridSizeF;
  let uvw = (vec3f(gid) + 0.5) * invGridSize;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Skip positions outside bounding sphere (dynamic radius).
  // PERF: precompute boundR² to keep the per-thread test to a single compare.
  let boundR = schroedinger.boundingRadius;
  let boundR2 = boundR * boundR;
  let dist2 = dot(worldPos, worldPos);
  if (dist2 > boundR2) {
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time
  let t = schroedinger.time * schroedinger.timeScale;

  // Sample density with both spatial and relative phase channels.
  let densityResult = sampleDensityWithPhaseComponents(worldPos, t, schroedinger);

  // densityResult = vec4f(rho, logRho, spatialPhase, relativePhase)
  let rho = densityResult.x;
  let logRho = densityResult.y;
  let spatialPhase = densityResult.z;
  let relativePhase = densityResult.w;

  // Store all values
  textureStore(densityGrid, gid, vec4f(rho, logRho, spatialPhase, relativePhase));
}
`

/**
 * Density matrix compute shader entry point.
 *
 * Evaluates n(x) = Tr(ρ|x⟩⟨x|) = Σ_{kl} ρ_{kl} ψ_k(x) ψ_l*(x)
 * where ψ_k are the individual basis wavefunctions.
 *
 * Output format (rgba16float):
 *   R: total density n(x)
 *   G: log density
 *   B: coherence fraction (off-diagonal contribution / total)
 *   A: reserved (0)
 */
export const densityMatrixComputeBlock = /* wgsl */ `
// ============================================
// Density Matrix Compute Shader
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate to world-space position.
  // PERF: hoist 1/gridSize so per-thread work is a vec3 multiply, not a divide.
  let gridSizeF = vec3f(gridParams.gridSize);
  let invGridSize = 1.0 / gridSizeF;
  let uvw = (vec3f(gid) + 0.5) * invGridSize;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Sphere clipping: skip cube corners outside the bounding sphere.
  // Basis functions (HO: Gaussian decay, hydrogen: exponential decay) are
  // negligible beyond the bounding radius. The density-grid raymarcher
  // samples only from the texture — no inline fallback exists — so zero
  // values in corners are handled correctly via empty-skip acceleration.
  let boundR = schroedinger.boundingRadius;
  let boundR2 = boundR * boundR;
  let dist2 = dot(worldPos, worldPos);
  if (dist2 > boundR2) {
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time
  let t = schroedinger.time * schroedinger.timeScale;

  // Map 3D position to ND coordinates ONCE, shared across all basis evaluations.
  // Previously each evaluateSingleBasis call redundantly recomputed this transform.
  let xND = mapPosToND(worldPos, schroedinger);

  // Active basis size: use oq.maxK for density matrix mode (supports up to 14)
  let basisK = min(u32(oq.maxK), 14u);

  // Evaluate each basis function ψ_k(x) independently and cache |ψ_k|².
  // PERF: caching |ψ_k|² skips K(K-1)/2 redundant dot(pl,pl) calls in the
  // inner cross-term loop (up to ~90 dots per voxel at K=14), and also lets
  // us skip the inner-loop basisValues[l] load entirely when that basis is
  // negligible at this grid point — matters because array<vec2f,14> often
  // lives in private/scratch memory.
  var basisValues: array<vec2f, 14>;
  var basisMag2: array<f32, 14>;
  for (var k = 0u; k < basisK; k = k + 1u) {
    let v = evaluateSingleBasis(xND, t, k, schroedinger);
    basisValues[k] = v;
    basisMag2[k] = dot(v, v);
  }

  // Compute n(x) = Σ_{kl} ρ_{kl} · ψ_k(x) · ψ_l*(x)
  // Hermitian symmetry: ρ_{lk} = conj(ρ_{kl}), so off-diagonal pairs contribute
  // 2·Re(ρ_{kl} · ψ_k · ψ_l*). Reduces K² iterations to K(K+1)/2.
  var totalDensity: f32 = 0.0;
  var diagDensity: f32 = 0.0;

  for (var k = 0u; k < basisK; k = k + 1u) {
    // PERF: skip basis states with negligible amplitude at this grid point
    let psi_k_sq = basisMag2[k];
    if (psi_k_sq < 1e-20) { continue; }

    // Diagonal: ρ_{kk} |ψ_k|² (ρ_{kk} is real for Hermitian ρ)
    let rho_kk = getRho(oq, k, k);
    totalDensity += rho_kk.x * psi_k_sq;
    diagDensity += rho_kk.x * psi_k_sq;

    // Off-diagonal: 2·Re(ρ_{kl} · ψ_k · ψ_l*) for l > k
    // PERF: inline complex cross-term to avoid intermediate vec2f
    let pk = basisValues[k];
    for (var l = k + 1u; l < basisK; l = l + 1u) {
      // PERF: cached |ψ_l|² — skip array load when basis l is negligible.
      if (basisMag2[l] < 1e-20) { continue; }
      let rho_kl = getRho(oq, k, l);
      // PERF: skip negligible coherence (common after decoherence)
      if (dot(rho_kl, rho_kl) < 1e-20) { continue; }
      let pl = basisValues[l];
      // Re(ψ_k · ψ_l*) = dot(ψ_k, ψ_l), Im(ψ_k · ψ_l*) = ψk.y·ψl.x - ψk.x·ψl.y
      totalDensity += 2.0 * (rho_kl.x * dot(pk, pl) - rho_kl.y * (pk.y * pl.x - pk.x * pl.y));
    }
  }

  // Clamp density to non-negative (numerical noise can cause tiny negatives)
  totalDensity = max(totalDensity, 0.0);

  // Coherence fraction: ratio of off-diagonal contribution (boost-independent)
  let coherenceFraction = select(0.0,
    1.0 - clamp(diagDensity / max(totalDensity, 1e-10), 0.0, 1.0),
    totalDensity > 1e-10
  );

  // Apply uniform visualization boost for hydrogen ND mode.
  // This replaces the per-basis boost that was removed from evaluateSingleBasis,
  // ensuring correct relative scaling between cross-terms and diagonals.
  if (QUANTUM_MODE_DEFAULT >= QUANTUM_MODE_HYDROGEN_ND) {
    totalDensity *= schroedinger.hydrogenNDBoost;
  }

  // Log density for rendering. Branch instead of select() so log() is
  // not evaluated on near-zero densities (common in empty regions).
  var logRho: f32;
  if (totalDensity > 1e-10) {
    logRho = log(totalDensity);
  } else {
    logRho = -20.0;
  }

  // Store: R=density, G=logDensity, B=coherenceFraction, A=0
  textureStore(densityGrid, gid, vec4f(totalDensity, logRho, coherenceFraction, 0.0));
}
`
