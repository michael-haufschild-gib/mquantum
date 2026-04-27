/**
 * Vortex Core Detection Compute Shader
 *
 * Detects quantized vortex cores by counting phase singularities via
 * plaquette winding. For each 2D plaquette (square of 4 neighboring sites)
 * in the first 3 visible dimensions, computes the discrete phase circulation:
 *
 *   Γ = Σ Δφ around plaquette (with branch-cut aware wrapping to [-π,π])
 *
 * A plaquette with |Γ| ≈ 2π contains a vortex (charge = Γ/2π).
 *
 * Two-pass parallel reduction:
 *   Pass 1: Each workgroup counts vortex plaquettes in its chunk → partial sums
 *   Pass 2: Single workgroup reduces partials → [totalVortexCount, totalPositiveCharge, totalNegativeCharge]
 *
 * Checks plaquettes across all C(D,2) dimension pairs:
 * D=3: 3 planes, D=4: 6 planes, D=5: 10 planes.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(256)
 * @module
 */

/** Pass 1: Count vortex plaquettes per workgroup chunk. */
export const vortexDetectReduceBlock = /* wgsl */ `
struct VortexDetectUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  densityThreshold: f32,  // fraction of maxDensity below which to check for vortices
  maxDensity: f32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> vdParams: VortexDetectUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read> tParams: TDSEUniforms;
@group(0) @binding(3) var<storage, read_write> partialCounts: array<u32>;
@group(0) @binding(4) var<storage, read_write> partialPosCharge: array<u32>;
@group(0) @binding(5) var<storage, read_write> partialNegCharge: array<u32>;

var<workgroup> shared_count: array<u32, 256>;
var<workgroup> shared_pos: array<u32, 256>;
var<workgroup> shared_neg: array<u32, 256>;

const VORTEX_PI:  f32 = 3.14159265358979323846;
const VORTEX_TAU: f32 = 6.28318530717958647692;

// Wrap phase difference to [-π, π]. Two predicated subs on GPU; no branch penalty.
fn wrapPhase(dp: f32) -> f32 {
  var w = dp;
  if (w > VORTEX_PI)  { w -= VORTEX_TAU; }
  if (w < -VORTEX_PI) { w += VORTEX_TAU; }
  return w;
}

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;

  var vCount: u32 = 0u;
  var posCount: u32 = 0u;
  var negCount: u32 = 0u;

  if (idx < vdParams.totalSites) {
    let coords = linearToND(idx, tParams.strides, tParams.gridSize, tParams.latticeDim);

    // Check density: only look for vortices where density is low
    let z0 = psi[idx];
    let re0 = z0.x;
    let im0 = z0.y;
    let density = re0 * re0 + im0 * im0;
    let threshold = vdParams.densityThreshold * vdParams.maxDensity;

    // Only check if density is below threshold (vortex core region)
    if (density < threshold && density > 0.0) {
      // Check plaquettes in all C(D,2) dimension pairs for N-D vortex detection.
      // For D=3: planes (0,1), (0,2), (1,2) — standard 3D vortex lines.
      // For D=4: adds (0,3), (1,3), (2,3) — detects vortex surfaces in all planes.
      // For D=5+: all pairs — detects vortex volumes across all codimension-2 planes.
      let totalDims = tParams.latticeDim;

      // PERF: phi at idx (the (0,0) corner of every plaquette) is invariant
      // across all (da, db) iterations. Hoist the atan2 once instead of
      // recomputing C(D,2) times per site (1× for D=2, 55× for D=11).
      let phi00 = atan2(im0, re0);

      // PERF: phi at idx + strides[d] (the (1,0) corner along axis d, and the
      // (0,1) corner along axis d when d is the second loop index) depends only
      // on a single axis, not the (da, db) pair. Precompute once per axis and
      // reuse: saves up to 88 atan2/site at D=11 (44 phi10 + 44 phi01).
      // Sized for latticeDim up to 16 (current max is 11). Entries past
      // totalDims are never read; entries at boundary are zero-initialized
      // and never read because the (da, db) loop skips boundary plaquettes.
      var phiDim: array<f32, 16>;
      for (var d: u32 = 0u; d < totalDims; d++) {
        if (coords[d] < tParams.gridSize[d] - 1u) {
          let zd = psi[idx + tParams.strides[d]];
          phiDim[d] = atan2(zd.y, zd.x);
        }
      }

      for (var da: u32 = 0u; da < totalDims; da++) {
        for (var db: u32 = da + 1u; db < totalDims; db++) {
          // Skip if at boundary (can't form plaquette)
          if (coords[da] >= tParams.gridSize[da] - 1u || coords[db] >= tParams.gridSize[db] - 1u) {
            continue;
          }

          // Get phase at the other 3 plaquette corners: (1,0), (1,1), (0,1).
          // phi10 and phi01 come from the precomputed per-axis array; phi11
          // depends on both axes and must be computed per (da, db) pair.
          let strideA = tParams.strides[da];
          let strideB = tParams.strides[db];

          let z11 = psi[idx + strideA + strideB];
          let phi10 = phiDim[da];
          let phi11 = atan2(z11.y, z11.x);
          let phi01 = phiDim[db];

          // Phase circulation around plaquette
          let circulation = wrapPhase(phi10 - phi00)
                          + wrapPhase(phi11 - phi10)
                          + wrapPhase(phi01 - phi11)
                          + wrapPhase(phi00 - phi01);

          // Vortex if |circulation| > π (should be ≈ ±2π)
          if (abs(circulation) > 3.0) {
            vCount += 1u;
            if (circulation > 0.0) {
              posCount += 1u;
            } else {
              negCount += 1u;
            }
          }
        }
      }
    }
  }

  shared_count[local] = vCount;
  shared_pos[local] = posCount;
  shared_neg[local] = negCount;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_count[local] += shared_count[local + stride];
      shared_pos[local] += shared_pos[local + stride];
      shared_neg[local] += shared_neg[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    partialCounts[wid.x] = shared_count[0];
    partialPosCharge[wid.x] = shared_pos[0];
    partialNegCharge[wid.x] = shared_neg[0];
  }
}
`

/** Pass 2: Reduce partial counts → final vortex statistics. Single workgroup. */
export const vortexDetectFinalizeBlock = /* wgsl */ `
struct VortexDetectUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  latticeDim: u32,
  densityThreshold: f32,
  maxDensity: f32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> vdParams: VortexDetectUniforms;
@group(0) @binding(1) var<storage, read> partialCounts: array<u32>;
@group(0) @binding(2) var<storage, read> partialPosCharge: array<u32>;
@group(0) @binding(3) var<storage, read> partialNegCharge: array<u32>;
@group(0) @binding(4) var<storage, read_write> result: array<u32>;

var<workgroup> shared_count: array<u32, 256>;
var<workgroup> shared_pos: array<u32, 256>;
var<workgroup> shared_neg: array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  var cVal: u32 = 0u;
  var pVal: u32 = 0u;
  var nVal: u32 = 0u;
  var i = local;
  while (i < vdParams.numWorkgroups) {
    cVal += partialCounts[i];
    pVal += partialPosCharge[i];
    nVal += partialNegCharge[i];
    i += 256u;
  }
  shared_count[local] = cVal;
  shared_pos[local] = pVal;
  shared_neg[local] = nVal;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_count[local] += shared_count[local + stride];
      shared_pos[local] += shared_pos[local + stride];
      shared_neg[local] += shared_neg[local + stride];
    }
    workgroupBarrier();
  }

  // result: [0] = total vortex plaquettes, [1] = positive charge, [2] = negative charge
  if (local == 0u) {
    result[0] = shared_count[0];
    result[1] = shared_pos[0];
    result[2] = shared_neg[0];
  }
}
`
