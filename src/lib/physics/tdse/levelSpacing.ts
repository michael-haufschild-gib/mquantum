/**
 * Level Spacing Statistics for Quantum Eigenvalue Spectra
 *
 * Computes nearest-neighbor level spacing distributions and classifies
 * quantum systems as integrable (Poisson), chaotic (Wigner-Dyson/GOE),
 * or intermediate (Anderson-localized near mobility edge).
 *
 * The Brody parameter β interpolates between:
 *   β = 0: Poisson distribution P(s) = exp(-s) — integrable / localized
 *   β = 1: Wigner-Dyson GOE P(s) = (π/2)s·exp(-πs²/4) — chaotic / extended
 *
 * Reference: Brody et al., Rev. Mod. Phys. 53, 385 (1981)
 *
 * @module lib/physics/tdse/levelSpacing
 */

import { computeLevelSpacingWasm, isAnimationWasmReady } from '@/lib/wasm'

/**
 * Minimum number of eigenvalues to attempt WASM acceleration for level spacing.
 * Below this, the WASM boundary overhead may exceed compute savings.
 */
const WASM_LEVEL_SPACING_MIN_ENERGIES = 50

/** Result of level spacing analysis. */
export interface LevelSpacingResult {
  /** Sorted eigenvalues used for the analysis */
  energies: number[]
  /** Unfolded nearest-neighbor spacings (mean-normalized) */
  spacings: number[]
  /** Mean spacing before unfolding */
  meanSpacing: number
  /** Brody parameter β ∈ [0, 1]: 0 = Poisson, 1 = Wigner-Dyson */
  brodyBeta: number
  /** Classification based on β thresholds */
  classification: 'poisson' | 'intermediate' | 'wigner-dyson'
  /** Mean IPR across eigenstates (NaN if no valid IPR data) */
  meanIPR: number
}

/**
 * Compute level spacing statistics from a set of eigenvalues.
 *
 * Steps:
 * 1. Sort energies in ascending order
 * 2. Compute nearest-neighbor spacings
 * 3. Unfold: normalize spacings by their mean so ⟨s⟩ = 1
 * 4. Fit Brody parameter by minimizing the KS statistic
 * 5. Classify
 *
 * @param energies - Array of eigenvalues. Non-finite entries are ignored.
 * @param iprs - Optional array of IPR values (same length as energies)
 * @returns Level spacing statistics and classification
 */
export function computeLevelSpacing(energies: number[], iprs?: number[]): LevelSpacingResult {
  const finiteEnergies: number[] = []
  const finiteEnergyIpRs: number[] | undefined = iprs ? [] : undefined
  for (let i = 0; i < energies.length; i++) {
    const energy = energies[i]!
    if (!Number.isFinite(energy)) continue
    finiteEnergies.push(energy)
    if (finiteEnergyIpRs && Number.isFinite(iprs![i])) finiteEnergyIpRs.push(iprs![i]!)
  }
  const meanIPR = computeMeanFinite(finiteEnergyIpRs)

  if (finiteEnergies.length < 2) {
    return {
      energies: [...finiteEnergies].sort((a, b) => a - b),
      spacings: [],
      meanSpacing: 0,
      brodyBeta: 0,
      classification: 'poisson',
      meanIPR,
    }
  }

  // ── WASM fast path ──────────────────────────────────────────────────
  if (finiteEnergies.length >= WASM_LEVEL_SPACING_MIN_ENERGIES && isAnimationWasmReady()) {
    const wasmResult = tryLevelSpacingWasm(finiteEnergies, meanIPR)
    if (wasmResult) return wasmResult
  }

  // ── JS fallback ─────────────────────────────────────────────────────
  const sorted = [...finiteEnergies].sort((a, b) => a - b)

  // Nearest-neighbor spacings
  const rawSpacings: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    rawSpacings.push(sorted[i]! - sorted[i - 1]!)
  }

  // Unfolding: normalize by mean spacing
  const meanSpacing = rawSpacings.reduce((a, b) => a + b, 0) / rawSpacings.length
  if (meanSpacing <= 0) {
    return {
      energies: sorted,
      spacings: rawSpacings,
      meanSpacing,
      brodyBeta: 0,
      classification: 'poisson',
      meanIPR,
    }
  }
  const spacings = rawSpacings.map((s) => s / meanSpacing)

  // Brody parameter fit via maximum likelihood
  const brodyBeta = fitBrodyParameter(spacings)

  // Classification thresholds
  let classification: LevelSpacingResult['classification']
  if (brodyBeta < 0.3) classification = 'poisson'
  else if (brodyBeta > 0.7) classification = 'wigner-dyson'
  else classification = 'intermediate'

  return {
    energies: sorted,
    spacings,
    meanSpacing,
    brodyBeta,
    classification,
    meanIPR,
  }
}

function computeMeanFinite(values: number[] | undefined): number {
  const finite = values?.filter(Number.isFinite) ?? []
  return finite.length > 0 ? finite.reduce((a, b) => a + b, 0) / finite.length : NaN
}

/**
 * Fit the Brody parameter β to an array of unfolded spacings
 * by minimizing the Kolmogorov-Smirnov statistic via golden section search.
 *
 * The Brody distribution is:
 *   P(s) = (β+1) · b · s^β · exp(-b · s^(β+1))
 * where b = Γ((β+2)/(β+1))^(β+1)
 *
 * Golden section search on β ∈ [0, 1] exploits the unimodality of the
 * KS statistic across the one-parameter Brody family. Two interior probe
 * points narrow the interval by the golden ratio each iteration, converging
 * to ~1e-6 precision in ~50 iterations.
 *
 * @param spacings - Unfolded spacings (mean ~ 1)
 * @returns Brody parameter β ∈ [0, 1]
 */
function fitBrodyParameter(spacings: number[]): number {
  if (spacings.length < 2) return 0

  // Sort spacings for CDF comparison
  const sorted = [...spacings].sort((a, b) => a - b)
  const n = sorted.length

  // Golden section search on β to minimize KS statistic vs Brody CDF
  const phi = (Math.sqrt(5) - 1) / 2 // ≈ 0.618
  let a = 0
  let b = 1
  let c = b - phi * (b - a) // interior left probe
  let d = a + phi * (b - a) // interior right probe
  let ksC = ksStatistic(sorted, n, c)
  let ksD = ksStatistic(sorted, n, d)

  for (let iter = 0; iter < 50; iter++) {
    if (b - a < 1e-6) break
    if (ksC < ksD) {
      // Minimum is in [a, d]
      b = d
      d = c
      ksD = ksC
      c = b - phi * (b - a)
      ksC = ksStatistic(sorted, n, c)
    } else {
      // Minimum is in [c, b]
      a = c
      c = d
      ksC = ksD
      d = a + phi * (b - a)
      ksD = ksStatistic(sorted, n, d)
    }
  }

  return (a + b) / 2
}

/**
 * Kolmogorov-Smirnov statistic between empirical CDF and Brody CDF.
 *
 * @param sorted - Sorted spacings
 * @param n - Number of spacings
 * @param beta - Brody parameter
 * @returns Maximum absolute difference between CDFs
 */
function ksStatistic(sorted: number[], n: number, beta: number): number {
  // Brody CDF: F(s) = 1 - exp(-b · s^(β+1))
  // where b = Γ((β+2)/(β+1))^(β+1)
  const bp1 = beta + 1
  const b = Math.pow(gamma((beta + 2) / bp1), bp1)

  let maxD = 0
  for (let i = 0; i < n; i++) {
    const empirical = (i + 1) / n
    const theoretical = 1 - Math.exp(-b * Math.pow(sorted[i]!, bp1))
    const d = Math.abs(empirical - theoretical)
    if (d > maxD) maxD = d
  }
  return maxD
}

/**
 * Lanczos approximation of the gamma function for positive real arguments.
 *
 * @param z - Input value (must be > 0)
 * @returns Γ(z)
 */
function gamma(z: number): number {
  if (z < 0.5) {
    // Reflection formula: Γ(z) = π / (sin(πz) · Γ(1-z))
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z))
  }
  z -= 1
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  let x = c[0]!
  for (let i = 1; i < g + 2; i++) {
    x += c[i]! / (z + i)
  }
  const t = z + g + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

/**
 * Classify eigenstate localization from IPR values.
 *
 * @param ipr - Participation-count IPR `(Σp)² / Σp²`; `1` is delta-localized,
 *              `totalSites` is uniformly extended.
 * @param totalSites - Total number of lattice sites N
 * @returns Classification string
 */
export function classifyLocalization(
  ipr: number,
  totalSites: number
): 'extended' | 'critical' | 'localized' {
  if (!Number.isFinite(ipr) || totalSites <= 0) return 'critical'
  // Current TDSE/stochastic convention is participation-count IPR:
  // extended states have IPR ~ N, localized states have IPR ~ O(1).
  // These thresholds mirror the old PR convention:
  //   IPR_old < 3/N  <=>  IPR_count > N/3  (extended)
  //   IPR_old > 10/N <=>  IPR_count < N/10 (localized)
  const normalized = ipr / totalSites
  if (normalized > 1 / 3) return 'extended'
  if (normalized < 1 / 10) return 'localized'
  return 'critical'
}

// ============================================================================
// WASM Acceleration
// ============================================================================

/** Classification code to string mapping (matches Rust compute_level_spacing). */
const CLASSIFICATION_MAP: LevelSpacingResult['classification'][] = [
  'poisson',
  'intermediate',
  'wigner-dyson',
]

/**
 * Attempt WASM-accelerated level spacing computation. Packs energies into
 * a Float64Array, calls WASM, and unpacks the result.
 *
 * IPR computation stays in TypeScript since it's a simple mean of an optional
 * input array — not worth the WASM boundary crossing.
 *
 * @returns LevelSpacingResult if WASM succeeded, null otherwise
 */
function tryLevelSpacingWasm(energies: number[], meanIPR: number): LevelSpacingResult | null {
  const energiesF64 = new Float64Array(energies)
  const packed = computeLevelSpacingWasm(energiesF64)

  if (!packed) return null

  const numSpacings = energies.length - 1
  // Expected: numSpacings + 3 (brody_beta, mean_spacing, classification_code)
  if (packed.length < numSpacings + 3) return null

  // Unpack spacings
  const spacings: number[] = []
  for (let i = 0; i < numSpacings; i++) {
    spacings.push(packed[i]!)
  }

  const brodyBeta = packed[numSpacings]!
  const meanSpacing = packed[numSpacings + 1]!
  const classificationCode = Math.round(packed[numSpacings + 2]!)

  // Validate WASM payload values — fall back to JS if corrupt
  if (
    !Number.isFinite(brodyBeta) ||
    !Number.isFinite(meanSpacing) ||
    meanSpacing <= 0 ||
    brodyBeta < 0 ||
    brodyBeta > 1 ||
    !(classificationCode in CLASSIFICATION_MAP)
  ) {
    return null
  }
  for (let i = 0; i < numSpacings; i++) {
    if (!Number.isFinite(packed[i]!) || packed[i]! < 0) return null
  }

  const classification = CLASSIFICATION_MAP[classificationCode] ?? 'intermediate'

  // Sort energies (same as JS path)
  const sorted = [...energies].sort((a, b) => a - b)

  return {
    energies: sorted,
    spacings,
    meanSpacing,
    brodyBeta,
    classification,
    meanIPR,
  }
}
