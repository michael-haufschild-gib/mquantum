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
 * Apply the postselected-CTC mirror-pair filter in place.
 *
 * For each mirror pair `(v, M(v))`, decomposes the phase-twisted pair into
 * loop-consistent and paradox sectors:
 *
 *   c = 0.5 * (ψ(v) + exp(-iφ)ψ(M(v)))
 *   p = 0.5 * (ψ(v) - exp(-iφ)ψ(M(v)))
 *
 * then damps `p` by `(1-strength)` and renormalizes the pair to its incoming
 * norm. `strength=1` produces the Novikov fixed point
 * `ψ(v) = exp(-iφ)ψ(M(v))`; `strength=0` is the identity.
 *
 * @param psi - Interleaved `Float32Array` of length `2 · Π gridSize[d]`.
 * @param gridSize - Per-axis lattice sizes.
 * @param axis - Mirror axis index (`0 | 1 | 2`).
 * @param strength - Paradox-sector damping strength, clamped to `[0, 1]`.
 * @param phase - Loop holonomy φ in radians.
 */
export function applyCtcPostselection(
  psi: Float32Array,
  gridSize: readonly number[],
  axis: MirrorAxis,
  strength: number,
  phase: number
): void {
  const ctcStrength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0
  if (ctcStrength === 0) return
  const phi = Number.isFinite(phase) ? phase : 0
  const { strideA, Na, blockSize, totalSites } = decompose(gridSize, axis)
  if (psi.length !== 2 * totalSites) {
    throw new Error(`[wormholeCoupling] psi length ${psi.length} != 2·totalSites ${2 * totalSites}`)
  }

  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const damp = 1 - ctcStrength
  const halfTotal = totalSites / 2
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
    const pairNormBefore = reV * reV + imV * imV + reVP * reVP + imVP * imVP
    if (pairNormBefore <= 0) continue

    // exp(-iφ) * ψ(M(v))
    const twRe = cosPhi * reVP + sinPhi * imVP
    const twIm = cosPhi * imVP - sinPhi * reVP

    const consistentRe = 0.5 * (reV + twRe)
    const consistentIm = 0.5 * (imV + twIm)
    const paradoxRe = 0.5 * (reV - twRe)
    const paradoxIm = 0.5 * (imV - twIm)

    const filteredVRe = consistentRe + damp * paradoxRe
    const filteredVIm = consistentIm + damp * paradoxIm
    const filteredTwRe = consistentRe - damp * paradoxRe
    const filteredTwIm = consistentIm - damp * paradoxIm

    // exp(+iφ) * filteredTwistedMirror
    const filteredVPRe = cosPhi * filteredTwRe - sinPhi * filteredTwIm
    const filteredVPIm = cosPhi * filteredTwIm + sinPhi * filteredTwRe
    const pairNormAfter =
      filteredVRe * filteredVRe +
      filteredVIm * filteredVIm +
      filteredVPRe * filteredVPRe +
      filteredVPIm * filteredVPIm
    const renorm = Math.sqrt(pairNormBefore / Math.max(pairNormAfter, 1e-30))

    psi[2 * idx] = filteredVRe * renorm
    psi[2 * idx + 1] = filteredVIm * renorm
    psi[2 * mirrorIdx] = filteredVPRe * renorm
    psi[2 * mirrorIdx + 1] = filteredVPIm * renorm
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

/** Parameters for sampling the CTC loop-residue reference field at one site. */
export interface CtcLoopResidualSampleParams {
  /** Interleaved (re, im) wavefunction of length `2·Π gridSize[d]`. */
  psi: Float32Array
  /** Per-axis lattice sizes. Length is the active lattice dimension. */
  gridSize: readonly number[]
  /** Mirror axis index. Invalid axes produce a zero display sample. */
  axis: number
  /** Linear site index of v in row-major TDSE storage. */
  siteIndex: number
  /** Loop holonomy phi in radians. */
  phase: number
  /** Density scale used by the shader density gate. Defaults to 1. */
  maxDensity?: number
  /** Denominator epsilon. Defaults to the shader value. */
  epsilon?: number
}

/** CPU reference output for one CTC loop-residue sample. */
export interface CtcLoopResidualSample {
  /** Raw PRD residue before display remapping. */
  rawResidue: number
  /** Renderer scalar: `clamp(rawResidue, 0, 1) * densityGate`. */
  displayScalar: number
  density: number
  mirrorDensity: number
  mirrorIndex: number | null
}

/** Parameters for sampling the CTC loop-gain reference field at one site. */
export interface CtcLoopGainSampleParams {
  /** Interleaved (re, im) wavefunction of length `2·Π gridSize[d]`. */
  psi: Float32Array
  /** Per-axis lattice sizes. Length is the active lattice dimension. */
  gridSize: readonly number[]
  /** Mirror axis index. Invalid axes produce a zero display sample. */
  axis: number
  /** Linear site index of v in row-major TDSE storage. */
  siteIndex: number
  /** Loop holonomy phi in radians. */
  phase: number
  /** Loop-feedback survival, clamped to `[0, 0.995]`. */
  ctcPostselectionStrength: number
  /** Density scale used by the shader density gate. Defaults to 1. */
  maxDensity?: number
  /** Denominator epsilon. Defaults to the shader value. */
  epsilon?: number
}

/** CPU reference output for one CTC loop-gain sample. */
export interface CtcLoopGainSample {
  /** Wrapped phase mismatch in `[-π, π]`. */
  delta: number
  /** Geometric-series gain before logarithmic display remapping. */
  gain: number
  /** Gain at exact chronology-horizon resonance for the same feedback. */
  resonantGain: number
  /** Renderer scalar after logarithmic remapping and density gate. */
  displayScalar: number
  density: number
  mirrorDensity: number
  mirrorIndex: number | null
}

function zeroCtcResidualSample(): CtcLoopResidualSample {
  return { rawResidue: 0, displayScalar: 0, density: 0, mirrorDensity: 0, mirrorIndex: null }
}

function zeroCtcLoopGainSample(): CtcLoopGainSample {
  return {
    delta: 0,
    gain: 0,
    resonantGain: 0,
    displayScalar: 0,
    density: 0,
    mirrorDensity: 0,
    mirrorIndex: null,
  }
}

function smoothstep01(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * CPU reference for the TDSE `ctcResidual` field view at one lattice site.
 *
 * Matches `computeCtcResidualScalar` in `tdseWriteGrid.wgsl.ts`: invalid mirror
 * axes, single-cell mirror axes, and odd mirror axes return zero; valid samples
 * evaluate the postselected-loop residue against the nearest mirror site and
 * apply the same local density gate.
 */
export function computeCtcLoopResidualSample(
  params: CtcLoopResidualSampleParams
): CtcLoopResidualSample {
  const { psi, gridSize, axis, siteIndex } = params
  if (!Number.isInteger(axis) || axis < 0 || axis >= gridSize.length || axis >= 12) {
    return zeroCtcResidualSample()
  }
  if (!Number.isInteger(siteIndex) || siteIndex < 0) {
    return zeroCtcResidualSample()
  }
  for (let d = 0; d < gridSize.length; d++) {
    const n = gridSize[d]!
    if (!Number.isInteger(n) || n < 1) return zeroCtcResidualSample()
  }

  const axisSize = gridSize[axis]!
  if (axisSize < 2 || axisSize % 2 !== 0) {
    return zeroCtcResidualSample()
  }

  const strides = computeStrides(gridSize)
  const totalSites = gridSize.reduce((acc, n) => acc * n, 1)
  if (siteIndex >= totalSites) {
    return zeroCtcResidualSample()
  }
  if (psi.length !== 2 * totalSites) {
    throw new Error(`[wormholeCoupling] psi length ${psi.length} != 2·totalSites ${2 * totalSites}`)
  }

  const strideA = strides[axis]!
  const coord = Math.floor(siteIndex / strideA) % axisSize
  const mirrorCoord = axisSize - 1 - coord
  const mirrorIndex = siteIndex + (mirrorCoord - coord) * strideA
  if (mirrorIndex < 0 || mirrorIndex >= totalSites) {
    return zeroCtcResidualSample()
  }

  const re = psi[2 * siteIndex]!
  const im = psi[2 * siteIndex + 1]!
  const mirrorRe = psi[2 * mirrorIndex]!
  const mirrorIm = psi[2 * mirrorIndex + 1]!
  const density = re * re + im * im
  const mirrorDensity = mirrorRe * mirrorRe + mirrorIm * mirrorIm
  const phi = Number.isFinite(params.phase) ? params.phase : 0
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const echoRe = cosPhi * mirrorRe + sinPhi * mirrorIm
  const echoIm = cosPhi * mirrorIm - sinPhi * mirrorRe
  const dRe = re - echoRe
  const dIm = im - echoIm
  const epsilon = params.epsilon
  const eps = typeof epsilon === 'number' && Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 1e-20
  const rawResidue = (dRe * dRe + dIm * dIm) / (density + mirrorDensity + eps)
  const maxDensityInput = params.maxDensity
  const maxDensity =
    typeof maxDensityInput === 'number' && Number.isFinite(maxDensityInput)
      ? Math.max(maxDensityInput, 0)
      : 1
  const normDensity = maxDensity > 0 ? density / maxDensity : 0
  const densityGate = smoothstep01(0, 0.02, normDensity)
  const displayScalar = Math.max(0, Math.min(1, rawResidue)) * densityGate

  return { rawResidue, displayScalar, density, mirrorDensity, mirrorIndex }
}

/**
 * CPU reference for the TDSE `ctcLoopGain` field view at one lattice site.
 *
 * Matches `computeCtcLoopGainScalar` in `tdseWriteGrid.wgsl.ts`: invalid mirror
 * axes, single-cell mirror axes, odd mirror axes, zero feedback, empty local
 * samples, and empty mirror echoes return zero; valid samples display the
 * logarithmically normalized chronology-horizon loop gain.
 */
export function computeCtcLoopGainSample(params: CtcLoopGainSampleParams): CtcLoopGainSample {
  const { psi, gridSize, axis, siteIndex } = params
  if (!Number.isInteger(axis) || axis < 0 || axis >= gridSize.length || axis >= 12) {
    return zeroCtcLoopGainSample()
  }
  if (!Number.isInteger(siteIndex) || siteIndex < 0) {
    return zeroCtcLoopGainSample()
  }
  for (let d = 0; d < gridSize.length; d++) {
    const n = gridSize[d]!
    if (!Number.isInteger(n) || n < 1) return zeroCtcLoopGainSample()
  }

  const axisSize = gridSize[axis]!
  if (axisSize < 2 || axisSize % 2 !== 0) {
    return zeroCtcLoopGainSample()
  }

  const strides = computeStrides(gridSize)
  const totalSites = gridSize.reduce((acc, n) => acc * n, 1)
  if (siteIndex >= totalSites) {
    return zeroCtcLoopGainSample()
  }
  if (psi.length !== 2 * totalSites) {
    throw new Error(`[wormholeCoupling] psi length ${psi.length} != 2·totalSites ${2 * totalSites}`)
  }

  const strideA = strides[axis]!
  const coord = Math.floor(siteIndex / strideA) % axisSize
  const mirrorCoord = axisSize - 1 - coord
  const mirrorIndex = siteIndex + (mirrorCoord - coord) * strideA
  if (mirrorIndex < 0 || mirrorIndex >= totalSites) {
    return zeroCtcLoopGainSample()
  }

  const re = psi[2 * siteIndex]!
  const im = psi[2 * siteIndex + 1]!
  const mirrorRe = psi[2 * mirrorIndex]!
  const mirrorIm = psi[2 * mirrorIndex + 1]!
  const density = re * re + im * im
  const mirrorDensity = mirrorRe * mirrorRe + mirrorIm * mirrorIm
  const epsilon = params.epsilon
  const eps = typeof epsilon === 'number' && Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 1e-20
  if (density <= eps || mirrorDensity <= eps) {
    return { ...zeroCtcLoopGainSample(), density, mirrorDensity, mirrorIndex }
  }

  const strength = params.ctcPostselectionStrength
  const a = Number.isFinite(strength) ? Math.max(0, Math.min(0.995, strength)) : 0
  if (a <= 0) {
    return { ...zeroCtcLoopGainSample(), density, mirrorDensity, mirrorIndex }
  }

  const phi = Number.isFinite(params.phase) ? params.phase : 0
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const echoRe = cosPhi * mirrorRe + sinPhi * mirrorIm
  const echoIm = cosPhi * mirrorIm - sinPhi * mirrorRe
  const theta = Math.atan2(im, re)
  const thetaEcho = Math.atan2(echoIm, echoRe)
  const phaseMismatch = theta - thetaEcho
  const delta = Math.atan2(Math.sin(phaseMismatch), Math.cos(phaseMismatch))
  const gain = 1 / (1 + a * a - 2 * a * Math.cos(delta) + eps)
  const resonantGain = 1 / ((1 - a) * (1 - a) + eps)
  const rawDisplay = Math.log1p(gain) / Math.log1p(resonantGain)
  const maxDensityInput = params.maxDensity
  const maxDensity =
    typeof maxDensityInput === 'number' && Number.isFinite(maxDensityInput)
      ? Math.max(maxDensityInput, 0)
      : 1
  const normDensity = maxDensity > 0 ? density / maxDensity : 0
  const densityGate = smoothstep01(0, 0.02, normDensity)
  const displayScalar = Math.max(0, Math.min(1, rawDisplay)) * densityGate

  return { delta, gain, resonantGain, displayScalar, density, mirrorDensity, mirrorIndex }
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
