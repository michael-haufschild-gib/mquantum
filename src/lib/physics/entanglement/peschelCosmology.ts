/**
 * Cosmological trajectory of Peschel entanglement entropy under FLRW
 * adiabatic evolution.
 *
 * Evaluates `S(L_A, η)` — the reduced von Neumann entropy of a contiguous
 * 1D-slice subsystem — as a function of conformal time on a cosmological
 * background. At each η the instantaneous adiabatic vacuum is reconstructed
 * with `ω_k(η)² = k_lat² + m² · a(η)²`, the Peschel correlators are built,
 * and the symplectic eigenvalue decomposition yields the entropy.
 *
 * @module lib/physics/entanglement/peschelCosmology
 */

import { computeCosmologyAt, type CosmologySnapshot } from '@/lib/physics/cosmology/background'
import { type CosmologyPresetParams, isValidPreset } from '@/lib/physics/cosmology/presets'

import { buildLatticeSliceCorrelators } from './peschelCorrelators'
import { extractSubsystem, peschelEntropy, symplecticEigenvalues } from './peschelEntropy'

/**
 * Input to a cosmology-aware entanglement-entropy trajectory computation.
 *
 * Lattice geometry is N-D (the slice along axis 0 is probed); for a pure
 * 1D run pass length-1 arrays and `latticeDim = 1`.
 */
export interface CosmologicalEntropyInput {
  /** Grid sizes per lattice dimension. First entry is the probed axis. */
  readonly gridSize: readonly number[]
  /** Lattice spacings per dimension. */
  readonly spacing: readonly number[]
  /** Active spatial dimensions of the lattice. */
  readonly latticeDim: number
  /** Mass of the free scalar field (physical mass, not yet squared with a²). */
  readonly mass: number
  /** Contiguous subsystem length L_A ∈ [1, N_0/2]. */
  readonly subsystemLength: number
  /** FLRW preset parameters (must satisfy `isValidPreset`). */
  readonly cosmology: CosmologyPresetParams
  /** Conformal times `η < 0` at which to evaluate S (skipped if `η = 0`). */
  readonly etaSweep: readonly number[]
}

/**
 * Result of a cosmology-aware entanglement-entropy trajectory.
 */
export interface CosmologicalEntropyTrajectory {
  /** Conformal times actually sampled (non-zero, cosmology-valid). */
  etas: number[]
  /** Scale factor `a(η)` at each sampled η. */
  scaleFactors: number[]
  /** Effective squared mass `m² · a(η)²` at each sampled η. */
  effectiveMassSq: number[]
  /** Peschel entropy S(L_A, η) at each sampled η, in nats. */
  entropies: number[]
}

/**
 * Evaluate the Peschel entanglement entropy S(L_A) of a contiguous 1D slice
 * subsystem as a function of conformal time η on a cosmological background.
 *
 * The slice is the 1D set of lattice sites along axis 0 of the N-D lattice;
 * the correlators are built by summing over all transverse k modes so the
 * trajectory reflects the full-dimensional vacuum restricted to the slice,
 * not a standalone 1D theory that happens to share `(N_0, a_0, m)`.
 *
 * The computation at each η is the **instantaneous adiabatic-vacuum**
 * entropy built from the lattice dispersion `ω_k(η)² = k_lat² + m²·a(η)²`.
 * This is the cosmology-aware counterpart of the Minkowski construction in
 * {@link buildLatticeSliceCorrelators} — same operator, different squared
 * mass at each step.
 *
 * **What it reveals**: for de Sitter, as η → 0⁻ the scale factor
 * `a(η) = −1/(Hη)` diverges, so `m_eff²(η) → ∞` for a massive field — the
 * mass gap reopens and entropy saturates to the area law. For a massless
 * field `m_eff² ≡ 0`, the entropy is independent of η at the analytic level;
 * any residual drift is a lattice finite-size artefact. For Kasner and
 * ekpyrotic backgrounds `a(η)` varies as a power law in `|η|`, so the
 * trajectory shows monotonic growth or decay depending on `q`.
 *
 * Invalid / skipped samples:
 *   - `η = 0` is skipped (the cosmology helper throws for non-Minkowski).
 *   - Non-finite `a(η)` is skipped (should not happen for the standard
 *     presets but is guarded defensively).
 *   - An invalid non-Minkowski preset returns an empty trajectory so the UI
 *     can hide the chart — more honest than a flat line labelled "de Sitter".
 *
 * @param input - Lattice, cosmology, and η-sweep configuration.
 * @returns A trajectory with matched `etas`, `scaleFactors`,
 *          `effectiveMassSq`, and `entropies` arrays.
 * @throws {Error} If `subsystemLength < 1` or `> gridSize[0]`, or lattice
 *                 parameters are invalid.
 */
export function computeCosmologicalEntropyTrajectory(
  input: CosmologicalEntropyInput
): CosmologicalEntropyTrajectory {
  const { gridSize, spacing, latticeDim, mass, subsystemLength, cosmology, etaSweep } = input
  if (!Number.isInteger(latticeDim) || latticeDim < 1) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: latticeDim must be a positive integer, got ${latticeDim}`
    )
  }
  if (gridSize.length < latticeDim || spacing.length < latticeDim) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: gridSize and spacing must have at least ${latticeDim} entries`
    )
  }
  const N0 = gridSize[0]!
  if (!Number.isInteger(subsystemLength) || subsystemLength < 1 || subsystemLength > N0) {
    throw new Error(
      `computeCosmologicalEntropyTrajectory: subsystemLength must be in [1, ${N0}], got ${subsystemLength}`
    )
  }
  if (!(N0 >= 2) || !(spacing[0]! > 0) || !Number.isFinite(mass)) {
    throw new Error('computeCosmologicalEntropyTrajectory: invalid lattice parameters')
  }

  const massSqBase = mass * mass
  const isMinkowski = cosmology.preset === 'minkowski'
  // Refuse to silently fall back to the Minkowski trajectory for an invalid
  // non-Minkowski preset — the UI handles an empty trajectory by hiding the
  // chart, which is a clearer signal to the user that their parameters are
  // broken than a flat line labeled "de Sitter".
  if (!isMinkowski && !isValidPreset(cosmology)) {
    return { etas: [], scaleFactors: [], effectiveMassSq: [], entropies: [] }
  }

  const etas: number[] = []
  const scales: number[] = []
  const mEffs: number[] = []
  const entropies: number[] = []

  for (const eta of etaSweep) {
    if (!Number.isFinite(eta)) continue
    if (eta === 0 && !isMinkowski) continue

    let snap: CosmologySnapshot
    if (isMinkowski) {
      snap = { a: 1, hubble: 0, aKinetic: 1, aPotential: 1, aFull: 1 }
    } else {
      try {
        snap = computeCosmologyAt(eta, cosmology)
      } catch {
        continue
      }
    }
    if (!Number.isFinite(snap.a) || snap.a <= 0) continue

    const mEffSq = massSqBase * snap.a * snap.a
    const correlators = buildLatticeSliceCorrelators({
      gridSize,
      spacing,
      latticeDim,
      massSq: mEffSq,
    })
    const XA = extractSubsystem(correlators.X, N0, 0, subsystemLength)
    const PA = extractSubsystem(correlators.P, N0, 0, subsystemLength)
    const nu = symplecticEigenvalues(XA, PA, subsystemLength)
    const S = peschelEntropy(nu)

    etas.push(eta)
    scales.push(snap.a)
    mEffs.push(mEffSq)
    entropies.push(S)
  }

  return { etas, scaleFactors: scales, effectiveMassSq: mEffs, entropies }
}
