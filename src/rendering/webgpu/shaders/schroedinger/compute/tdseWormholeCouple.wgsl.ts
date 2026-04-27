/**
 * TDSE — ER=EPR Double-trace Wormhole Coupling Shader.
 *
 * Implements `exp(-i·τ·g·P_M)` where `P_M` is the reflection operator across
 * the chosen mirror axis. Because `P_M` is a unitary involution (`P_M² = 1`),
 * the exponential reduces to the closed form
 *
 *   `exp(-i·τ·g·P_M) = cos(τg)·I − i·sin(τg)·P_M`
 *
 * which acts on each mirror pair `(v, v')` (with `v' = M(v)`) as a 2×2
 * rotation in the `(ψ_L, ψ_R)` subspace:
 *
 *   `ψ_new(v)  = cos(τg)·ψ(v)  − i·sin(τg)·ψ(v')`
 *   `ψ_new(v') = cos(τg)·ψ(v') − i·sin(τg)·ψ(v)`
 *
 * Dispatch strategy (a) — "half-space": the compute pass is launched with
 * enough workgroups to cover half the lattice. Each thread maps to a voxel
 * `v` with `coord[axis] < N/2`, reads both `ψ(v)` and `ψ(v')` from the
 * storage buffers, and writes both updated values. No two threads touch the
 * same pair, so no race is possible. This avoids the scratch-copy overhead
 * of strategy (b) at the cost of one division when deriving the mirror
 * index. Grid size along the mirror axis must be even (power-of-two in
 * practice).
 *
 * Requires `tdseUniformsBlock + freeScalarNDIndexBlock` to be prepended so
 * `TDSEUniforms`, `params.strides`, `params.gridSize`, and `linearToND` are
 * available.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseWormholeCoupleBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let tid = gid.x;
  if (params.wormholeCouplingEnabled == 0u) { return; }

  let axis = params.wormholeMirrorAxis;
  // Guard against an axis outside the active lattice (would otherwise yield
  // gridSize=1 and divide-by-zero). No-op in that case.
  if (axis >= params.latticeDim) { return; }
  let Na = params.gridSize[axis];
  if (Na < 2u) { return; }

  // totalSites/2 over-counts the mirrored-pair space for odd Na (e.g. Na=3
  // leaves a self-mirror center row that belongs to no pair). Bound threads
  // by the exact pair count = (totalSites / Na) * (Na/2).
  let halfA = Na >> 1u;
  let pairTotal = (params.totalSites / Na) * halfA;
  if (tid >= pairTotal) { return; }

  // The UI restricts gridSize to powers of two, so blockSize is normally
  // pow2 and the shift/mask fast path applies. A corrupt save or
  // programmatic config can still land a non-pow2 mirror axis size here
  // (e.g. Na=6 → halfA=3), in which case shift/mask aliases distinct
  // pairs onto the same idx and updates the wrong mirror partner. Fall
  // back to integer div/mod when blockSize is not pow2.
  let strideA = params.strides[axis];
  let blockSize = strideA * halfA;
  let naStride = strideA * Na;
  var outer: u32;
  var withinBlock: u32;
  if ((blockSize & (blockSize - 1u)) == 0u) {
    let logBlock = firstTrailingBit(blockSize);
    outer = tid >> logBlock;
    withinBlock = tid & (blockSize - 1u);
  } else {
    outer = tid / blockSize;
    withinBlock = tid % blockSize;
  }
  // strideA stays pow2 across both branches (it's a product of higher-axis
  // dims, all of which are pow2 in the supported configurations), so the
  // innerOffset / coordAStride decomposition still holds.
  let innerOffset = withinBlock & (strideA - 1u);
  // coordAStride = coordA * strideA recovered without an explicit mul:
  // withinBlock = coordA·strideA + innerOffset exactly when strideA is a
  // power of 2, so coordA·strideA = withinBlock − innerOffset. This
  // recombines the shift/mask split without re-multiplying, and lets idx
  // fold to outer * (strideA * Na) + coordA*strideA + innerOffset
  //         = outer * naStride + withinBlock.
  let coordAStride = withinBlock - innerOffset;
  let idx = outer * naStride + withinBlock;
  // Mirror partner: coord (Na-1-coordA) along the mirror axis.
  // (Na - 1 - 2·coordA) · strideA = (Na - 1)·strideA − 2·coordA·strideA;
  // (Na − 1)·strideA is uniform per dispatch (CSE'd), and
  // 2·coordA·strideA is just (coordAStride << 1).
  let mirrorIdx = idx + (Na - 1u) * strideA - (coordAStride << 1u);

  // cos/sin of (0.5·dt·g) are dispatch-uniform; precomputed host-side.
  let c = params.wormholeCosTau;
  let s = params.wormholeSinTau;

  // Read both values BEFORE writing either — prevents races inside a pair.
  let zV  = psi[idx];
  let zVP = psi[mirrorIdx];
  let reV  = zV.x;
  let imV  = zV.y;
  let reVP = zVP.x;
  let imVP = zVP.y;

  // (a − ib)·(x + iy) = (ax + by) + i(ay − bx). Here the coefficient acting on
  // ψ(v') is (−i·s) → real part contribution = +s·im(ψ(v')), imag = −s·re(ψ(v')).
  psi[idx]       = vec2f(c * reV  + s * imVP, c * imV  - s * reVP);
  psi[mirrorIdx] = vec2f(c * reVP + s * imV,  c * imVP - s * reV);
}
`
