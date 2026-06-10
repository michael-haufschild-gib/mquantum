/**
 * Weil-intertwiner positivity math for the Hilbert–Pólya Analysis panel.
 *
 * From the regularized intertwiner of the Riemann operator (Yakaboylu,
 * arXiv:2408.15135 eq 52): ⟨Ψ_s|V̂_{R,ε}Ψ_{s'}⟩ = ε²/(ε² − (s̄+s'−1)²).
 * On the critical line this Gram matrix is the Cauchy kernel
 * W_ε[n,m] = ε²/(ε² + (γ_n−γ_m)²) — positive definite for any point set
 * (Bochner). The Riemann Hypothesis is exactly the statement that positivity
 * survives for the TRUE zero set at every ε: an off-line zero β ≠ 1/2 plus
 * its functional-equation partner 1−β drives λ_min negative once ε < |2β−1|.
 *
 * @module lib/physics/hilbertPolya/intertwiner
 */

/** A (possibly off-line) zero parameterized by Re(ρ) = b and Im(ρ) = g. */
export interface ZeroPoint {
  b: number
  g: number
}

/**
 * Real part of the regularized intertwiner Gram on a set of zeros, using the
 * analytically-continued matrix elements ε²/(ε² − (s̄+s'−1)²).
 */
export function intertwinerGram(points: readonly ZeroPoint[], eps: number): Float64Array {
  const n = points.length
  const m = new Float64Array(n * n)
  const e2 = eps * eps
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const re = points[i]!.b + points[j]!.b - 1
      const im = points[j]!.g - points[i]!.g
      const dRe = e2 - (re * re - im * im)
      const dIm = -2 * re * im
      const den = dRe * dRe + dIm * dIm
      m[i * n + j] = den > 0 ? (e2 * dRe) / den : 0
    }
  }
  return m
}

/** Critical-line zero set from a list of ordinates. */
export function onLinePoints(ordinates: readonly number[]): ZeroPoint[] {
  return ordinates.map((g) => ({ b: 0.5, g }))
}

/**
 * Zero set with one injected off-line doublet (ρ₀ = β+iγ₀ and its
 * functional-equation partner 1−β+iγ₀). At β = 1/2 the doublet degenerates
 * to a single on-line zero, which we skip to keep the Gram non-singular.
 */
export function withDoublet(
  ordinates: readonly number[],
  beta: number,
  gamma0: number
): ZeroPoint[] {
  const pts = onLinePoints(ordinates)
  if (Math.abs(beta - 0.5) > 1e-6) {
    pts.push({ b: beta, g: gamma0 }, { b: 1 - beta, g: gamma0 })
  }
  return pts
}

/**
 * Smallest eigenvalue of a dense symmetric matrix by cyclic Jacobi sweeps.
 * Sizes here are ≤ ~50, where Jacobi is robust and fast enough for UI use.
 */
export function minEigenvalueSym(aIn: Float64Array, n: number): number {
  const m = Float64Array.from(aIn)
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * n + j]! ** 2
    if (off < 1e-20) break
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const apq = m[i * n + j]!
        if (Math.abs(apq) < 1e-14) continue
        const tau = (m[j * n + j]! - m[i * n + i]!) / (2 * apq)
        const sgn = Math.sign(tau) || 1
        const t = sgn / (Math.abs(tau) + Math.sqrt(tau * tau + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const aik = m[i * n + k]!
          const ajk = m[j * n + k]!
          m[i * n + k] = c * aik - s * ajk
          m[j * n + k] = s * aik + c * ajk
        }
        for (let k = 0; k < n; k++) {
          const aki = m[k * n + i]!
          const akj = m[k * n + j]!
          m[k * n + i] = c * aki - s * akj
          m[k * n + j] = s * aki + c * akj
        }
      }
    }
  }
  let min = Infinity
  for (let i = 0; i < n; i++) min = Math.min(min, m[i * n + i]!)
  return min
}

/** Deterministic LCG in [0,1) for the Poisson comparison ensemble. */
export function makeLcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (1103515245 * state + 12345) >>> 0
    return state / 4294967296
  }
}

/**
 * λ_min of the Cauchy Gram on three matched-density ensembles: the given
 * unfolded points, Poisson points (mean over `realizations`), and the picket
 * fence. Used by the panel's "GUE protects positivity" comparison row.
 */
export function ensembleComparison(
  unfolded: readonly number[],
  eps: number,
  realizations = 6,
  seed = 123456789
): { zeros: number; poissonMean: number; picket: number } {
  const n = unfolded.length
  const gram = (pts: readonly number[]): number =>
    minEigenvalueSym(
      intertwinerGram(
        pts.map((g) => ({ b: 0.5, g })),
        eps
      ),
      n
    )
  const zeros = gram(unfolded)
  const rand = makeLcg(seed)
  let acc = 0
  for (let r = 0; r < realizations; r++) {
    const pts: number[] = [0]
    for (let i = 1; i < n; i++) pts.push(pts[i - 1]! - Math.log(1 - rand()))
    acc += gram(pts)
  }
  const picket = gram(Array.from({ length: n }, (_, i) => i))
  return { zeros, poissonMean: acc / realizations, picket }
}
