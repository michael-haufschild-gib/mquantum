/**
 * Numerical lab core for the Hilbert–Pólya quest (research script, not app code).
 *
 * - tqli: implicit-shift QL eigensolver for symmetric tridiagonal matrices
 *   (eigenvalues only), the standard Numerical Recipes algorithm.
 * - buildSturmLiouville: cell-centered finite-volume discretization of
 *   L = ∂_x(p(x)∂_x) + V(x) on (a, b] with a natural (zero-flux) condition at
 *   the left face and a Dirichlet condition at the right face. When p(a) = 0
 *   (degenerate endpoint), the zero left flux reproduces the principal
 *   boundary condition lim_{x→a} p(x)ξ'(x) = 0 exactly — this is the
 *   Connes–Moscovici W_sa condition (arXiv:2112.05500 eq 16).
 *
 * Run self-test: node --experimental-strip-types scripts/research/hilbertPolya/tridiag.ts
 */

export interface Tridiag {
  /** Diagonal entries d[0..n-1]. */
  d: Float64Array
  /** Off-diagonal entries e[0..n-2]; e[i] couples nodes i and i+1. */
  e: Float64Array
}

/**
 * All eigenvalues of a symmetric tridiagonal matrix via implicit-shift QL.
 * d has length n; e has length ≥ n-1 with e[i] coupling (i, i+1).
 * Destroys inputs. Returns eigenvalues sorted ascending.
 */
export function tqli(d: Float64Array, eIn: Float64Array): Float64Array {
  const n = d.length
  const e = new Float64Array(n) // e[i] couples (i, i+1); e[n-1] is workspace 0
  e.set(eIn.subarray(0, n - 1))

  for (let l = 0; l < n; l++) {
    let iter = 0
    let m = l
    for (;;) {
      // Find the first negligible off-diagonal at or after l.
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]!) + Math.abs(d[m + 1]!)
        if (Math.abs(e[m]!) <= Number.EPSILON * dd) break
      }
      if (m === l) break
      if (iter++ === 60) throw new Error(`tqli: too many iterations at l=${l}`)

      // Form implicit shift.
      let g = (d[l + 1]! - d[l]!) / (2 * e[l]!)
      let r = Math.hypot(g, 1)
      g = d[m]! - d[l]! + e[l]! / (g + (g >= 0 ? r : -r))
      let s = 1
      let c = 1
      let p = 0
      let underflow = false
      for (let i = m - 1; i >= l; i--) {
        let f = s * e[i]!
        const b = c * e[i]!
        r = Math.hypot(f, g)
        e[i + 1] = r
        if (r === 0) {
          d[i + 1]! -= p
          e[m] = 0
          underflow = true
          break
        }
        s = f / r
        c = g / r
        g = d[i + 1]! - p
        f = (d[i]! - g) * s + 2 * c * b
        p = s * f
        d[i + 1] = g + p
        g = c * f - b
      }
      if (underflow) continue
      d[l]! -= p
      e[l] = g
      e[m] = 0
    }
  }
  const out = Array.from(d)
  out.sort((a, b) => a - b)
  return Float64Array.from(out)
}

/**
 * Cell-centered FV discretization of L = ∂(p∂) + V on (a, a + n*h], natural
 * (zero-flux) at the left face x=a, Dirichlet (mirror ghost) at the right
 * face x = a + n*h. Cell centers x_i = a + (i+1/2)h, i = 0..n-1.
 */
export function buildSturmLiouville(
  a: number,
  h: number,
  n: number,
  p: (x: number) => number,
  V: (x: number) => number
): Tridiag {
  const d = new Float64Array(n)
  const e = new Float64Array(n - 1)
  const inv = 1 / (h * h)
  for (let i = 0; i < n; i++) {
    const xc = a + (i + 0.5) * h
    const pL = p(a + i * h) // left face (i=0 → p(a), zero for degenerate endpoint)
    const pR = p(a + (i + 1) * h) // right face
    // Interior: (Lξ)_i = [pR(ξ_{i+1}-ξ_i) - pL(ξ_i-ξ_{i-1})]/h² + V ξ_i.
    // Right boundary cell: mirror ghost ξ_n = -ξ_{n-1} ⇒ flux term -2 pR ξ_{n-1}/h².
    const rightCoupling = i === n - 1 ? 2 * pR : pR
    d[i] = -(pL + rightCoupling) * inv + V(xc)
    if (i < n - 1) e[i] = pR * inv
  }
  return { d, e }
}

/** Self-test: harmonic oscillator -ξ'' + x²ξ on (-X, X), eigenvalues 2k+1. */
function selfTest(): void {
  const X = 12
  const h = 0.01
  const n = Math.round((2 * X) / h)
  // L = ∂(p∂) + V with p = +1, V = -x² is -H; eigenvalues -(2k+1), negate after.
  const { d, e } = buildSturmLiouville(
    -X,
    h,
    n,
    () => 1,
    (x) => -(x * x)
  )
  const ev = tqli(d, e)
  // Largest eigenvalues of L = -(smallest of H); H eigenvalues = 2k+1.
  const hEv: number[] = []
  for (let i = ev.length - 1; i >= ev.length - 8; i--) hEv.push(-ev[i]!)
  hEv.sort((u, v) => u - v)
  let maxErr = 0
  for (let k = 0; k < 8; k++) maxErr = Math.max(maxErr, Math.abs(hEv[k]! - (2 * k + 1)))
  console.log('HO eigenvalues:', hEv.map((v) => v.toFixed(6)).join(', '))
  console.log(`max |error| vs 2k+1: ${maxErr.toExponential(2)} (expect ~1e-4 at h=0.01)`)
  if (maxErr > 1e-3) throw new Error('self-test FAILED')
  console.log('tridiag self-test PASSED')
}

if (process.argv[1]?.endsWith('tridiag.ts')) selfTest()
