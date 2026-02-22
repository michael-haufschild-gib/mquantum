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
 * Compute shader bind group layout block
 * Uses a dedicated layout for compute:
 * - Group 0, Binding 0: SchroedingerUniforms
 * - Group 0, Binding 1: BasisVectors
 * - Group 0, Binding 2: GridParams
 * - Group 0, Binding 3: Output texture (storage)
 */
export function generateDensityGridBindingsBlock(
  storageFormat: 'r16float' | 'rgba16float' = 'rgba16float'
): string {
  return /* wgsl */ `
// ============================================
// Compute Shader Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;

// Output texture (write-only)
// r16float is used for density-only mode, rgba16float for phase-capable mode.
@group(0) @binding(3) var densityGrid: texture_storage_3d<${storageFormat}, write>;
`
}

// Backward-compatible default bindings block (rgba16float payload)
export const densityGridBindingsBlock = generateDensityGridBindingsBlock()

/**
 * Extended bindings block that includes the open quantum uniform buffer
 * at group 0, binding 4.
 */
export function generateDensityGridBindingsWithOpenQuantumBlock(
  storageFormat: 'r16float' | 'rgba16float' = 'rgba16float'
): string {
  return /* wgsl */ `
// ============================================
// Compute Shader Bind Groups (Open Quantum)
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;

// Output texture (write-only)
@group(0) @binding(3) var densityGrid: texture_storage_3d<${storageFormat}, write>;

// Open quantum density matrix uniforms
@group(0) @binding(4) var<uniform> oq: OpenQuantumUniforms;
`
}

/**
 * Extended bindings block that includes both the open quantum and
 * hydrogen basis uniform buffers (bindings 4 and 5).
 */
export function generateDensityGridBindingsWithHydrogenBasisBlock(
  storageFormat: 'r16float' | 'rgba16float' = 'rgba16float'
): string {
  return /* wgsl */ `
// ============================================
// Compute Shader Bind Groups (Open Quantum + Hydrogen Basis)
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;

// Output texture (write-only)
@group(0) @binding(3) var densityGrid: texture_storage_3d<${storageFormat}, write>;

// Open quantum density matrix uniforms
@group(0) @binding(4) var<uniform> oq: OpenQuantumUniforms;

// Hydrogen per-basis quantum numbers
@group(0) @binding(5) var<uniform> hydrogenBasis: HydrogenBasisUniforms;
`
}

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

  // Convert grid coordinate to normalized [0,1] space
  // Note: gridSize-1 ensures we sample at grid cell centers including boundaries
  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;

  // Convert to world-space position within bounding volume
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Check if position is within the bounding sphere (dynamic radius)
  // Grid is a cube, but quantum volume is spherical - skip corners
  // PERF: Compare squared distances to avoid sqrt per thread
  let dist2 = dot(worldPos, worldPos);
  let boundR = schroedinger.boundingRadius;
  if (dist2 > boundR * boundR) {
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

  // Convert grid coordinate to world-space position
  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Skip positions outside bounding sphere (dynamic radius)
  // PERF: Compare squared distances to avoid sqrt per thread
  let dist2 = dot(worldPos, worldPos);
  let boundR = schroedinger.boundingRadius;
  if (dist2 > boundR * boundR) {
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

/**
 * Complex multiplication: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
 */
fn complexMulOQ(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

/**
 * Complex conjugate
 */
fn complexConjOQ(a: vec2f) -> vec2f {
  return vec2f(a.x, -a.y);
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate to world-space position
  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Skip positions outside bounding sphere
  let dist2 = dot(worldPos, worldPos);
  let boundR = schroedinger.boundingRadius;
  if (dist2 > boundR * boundR) {
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time
  let t = schroedinger.time * schroedinger.timeScale;

  // Active basis size: use oq.maxK for density matrix mode (supports up to 14)
  let basisK = min(oq.maxK, 14u);

  // Evaluate each basis function ψ_k(x) independently
  // Store as complex values (re, im)
  var basisValues: array<vec2f, 14>;
  for (var k = 0u; k < basisK; k = k + 1u) {
    basisValues[k] = evaluateSingleBasis(worldPos, t, k, schroedinger);
  }

  // Compute n(x) = Σ_{kl} ρ_{kl} · ψ_k(x) · ψ_l*(x)
  // Also track diagonal contribution for coherence fraction
  var totalDensity: f32 = 0.0;
  var diagDensity: f32 = 0.0;

  for (var k = 0u; k < basisK; k = k + 1u) {
    for (var l = 0u; l < basisK; l = l + 1u) {
      let rho_kl = getRho(oq, k, l);
      // ψ_k · ψ_l* = complexMul(ψ_k, conj(ψ_l))
      let prod = complexMulOQ(basisValues[k], complexConjOQ(basisValues[l]));
      // Re(ρ_{kl} · ψ_k · ψ_l*) contributes to density
      totalDensity += rho_kl.x * prod.x - rho_kl.y * prod.y;
    }
    // Diagonal: ρ_{kk} |ψ_k|² (always real)
    let rho_kk = getRho(oq, k, k);
    diagDensity += rho_kk.x * dot(basisValues[k], basisValues[k]);
  }

  // Clamp density to non-negative (numerical noise can cause tiny negatives)
  totalDensity = max(totalDensity, 0.0);

  // Log density for rendering
  let logRho = select(-20.0, log(max(totalDensity, 1e-20)), totalDensity > 1e-10);

  // Coherence fraction: how much of the density comes from off-diagonal terms
  let coherenceFraction = select(0.0,
    1.0 - clamp(diagDensity / max(totalDensity, 1e-10), 0.0, 1.0),
    totalDensity > 1e-10
  );

  // Store: R=density, G=logDensity, B=coherenceFraction, A=0
  textureStore(densityGrid, gid, vec4f(totalDensity, logRho, coherenceFraction, 0.0));
}
`
