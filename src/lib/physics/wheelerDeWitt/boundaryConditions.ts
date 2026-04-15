/**
 * Wheeler–DeWitt boundary conditions (Hartle–Hawking / Vilenkin / DeWitt).
 *
 * Each proposal prescribes the reduced wavefunction χ(a_min, φ) on the
 * two-inflaton grid and its `a`-derivative. The solver consumes these
 * two Float32 buffers as interleaved (re, im) pairs indexed by
 * `i = i_phi1 * Nphi + i_phi2`.
 *
 * All quantities use G = ℏ = c = 1 units.
 */

/** 8πG / 3 with G = 1 — shared constant reused by solver + boundary. */
export const WDW_G_PREFACTOR = (8 * Math.PI) / 3

/** Potential V(φ) = ½m²(φ₁²+φ₂²) + Λ. Real-valued scalar. */
export function wdwPotential(phi1: number, phi2: number, m: number, lambda: number): number {
  return 0.5 * m * m * (phi1 * phi1 + phi2 * phi2) + lambda
}

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
}

/** Output buffers for the boundary condition: χ(a_min, φ) and ∂_a χ(a_min, φ). */
export interface WdwBoundaryField {
  /** χ(a_min,·) interleaved [re, im] × (Nphi*Nphi). */
  chi: Float32Array
  /** ∂_a χ(a_min,·) interleaved [re, im] × (Nphi*Nphi). */
  chiDeriv: Float32Array
}

/** Interleaved-index helper — (re, im) packed: 2 floats per grid point. */
function setPair(out: Float32Array, idx: number, re: number, im: number): void {
  out[2 * idx] = re
  out[2 * idx + 1] = im
}

/** Zero-allocate helper that produces a Float32Array of (Nphi²) complex entries. */
function allocComplexGrid(Nphi: number): Float32Array {
  return new Float32Array(2 * Nphi * Nphi)
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
 * Hartle–Hawking no-boundary data.
 *
 * χ(a_min, φ) = exp(−|S_E|) with the WKB Euclidean action
 * S_E(φ, a) = (1/(3 V(φ))) · [(1 − a²·(8πG/3)·V(φ))^{3/2} − 1] when the
 * argument is non-negative, falling back to a Gaussian-in-φ envelope
 * when the expression is imaginary (V(φ) is too large for the bounce).
 * ∂_a χ = 0 by symmetry.
 *
 * @param input - Grid + physics inputs
 * @returns Real-valued (im = 0) boundary field
 */
export function hartleHawkingBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
  const a2 = aMin * aMin

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = indexToPhi(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = indexToPhi(i2, Nphi, phiExtent)
      const V = wdwPotential(phi1, phi2, mass, lambda)
      const idx = i1 * Nphi + i2
      let amp: number
      if (V <= 1e-12) {
        // Λ ≤ 0 region: fall back to exponential damping in φ.
        amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
      } else {
        const arg = 1.0 - a2 * WDW_G_PREFACTOR * V
        if (arg <= 0) {
          // Classically forbidden region — damped tail.
          amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
        } else {
          const Se = (1.0 / (3.0 * V)) * (Math.pow(arg, 1.5) - 1.0)
          // S_E is negative when arg<1 (expanding bounce), so |S_E| = -S_E.
          // exp(-|S_E|) is bounded in (0,1].
          amp = Math.exp(-Math.abs(Se))
        }
      }
      setPair(chi, idx, amp, 0)
      setPair(chiDeriv, idx, 0, 0)
    }
  }
  return { chi, chiDeriv }
}

/**
 * Vilenkin tunneling boundary data.
 *
 * χ(a_min, φ) = A(φ)·exp(+i·S_L(φ)) with Lorentzian WKB phase
 * S_L(φ) = a_min³·V(φ)/3 — the leading small-a term of the classical
 * action — and A(φ) a Gaussian envelope. ∂_a χ ≈ i·(a_min²·V(φ))·χ,
 * from ∂_a S_L at a=a_min.
 *
 * This produces a non-trivial oscillating phase with non-zero mean phase
 * magnitude, distinguishing Vilenkin from Hartle–Hawking visually.
 *
 * @param input - Grid + physics inputs
 * @returns Complex boundary field with |arg(χ)|_mean > 0
 */
export function vilenkinBoundary(input: WdwBoundaryInputs): WdwBoundaryField {
  const { Nphi, phiExtent, aMin, mass, lambda } = input
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
  const a3 = aMin * aMin * aMin
  const a2 = aMin * aMin

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = indexToPhi(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = indexToPhi(i2, Nphi, phiExtent)
      const V = wdwPotential(phi1, phi2, mass, lambda)
      const amp = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
      const S_L = (a3 * V) / 3.0
      const cosS = Math.cos(S_L)
      const sinS = Math.sin(S_L)
      const idx = i1 * Nphi + i2
      setPair(chi, idx, amp * cosS, amp * sinS)
      // ∂_a (amp·exp(iS_L)) = amp · i · (∂_a S_L) · exp(iS_L) with
      // ∂_a S_L|_{aMin} = a_min²·V(φ).
      const dSda = a2 * V
      // d/da of chi = i·dSda·chi
      const cre = amp * cosS
      const cim = amp * sinS
      setPair(chiDeriv, idx, -dSda * cim, dSda * cre)
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
  const chi = allocComplexGrid(Nphi)
  const chiDeriv = allocComplexGrid(Nphi)
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
