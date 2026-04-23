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

  for (var cs: u32 = 0u; cs < numCoinStates; cs++) {
    let dim = cs / 2u;
    let isPositive = (cs % 2u) == 0u;

    // Source site: shift backwards from destination
    // If this coin state shifts +1, the source was at coord-1 (and vice versa)
    var srcCoord: i32;
    if (isPositive) {
      srcCoord = i32(destCoords[dim]) - 1;
    } else {
      srcCoord = i32(destCoords[dim]) + 1;
    }

    // Open boundary: out-of-bounds sources contribute zero (amplitude leaves the domain).
    // Periodic boundary: wrap via modular arithmetic (default when absorber is off).
    if (params.openBoundary != 0u && (srcCoord < 0 || srcCoord >= i32(params.gridSize[dim]))) {
      coinOut[destBase + cs * 2u] = 0.0;
      coinOut[destBase + cs * 2u + 1u] = 0.0;
    } else {
      var srcCoords = destCoords;
      srcCoords[dim] = u32((srcCoord + i32(params.gridSize[dim])) % i32(params.gridSize[dim]));

      let srcSite = ndToLinear(srcCoords, params.strides, params.latticeDim);
      let srcBase = srcSite * numCoinStates * 2u + cs * 2u;

      coinOut[destBase + cs * 2u] = coinIn[srcBase];
      coinOut[destBase + cs * 2u + 1u] = coinIn[srcBase + 1u];
    }
  }
}
`
