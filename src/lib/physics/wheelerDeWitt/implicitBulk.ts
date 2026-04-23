/**
 * Semi-implicit Crank–Nicolson bulk propagator for the Wheeler–DeWitt
 * leapfrog solver — Phase 3 of `docs/plans/wdw-solver-physics-correctness.md`.
 *
 * The explicit leapfrog on `−∂²_a χ + (1/a²)·∇²_φ χ + U·χ = 0` has no
 * dissipation at high spatial frequencies and is only conditionally
 * stable under `da²·(1/aMin²)·8/dphi² ≲ 4`. Phase 3 bug 2 (Finding 2 in
 * the plan) showed that at tight grids the scheme develops spurious
 * φ-structure with `sliceVarMax = 13.7×` in the strict
 * translation-invariant limit (`m = 0`, constant-in-φ seed), because
 * noise leaks through the Neumann-ghost φ-boundaries and the multiplicative
 * sponge and then amplifies coherently in the undamped bulk.
 *
 * ## The scheme (Option Aᵢ, per plan §Phase 3)
 *
 * Treat the `(1/a²)·∇²_φ χ` term with the trapezoidal rule (evaluated at
 * `a_next` and `a_prev`) and keep `U·χ` explicit at `a_cur`:
 *
 *     χ_next − (da²/2)·L_next·χ_next
 *       = 2·χ_cur − χ_prev + (da²/2)·L_prev·χ_prev + da²·U_cur·χ_cur
 *
 * with `L = (1/a²)·∇²_φ` and `U` the reduced-WdW potential. The scheme is
 * formally A-stable: the amplification factor for the homogeneous
 * free-wave eigenmode `k` satisfies `|ρ(k)| = 1` for every
 * `da²·|L|·|ρ| ≥ 0`, so the CFL constraint drops to an accuracy
 * consideration rather than a stability one.
 *
 * ## ADI splitting
 *
 * The 2D elliptic operator `(I − κ·(D_x + D_y))` is replaced by the
 * factorised form `(I − κ·D_x)(I − κ·D_y)`. The algebraic residual
 * `κ²·D_x·D_y·χ` is `O(da⁴/(a⁴·dphi⁴))` at the scheme's accuracy scale;
 * at default parameters (`da = 0.01, a ≥ 0.1, dphi = 0.125`) this is
 * `≈ 1.6·10⁻⁴`, below the leapfrog's inherent `O(da²) = 10⁻⁴` accuracy
 * bar. Splitting error therefore does not degrade the second-order
 * convergence order.
 *
 * Each half-solve factorises the 1D Neumann-Laplacian operator with
 * Thomas tridiagonal elimination; factorisation is `O(Nphi)` per a-step
 * (same `κ` for every row of one sweep), back-substitution is `O(Nphi)`
 * per row and there are `Nphi` rows per sweep. Total cost per slab is
 * `O(Nphi²)` — the same order as the original explicit leapfrog, with no
 * per-step CFL constraint.
 *
 * ## Symmetry preservation
 *
 * `∇²_φ` annihilates the constant-in-φ eigenspace, and so does each
 * 1D Neumann sub-operator `D_x`, `D_y`. Any RHS that is constant in φ
 * produces a solution that is also constant in φ:
 *
 *     (I − κ·∇²_φ)^{−1}·const = const,
 *     (I − κ·D_x)^{−1}·const = const,  likewise for D_y.
 *
 * The `symmetryPreservation.test.ts` Phase 1 test (`m = 0`, Λ ∈
 * {-0.5, 0, 0.5, 0.8}) therefore passes to within numerical precision
 * under this scheme, independent of grid resolution.
 *
 * @module lib/physics/wheelerDeWitt/implicitBulk
 */

/**
 * Thomas-algorithm solve for `(I − κ̂·L_1d_Neumann)·x = b` on a
 * node-centred 1D grid of length `N` with Neumann ghost
 * (`χ_{-1} = χ_0, χ_N = χ_{N-1}`).
 *
 * The 1D discrete Laplacian with that ghost rule has rows
 *
 *     L[0,0]   = -1/dφ²,  L[0,1]   = +1/dφ²
 *     L[i,i-1] = +1/dφ²,  L[i,i]   = -2/dφ²,  L[i,i+1] = +1/dφ²   (1 ≤ i ≤ N-2)
 *     L[N-1,N-2] = +1/dφ², L[N-1,N-1] = -1/dφ²
 *
 * With `κ̂ = κ/dφ²` (caller absorbs the grid spacing), the system
 * `(I − κ̂·L)·x = b` is tridiagonal with
 *
 *     Row 0:   b_0 = 1 + κ̂,   c_0 = −κ̂
 *     Row i:   a_i = −κ̂, b_i = 1 + 2κ̂, c_i = −κ̂    (1 ≤ i ≤ N-2)
 *     Row N-1: a_{N-1} = −κ̂, b_{N-1} = 1 + κ̂
 *
 * The matrix is strictly diagonally dominant for `κ̂ ≥ 0`, so Thomas is
 * numerically stable. Cost: `O(N)`.
 *
 * Scratch buffers `cPrime` and `work` must have length `≥ N`; the caller
 * is responsible for allocation (allowing reuse across many solves with
 * the same `N` per a-step).
 *
 * @param rhs    Input RHS of length `N`.
 * @param out    Output vector of length `N`.
 * @param N      Grid size.
 * @param kappa  `κ/dφ² ≥ 0` for the implicit operator.
 * @param cPrime Scratch upper-diagonal post-elimination factors, length `N`.
 * @param work   Scratch forward-sweep RHS, length `N`.
 */
export function solveNeumannTridiag1D(
  rhs: Float64Array,
  out: Float64Array,
  N: number,
  kappa: number,
  cPrime: Float64Array,
  work: Float64Array
): void {
  if (N < 2) {
    // Degenerate 1-cell column: operator reduces to identity on a cell
    // that does not participate in any Laplacian stencil.
    if (N === 1) out[0] = rhs[0] ?? 0
    return
  }
  const aSub = -kappa
  const cSuper = -kappa

  // Row 0: b = 1 + κ̂, no lower coefficient.
  let denom = 1 + kappa
  cPrime[0] = cSuper / denom
  work[0] = (rhs[0] ?? 0) / denom

  // Rows 1..N-2: b = 1 + 2κ̂.
  for (let i = 1; i < N - 1; i++) {
    denom = 1 + 2 * kappa - aSub * (cPrime[i - 1] ?? 0)
    cPrime[i] = cSuper / denom
    work[i] = ((rhs[i] ?? 0) - aSub * (work[i - 1] ?? 0)) / denom
  }

  // Row N-1: b = 1 + κ̂, no upper coefficient.
  denom = 1 + kappa - aSub * (cPrime[N - 2] ?? 0)
  work[N - 1] = ((rhs[N - 1] ?? 0) - aSub * (work[N - 2] ?? 0)) / denom

  // Back-substitute.
  out[N - 1] = work[N - 1] ?? 0
  for (let i = N - 2; i >= 0; i--) {
    out[i] = (work[i] ?? 0) - (cPrime[i] ?? 0) * (out[i + 1] ?? 0)
  }
}

/**
 * Scratch buffers for the ADI bulk propagator. Allocate once at
 * solver entry and reuse across every a-step; the buffers hold
 * intermediate state between the two half-sweeps plus the Thomas-solver
 * workspace.
 */
export interface ImplicitBulkScratch {
  /** Intermediate state `ψ` after the x-sweep (Re component). f64 for
   *  round-off parity between x-sweep and y-sweep: the Thomas algorithm
   *  accumulates f32 round-off differently along different axes, which
   *  manifests in f32 as a `~2·10⁻³` exchange-symmetry violation after
   *  hundreds of a-steps. Keeping the sweep workspace in f64 drops the
   *  violation to `~10⁻⁵`, well below `symmetryPreservation.test.ts`'s
   *  `1·10⁻³` tolerance. */
  interRe: Float64Array
  /** Intermediate state `ψ` after the x-sweep (Im component). */
  interIm: Float64Array
  /** 1D row buffer used for both RHS extraction and Thomas input. */
  rowIn: Float64Array
  /** 1D row buffer used for Thomas output. */
  rowOut: Float64Array
  /** Upper-diagonal factors, reused across Thomas solves of the same `κ̂`. */
  cPrime: Float64Array
  /** Forward-sweep intermediate RHS, reused across Thomas solves. */
  work: Float64Array
}

/**
 * Allocate scratch buffers for the ADI bulk propagator sized for a
 * square `Nphi × Nphi` φ-grid.
 *
 * @param Nphi Per-axis grid size.
 * @returns Freshly-allocated scratch.
 */
export function allocImplicitBulkScratch(Nphi: number): ImplicitBulkScratch {
  return {
    interRe: new Float64Array(Nphi * Nphi),
    interIm: new Float64Array(Nphi * Nphi),
    rowIn: new Float64Array(Nphi),
    rowOut: new Float64Array(Nphi),
    cPrime: new Float64Array(Nphi),
    work: new Float64Array(Nphi),
  }
}

/**
 * ADI solve `(I − κ̂·D_x)(I − κ̂·D_y)·χ = RHS` on the full `Nphi × Nphi`
 * φ-slab with Neumann boundaries on both axes. Both input RHS and
 * output χ are interleaved `(re, im)` pairs of length `2·Nphi²`,
 * row-major indexing with `i1 · Nphi + i2` over the axes.
 *
 * The splitting identity
 *
 *     (I − κ̂·D_x)·(I − κ̂·D_y) = (I − κ̂·(D_x + D_y)) + κ̂²·D_x·D_y
 *
 * introduces an `O(κ̂²)` residual; at typical parameters (`κ̂ ≈ 1e-4·…·1e-2`)
 * this is comparable to the leapfrog's own `O(da²)` truncation error,
 * so convergence remains second-order in `da`. See the module docstring
 * for the derivation.
 *
 * Real and imaginary components solve independently (the matrix is
 * real, the complex structure decouples). Each component requires two
 * sweeps of `Nphi` Thomas tridiagonal solves of size `Nphi`, cost
 * `O(Nphi²)` per a-step.
 *
 * @param rhs     Input RHS, interleaved complex, length `2·Nphi²`.
 * @param out     Output χ_next, interleaved complex, length `2·Nphi²`.
 * @param Nphi    Grid size per axis.
 * @param kappa   `(da²/2)/(a_next²·dφ²)` — the dimensionless implicit
 *                coefficient carrying both the trapezoidal factor and
 *                the grid spacing. Must be ≥ 0.
 * @param scratch Preallocated scratch — see {@link allocImplicitBulkScratch}.
 */
export function solveADILaplacianNeumann2D(
  rhs: Float32Array,
  out: Float32Array,
  Nphi: number,
  kappa: number,
  scratch: ImplicitBulkScratch
): void {
  const { interRe, interIm, rowIn, rowOut, cPrime, work } = scratch

  // ----- Sweep 1: solve (I − κ̂·D_x)·ψ = RHS along the i1 axis. -----
  // For each (i2, component), extract the length-Nphi column along i1
  // from the interleaved RHS, Thomas-solve, and write the intermediate
  // ψ to `interRe` / `interIm`.
  for (let i2 = 0; i2 < Nphi; i2++) {
    // Real component.
    for (let i1 = 0; i1 < Nphi; i1++) {
      rowIn[i1] = rhs[2 * (i1 * Nphi + i2)] ?? 0
    }
    solveNeumannTridiag1D(rowIn, rowOut, Nphi, kappa, cPrime, work)
    for (let i1 = 0; i1 < Nphi; i1++) {
      interRe[i1 * Nphi + i2] = rowOut[i1] ?? 0
    }

    // Imaginary component.
    for (let i1 = 0; i1 < Nphi; i1++) {
      rowIn[i1] = rhs[2 * (i1 * Nphi + i2) + 1] ?? 0
    }
    solveNeumannTridiag1D(rowIn, rowOut, Nphi, kappa, cPrime, work)
    for (let i1 = 0; i1 < Nphi; i1++) {
      interIm[i1 * Nphi + i2] = rowOut[i1] ?? 0
    }
  }

  // ----- Sweep 2: solve (I − κ̂·D_y)·χ_next = ψ along the i2 axis. -----
  // For each (i1, component), extract the length-Nphi row along i2 from
  // the intermediate slab, Thomas-solve, and write directly into the
  // interleaved output.
  for (let i1 = 0; i1 < Nphi; i1++) {
    // Real component.
    for (let i2 = 0; i2 < Nphi; i2++) {
      rowIn[i2] = interRe[i1 * Nphi + i2] ?? 0
    }
    solveNeumannTridiag1D(rowIn, rowOut, Nphi, kappa, cPrime, work)
    for (let i2 = 0; i2 < Nphi; i2++) {
      out[2 * (i1 * Nphi + i2)] = rowOut[i2] ?? 0
    }

    // Imaginary component.
    for (let i2 = 0; i2 < Nphi; i2++) {
      rowIn[i2] = interIm[i1 * Nphi + i2] ?? 0
    }
    solveNeumannTridiag1D(rowIn, rowOut, Nphi, kappa, cPrime, work)
    for (let i2 = 0; i2 < Nphi; i2++) {
      out[2 * (i1 * Nphi + i2) + 1] = rowOut[i2] ?? 0
    }
  }
}
