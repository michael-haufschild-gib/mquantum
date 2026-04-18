/**
 * Main entry point for the SRMT (Superspace-Relational Modular Time)
 * diagnostic.
 *
 * Composes the Schmidt decomposition, modular-Hamiltonian spectrum, and
 * Hamilton-Jacobi operator eigenspectrum into a single readout, together
 * with an affine-match quality metric that quantifies the alignment
 * between the two spectra under the chosen clock.
 *
 * The SRMT conjecture under test: the DeWitt-timelike clock (`clock = 'a'`)
 * should give a much lower `affineMatchQuality` (better fit) than either
 * `'phi1'` or `'phi2'`. The UI plots the two spectra side-by-side and
 * overlays `sliceK` on the φ-slice density field.
 *
 * @module lib/physics/srmt/diagnostic
 */

import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

import { hjSpectrumOnSliceTopK } from './hjOperator'
import { modularSpectrum } from './modularHamiltonian'
import { schmidtValues } from './schmidt'
import type { SrmtConfig, SrmtResult, SrmtSlicePlane } from './types'

/**
 * Optional physics context needed to build the HJ operator. The solver
 * output does not currently carry the original inflaton mass / Λ (they
 * drive but aren't preserved in {@link WheelerDeWittSolverOutput}), so we
 * accept them separately here. Callers that don't know the physical
 * parameters can pass zeros — the HJ spectrum then reduces to the free
 * Laplacian eigenvalues, which is still a valid comparison target for the
 * Schmidt spectrum of a free-wave χ.
 */
export interface SrmtPhysicsContext {
  /** Inflaton mass `m` used in `V(φ) = ½ m² |φ|² + Λ`. */
  inflatonMass: number
  /** Cosmological constant `Λ`. */
  cosmologicalConstant: number
}

/**
 * Default physics context — zeros — used when the caller omits the
 * parameter. Documented separately rather than inlined so consumers can
 * reason about the fallback behaviour.
 */
const DEFAULT_PHYSICS: SrmtPhysicsContext = {
  inflatonMass: 0,
  cosmologicalConstant: 0,
}

/**
 * Map the clock axis to the corresponding slice orientation used by the
 * density-grid renderer.
 *
 * @param clock - Clock axis.
 * @returns Slice plane label.
 */
function slicePlaneFor(clock: SrmtConfig['clock']): SrmtSlicePlane {
  if (clock === 'a') return 'phi-phi'
  if (clock === 'phi1') return 'a-phi2'
  return 'a-phi1'
}

/**
 * Affine-match quality `q = Σ_n (K_n − (α E_n + β))² / Σ_n K_n²` after
 * a least-squares fit of `α`, `β` over the first `count` points.
 *
 * @param K - Modular spectrum values (ascending).
 * @param E - HJ spectrum values (ascending).
 * @param count - Number of leading values to include in the fit.
 * @returns The fit quality metric, or `NaN` when the input is degenerate
 *          (fewer than 2 points or zero-variance `E`).
 */
function affineFitQuality(K: Float64Array, E: Float64Array, count: number): number {
  if (count < 2) return Number.NaN

  let sumE = 0
  let sumK = 0
  for (let i = 0; i < count; i++) {
    sumE += E[i]!
    sumK += K[i]!
  }
  const meanE = sumE / count
  const meanK = sumK / count

  let sEE = 0
  let sEK = 0
  let sKK = 0
  for (let i = 0; i < count; i++) {
    const dE = E[i]! - meanE
    const dK = K[i]! - meanK
    sEE += dE * dE
    sEK += dE * dK
    sKK += dK * dK
  }

  if (sEE <= 0) return Number.NaN
  const alpha = sEK / sEE
  const beta = meanK - alpha * meanE

  let num = 0
  let den = 0
  for (let i = 0; i < count; i++) {
    const k = K[i]!
    const predicted = alpha * E[i]! + beta
    const r = k - predicted
    num += r * r
    den += k * k
  }

  if (den <= 0) return sKK > 0 ? num / sKK : Number.NaN
  return num / den
}

/**
 * Populate the 2D `sliceK` field rendered as a heatmap disk at the cut
 * plane.
 *
 * Physical content: the diagonal of the reduced density matrix
 * `ρ_A(x_slice) = |χ(x_clock = cut, x_slice)|²` on the slice
 * perpendicular to the selected clock axis. This is the scalar field
 * the modular Hamiltonian `K_A = −log ρ_A` acts upon; rendering it
 * shows *where* on the `(φ₁, φ₂) / (a, φ)` slice the reduced state has
 * support — the physically-meaningful 2D companion to the 1D
 * `kSpectrum` plotted in the side panel.
 *
 * ## Shape contract
 *
 * The packer (`packWdwDensityGrid → srmtOverlay`) consumes a fixed
 * `Nphi²` buffer for all clocks. For clock `'a'` this matches the
 * natural slice shape (φ₁ × φ₂). For clock `'φ₁'` / `'φ₂'` the natural
 * slice is `(a, φ_other)` with size `Na × Nphi` — typically 128 × 32 at
 * default config, which we compress along the `a` axis into `Nphi`
 * bins.
 *
 * ## Compression kernel
 *
 * For `Na >= Nphi` we **bin-average** into `Nphi` contiguous blocks of
 * `Na / Nphi` cells each (plus the remainder). Averaging preserves the
 * integrated probability density — if the raw slice has `∫ ρ da = c`,
 * the compressed slice retains `c / Nphi` per bin up to discretisation.
 * Nearest-neighbour resampling (the previous behaviour) dropped (Na/Nphi
 * − 1) source cells per output bin, losing information that would have
 * contributed to the heatmap brightness.
 *
 * For `Na < Nphi` (edge case, e.g. a tiny grid) we fall back to
 * repeating the source slab to fill the output — there is no
 * information to gain from upsampling, and the `Nphi²` contract still
 * has to be satisfied.
 *
 * @param output - Wheeler–DeWitt solver output (source of `χ` values).
 * @param clock  - Clock axis selector.
 * @param cutIndex - Cut index along the clock axis (already validated
 *   by the caller to be strictly interior).
 * @returns Float32 `Nphi²` slab of slice-plane density values.
 */
function buildSliceK(
  output: WheelerDeWittSolverOutput,
  clock: SrmtConfig['clock'],
  cutIndex: number
): Float32Array {
  const [Na, Nphi] = output.gridSize
  const slab = Nphi * Nphi
  const out = new Float32Array(slab)
  const chi = output.chi

  if (clock === 'a') {
    const ia = Math.min(Na - 1, Math.max(0, cutIndex))
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const idx = 2 * (ia * slab + i1 * Nphi + i2)
        const re = chi[idx] ?? 0
        const im = chi[idx + 1] ?? 0
        out[i1 * Nphi + i2] = re * re + im * im
      }
    }
    return out
  }

  // φ-clock slice: natural shape (Na × Nphi). We bin-average into Nphi
  // rows along the a-axis so the rendered heatmap reflects all source
  // cells.
  const cutPhi = Math.min(Nphi - 1, Math.max(0, cutIndex))

  // Per-output-bin starting index and count. Uses the floor/ceil split
  // so remainders are distributed across the first few bins (e.g. Na=128,
  // Nphi=32 → every bin = exactly 4; Na=130, Nphi=32 → first 2 bins = 5,
  // rest = 4).
  const base = Math.floor(Na / Nphi)
  const remainder = Na - base * Nphi

  let ia = 0
  for (let i = 0; i < Nphi; i++) {
    const count = base + (i < remainder ? 1 : 0)
    const iaStart = ia
    ia += count
    // `count` may be zero only when Na < Nphi — handled below via
    // repetition. In the Na >= Nphi path count is always >= 1.
    if (count > 0) {
      for (let j = 0; j < Nphi; j++) {
        let i1: number
        let i2: number
        if (clock === 'phi1') {
          i1 = cutPhi
          i2 = j
        } else {
          i1 = j
          i2 = cutPhi
        }
        let acc = 0
        for (let k = 0; k < count; k++) {
          const iaK = iaStart + k
          const idx = 2 * (iaK * slab + i1 * Nphi + i2)
          const re = chi[idx] ?? 0
          const im = chi[idx + 1] ?? 0
          acc += re * re + im * im
        }
        out[i * Nphi + j] = acc / count
      }
    } else {
      // Na < Nphi fallback: repeat the nearest source row so the contract
      // `out.length = Nphi²` is satisfied even on degenerate grids.
      const iaFallback = Math.min(Na - 1, Math.floor((i * Na) / Nphi))
      for (let j = 0; j < Nphi; j++) {
        let i1: number
        let i2: number
        if (clock === 'phi1') {
          i1 = cutPhi
          i2 = j
        } else {
          i1 = j
          i2 = cutPhi
        }
        const idx = 2 * (iaFallback * slab + i1 * Nphi + i2)
        const re = chi[idx] ?? 0
        const im = chi[idx + 1] ?? 0
        out[i * Nphi + j] = re * re + im * im
      }
    }
  }
  return out
}

/**
 * Compute the SRMT diagnostic against a WdW solver output.
 *
 * @param output - Solver output providing `χ` and grid metadata.
 * @param config - Clock/slice/rank configuration.
 * @param physics - Optional physics parameters for the HJ potential.
 *                  Defaults to zero mass / zero `Λ`.
 * @returns Bundled diagnostic result.
 */
export function computeSrmtDiagnostic(
  output: WheelerDeWittSolverOutput,
  config: SrmtConfig,
  physics: SrmtPhysicsContext = DEFAULT_PHYSICS
): SrmtResult {
  const [Na, Nphi1, Nphi2] = output.gridSize
  if (Nphi1 !== Nphi2) {
    throw new Error(`computeSrmtDiagnostic: non-square φ grid (${Nphi1}, ${Nphi2}) unsupported`)
  }
  const Nphi = Nphi1

  if (!Number.isInteger(config.cutIndex) || config.cutIndex <= 0) {
    throw new Error(
      `computeSrmtDiagnostic: cutIndex must be a positive integer, got ${config.cutIndex}`
    )
  }
  if (!Number.isInteger(config.rankCap) || config.rankCap <= 0) {
    throw new Error(
      `computeSrmtDiagnostic: rankCap must be a positive integer, got ${config.rankCap}`
    )
  }

  // Schmidt decomposition and modular spectrum.
  const allSchmidt = schmidtValues({ chi: output.chi, gridSize: output.gridSize }, config.clock)
  const keep = Math.min(config.rankCap, allSchmidt.length)
  const schmidt = new Float64Array(keep)
  for (let i = 0; i < keep; i++) schmidt[i] = allSchmidt[i]!
  const { spectrum: kSpec } = modularSpectrum(schmidt)

  // HJ operator on the slice — Lanczos top-k extraction. Returns only
  // the `rankCap` dominant eigenvalues (by magnitude) sorted ascending,
  // avoiding the O(n³) full-spectrum Jacobi cost that blocked the worker
  // for 10+ seconds on clock='a' and effectively forever on the φ-clocks.
  const { spectrum: hjSpec32 } = hjSpectrumOnSliceTopK(
    config.clock,
    {
      Na,
      Nphi,
      aMin: output.aMin,
      aMax: output.aMax,
      phiExtent: output.phiExtent,
      inflatonMass: physics.inflatonMass,
      cosmologicalConstant: physics.cosmologicalConstant,
      sliceIndex: config.cutIndex,
    },
    config.rankCap
  )
  // Widen back to Float64 for the affine fit accumulators — the fit
  // subtracts mean values and squares residuals, both prone to f32
  // catastrophic cancellation when eigenvalues span a wide magnitude
  // range (HJ spectra for WdW span many orders).
  const hjSpec = new Float64Array(hjSpec32.length)
  for (let i = 0; i < hjSpec32.length; i++) hjSpec[i] = hjSpec32[i]!

  const compareCount = Math.min(kSpec.length, hjSpec.length, config.rankCap)
  const q = affineFitQuality(kSpec, hjSpec, compareCount)

  // Cast outputs to Float32 per SrmtResult contract.
  const schmidtF32 = new Float32Array(schmidt.length)
  for (let i = 0; i < schmidt.length; i++) schmidtF32[i] = schmidt[i]!
  const kF32 = new Float32Array(kSpec.length)
  for (let i = 0; i < kSpec.length; i++) kF32[i] = kSpec[i]!
  // hjSpec32 is already Float32 from lanczosTopK; hold the reference
  // directly to avoid a redundant allocation + copy.
  const hjF32 = hjSpec32

  const sliceK = buildSliceK(output, config.clock, config.cutIndex)

  return {
    schmidtValues: schmidtF32,
    kSpectrum: kF32,
    hjSpectrum: hjF32,
    affineMatchQuality: q,
    slicePlane: slicePlaneFor(config.clock),
    sliceK,
  }
}
