/**
 * Per-column Bogoliubov coefficients (`α_k`, `β_k`) extracted from the
 * Wheeler–DeWitt Stage-3 Airy/Langer connection.
 *
 * ## Physics
 *
 * Inside the Lorentzian region of each `(φ₁, φ₂)` column the WdW
 * solution decomposes onto the WKB mode basis
 *
 *     u_+(a) = e^{+iφ_L(a)} / (√2 · |U(a)|^{1/4})    (positive-frequency)
 *     u_−(a) = e^{−iφ_L(a)} / (√2 · |U(a)|^{1/4})    (negative-frequency)
 *
 * with the Wronskian-style canonical normalisation `∝ 1/√(2|p|)`. Writing
 * `χ = α · u_− + β · u_+` (sign convention: `α` is the coefficient of the
 * `e^{−iφ_L}` mode, which for our `dφ_L/da < 0` choice corresponds to the
 * **outgoing-in-`a`** wave that Vilenkin's BC selects), the leading-WKB
 * matching to the cosine/sine ansatz `χ = |U|^{−1/4} · (A_c cos φ_L +
 * A_s sin φ_L)` gives
 *
 *     α = (A_c + i · A_s) / √2
 *     β = (A_c − i · A_s) / √2
 *
 * (Derivation: `cos φ_L = ½(e^{iφ_L} + e^{-iφ_L})`,
 * `sin φ_L = (e^{iφ_L} − e^{-iφ_L})/(2i)`. Collecting `e^{-iφ_L}`
 * coefficients gives `α = (A_c + i·A_s)/√2`; `e^{+iφ_L}` gives
 * `β = (A_c − i·A_s)/√2`.)
 *
 * The **flux invariant** (signed) is
 *
 *     |α|² − |β|² = +2 · Im(A_c · conj(A_s))
 *
 * which equals the Wronskian flux of the WdW wave. For canonical
 * Wronskian-normalised mode functions this would be `±1` (in/out
 * scattering); for arbitrary BC amplitudes (as the WdW solver delivers)
 * it is the BC-set flux scale. The dimensionless **flux ratio**
 *
 *     R_flux = (|α|² − |β|²) / (|α|² + |β|²)        ∈ [−1, 1]
 *
 * is BC-amplitude-independent: it equals `+1` for a pure outgoing wave
 * (`β = 0`, Vilenkin), `−1` for a pure incoming wave, and `0` for a
 * standing wave (`|α| = |β|`, HH/DeWitt).
 *
 * ## What changes vs Stage-2
 *
 * Pre-Stage-3 the absorber-damped match cell mixed decaying and growing
 * branches by the same rate, leaving a BC-agnostic complex amplitude.
 * The Bogoliubov coefficients computed from that mixture would have:
 *
 *  - For HH/DeWitt: spurious `β ≠ |α|` driven by absorber
 *    asymmetries instead of the physical standing-wave structure.
 *  - For Vilenkin: spurious non-zero `β` (incoming wave leaked in)
 *    instead of the physical `β = 0` outgoing-wave selection.
 *
 * Stage-3 extraction reads the (Lorentzian-side) numerical leapfrog
 * directly — never the absorber-contaminated match cell — so the
 * Bogoliubov coefficients reflect the actual BC-driven WKB amplitudes.
 *
 * @module lib/physics/wheelerDeWitt/bogoliubov
 */

import type { WheelerDeWittSolverOutput } from './solver'

/**
 * Bogoliubov coefficients for one `(φ₁, φ₂)` column.
 *
 * `null` when the column had no successful Airy extraction (no turning
 * surface, or too few asymptotic cells). Consumers should skip those
 * columns when aggregating statistics.
 */
export interface BogoliubovColumn {
  /** Inflaton coordinates. */
  phi1: number
  phi2: number
  /** `Re(α)`, `Im(α)`. */
  alphaRe: number
  alphaIm: number
  /** `Re(β)`, `Im(β)`. */
  betaRe: number
  betaIm: number
  /** `|α|²`. */
  alphaSq: number
  /** `|β|²`. */
  betaSq: number
  /** Flux invariant `|α|² − |β|² = +2·Im(A_c·conj(A_s))`. */
  flux: number
  /**
   * Flux ratio `(|α|² − |β|²) / (|α|² + |β|²)` ∈ `[−1, 1]`. BC-amplitude
   * independent; +1 for pure outgoing, 0 for standing wave, −1 for pure
   * incoming. The sign convention matches the in/out scattering picture
   * for a Wronskian-normalised mode basis. `NaN` when the column had
   * zero amplitude (`|α|² + |β|² = 0`) — excluded from `meanFluxRatio`
   * to avoid biasing the aggregate toward a fake standing-wave signal.
   */
  fluxRatio: number
  /** Number of Lorentzian-asymptotic cells used in the extraction. */
  asymptoticCellCount: number
}

/** Aggregate statistics over all extracted columns. */
export interface BogoliubovSummary {
  /** Per-column results in `[i1 * Nphi + i2]` order. `null` for failed columns. */
  columns: (BogoliubovColumn | null)[]
  /** Number of columns with successful extraction. */
  extractedCount: number
  /** Total number of columns (`Nphi · Nphi`). */
  totalColumns: number
  /**
   * Mean flux ratio across columns with a finite `fluxRatio`. Near 0
   * indicates HH/DeWitt standing-wave structure; near +1 indicates
   * Vilenkin outgoing-wave selection. `NaN` when no column contributed
   * a finite flux ratio — either because no extraction succeeded or
   * because every extracted column had zero amplitude (`|α|² + |β|² =
   * 0`) — so callers can distinguish missing data from a real
   * zero-particle signal.
   */
  meanFluxRatio: number
  /**
   * Mean `|β/α|` ratio across extracted columns with `|α|² > 0`. `NaN`
   * when no column contributed (all `|α|²` were zero or no column
   * extracted).
   */
  meanBetaOverAlpha: number
}

/**
 * Compute per-column Bogoliubov coefficients from the solver output's
 * stored Airy connection state.
 *
 * @param output - Solver output (must contain `columnAiry`, populated by
 *   the Stage-3 post-process).
 * @returns Per-column coefficients + aggregate stats.
 */
export function extractBogoliubov(output: WheelerDeWittSolverOutput): BogoliubovSummary {
  const Nphi = output.gridSize[1]
  // Guard the single-column synthetic case (Nphi === 1) where the stride
  // would blow up to Infinity; callers in tests pin the column at φ = 0.
  const dphi = Nphi > 1 ? (2 * output.phiExtent) / (Nphi - 1) : 0
  const total = Nphi * Nphi
  const columns: (BogoliubovColumn | null)[] = new Array(total)
  let extractedCount = 0
  let fluxRatioSum = 0
  let fluxRatioCount = 0
  let betaOverAlphaSum = 0
  let betaOverAlphaCount = 0

  // α = (A_c + i·A_s) / √2,  β = (A_c − i·A_s) / √2 — the `1/√2` prefactor
  // is column-invariant, so hoist it out of the hot loop.
  const inv2 = 1 / Math.sqrt(2)

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = Nphi > 1 ? -output.phiExtent + i1 * dphi : 0
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = Nphi > 1 ? -output.phiExtent + i2 * dphi : 0
      const idx = i1 * Nphi + i2
      const info = output.columnAiry[idx]
      if (!info || !info.hasOverwrite) {
        columns[idx] = null
        continue
      }

      // α = (A_c + i·A_s) / √2,  β = (A_c − i·A_s) / √2.
      // (A_c + i·A_s) = (acRe − asIm) + i·(acIm + asRe).
      // (A_c − i·A_s) = (acRe + asIm) + i·(acIm − asRe).
      const alphaRe = inv2 * (info.acRe - info.asIm)
      const alphaIm = inv2 * (info.acIm + info.asRe)
      const betaRe = inv2 * (info.acRe + info.asIm)
      const betaIm = inv2 * (info.acIm - info.asRe)
      const alphaSq = alphaRe * alphaRe + alphaIm * alphaIm
      const betaSq = betaRe * betaRe + betaIm * betaIm
      const flux = alphaSq - betaSq
      const sumSq = alphaSq + betaSq
      // NaN for zero-amplitude columns so they don't masquerade as a
      // standing-wave signal and bias meanFluxRatio toward HH/DeWitt.
      const fluxRatio = sumSq > 0 ? flux / sumSq : Number.NaN

      columns[idx] = {
        phi1,
        phi2,
        alphaRe,
        alphaIm,
        betaRe,
        betaIm,
        alphaSq,
        betaSq,
        flux,
        fluxRatio,
        asymptoticCellCount: info.asymptoticCellCount,
      }
      extractedCount += 1
      if (Number.isFinite(fluxRatio)) {
        fluxRatioSum += fluxRatio
        fluxRatioCount += 1
      }
      if (alphaSq > 0) {
        betaOverAlphaSum += Math.sqrt(betaSq / alphaSq)
        betaOverAlphaCount += 1
      }
    }
  }

  return {
    columns,
    extractedCount,
    totalColumns: total,
    // NaN (not 0) when nothing was extracted — 0 would be indistinguishable
    // from a real standing-wave / zero-particle signal and would silently
    // misclassify failed runs as meaningful physics.
    meanFluxRatio: fluxRatioCount > 0 ? fluxRatioSum / fluxRatioCount : Number.NaN,
    meanBetaOverAlpha: betaOverAlphaCount > 0 ? betaOverAlphaSum / betaOverAlphaCount : Number.NaN,
  }
}
