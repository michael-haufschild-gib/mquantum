/**
 * TDSE — ER=EPR Double-trace Wormhole Coupling (CPU reference).
 *
 * Implements the exact rotation performed by the GPU kernel
 * `tdseWormholeCouple.wgsl`: `ψ ← exp(-i·τ·g·P_M) ψ` where `P_M` reflects
 * the lattice across the chosen mirror axis. Because `P_M² = 1`, the
 * exponential is closed-form:
 *
 *   `exp(-i·τg·P_M) = cos(τg)·I − i·sin(τg)·P_M`
 *
 * acting on each mirror pair `(v, v')` as a unitary 2×2 rotation. This
 * file is the physics specification the GPU kernel must match — used by
 * unit tests and the HUD coherence-on-random-state checks.
 *
 * Also exposes {@link computeWormholeCoherence}:
 *
 *   `I(L:R) = |Σ_v ψ*(v) · ψ(M(v))|² / ‖ψ‖⁴`
 *
 * which is the mutual-overlap of `|ψ⟩` with its mirror-reflected
 * counterpart. `I ∈ [0, 1]`: zero for fully one-sided states, unity for
 * states with exact mirror symmetry (the Thermofield-double analogue).
 *
 * @module lib/physics/tdse/wormholeCoupling
 */

type MirrorAxis = 0 | 1 | 2

/**
 * Compute row-major strides for a lattice of the given per-axis sizes.
 *
 * @param gridSize - Per-axis grid sizes (length = latticeDim).
 * @returns Strides of the same length; `strides[latticeDim-1] = 1`.
 */
function computeStrides(gridSize: readonly number[]): number[] {
  const D = gridSize.length
  const strides = new Array<number>(D)
  if (D === 0) return strides
  strides[D - 1] = 1
  for (let d = D - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }
  return strides
}

/**
 * Given the chosen mirror axis and row-major strides, produce the
 * decomposition used by the GPU half-space dispatch: `blockSize`,
 * `strideA`, `halfA`, and `totalSites`. Throws on an invalid axis or odd
 * grid size along the mirror axis.
 *
 * @internal
 */
function decompose(
  gridSize: readonly number[],
  axis: MirrorAxis
): {
  strides: number[]
  strideA: number
  Na: number
  halfA: number
  blockSize: number
  totalSites: number
} {
  if (gridSize.length === 0) {
    throw new Error('[wormholeCoupling] gridSize must be non-empty')
  }
  if (axis < 0 || axis >= gridSize.length) {
    throw new Error(`[wormholeCoupling] axis ${axis} out of range for D=${gridSize.length}`)
  }
  // Guard each axis — a non-positive, non-integer, or non-finite size would
  // let `totalSites` silently round to 0/NaN and downstream dispatches would
  // zero-iterate or throw index-out-of-range on ψ reads.
  for (let d = 0; d < gridSize.length; d++) {
    const n = gridSize[d]!
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`[wormholeCoupling] gridSize[${d}] must be a positive integer, got ${n}`)
    }
  }
  const Na = gridSize[axis]!
  if (Na < 2 || Na % 2 !== 0) {
    throw new Error(`[wormholeCoupling] grid size along axis ${axis} must be even, got ${Na}`)
  }
  const strides = computeStrides(gridSize)
  const strideA = strides[axis]!
  const halfA = Na / 2
  const blockSize = strideA * halfA
  let totalSites = 1
  for (const n of gridSize) totalSites *= n
  return { strides, strideA, Na, halfA, blockSize, totalSites }
}

/**
 * Apply the wormhole coupling operator `exp(-i·dt·g·P_M)` in place on an
 * interleaved (re, im, re, im, …) wavefunction.
 *
 * Matches the GPU kernel bit-for-bit on a well-formed (even along mirror
 * axis) lattice. Side-effect only — `psi` is mutated.
 *
 * @param psi - Interleaved `Float32Array` of length `2 · Π gridSize[d]`.
 * @param gridSize - Per-axis lattice sizes.
 * @param axis - Mirror axis index (`0 | 1 | 2`).
 * @param dt - Effective time step (Strang splitting contributes `0.5·dt` per dispatch).
 * @param g - Coupling strength (non-negative). `g=0` is a no-op.
 */
export function applyWormholeCoupling(
  psi: Float32Array,
  gridSize: readonly number[],
  axis: MirrorAxis,
  dt: number,
  g: number
): void {
  if (g === 0 || dt === 0) return
  const { strideA, Na, blockSize, totalSites } = decompose(gridSize, axis)
  if (psi.length !== 2 * totalSites) {
    throw new Error(`[wormholeCoupling] psi length ${psi.length} != 2·totalSites ${2 * totalSites}`)
  }
  const halfTotal = totalSites / 2
  const c = Math.cos(dt * g)
  const s = Math.sin(dt * g)
  for (let tid = 0; tid < halfTotal; tid++) {
    const outer = Math.floor(tid / blockSize)
    const withinBlock = tid - outer * blockSize
    const coordA = Math.floor(withinBlock / strideA)
    const innerOffset = withinBlock - coordA * strideA
    const idx = outer * (strideA * Na) + coordA * strideA + innerOffset
    const mirrorIdx = idx + (Na - 1 - 2 * coordA) * strideA
    const reV = psi[2 * idx]!
    const imV = psi[2 * idx + 1]!
    const reVP = psi[2 * mirrorIdx]!
    const imVP = psi[2 * mirrorIdx + 1]!
    // (a − ib)·(x + iy) = (ax + by) + i(ay − bx)
    // Coefficient on ψ(v') is (−i·s) → Re-contribution = +s·im(ψ(v')), Im = −s·re(ψ(v')).
    psi[2 * idx] = c * reV + s * imVP
    psi[2 * idx + 1] = c * imV - s * reVP
    psi[2 * mirrorIdx] = c * reVP + s * imV
    psi[2 * mirrorIdx + 1] = c * imVP - s * reV
  }
}

/**
 * Compute the normalized L:R mirror coherence
 * `I(L:R) = |Σ_v ψ*(v)·ψ(M(v))|² / ‖ψ‖⁴`.
 *
 * @param psi - Interleaved (re, im) wavefunction of length `2·Π gridSize[d]`.
 * @param gridSize - Per-axis lattice sizes.
 * @param axis - Mirror axis index (`0 | 1 | 2`).
 * @returns `I ∈ [0, 1]`. Returns `0` for the zero vector.
 */
export function computeWormholeCoherence(
  psi: Float32Array,
  gridSize: readonly number[],
  axis: MirrorAxis
): number {
  const { strideA, Na, blockSize, totalSites } = decompose(gridSize, axis)
  if (psi.length !== 2 * totalSites) {
    throw new Error(`[wormholeCoupling] psi length ${psi.length} != 2·totalSites ${2 * totalSites}`)
  }
  // ⟨ψ|P_M|ψ⟩ = Σ_v ψ*(v)·ψ(M(v)).
  // Each mirror pair contributes ψ*(v)·ψ(v') + ψ*(v')·ψ(v) = 2·Re[ψ*(v)·ψ(v')].
  // Imaginary parts cancel, so the sum is real. ‖ψ‖² is a real positive scalar.
  let numRe = 0
  let normSq = 0
  const halfTotal = totalSites / 2
  for (let tid = 0; tid < halfTotal; tid++) {
    const outer = Math.floor(tid / blockSize)
    const withinBlock = tid - outer * blockSize
    const coordA = Math.floor(withinBlock / strideA)
    const innerOffset = withinBlock - coordA * strideA
    const idx = outer * (strideA * Na) + coordA * strideA + innerOffset
    const mirrorIdx = idx + (Na - 1 - 2 * coordA) * strideA
    const a = psi[2 * idx]!
    const b = psi[2 * idx + 1]!
    const c = psi[2 * mirrorIdx]!
    const d = psi[2 * mirrorIdx + 1]!
    // Re[ψ*(v)·ψ(v')] = a·c + b·d
    numRe += 2 * (a * c + b * d)
    normSq += a * a + b * b + c * c + d * d
  }
  if (normSq <= 0) return 0
  const denom = normSq * normSq
  return (numRe * numRe) / denom
}

/** Type guard for the mirror-axis enum used by the store and URL layer. */
export function isValidMirrorAxis(v: unknown): v is MirrorAxis {
  return v === 0 || v === 1 || v === 2
}

/**
 * Clamp a user/config mirror-axis value to an axis supported by the active
 * lattice. The wormhole kernel only exposes x/y/z axes, and a lattice with
 * fewer active dimensions must not upload an out-of-range axis because the
 * shader treats that as a no-op.
 */
export function normalizeMirrorAxisForLattice(axis: unknown, latticeDim: number): MirrorAxis {
  const dim = Number.isFinite(latticeDim) ? Math.floor(latticeDim) : 1
  const maxAxis = Math.max(0, Math.min(2, dim - 1))
  const raw = typeof axis === 'number' && Number.isFinite(axis) ? Math.floor(axis) : 0
  return Math.max(0, Math.min(maxAxis, raw)) as MirrorAxis
}
