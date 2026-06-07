/**
 * Wheeler–DeWitt boundary conditions (Hartle–Hawking / Vilenkin / DeWitt).
 *
 * Each proposal prescribes the reduced wavefunction χ(a_min, φ) on the
 * two-inflaton grid and its `a`-derivative. The solver consumes these
 * two Float32 buffers as interleaved (re, im) pairs indexed by
 * `i = i_phi1 * Nphi + i_phi2`.
 *
 * All quantities use G = ℏ = c = 1 units. Physics constants and the
 * potential helper live in {@link ./constants}; they are re-exported here
 * for backward compatibility with existing imports.
 *
 * ## Phase 2 rewrite
 *
 * The `hartleHawkingBoundary` / `vilenkinBoundary` generators were
 * originally seeded from the leading-WKB amplitude `|U|^{-1/4}·exp(∓|S_E|)`.
 * That form is asymptotically correct only for `|ζ| ≫ 1`; at the typical
 * seeding point `a_min ≈ 0.05..0.1` the Langer variable sits at `|ζ| ≈ 1.6`,
 * well inside the regime where subleading corrections matter. The
 * resulting seed projects onto the Airy basis `{Ai(ζ), Bi(ζ)}` with a
 * **53 % Bi-branch admixture** where HH requires pure Ai (see
 * `docs/plans/wdw-solver-physics-correctness.md` §Finding 1). The
 * rewrite delegates the per-cell seed to {@link ./hhLangerSeed} which
 * emits the Langer-uniform Airy combination exactly.
 */

export { WDW_G_PREFACTOR, wdwPotential } from '../constants'
import { hhLangerSeed, vilenkinLangerSeed } from '../hhLangerSeed'
import type { WdwBoundaryField, WdwMinisuperspaceDimension } from '../solverTypes'

export type { WdwBoundaryField } from '../solverTypes'

/** Shared inputs for the boundary-condition generators. */
export interface WdwBoundaryInputs {
  /** Number of φ grid points per inflaton axis (square φ grid) */
  Nphi: number
  /** Half-range: φ ∈ [-phiExtent, +phiExtent] on both axes */
  phiExtent: number
  /** Initial scale factor a_min where data is imposed */
  aMin: number
  /** Inflaton mass m */
  mass: number
  /** Cosmological constant Λ */
  lambda: number
  /**
   * Per-axis effective-mass ratio on the φ₂ axis. Optional; defaults to
   * `1` (isotropic — matches pre-asymmetry behaviour bit-identically).
   * Threaded into `wdwPotential` / `wdwU` so boundary data stays
   * consistent with the bulk evolution's anisotropic potential.
   */
  asymmetry?: number
  /** Minisuperspace dimension. Defaults to 3. */
  minisuperspaceDimension?: WdwMinisuperspaceDimension
}

/** Interleaved-index helper — (re, im) packed: 2 floats per grid point. */
function setPair(out: Float32Array, idx: number, re: number, im: number): void {
  out[2 * idx] = re
  out[2 * idx + 1] = im
}

/** Zero-allocate helper that produces a complex-entry Float32Array. */
function allocComplexGrid(Nphi: number, phiDims: 2 | 3 = 2): Float32Array {
  return new Float32Array(2 * Math.pow(Nphi, phiDims))
}

/**
 * Map grid index `i ∈ [0, Nphi)` to the φ coordinate.
 * Grid points span a closed interval of width 2·phiExtent.
 */
function indexToPhi(i: number, Nphi: number, phiExtent: number): number {
  if (Nphi <= 1) return 0
  return -phiExtent + (2 * phiExtent * i) / (Nphi - 1)
}

/**
 * Hartle–Hawking no-boundary data, Langer-uniform seed (Phase 2).
 *
 * For each `(φ₁, φ₂)` cell, `{χ, χ′}` are obtained from
 * {@link hhLangerSeed}:
 *
 *  - V(φ) > 0 : `χ(a_min, φ) = (ζ/U)^{1/4} · Ai(ζ)` — pure Ai branch.
 *    Regular at the classical singularity; exponentially decaying past
 *    the turning surface. This is the unique branch that the
 *    no-boundary Euclidean path integral selects.
 *  - V(φ) = 0 (free case, `m = Λ = 0`): `χ = env · √a · J_{1/4}(3π·a²)`.
 *  - V(φ) < 0 (AdS cell): `χ = env · |U|^{-1/4} · cos Φ_L(a)` — real
 *    standing-wave with Gaussian-in-φ gauge envelope.
 *
 * `χ′(a_min, φ)` is returned analytically from `{@link hhLangerSeed}`
 * via the closed-form chain-rule derivative of `(ζ/U)^{1/4}·Ai(ζ)`.
 * Both `χ` and `χ′` are real-valued.
 *
 * @param input - Grid + physics inputs
 * @returns Real-valued boundary field (`im = 0` throughout).
 */
export function hartleHawkingBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const dimension = input.minisuperspaceDimension ?? 3
  const chi = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)
  const chiDeriv = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)

  if (dimension === 4) {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        for (let i3 = 0; i3 < Nphi; i3++) {
          const phi3 = indexToPhi(i3, Nphi, phiExtent)
          const seed = hhLangerSeed({ a: aMin, phi1, phi2, phi3, m: mass, lambda, asymmetry })
          const idx = (i1 * Nphi + i2) * Nphi + i3
          setPair(chi, idx, seed.chi.re, seed.chi.im)
          setPair(chiDeriv, idx, seed.dChi.re, seed.dChi.im)
        }
      }
    }
  } else {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        const seed = hhLangerSeed({ a: aMin, phi1, phi2, m: mass, lambda, asymmetry })
        const idx = i1 * Nphi + i2
        setPair(chi, idx, seed.chi.re, seed.chi.im)
        setPair(chiDeriv, idx, seed.dChi.re, seed.dChi.im)
      }
    }
  }
  return { chi, chiDeriv }
}

/**
 * Vilenkin tunneling boundary data, Langer-uniform seed (Phase 2).
 *
 * For each `(φ₁, φ₂)` cell, `{χ, χ′}` are obtained from
 * {@link vilenkinLangerSeed} — the complex combination that selects
 * the outgoing (+a direction = expanding-universe) branch:
 *
 *  - V(φ) > 0 : `χ = (ζ/U)^{1/4} · (Ai(ζ) + i·Bi(ζ))`. Langer-uniform
 *    outgoing wave. Asymptotically
 *    `Ai + i·Bi → (1/√π)|ζ|^{-1/4}·exp(-i·|S_L| + i·π/4)`, giving
 *    `χ′/χ → +i·√|U|` — the outgoing phase gradient that Vilenkin's
 *    tunneling proposal selects.
 *  - V(φ) = 0 (free case): `χ = env · √a · H_{1/4}^{(1)}(3π·a²)` —
 *    outgoing Hankel combination `J + i·Y`.
 *  - V(φ) < 0 (AdS cell): `χ = env · |U|^{-1/4} · exp(+i·Φ_L(a))`.
 *    Leading-WKB outgoing wave on the pure-Lorentzian column.
 *
 * The V > 0 Langer seed replaces the legacy leading-WKB
 * `amp = exp(-½|φ|²) · exp(+i·a_min³·V/3)` amplitude-plus-phase form,
 * which shared the same 53 % Bi-branch contamination as the legacy HH
 * seed (`docs/plans/wdw-solver-physics-correctness.md` §Phase 2
 * deliverable #5). The new seed produces the pure outgoing branch to
 * the precision of the Airy evaluator (~1e-14).
 *
 * @param input - Grid + physics inputs
 * @returns Complex boundary field with `Im χ′/χ → +√|U|` (outgoing).
 */
export function vilenkinBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const dimension = input.minisuperspaceDimension ?? 3
  const chi = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)
  const chiDeriv = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)

  if (dimension === 4) {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        for (let i3 = 0; i3 < Nphi; i3++) {
          const phi3 = indexToPhi(i3, Nphi, phiExtent)
          const seed = vilenkinLangerSeed({
            a: aMin,
            phi1,
            phi2,
            phi3,
            m: mass,
            lambda,
            asymmetry,
          })
          const idx = (i1 * Nphi + i2) * Nphi + i3
          setPair(chi, idx, seed.chi.re, seed.chi.im)
          setPair(chiDeriv, idx, seed.dChi.re, seed.dChi.im)
        }
      }
    }
  } else {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        const seed = vilenkinLangerSeed({ a: aMin, phi1, phi2, m: mass, lambda, asymmetry })
        const idx = i1 * Nphi + i2
        setPair(chi, idx, seed.chi.re, seed.chi.im)
        setPair(chiDeriv, idx, seed.dChi.re, seed.dChi.im)
      }
    }
  }
  return { chi, chiDeriv }
}

/**
 * DeWitt boundary: χ(0, φ) = 0 everywhere, bootstrapped at a_min by a
 * non-trivial Gaussian-in-φ profile scaled by a_min so the a=0 node is
 * explicit and the march has a finite derivative to integrate from.
 *
 * ∂_a χ ≈ χ(a_min)/a_min (linear ramp from 0).
 *
 * @param input - Grid + physics inputs
 * @returns Real boundary field with explicit node at a=0
 */
export function deWittBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin } = input
  const dimension = input.minisuperspaceDimension ?? 3
  const chi = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)
  const chiDeriv = allocComplexGrid(Nphi, dimension === 4 ? 3 : 2)
  if (dimension === 4) {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        for (let i3 = 0; i3 < Nphi; i3++) {
          const phi3 = indexToPhi(i3, Nphi, phiExtent)
          const idx = (i1 * Nphi + i2) * Nphi + i3
          const env = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2 + phi3 * phi3))
          const amp = aMin * env
          setPair(chi, idx, amp, 0)
          setPair(chiDeriv, idx, env, 0)
        }
      }
    }
  } else {
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = indexToPhi(i1, Nphi, phiExtent)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = indexToPhi(i2, Nphi, phiExtent)
        const idx = i1 * Nphi + i2
        const env = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
        const amp = aMin * env
        setPair(chi, idx, amp, 0)
        // χ starts from the a=0 node linearly: χ'(a_min) ≈ env (= χ(a_min)/a_min).
        setPair(chiDeriv, idx, env, 0)
      }
    }
  }
  return { chi, chiDeriv }
}

/**
 * Dispatch helper that produces boundary data for the chosen proposal.
 *
 * @param bc - Boundary-condition enum
 * @param input - Grid + physics inputs
 * @returns Initial χ + ∂_a χ on the a=a_min slice
 */
export function buildWdwBoundary(
  bc: 'noBoundary' | 'tunneling' | 'deWitt',
  input: WdwBoundaryInputs
): WdwBoundaryField {
  switch (bc) {
    case 'noBoundary':
      return hartleHawkingBoundary(input)
    case 'tunneling':
      return vilenkinBoundary(input)
    case 'deWitt':
      return deWittBoundary(input)
    default: {
      const exhaustive: never = bc
      throw new Error(`Unknown Wheeler-DeWitt boundary condition: ${String(exhaustive)}`)
    }
  }
}
