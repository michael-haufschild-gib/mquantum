/**
 * WGSL 1D Eigenfunction Cache Lookup with Cubic Hermite Interpolation
 *
 * Pre-computed φ_n(x, ω) and φ'_n(x, ω) stored in a storage buffer.
 * Replaces expensive per-sample Hermite polynomial + exp() evaluation
 * with cheap buffer lookups + cubic interpolation.
 *
 * Architecture:
 * - Storage buffer: array<vec2f> where .x = φ_n(x), .y = φ'_n(x)
 * - Metadata uniform: per-function domain (xMin, xMax, invRange) + index map
 * - Compile-time selectable interpolation policy:
 *   Catmull-Rom (legacy) or robust monotone Hermite + endpoint extrapolation
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl
 */

/** Number of sample points per cached eigenfunction */
export const EIGEN_CACHE_SAMPLES = 2048

/** Maximum unique (n, ω) pairs (MAX_TERMS × MAX_DIM) */
export const MAX_EIGEN_FUNCS = 88

/**
 * WGSL struct definition + bind group declarations for the eigenfunction cache.
 * Placed at group 2, bindings 2-3.
 */
export const eigenfunctionCacheBindingsBlock = /* wgsl */ `
// ============================================
// Eigenfunction Cache - Bind Group Declarations
// ============================================

const EIGEN_CACHE_SAMPLES: u32 = ${EIGEN_CACHE_SAMPLES}u;
const MAX_EIGEN_FUNCS: u32 = 88u;

struct EigenfunctionCacheMeta {
  numFuncs: u32,
  dimension: u32,
  _pad0: u32,
  _pad1: u32,
  // Per-function metadata: vec4f(xMin, xMax, invRange, 0)
  funcMeta: array<vec4f, 88>,
  // Index map: maps (termIdx * 11 + dimIdx) to function index
  // 88 i32 values packed as 22 vec4<i32>
  indexMap: array<vec4<i32>, 22>,
}

@group(2) @binding(2) var<storage, read> eigenCache: array<vec2f>;
@group(2) @binding(3) var<uniform> eigenMeta: EigenfunctionCacheMeta;
`

/**
 * WGSL lookup functions for the eigenfunction cache.
 * Includes cubic Hermite interpolation and convenience wrappers.
 */
export const eigenfunctionCacheLookupBlock = /* wgsl */ `
// ============================================
// Eigenfunction Cache - Lookup Functions
// ============================================

// Get the cache function index for a given (termIdx, dimIdx) pair
fn getEigenFuncIdx(termIdx: i32, dimIdx: i32) -> i32 {
  let flatIdx = termIdx * 11 + dimIdx;
  let vecIdx = flatIdx >> 2;  // / 4
  let compIdx = flatIdx & 3;  // % 4
  return eigenMeta.indexMap[vecIdx][compIdx];
}

// Read a cache entry: vec2f(φ, φ') at sample index for a given function
fn readCacheEntry(funcIdx: i32, sampleIdx: i32) -> vec2f {
  let idx = clamp(sampleIdx, 0, i32(EIGEN_CACHE_SAMPLES) - 1);
  return eigenCache[funcIdx * i32(EIGEN_CACHE_SAMPLES) + idx];
}

// Clamp tangents to preserve local monotonicity and avoid cubic overshoot.
fn limitMonotoneTangent(delta: f32, tangent: f32) -> f32 {
  if (abs(delta) <= 1e-6) {
    return 0.0;
  }
  if (delta * tangent <= 0.0) {
    return 0.0;
  }
  let maxMag = 3.0 * abs(delta);
  return clamp(tangent, -maxMag, maxMag);
}

fn monotoneHermiteScalar(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
  let delta = p2 - p1;
  var m1 = 0.5 * (p2 - p0);
  var m2 = 0.5 * (p3 - p1);
  m1 = limitMonotoneTangent(delta, m1);
  m2 = limitMonotoneTangent(delta, m2);

  let t2 = t * t;
  let t3 = t2 * t;
  let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
  let h10 = t3 - 2.0 * t2 + t;
  let h01 = -2.0 * t3 + 3.0 * t2;
  let h11 = t3 - t2;
  return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
}

fn monotoneHermiteVec2(p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f, t: f32) -> vec2f {
  return vec2f(
    monotoneHermiteScalar(p0.x, p1.x, p2.x, p3.x, t),
    monotoneHermiteScalar(p0.y, p1.y, p2.y, p3.y, t)
  );
}

// Cached eigenfunction lookup with compile-time-selectable interpolation policy.
// Returns vec2f(φ_n(x), φ'_n(x)).
fn lookupEigenfunction(funcIdx: i32, x: f32) -> vec2f {
  let fMeta = eigenMeta.funcMeta[funcIdx];
  let xMin = fMeta.x;
  let xMax = fMeta.y;
  let invRange = fMeta.z;

  // Robust mode: explicit linear extrapolation outside cache domain.
  if (USE_ROBUST_EIGEN_INTERPOLATION) {
    let left = readCacheEntry(funcIdx, 0);
    let right = readCacheEntry(funcIdx, i32(EIGEN_CACHE_SAMPLES) - 1);
    if (x <= xMin) {
      return vec2f(left.x + left.y * (x - xMin), left.y);
    }
    if (x >= xMax) {
      return vec2f(right.x + right.y * (x - xMax), right.y);
    }
  }

  // Map x to continuous sample index [0, SAMPLES-1]
  let tNorm = clamp((x - xMin) * invRange, 0.0, f32(EIGEN_CACHE_SAMPLES - 1u));
  let i = i32(floor(tNorm));
  let f = tNorm - f32(i);

  // Four sample points for Catmull-Rom spline
  let p0 = readCacheEntry(funcIdx, i - 1);
  let p1 = readCacheEntry(funcIdx, i);
  let p2 = readCacheEntry(funcIdx, i + 1);
  let p3 = readCacheEntry(funcIdx, i + 2);

  if (USE_ROBUST_EIGEN_INTERPOLATION) {
    // Near nodal crossings (sign changes) use linear fallback to avoid cubic ringing.
    let signSensitive = (p0.x * p1.x <= 0.0) || (p1.x * p2.x <= 0.0) || (p2.x * p3.x <= 0.0);
    if (signSensitive) {
      return p1 + f * (p2 - p1);
    }
    return monotoneHermiteVec2(p0, p1, p2, p3, f);
  }

  // Catmull-Rom interpolation (equivalent to cubic Hermite with τ=0.5)
  // h(t) = p1 + 0.5*t*(p2-p0 + t*(2*p0 - 5*p1 + 4*p2 - p3 + t*(3*(p1-p2) + p3 - p0)))
  let f2 = f * f;
  let f3 = f2 * f;
  let result = p1
    + 0.5 * f * (p2 - p0)
    + 0.5 * f2 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3)
    + 0.5 * f3 * (3.0 * (p1 - p2) + p3 - p0);

  return result;
}

// Drop-in replacement for ho1D() using cache lookup
// Returns φ_n(x) (eigenfunction value)
fn ho1DCached(funcIdx: i32, x: f32) -> f32 {
  if (funcIdx < 0) { return 0.0; }
  return lookupEigenfunction(funcIdx, x).x;
}

// Returns φ'_n(x) (eigenfunction derivative)
fn ho1DDerivCached(funcIdx: i32, x: f32) -> f32 {
  if (funcIdx < 0) { return 0.0; }
  return lookupEigenfunction(funcIdx, x).y;
}
`
