/**
 * Host-precomputed harmonic-oscillator superposition terms.
 *
 * Splits `term_k = c_k * exp(-i * E_k * t)` out of the fragment shader and
 * computes it once per frame on the host. At 1080p 60fps with 8 terms this
 * lifts ~4.7B GPU ops/s (8 cos+sin and 8 complex multiplies per pixel).
 *
 * @module rendering/webgpu/renderers/uniformPackingHOTerms
 */

import { MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index

/**
 * Compute and write the per-term HO time factors term_k = c_k * exp(-i * E_k * t)
 * into the SchroedingerUniforms.precomputedTerm slot.
 *
 * Reads termCount, energy[k], and (post-momentum-transform) coeff[k] from the
 * already-packed buffer views, so it MUST be invoked AFTER
 * `packSchroedingerUniforms` and AFTER `applyHOMomentumTransform`. The
 * transform rotates coeff[k] by (-i)^{Σ n_j} per term, so precomputing
 * earlier would bake the wrong coefficient into the term.
 *
 * The host computes cos/sin in f64 and stores into Float32Array; the truncated
 * f32 is at least as precise as the GPU's per-pixel f32 transcendental.
 *
 * Slots beyond termCount are zeroed so a previous frame's higher-k terms can't
 * leak into the current state if termCount shrank.
 *
 * @param floatView - Schroedinger uniform buffer Float32 view.
 * @param intView - Schroedinger uniform buffer Int32 view (for termCount).
 * @param animationTime - Current animation time (matches uniforms.time).
 * @param timeScale - Time-scale multiplier (matches uniforms.timeScale).
 */
export function packPrecomputedHOTerms(
  floatView: Float32Array,
  intView: Int32Array,
  animationTime: number,
  timeScale: number
): void {
  // t matches the shader's `getVolumeTime(uniforms) = uniforms.time * uniforms.timeScale`.
  const t = animationTime * timeScale
  const termCount = Math.min(Math.max(intView[I.termCount] ?? 0, 0), MAX_TERMS)

  for (let k = 0; k < termCount; k++) {
    const energy = floatView[I.energy + k] ?? 0
    const coeffRe = floatView[I.coeff + k * 4] ?? 0
    const coeffIm = floatView[I.coeff + k * 4 + 1] ?? 0
    const phase = -energy * t
    const cosP = Math.cos(phase)
    const sinP = Math.sin(phase)
    // term_k = c_k * (cos + i sin)
    //        = (Re*cos - Im*sin) + i (Re*sin + Im*cos)
    const slot = I.precomputedTerm + k * 4
    floatView[slot] = coeffRe * cosP - coeffIm * sinP
    floatView[slot + 1] = coeffRe * sinP + coeffIm * cosP
    floatView[slot + 2] = 0
    floatView[slot + 3] = 0
  }

  // Zero unused slots so stale values from larger termCounts can't leak.
  for (let k = termCount; k < MAX_TERMS; k++) {
    const slot = I.precomputedTerm + k * 4
    floatView[slot] = 0
    floatView[slot + 1] = 0
    floatView[slot + 2] = 0
    floatView[slot + 3] = 0
  }
}
