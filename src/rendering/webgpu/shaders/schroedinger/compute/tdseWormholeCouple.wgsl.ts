/**
 * TDSE — ER=EPR Double-trace Wormhole Coupling Shader.
 *
 * Implements `exp(-i·τ·g·P_M)` where `P_M` is the reflection operator across
 * the chosen mirror axis. Because `P_M` is a rank-1 involution (`P_M² = 1`),
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
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

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
  let halfA = Na / 2u;
  let pairTotal = (params.totalSites / Na) * halfA;
  if (tid >= pairTotal) { return; }

  // Map the half-space thread id to a full-lattice voxel index whose
  // coordinate along the mirror axis is < Na/2. This is done by unfolding
  // tid into the lattice coordinates, treating the mirror axis as the
  // slowest-varying "outer" dimension. Concretely, tid = outerBlock * blockSize
  // + innerOffset, where blockSize = strides[axis] (voxels per coord step)
  // and the "outer block" counts how many full (Na/2) steps of axis coord
  // plus how many full strides we've advanced past.
  let strideA = params.strides[axis];
  let blockSize = strideA * halfA;
  let outer = tid / blockSize;
  let withinBlock = tid - outer * blockSize;
  let coordA = withinBlock / strideA;
  let innerOffset = withinBlock - coordA * strideA;
  let idx = outer * (strideA * Na) + coordA * strideA + innerOffset;
  // Mirror partner: coord (Na-1-coordA) along the mirror axis.
  let mirrorIdx = idx + (Na - 1u - 2u * coordA) * strideA;

  let tau = 0.5 * params.dt;
  let c = cos(tau * params.wormholeCouplingG);
  let s = sin(tau * params.wormholeCouplingG);

  // Read both values BEFORE writing either — prevents races inside a pair.
  let reV  = psiRe[idx];
  let imV  = psiIm[idx];
  let reVP = psiRe[mirrorIdx];
  let imVP = psiIm[mirrorIdx];

  // (a − ib)·(x + iy) = (ax + by) + i(ay − bx). Here the coefficient acting on
  // ψ(v') is (−i·s) → real part contribution = +s·im(ψ(v')), imag = −s·re(ψ(v')).
  psiRe[idx]        = c * reV  + s * imVP;
  psiIm[idx]        = c * imV  - s * reVP;
  psiRe[mirrorIdx]  = c * reVP + s * imV;
  psiIm[mirrorIdx]  = c * imVP - s * reV;
}
`
