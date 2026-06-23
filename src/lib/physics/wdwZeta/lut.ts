/**
 * ζ-LUT builders for the WDW ⊗ ζ visualization suite.
 *
 * The suite no longer bakes a finished 96³ RGBA image (the old, homogenizing
 * "everything is a glowing texture cube" route). Instead each mode uploads a
 * tiny `array<vec4f, WDW_ZETA_LUT_VEC4>` storage buffer carrying only the
 * *irreducible* precomputed arithmetic — the ζ-zero ordinates, primon
 * occupations, Möbius lacework weights, prime-power ridge positions, Selberg
 * lengths — and the shader synthesizes a **live, lit, per-mode-distinct 3D form**
 * from it (mirroring how `riemannZeta`/`bifurcationHorizon`/`hilbertPolya`
 * already render). All the heavy ζ math (`complex.ts`) runs once here, on the
 * CPU, when a config knob changes — never per frame.
 *
 * ## LUT layout contract (shared verbatim with `mainWdwZetaVolume.wgsl.ts`)
 *
 * ```
 * [0]                      header A: (itemCount, pA, pB, pC)   — per-mode scalars
 * [1]                      header B: (pD, pE, pF, pG)
 * [ZEROS .. ZEROS+ZN-1]    ζ-zeros : .x = tₙ (nth nontrivial ordinate, Im ρₙ)
 * [AUX .. ]                aux     : mode-specific (primes, μ(n), ridges, lengths)
 * ```
 *
 * @module lib/physics/wdwZeta/lut
 */

import type { AdelicWavefunctionConfig } from '@/lib/geometry/extended/wdwZeta/adelicWavefunction'
import type { ConstraintSeamConfig } from '@/lib/geometry/extended/wdwZeta/constraintSeam'
import type { DewittConeConfig } from '@/lib/geometry/extended/wdwZeta/dewittCone'
import type { FieldOneElementConfig } from '@/lib/geometry/extended/wdwZeta/fieldOneElement'
import type { ForcedCellConfig } from '@/lib/geometry/extended/wdwZeta/forcedCell'
import type { FrobeniusWheelConfig } from '@/lib/geometry/extended/wdwZeta/frobeniusWheel'
import type { MoebiusNoBoundaryConfig } from '@/lib/geometry/extended/wdwZeta/moebiusNoBoundary'
import type { PrimonMultiverseConfig } from '@/lib/geometry/extended/wdwZeta/primonMultiverse'
import type { SelbergSpectrumConfig } from '@/lib/geometry/extended/wdwZeta/selbergSpectrum'
import type { TurningSurfaceConfig } from '@/lib/geometry/extended/wdwZeta/turningSurface'
import type { WeilPositivityConfig } from '@/lib/geometry/extended/wdwZeta/weilPositivity'
import { primePowersUpTo, RIEMANN_ZEROS, truncatedZeta } from '@/lib/physics/riemannZeta'
import { cabs, carg, cmul, type Complex, cxi } from '@/lib/physics/wdwZeta/complex'

/** First LUT index of the ζ-zero block. */
export const WDW_ZETA_ZEROS_OFFSET = 2
/** Number of ζ-zero ordinates carried (≤ RIEMANN_ZEROS.length). */
export const WDW_ZETA_ZEROS_COUNT = 48
/** First LUT index of the per-mode auxiliary block. */
export const WDW_ZETA_AUX_OFFSET = WDW_ZETA_ZEROS_OFFSET + WDW_ZETA_ZEROS_COUNT
/**
 * 2D analytic-field block: a `NX × NY` grid (row-major, `idx = y·NX + x`) of the
 * mode's *actually computed* complex field — the completed ξ(σ+it) over the
 * critical strip (Constraint Seam), or the minisuperspace potential U(a,φ) with
 * its WKB action S (Turning Surface). `.x` = height scalar (normalized log|ξ| /
 * lifted √U), `.y` = phase / action, `.z` = signed raw value, `.w` = on-seam
 * zero proximity. The shader samples this bilinearly to ray-march a relief of
 * the real function — the zeros, the functional-equation mirror, and any
 * off-line ghost are emergent, not painted.
 */
export const WDW_ZETA_FIELD_NX = 96
export const WDW_ZETA_FIELD_NY = 64
export const WDW_ZETA_FIELD_OFFSET = 128
/**
 * Shared arithmetic-measures 1D table — baked into EVERY mode's LUT. A strip of
 * `WDW_ZETA_MEASURES_COUNT` samples over a normalized spectral coordinate
 * carrying the four number-theoretic measures the whole ζ/prime group's
 * mathematics produces:
 *   .x = N(t)  — Riemann zero-count staircase (count of ζ-zeros with ordinate ≤ t)
 *   .y = ψ(x)  — Chebyshev prime staircase Σ_{pᵏ≤x} log p   (normalized to [0,1])
 *   .z = M(x)  — Mertens summatory Σ_{n≤x} μ(n)             (normalized to [−1,1])
 *   .w = osc   — explicit-formula oscillation Σ_n cos(γₙ·log x)/√(¼+γₙ²)  ([−1,1])
 * The four shared color algorithms (29-32) map each surface point's spectral
 * coordinate into this table — so the colour encodes a genuine measure, not
 * surface orientation or lighting.
 */
export const WDW_ZETA_MEASURES_OFFSET =
  WDW_ZETA_FIELD_OFFSET + WDW_ZETA_FIELD_NX * WDW_ZETA_FIELD_NY
export const WDW_ZETA_MEASURES_COUNT = 128
/** Spectral window [t_min, t_max] the measures table spans. */
export const WDW_ZETA_MEASURES_TMIN = 2
export const WDW_ZETA_MEASURES_TMAX = 60
/** vec4f entries in the LUT storage buffer (header + zeros + aux + 2D field + measures). */
export const WDW_ZETA_LUT_VEC4 = WDW_ZETA_MEASURES_OFFSET + WDW_ZETA_MEASURES_COUNT

/** Allocate a zeroed LUT float view (length WDW_ZETA_LUT_VEC4 × 4). */
function allocLut(): Float32Array {
  return new Float32Array(WDW_ZETA_LUT_VEC4 * 4)
}

/** Write a vec4 at LUT index `i`. */
function setVec4(lut: Float32Array, i: number, x: number, y = 0, z = 0, w = 0): void {
  const o = i * 4
  lut[o] = x
  lut[o + 1] = y
  lut[o + 2] = z
  lut[o + 3] = w
}

/** Fill the ζ-zero block with the first WDW_ZETA_ZEROS_COUNT ordinates. */
function writeZeros(lut: Float32Array): void {
  const n = Math.min(WDW_ZETA_ZEROS_COUNT, RIEMANN_ZEROS.length)
  for (let i = 0; i < n; i++) {
    setVec4(lut, WDW_ZETA_ZEROS_OFFSET + i, RIEMANN_ZEROS[i]!)
  }
}

/** Write a vec4 into the 2D field block at grid cell (x, y). */
function setField(
  lut: Float32Array,
  x: number,
  y: number,
  v: [number, number, number, number]
): void {
  setVec4(lut, WDW_ZETA_FIELD_OFFSET + y * WDW_ZETA_FIELD_NX + x, v[0], v[1], v[2], v[3])
}

/**
 * Bake the actual completed ξ(σ+it) over the critical strip into the 2D field.
 * Height = normalized log(1+|ξ|) (dips to the seam at every zero, where |ξ|=0);
 * `.y` = arg ξ (winds ±2π around each zero); `.w` = on-seam zero proximity. The
 * ghost sector multiplies in a functional-equation-symmetric off-line zero
 * quartet — the κ₋ > 0 configuration RH forbids — so the relief dips OFF the
 * seam where it cannot.
 */
function bakeXiField(lut: Float32Array, tMax: number, ghost: boolean, ghostDelta: number): void {
  const NX = WDW_ZETA_FIELD_NX
  const NY = WDW_ZETA_FIELD_NY
  // off-line ghost quartet ½±δ ± iγ₀ (γ₀ = first zero ordinate)
  const g0 = RIEMANN_ZEROS[0]!
  const quartet: Complex[] = ghost
    ? [
        [0.5 + ghostDelta, g0],
        [0.5 - ghostDelta, g0],
        [0.5 + ghostDelta, -g0],
        [0.5 - ghostDelta, -g0],
      ]
    : []
  const mags = new Float32Array(NX * NY)
  const lineIx = Math.round(0.5 * (NX - 1)) // σ = ½ column (the critical line)
  let maxLineLog = 1e-6
  for (let iy = 0; iy < NY; iy++) {
    const t = (iy / (NY - 1)) * tMax
    for (let ix = 0; ix < NX; ix++) {
      const sigma = ix / (NX - 1) // full critical strip σ ∈ [0,1]
      const s: Complex = [sigma, t]
      let xi = cxi(s)
      for (const rho of quartet) {
        xi = cmul(xi, [s[0] - rho[0], s[1] - rho[1]])
      }
      const lm = Math.log(1 + cabs(xi))
      mags[iy * NX + ix] = lm
      if (ix === lineIx && lm > maxLineLog) maxLineLog = lm
      // stash phase temporarily in the field; height filled in the second pass
      setField(lut, ix, iy, [0, carg(xi), 0, 0])
    }
  }
  // Normalize by the ON-LINE (σ=½) max so the zeros — where |ξ| dips to 0 on the
  // critical line — get full contrast; the off-line walls clamp at the top.
  const inv = 1 / maxLineLog
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      const o = (WDW_ZETA_FIELD_OFFSET + iy * NX + ix) * 4
      const h = Math.min(1.4, mags[iy * NX + ix]! * inv)
      lut[o] = h
      lut[o + 3] = 1 - Math.min(1, h * 3) // seam-zero proximity (h→0 at a zero)
    }
  }
}

/**
 * Bake a TDSE Talbot quantum-carpet, ζ-fingerprinted, into the field's `.z`
 * channel (the Constraint Seam overlay). This is a genuine free/box eigenstate
 * superposition ψ(x,τ) = Σ_{n=1}^{N} e^{i(n·x − n²·τ + γₙ)}: the energies E_n ∝ n²
 * are exact (so the fractal Talbot revivals are real), and the *initial phases*
 * are the Riemann zero ordinates γₙ — the ζ spectrum stamped onto the carpet.
 * `x` (carpet "space") runs along the t-axis so fringes climb the strip; `τ`
 * (relational time) runs along σ across the band. Stored normalized to [0,1].
 */
function bakeSeamCarpet(lut: Float32Array): void {
  const NX = WDW_ZETA_FIELD_NX
  const NY = WDW_ZETA_FIELD_NY
  const N = 12
  const tmp = new Float32Array(NX * NY)
  let maxC = 1e-6
  for (let iy = 0; iy < NY; iy++) {
    const x = (iy / (NY - 1)) * 2 * Math.PI * 4 // 4 fringe periods up the window
    for (let ix = 0; ix < NX; ix++) {
      const tau = (ix / (NX - 1)) * Math.PI // half a Talbot recurrence across σ
      let re = 0
      let im = 0
      for (let n = 1; n <= N; n++) {
        const ph = n * x - n * n * tau + (RIEMANN_ZEROS[n - 1] ?? 0)
        re += Math.cos(ph)
        im += Math.sin(ph)
      }
      const c = (re * re + im * im) / (N * N)
      tmp[iy * NX + ix] = c
      if (c > maxC) maxC = c
    }
  }
  const inv = 1 / maxC
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      lut[(WDW_ZETA_FIELD_OFFSET + iy * NX + ix) * 4 + 2] = tmp[iy * NX + ix]! * inv
    }
  }
}

/**
 * Bake the minisuperspace WDW potential U(a,φ) and its cumulative WKB action
 * S = ∫√U da into the 2D field (Turning Surface). `.x` = lifted √(max U,0)
 * (the classically allowed relief), `.y` = action S (the Airy fringe phase),
 * `.z` = signed U (allowed/forbidden), `.w` = caustic proximity at U≈0.
 */
function bakeTurningField(lut: Float32Array, m: number, lam: number, asym: number): void {
  const NX = WDW_ZETA_FIELD_NX
  const NY = WDW_ZETA_FIELD_NY
  const A_MAX = 3.0
  const PHI_MAX = 3.0
  const da = A_MAX / (NX - 1)
  let maxLift = 1e-6
  let maxS = 1e-6
  for (let iy = 0; iy < NY; iy++) {
    const phi = -PHI_MAX + (iy / (NY - 1)) * 2 * PHI_MAX
    // anisotropic minisuperspace: the +φ half-axis carries effective mass m·asym.
    const mPhi = phi >= 0 ? m * asym : m
    let action = 0
    for (let ix = 0; ix < NX; ix++) {
      const a = (ix / (NX - 1)) * A_MAX
      const a2 = a * a
      const u = a2 * (1 - (lam * a2) / 3) - a2 * a2 * 0.5 * mPhi * mPhi * phi * phi
      if (u > 0) action += Math.sqrt(u) * da
      const lift = u > 0 ? Math.sqrt(u) : 0
      if (lift > maxLift) maxLift = lift
      if (action > maxS) maxS = action
      setField(lut, ix, iy, [lift, action, u, 0])
    }
  }
  const invL = 1 / maxLift
  for (let iy = 0; iy < NY; iy++) {
    for (let ix = 0; ix < NX; ix++) {
      const o = (WDW_ZETA_FIELD_OFFSET + iy * NX + ix) * 4
      lut[o] = lut[o]! * invL
      const u = lut[o + 2]!
      lut[o + 3] = Math.exp(-((u / maxLift) * (u / maxLift)) * 40) // caustic ridge U≈0
    }
  }
}

/**
 * Li / Keiper coefficients λ_n = Σ_ρ [1 − (1 − 1/ρ)^n] over the non-trivial
 * zeros (conjugate-paired ⇒ real). Li's criterion: **RH ⟺ λ_n ≥ 0 for all n**.
 * An off-line zero drives some λ_n negative — the literal ghost. Returns the
 * sequence; the caller stores it (normalized) for the positivity-bowl relief.
 */
function liCoefficients(count: number, n: number, ghost: boolean, ghostDelta: number): number[] {
  const lambda = new Array<number>(n + 1).fill(0)
  const addZero = (re: number, im: number): void => {
    const d = re * re + im * im
    const invRho: Complex = [re / d, -im / d] // 1/ρ
    let cur: Complex = [1, 0]
    const base: Complex = [1 - invRho[0], -invRho[1]] // 1 − 1/ρ
    for (let k = 1; k <= n; k++) {
      cur = cmul(cur, base)
      lambda[k] = lambda[k]! + (1 - cur[0])
    }
  }
  const m = Math.min(count, RIEMANN_ZEROS.length)
  for (let i = 0; i < m; i++) {
    const g = RIEMANN_ZEROS[i]!
    addZero(0.5, g) // ρ = ½ + iγ
    addZero(0.5, -g) // conjugate ρ̄ = ½ − iγ
  }
  if (ghost) {
    const g0 = RIEMANN_ZEROS[0]!
    addZero(0.5 + ghostDelta, g0) // off-line zero
    addZero(0.5 + ghostDelta, -g0)
  }
  return lambda
}

/** First `count` primes (simple trial-division sieve). */
function firstPrimes(count: number): number[] {
  const primes: number[] = []
  for (let n = 2; primes.length < count; n++) {
    let isPrime = true
    for (const p of primes) {
      if (p * p > n) break
      if (n % p === 0) {
        isPrime = false
        break
      }
    }
    if (isPrime) primes.push(n)
  }
  return primes
}

/** Möbius function μ(n) by factorization. */
function moebiusMu(n: number): number {
  if (n === 1) return 1
  let m = n
  let primeFactors = 0
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      m /= p
      primeFactors++
      if (m % p === 0) return 0 // squared factor → μ = 0
    }
  }
  if (m > 1) primeFactors++
  return primeFactors % 2 === 0 ? 1 : -1
}

/**
 * Bake the shared arithmetic-measures table (N(t), Chebyshev ψ(x), Mertens M(x),
 * explicit-formula oscillation) — the number-theoretic measures the whole ζ/prime
 * group produces — over the spectral window [TMIN, TMAX]. Always baked, every
 * mode, so the four shared color algorithms can sample a genuine measure.
 */
function bakeSharedMeasures(lut: Float32Array): void {
  const N = WDW_ZETA_MEASURES_COUNT
  const xMin = WDW_ZETA_MEASURES_TMIN
  const xMax = WDW_ZETA_MEASURES_TMAX
  const primes = firstPrimes(20).filter((p) => p <= xMax) // primes ≤ xMax
  const rawN: number[] = []
  const rawPsi: number[] = []
  const rawM: number[] = []
  const rawOsc: number[] = []
  let maxN = 1e-6
  let maxPsi = 1e-6
  let maxAbsM = 1e-6
  let maxAbsOsc = 1e-6
  for (let i = 0; i < N; i++) {
    const x = xMin + ((xMax - xMin) * i) / (N - 1)
    // N(t): exact count of ζ-zeros with ordinate ≤ x (the zero-counting staircase).
    let Nt = 0
    for (const g of RIEMANN_ZEROS) if (g <= x) Nt++
    // Chebyshev ψ(x) = Σ_{pᵏ ≤ x} log p.
    let psi = 0
    for (const p of primes) {
      for (let pk = p; pk <= x; pk *= p) psi += Math.log(p)
    }
    // Mertens M(x) = Σ_{n ≤ x} μ(n).
    let M = 0
    for (let n = 1; n <= Math.floor(x); n++) M += moebiusMu(n)
    // Explicit-formula oscillation: the ζ-zeros' contribution Σ_n cos(γₙ·log x)/√(¼+γₙ²).
    let osc = 0
    const lx = Math.log(x)
    for (const g of RIEMANN_ZEROS) osc += Math.cos(g * lx) / Math.sqrt(0.25 + g * g)
    rawN.push(Nt)
    rawPsi.push(psi)
    rawM.push(M)
    rawOsc.push(osc)
    maxN = Math.max(maxN, Nt)
    maxPsi = Math.max(maxPsi, psi)
    maxAbsM = Math.max(maxAbsM, Math.abs(M))
    maxAbsOsc = Math.max(maxAbsOsc, Math.abs(osc))
  }
  for (let i = 0; i < N; i++) {
    // .x = raw N(t) staircase (integer count — the shader bands by it);
    // .y = ψ/max ∈ [0,1]; .z = M/max ∈ [−1,1]; .w = osc/max ∈ [−1,1].
    setVec4(
      lut,
      WDW_ZETA_MEASURES_OFFSET + i,
      rawN[i]!,
      rawPsi[i]! / maxPsi,
      rawM[i]! / maxAbsM,
      rawOsc[i]! / maxAbsOsc
    )
  }
}

// ── Per-mode builders. Each fills a fresh LUT: header + zeros + optional aux. ──

function buildConstraintSeam(lut: Float32Array, c: ConstraintSeamConfig): void {
  setVec4(lut, 0, c.reliefHeight, c.heightWindow, c.ghostSector ? 1 : 0, c.ghostOffset)
  // header B: σ-band half-width, carpet gain, domain-shade flag.
  setVec4(lut, 1, c.stripBand, c.carpetGain, c.domainShade ? 1 : 0, 0)
  writeZeros(lut)
  // The real completed ξ(σ+it) over the strip — zeros, mirror, ghost all emergent.
  bakeXiField(lut, c.heightWindow, c.ghostSector, c.ghostOffset)
  // TDSE Talbot carpet (ζ-phased) into field .z — the quantum-carpet overlay.
  bakeSeamCarpet(lut)
}

function buildMoebius(lut: Float32Array, c: MoebiusNoBoundaryConfig): void {
  // Real Möbius partial sum M(N) = Σ_{n≤N} μ(n)/n (the truncated 1/ζ(1); → 0 by
  // Mertens) — the no-boundary amplitude's arithmetic weight.
  const N = Math.min(Math.round(c.moebiusCutoff), 200)
  let M = 0
  for (let n = 1; n <= N; n++) M += moebiusMu(n) / n
  setVec4(lut, 0, c.maxDepth, c.moebiusCutoff, c.domeHeight, c.curvature)
  // header B: WDW boundary-condition morph + the Möbius partial sum.
  setVec4(lut, 1, c.tunnelMix, M, 0, 0)
  // Möbius lacework weights μ(n)/n (the squarefree-void pattern).
  const K = 48
  for (let n = 1; n <= K; n++) {
    const mu = moebiusMu(n)
    setVec4(lut, WDW_ZETA_AUX_OFFSET + (n - 1), mu, mu / n, n, 0)
  }
}

function buildForcedCell(lut: Float32Array, c: ForcedCellConfig): void {
  setVec4(lut, 0, c.levelCount, c.cellDensity, c.xExtent, c.squeeze)
  setVec4(lut, 1, c.wallHeight, 0, 0, 0) // 3D Planck-cell wall lattice height
  writeZeros(lut) // level heights E_n = ζ-zero ordinates
}

function buildTurningSurface(lut: Float32Array, c: TurningSurfaceConfig): void {
  setVec4(lut, 0, c.inflatonMass, c.lambda, c.fringeCount, c.termCount)
  // header B: φ-mass asymmetry + free-scalar-field vacuum-foam gain.
  setVec4(lut, 1, c.asymmetry, c.vacuumGain, 0, 0)
  // Prime-power ridge positions a = log(p^k) (the explicit-formula arithmetic).
  const powers = primePowersUpTo(Math.exp(3.0)).slice(0, Math.max(0, Math.round(c.termCount)))
  powers.forEach((pw, i) => setVec4(lut, WDW_ZETA_AUX_OFFSET + i, pw.logPos))
  // The real U(a,φ) potential + cumulative WKB action S = ∫√U (real Airy fringes).
  bakeTurningField(lut, c.inflatonMass, c.lambda, c.asymmetry)
}

function buildPrimon(lut: Float32Array, c: PrimonMultiverseConfig): void {
  const count = Math.max(1, Math.round(c.primeCount))
  // The real primon-gas partition function Z(β) = ζ(β) (diverges → Hagedorn as
  // β → 1⁺); header B carries it so the shader brightens the ignition honestly.
  const Z = truncatedZeta(c.beta)
  setVec4(lut, 0, c.beta, count, c.pairLinks ? 1 : 0, c.latticeMode)
  setVec4(lut, 1, Z, c.linkGain, c.occScale, 0)
  const primes = firstPrimes(count)
  primes.forEach((p, i) => {
    const occ = 1 / (Math.pow(p, c.beta) - 1) // Bose occupation n_p = 1/(p^β − 1)
    setVec4(lut, WDW_ZETA_AUX_OFFSET + i, p, occ, Math.log(p))
  })
}

function buildFrobenius(lut: Float32Array, c: FrobeniusWheelConfig): void {
  setVec4(lut, 0, c.baseQ, c.maxWeight, c.genus, c.spread)
  // header B: spindle-form flag + ζ-zero-density tint strength.
  setVec4(lut, 1, c.coneSpindle ? 1 : 0, c.zetaTint, 0, 0)
  writeZeros(lut) // ζ ordinates feed the purity-ring tint
}

function buildDewittCone(lut: Float32Array, c: DewittConeConfig): void {
  setVec4(lut, 0, c.coneSlope, c.ringCount, c.branchTint, c.horizon)
  // header B: nested light-cone fan count + helical ring warp.
  setVec4(lut, 1, c.fanCount, c.warp, 0, 0)
  writeZeros(lut) // ring latitudes spaced by the ζ ordinates
}

function buildSelberg(lut: Float32Array, c: SelbergSpectrumConfig): void {
  setVec4(lut, 0, c.geodesicCount, c.lengthCutoff, c.surfaceOpacity, c.funnelMode)
  // Selberg length spectrum ℓ_n = ln(tₙ) − 1.5 with winding ∝ ℓ.
  const count = Math.max(1, Math.round(c.geodesicCount))
  let written = 0
  for (let n = 0; n < RIEMANN_ZEROS.length && written < count; n++) {
    const ell = Math.log(RIEMANN_ZEROS[n]!) - 1.5
    if (ell > 0 && ell <= c.lengthCutoff) {
      const windings = Math.min(16, 3 + Math.round(ell * 2.2))
      setVec4(lut, WDW_ZETA_AUX_OFFSET + written, ell, windings)
      written++
    }
  }
  // header B: geodesic count actually written + geodesic winding gain.
  setVec4(lut, 1, written, c.windingGain, 0, 0)
}

function buildAdelic(lut: Float32Array, c: AdelicWavefunctionConfig): void {
  const count = Math.max(1, Math.round(c.primeCount))
  setVec4(lut, 0, c.treeDepth, count, c.branchSpread, c.foldExponent)
  // header B: Archimedean (real-place) ψ_∞ Gaussian core size/brightness.
  setVec4(lut, 1, c.archCore, 0, 0, 0)
  const primes = firstPrimes(count)
  primes.forEach((p, i) => setVec4(lut, WDW_ZETA_AUX_OFFSET + i, p))
}

function buildWeil(lut: Float32Array, c: WeilPositivityConfig): void {
  writeZeros(lut)
  // Real Li/Keiper coefficients λ_n — RH ⟺ λ_n ≥ 0 ∀n (Li's criterion). The
  // off-line zero drives some λ_n negative: the literal ghost the bowl carves.
  const NLI = 40
  const lambda = liCoefficients(Math.round(c.zeroCount), NLI, c.offLineZero, c.offLineOffset)
  let maxAbs = 1e-6
  for (let k = 1; k <= NLI; k++) maxAbs = Math.max(maxAbs, Math.abs(lambda[k]!))
  let minLambda = Infinity
  for (let k = 1; k <= NLI; k++) {
    const v = lambda[k]! / maxAbs // normalized λ_n ∈ [−1,1]
    minLambda = Math.min(minLambda, v)
    setVec4(lut, WDW_ZETA_AUX_OFFSET + (k - 1), v, lambda[k]!)
  }
  // header: count of λ's, primeWeight, ghost flag, and the most-negative λ
  // (the depth of the positivity violation — 0 under RH).
  setVec4(lut, 0, NLI, c.primeWeight, c.offLineZero ? 1 : 0, c.offLineOffset)
  // header B: most-negative λ, bowl curvature, contour-ring gain, vacuum-mound blend.
  setVec4(lut, 1, minLambda, c.bowlCurve, c.ringGain, c.kahlerMix)
}

/**
 * Number of non-trivial ζ-zeros pinned to the seam within the displayed window
 * [2, T] — the Constraint Seam Analysis readout. Every counted zero lies on
 * Re s = ½ (the functional-equation seam); the relief touches the seam plane at
 * each one.
 *
 * @param heightWindow - Upper ordinate bound T of the displayed critical strip.
 * @param zeros - ζ-zero ordinates (Im ρ), ascending.
 * @returns Count of zeros with ordinate in [2, T].
 */
export function seamZeroCount(heightWindow: number, zeros: readonly number[]): number {
  return zeros.filter((t) => t >= 2 && t <= heightWindow).length
}

/** Euler's totient φ(n) — the number of PRIMITIVE n-th roots of unity (= deg Φ_n). */
function eulerPhi(n: number): number {
  let result = n
  let m = n
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      while (m % p === 0) m /= p
      result -= result / p
    }
  }
  if (m > 1) result -= result / m
  return result
}

/** True iff n is prime (n ≥ 2). */
function isPrimeN(n: number): boolean {
  if (n < 2) return false
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return false
  return true
}

/**
 * 𝔽₁ cyclotomic spire: per-ring data for the tower of roots of unity. aux[n−1] =
 * (φ(n), isPrime, φ(n)/n, n). φ(n)/n = Π_{p|n}(1−1/p) is the density of PRIMITIVE
 * n-th roots of unity — the cyclotomic measure the `cyclotomicTotient` color
 * algorithm reads. The prime flag marks the closed points of Spec ℤ.
 */
function buildFieldOneElement(lut: Float32Array, c: FieldOneElementConfig): void {
  setVec4(lut, 0, c.maxOrder, c.qDeform, c.towerTwist, c.primeGlow)
  setVec4(lut, 1, c.vertexSize, 0, 0, 0)
  const M = Math.min(Math.max(1, Math.round(c.maxOrder)), 110)
  for (let n = 1; n <= M; n++) {
    const phi = eulerPhi(n)
    setVec4(lut, WDW_ZETA_AUX_OFFSET + (n - 1), phi, isPrimeN(n) ? 1 : 0, phi / n, n)
  }
}

/** Builder + hash for one suite mode (keyed by modeId 0..10). */
interface LutBuilder {
  build: (lut: Float32Array, host: WdwZetaConfigHostLut) => void
  hash: (host: WdwZetaConfigHostLut) => string
}

/** Structural slice of the suite sub-configs the builders read. */
export interface WdwZetaConfigHostLut {
  constraintSeam?: ConstraintSeamConfig
  moebiusNoBoundary?: MoebiusNoBoundaryConfig
  forcedCell?: ForcedCellConfig
  turningSurface?: TurningSurfaceConfig
  primonMultiverse?: PrimonMultiverseConfig
  frobeniusWheel?: FrobeniusWheelConfig
  dewittCone?: DewittConeConfig
  selbergSpectrum?: SelbergSpectrumConfig
  adelicWavefunction?: AdelicWavefunctionConfig
  weilPositivity?: WeilPositivityConfig
  fieldOneElement?: FieldOneElementConfig
}

const J = JSON.stringify

/** modeId → LUT builder + change-hash. */
const LUT_BUILDERS: Record<number, LutBuilder> = {
  0: {
    build: (l, h) => buildConstraintSeam(l, h.constraintSeam!),
    hash: (h) => J(h.constraintSeam),
  },
  1: {
    build: (l, h) => buildMoebius(l, h.moebiusNoBoundary!),
    hash: (h) => J(h.moebiusNoBoundary),
  },
  2: { build: (l, h) => buildForcedCell(l, h.forcedCell!), hash: (h) => J(h.forcedCell) },
  3: {
    build: (l, h) => buildTurningSurface(l, h.turningSurface!),
    hash: (h) => J(h.turningSurface),
  },
  4: { build: (l, h) => buildPrimon(l, h.primonMultiverse!), hash: (h) => J(h.primonMultiverse) },
  5: { build: (l, h) => buildFrobenius(l, h.frobeniusWheel!), hash: (h) => J(h.frobeniusWheel) },
  6: { build: (l, h) => buildDewittCone(l, h.dewittCone!), hash: (h) => J(h.dewittCone) },
  7: { build: (l, h) => buildSelberg(l, h.selbergSpectrum!), hash: (h) => J(h.selbergSpectrum) },
  8: {
    build: (l, h) => buildAdelic(l, h.adelicWavefunction!),
    hash: (h) => J(h.adelicWavefunction),
  },
  9: { build: (l, h) => buildWeil(l, h.weilPositivity!), hash: (h) => J(h.weilPositivity) },
  10: {
    build: (l, h) => buildFieldOneElement(l, h.fieldOneElement!),
    hash: (h) => J(h.fieldOneElement),
  },
}

/**
 * Build the ζ-LUT for a suite mode. The caller guarantees the matching
 * sub-config is present on `host` (the registry passes a defaulted host).
 *
 * @param modeId - Stable mode id 0..9 (matches the shader branch + registry).
 * @param host - Suite sub-config host.
 * @returns A fresh `Float32Array` of length WDW_ZETA_LUT_VEC4 × 4.
 */
export function buildWdwZetaLut(modeId: number, host: WdwZetaConfigHostLut): Float32Array {
  const lut = allocLut()
  LUT_BUILDERS[modeId]?.build(lut, host)
  // Shared arithmetic-measures table (every mode) — feeds the 4 shared color algos.
  bakeSharedMeasures(lut)
  return lut
}

/**
 * Change hash for a suite mode's LUT — the strategy re-uploads only when this
 * string changes (config edits), never per frame.
 *
 * @param modeId - Stable mode id 0..9.
 * @param host - Suite sub-config host.
 * @returns A stable string that changes iff the LUT contents would.
 */
export function wdwZetaLutHash(modeId: number, host: WdwZetaConfigHostLut): string {
  return LUT_BUILDERS[modeId]?.hash(host) ?? ''
}
