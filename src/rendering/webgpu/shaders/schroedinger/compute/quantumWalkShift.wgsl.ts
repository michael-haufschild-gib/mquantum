/**
 * Quantum Walk Conditional Shift Compute Shader
 *
 * Applies the position-dependent shift operator: moves amplitude in direction ±d
 * based on coin state index. Supports periodic or open boundary conditions.
 *
 * When `openBoundary` is set (absorber enabled), out-of-bounds source sites
 * contribute zero — amplitude that would leave the domain is discarded.
 * The PML absorber provides smooth damping before the hard edge.
 * When `openBoundary` is unset, periodic (toroidal) wrapping is used.
 *
 * Coin state mapping:
 *   j = 2d   → shift +1 along axis d
 *   j = 2d+1 → shift -1 along axis d
 *
 * Reads from coinIn, writes to coinOut (ping-pong double buffering).
 * For each destination site, looks backwards to find the source site
 * that contributed each coin state component.
 *
 * Requires freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const quantumWalkShiftBlock = /* wgsl */ `
struct QWShiftUniforms {
  totalSites: u32,
  latticeDim: u32,
  openBoundary: u32,
  _pad0: u32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
}

// QWShiftUniforms binds as storage because the struct embeds scalar arrays
// (array<u32, 12>) with 4-byte stride — spec-forbidden in uniform address
// space. Chrome/Tint accepts it; naga rejects. Storage has no stride restriction.
@group(0) @binding(0) var<storage, read> params: QWShiftUniforms;
@group(0) @binding(1) var<storage, read> coinIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> coinOut: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let destSite = gid.x;
  if (destSite >= params.totalSites) { return; }

  let numCoinStates = 2u * params.latticeDim;
  let destBase = destSite * numCoinStates * 2u;

  // Decompose destination site to N-D coordinates
  let destCoords = linearToND(destSite, params.strides, params.gridSize, params.latticeDim);

  for (var cs: u32 = 0u; cs < numCoinStates; cs = cs + 1u) {
    let dim = cs >> 1u;
    let isPositive = (cs & 1u) == 0u;
    let cs2 = cs << 1u;
    let destOut = destBase + cs2;

    // Source site: shift backwards from destination. (cs=+ dir → source at coord-1)
    let destCoordI = i32(destCoords[dim]);
    let srcCoord = destCoordI + select(1, -1, isPositive);

    let Nd = params.gridSize[dim];
    let Ni = i32(Nd);
    // Open boundary: out-of-bounds sources contribute zero.
    if (params.openBoundary != 0u && (srcCoord < 0 || srcCoord >= Ni)) {
      coinOut[destOut] = 0.0;
      coinOut[destOut + 1u] = 0.0;
    } else {
      // PERF: only one coordinate changes; compute the linear-index delta
      // directly instead of copying destCoords[12] and re-running ndToLinear
      // (which would multiply-add over all dims). For D=11 this saves an
      // array copy + 11 mul-adds per coin-state iteration.
      // Power-of-2 grid dim: (x + N) mod N == (x + N) & (N - 1).
      let srcCoordWrapped = (srcCoord + Ni) & (Ni - 1);
      let delta = srcCoordWrapped - destCoordI;
      let strideDim = i32(params.strides[dim]);
      let srcSite = u32(i32(destSite) + delta * strideDim);
      let srcBase = srcSite * numCoinStates * 2u + cs2;

      coinOut[destOut] = coinIn[srcBase];
      coinOut[destOut + 1u] = coinIn[srcBase + 1u];
    }
  }
}
`
