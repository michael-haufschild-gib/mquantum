/**
 * Modular Knot / Rademacher Horizon — physics core.
 *
 * Encodes the Dyson lead: the unit tangent bundle of the modular surface
 * `SL₂(ℝ)/SL₂(ℤ)` is the complement of the trefoil knot in `S³` (Étienne Ghys,
 * "Knots and dynamics", ICM 2006). Under this identification every closed
 * geodesic on the modular surface lifts to a closed orbit — a **modular knot**
 * — in `S³∖trefoil`, and the **linking number** of that knot with the trefoil
 * core equals the **Rademacher invariant Φ** of the corresponding hyperbolic
 * conjugacy class in `PSL₂(ℤ)`.
 *
 * The Rademacher function `Φ : SL₂(ℤ) → ℤ` is a homogeneous quasimorphism
 * (its defect is bounded) built from Dedekind sums; it is the unique (up to
 * scale) such map and is conjugacy-invariant on hyperbolic classes. Ghys's
 * theorem `lk(modular knot, trefoil) = Φ` is exact, not approximate.
 *
 * The deeper point this mode renders: **RH "confinement" is a global
 * topological winding, not a local potential.** `log|ξ(s)|` is harmonic away
 * from the zeros, so there is no confining well in the usual sense. What pins
 * the spectral content is a *winding number* — the same integer winding that
 * shows up analytically as `S(T) = (1/π) arg ζ(½ + iT)` (the argument /
 * winding of ζ along the critical line) and topologically as `Φ` (the linking
 * of the modular knot with the trefoil). This module computes `Φ` **exactly**
 * from number theory and uses it to drive both the geometry (meridian winding
 * count of each rendered knot = `|Φ|`) and the color (a diverging Φ colormap).
 *
 * Pipeline (all CPU, no GPU, no rendering here):
 *   1. {@link dedekindSum} / {@link rademacherPhi} — exact integer Φ.
 *   2. {@link enumerateModularGeodesics} — primitive hyperbolic conjugacy
 *      classes as cyclic `{L, R}` words, with matrix, trace, length, Φ.
 *   3. {@link bakeModularKnotVolume} — splat the trefoil core plus one tube per
 *      geodesic (wound `|Φ|` times in the meridian, colored by Φ) into an
 *      `N³` RGBA8 density+color volume for a later volume-rendering strategy.
 *
 * @module lib/physics/modularKnot
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. EXACT NUMBER THEORY — Dedekind sums and the Rademacher invariant Φ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Dedekind sawtooth `((x))`.
 *
 * `((x)) = 0` when `x` is an integer, and `frac(x) − 1/2` otherwise, where
 * `frac` is the fractional part in `[0, 1)`. This is the periodic
 * "centered fractional part" used to define Dedekind sums.
 *
 * @param x - Real argument.
 * @returns The sawtooth value in `(−1/2, 1/2)`, or exactly `0` at integers.
 */
function sawtooth(x: number): number {
  // Integer (within fp tolerance) → exactly 0.
  const nearest = Math.round(x)
  if (Math.abs(x - nearest) < 1e-12) return 0
  // frac(x) in [0, 1) — JS `%` keeps sign, so normalize.
  let f = x - Math.floor(x)
  if (f < 0) f += 1
  return f - 0.5
}

/**
 * The classical Dedekind sum `s(h, k)`.
 *
 * `s(h, k) = Σ_{n=1}^{k−1} ((n/k))·((hn/k))` with `((·))` the
 * {@link sawtooth | Dedekind sawtooth}. Defined for integers with `k ≥ 1`;
 * for `k = 1` the empty sum is `0`.
 *
 * Known closed form `s(1, k) = (k−1)(k−2)/(12k)` and Dedekind reciprocity
 * `s(h, k) + s(k, h) = −1/4 + (h/k + k/h + 1/(hk))/12` (for `gcd(h, k) = 1`)
 * are used as test oracles.
 *
 * @param h - Integer numerator argument.
 * @param k - Positive integer modulus.
 * @returns The Dedekind sum `s(h, k)` (a rational, returned as a `number`).
 */
export function dedekindSum(h: number, k: number): number {
  const kk = Math.abs(Math.trunc(k))
  if (kk <= 1) return 0
  const hh = Math.trunc(h)
  let sum = 0
  for (let n = 1; n < kk; n++) {
    sum += sawtooth(n / kk) * sawtooth((hh * n) / kk)
  }
  return sum
}

/**
 * The Rademacher invariant `Φ` of a matrix in `SL₂(ℤ)`.
 *
 * For `M = [[a, b], [c, d]]` with `ad − bc = 1`:
 *   - if `c = 0` (so `d = ±1`), `Φ(M) = b/d`;
 *   - otherwise `Φ(M) = (a + d)/c − 12·sign(c)·s(d, |c|) − 3·sign(c·(a + d))`,
 *
 * where `s` is the {@link dedekindSum | Dedekind sum}. `Φ` is integer-valued on
 * `SL₂(ℤ)`; the result is **rounded** to remove floating-point dust from the
 * Dedekind-sum summation. `Φ` is a homogeneous quasimorphism and is invariant
 * under conjugation on hyperbolic classes (e.g. `Φ(LR) = Φ(RL)`), which is what
 * makes it a well-defined invariant of a closed geodesic.
 *
 * @param a - Matrix entry `M[0][0]`.
 * @param b - Matrix entry `M[0][1]`.
 * @param c - Matrix entry `M[1][0]`.
 * @param d - Matrix entry `M[1][1]`.
 * @returns The integer Rademacher invariant `Φ(M)`.
 */
export function rademacherPhi(a: number, b: number, c: number, d: number): number {
  if (c === 0) {
    // d = ±1; Φ = b/d (already an integer for SL₂(ℤ)).
    return Math.round(b / d)
  }
  const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0)
  const raw = (a + d) / c - 12 * sign(c) * dedekindSum(d, Math.abs(c)) - 3 * sign(c * (a + d))
  return Math.round(raw)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GEODESIC ENUMERATION — primitive hyperbolic conjugacy classes
// ═══════════════════════════════════════════════════════════════════════════

/** A closed modular geodesic = primitive hyperbolic conjugacy class. */
export interface ModularGeodesic {
  /** Canonical (lexicographically-smallest cyclic rotation) `{L, R}` word. */
  word: string
  /** The `2×2` group element `[a, b, c, d]` for the chosen representative. */
  matrix: [number, number, number, number]
  /** Trace `a + d` of the product matrix (`|trace| > 2` ⇒ hyperbolic). */
  trace: number
  /** Exact Rademacher invariant `Φ` (= linking with the trefoil core). */
  phi: number
  /** Hyperbolic length `2·acosh(|trace|/2)` of the closed geodesic. */
  length: number
}

/** Generator `L = [[1, 1], [0, 1]]` (upper-triangular parabolic). */
const L: [number, number, number, number] = [1, 1, 0, 1]
/** Generator `R = [[1, 0], [1, 1]]` (lower-triangular parabolic). */
const R: [number, number, number, number] = [1, 0, 1, 1]

/**
 * `2×2` integer matrix product `(AB)`, row-major `[a, b, c, d]`.
 *
 * @param m - Left matrix `[a, b, c, d]`.
 * @param n - Right matrix `[a, b, c, d]`.
 * @returns The product `m·n` as `[a, b, c, d]`.
 */
function mul(
  m: [number, number, number, number],
  n: [number, number, number, number]
): [number, number, number, number] {
  const [a, b, c, d] = m
  const [e, f, g, h] = n
  return [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h]
}

/**
 * The product matrix of a `{L, R}` word, read left to right.
 *
 * @param word - A string over the alphabet `{'L', 'R'}`.
 * @returns The `SL₂(ℤ)` matrix `[a, b, c, d]` for that word.
 */
function wordMatrix(word: string): [number, number, number, number] {
  let m: [number, number, number, number] = [1, 0, 0, 1]
  for (const ch of word) {
    m = mul(m, ch === 'L' ? L : R)
  }
  return m
}

/**
 * The lexicographically-smallest cyclic rotation of a word.
 *
 * Used to deduplicate conjugacy classes: cyclically-equivalent words (the same
 * closed geodesic traversed from a different starting letter) share one
 * canonical form.
 *
 * @param word - A string over `{'L', 'R'}`.
 * @returns The smallest rotation under lexicographic order.
 */
function canonicalRotation(word: string): string {
  let best = word
  for (let i = 1; i < word.length; i++) {
    const rot = word.slice(i) + word.slice(0, i)
    if (rot < best) best = rot
  }
  return best
}

/**
 * Whether a word is a `k ≥ 2` repeat of a strictly shorter block (non-primitive).
 *
 * A primitive geodesic is traversed exactly once; `LRLR` is `(LR)²` and is
 * dropped in favor of `LR`.
 *
 * @param word - A string over `{'L', 'R'}`.
 * @returns `true` if `word` is a proper power of a shorter block.
 */
function isNonPrimitive(word: string): boolean {
  const n = word.length
  for (let block = 1; block <= n / 2; block++) {
    if (n % block !== 0) continue
    const unit = word.slice(0, block)
    let repeated = true
    for (let i = block; i < n; i += block) {
      if (word.slice(i, i + block) !== unit) {
        repeated = false
        break
      }
    }
    if (repeated) return true
  }
  return false
}

/**
 * Enumerate primitive hyperbolic conjugacy classes of `PSL₂(ℤ)` as closed
 * modular geodesics.
 *
 * Classes are cyclic binary words over `{L, R}` of length `2..maxLen` that
 * contain at least one `L` and one `R` (pure-parabolic words are not
 * hyperbolic), deduplicated by cyclic rotation (canonical = smallest
 * rotation), with non-primitive (proper-power) words removed, and the product
 * matrix required to satisfy `|trace| > 2` (hyperbolicity). The result is
 * deterministic and sorted by hyperbolic length ascending (ties broken by
 * canonical word for stability).
 *
 * @param maxLen - Maximum word length to enumerate (default `8`).
 * @returns Modular geodesics sorted by length ascending.
 */
export function enumerateModularGeodesics(maxLen = 8): ModularGeodesic[] {
  const seen = new Set<string>()
  const out: ModularGeodesic[] = []

  for (let len = 2; len <= maxLen; len++) {
    const total = 1 << len // 2^len words; bit i = (0:'L', 1:'R')
    for (let mask = 0; mask < total; mask++) {
      let word = ''
      let countL = 0
      let countR = 0
      for (let i = 0; i < len; i++) {
        if ((mask >> i) & 1) {
          word += 'R'
          countR++
        } else {
          word += 'L'
          countL++
        }
      }
      // Need both letters to be hyperbolic (not purely parabolic).
      if (countL === 0 || countR === 0) continue
      if (isNonPrimitive(word)) continue

      const canon = canonicalRotation(word)
      if (canon !== word) continue // only process each class via its canonical form
      if (seen.has(canon)) continue
      seen.add(canon)

      const matrix = wordMatrix(canon)
      const trace = matrix[0] + matrix[3]
      if (Math.abs(trace) <= 2) continue // not hyperbolic

      out.push({
        word: canon,
        matrix,
        trace,
        phi: rademacherPhi(matrix[0], matrix[1], matrix[2], matrix[3]),
        length: 2 * Math.acosh(Math.abs(trace) / 2),
      })
    }
  }

  out.sort((p, q) => p.length - q.length || (p.word < q.word ? -1 : p.word > q.word ? 1 : 0))
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. EMBEDDING + VOLUME BAKE — trefoil core + Φ-wound geodesic tubes
// ═══════════════════════════════════════════════════════════════════════════

/** A 3-vector `[x, y, z]`. */
type Vec3 = [number, number, number]

/**
 * Half-extent the embedding is scaled to fit inside (volume spans `[-1, 1]³`
 * mapped to voxel coordinates). The trefoil and all geodesic tubes are kept
 * within roughly this radius so the bake stays inside the grid.
 */
const EMBED_RADIUS = 0.82

/**
 * The standard trefoil knot curve.
 *
 * `(sin t + 2·sin 2t, cos t − 2·cos 2t, −sin 3t)` for `t ∈ [0, 2π)`, scaled to
 * fit a unit-ish box (its raw extent is `±3` in the plane, `±1` in z). This is
 * the `(2, 3)` torus knot whose complement is the modular surface's unit
 * tangent bundle; it is the topological core every modular knot links.
 *
 * @param t - Curve parameter in `[0, 2π)`.
 * @returns The trefoil point `[x, y, z]` scaled into the embedding box.
 */
export function TREFOIL(t: number): Vec3 {
  const x = Math.sin(t) + 2 * Math.sin(2 * t)
  const y = Math.cos(t) - 2 * Math.cos(2 * t)
  const z = -Math.sin(3 * t)
  // Raw planar extent ≈ ±3; scale to the embedding radius.
  const s = EMBED_RADIUS / 3
  return [x * s, y * s, z * s]
}

/**
 * Point on a modular-knot embedding curve.
 *
 * Each geodesic is rendered as a curve on a torus whose major radius grows with
 * the geodesic length and whose **meridian winding count equals `|Φ|`** (the
 * sign of `Φ` sets the winding direction), so the visual winding directly
 * encodes the Rademacher invariant = linking with the trefoil. Curves are
 * phase-offset by index for a deterministic, non-overlapping spread.
 *
 * @param u - Curve parameter in `[0, 2π)` (one trip around the major circle).
 * @param phi - The Rademacher invariant `Φ` of the geodesic.
 * @param majorR - Major radius of the carrier torus.
 * @param minorR - Minor (tube-center) radius of the carrier torus.
 * @param phase - Per-geodesic phase offset (radians) for layout spread.
 * @returns The embedding point `[x, y, z]`.
 */
function geodesicPoint(
  u: number,
  phi: number,
  majorR: number,
  minorR: number,
  phase: number
): Vec3 {
  // Meridian winding count = |Φ|; at least 1 so Φ=0 curves are still closed loops.
  const w = Math.max(1, Math.abs(phi))
  const dir = phi < 0 ? -1 : 1
  const mer = dir * w * u + phase
  const ringR = majorR + minorR * Math.cos(mer)
  const x = ringR * Math.cos(u + phase)
  const y = ringR * Math.sin(u + phase)
  const z = minorR * Math.sin(mer)
  return [x, y, z]
}

/**
 * Diverging Rademacher-Φ colormap.
 *
 * Maps `Φ` to an RGB triplet in `0..255`: strong blue for `Φ < 0`, a neutral
 * near-white at `Φ = 0`, and strong red/orange for `Φ > 0`. Magnitude
 * `|Φ|/maxAbsPhi` drives saturation (small `|Φ|` ⇒ desaturated toward white,
 * large `|Φ|` ⇒ fully saturated). Symmetric in `±Φ` up to the warm/cool hue
 * choice (negative is bluer, positive is redder/warmer).
 *
 * @param phi - The Rademacher invariant `Φ`.
 * @param maxAbsPhi - Normalizing magnitude (largest `|Φ|` in the scene); values
 *   `≤ 0` are treated as `1` to avoid division by zero.
 * @returns `[r, g, b]` each in `0..255`.
 */
export function phiColor(phi: number, maxAbsPhi: number): [number, number, number] {
  const denom = maxAbsPhi > 0 ? maxAbsPhi : 1
  const t = Math.max(-1, Math.min(1, phi / denom)) // signed, [-1, 1]
  const mag = Math.abs(t) // saturation driver, [0, 1]

  // Endpoint hues: cool (blue) for negative, warm (orange/red) for positive.
  // The endpoints are channel-mirrored about NEUTRAL so that a magnitude-m
  // negative Φ and a magnitude-m positive Φ are equally saturated (the blue
  // deviation of COOL equals the red deviation of WARM): a faithful diverging
  // map symmetric in ±Φ up to the cool/warm hue swap.
  const COOL: Vec3 = [35, 90, 235] // strong blue (R↔B mirror of WARM)
  const WARM: Vec3 = [235, 90, 35] // strong red/orange
  // A muted grey at Φ = 0: the tube is mostly low-|Φ| and bakes near this neutral,
  // so a near-255 white clips and blooms into a white cloud. A dimmer neutral keeps
  // the low-Φ cores readable as grey while the high-|Φ| blue/orange ends pop.
  const NEUTRAL: Vec3 = [180, 180, 180]

  const target = t < 0 ? COOL : WARM
  // Lerp neutral → saturated endpoint by magnitude.
  const r = NEUTRAL[0] + (target[0] - NEUTRAL[0]) * mag
  const g = NEUTRAL[1] + (target[1] - NEUTRAL[1]) * mag
  const b = NEUTRAL[2] + (target[2] - NEUTRAL[2]) * mag
  return [
    Math.round(Math.max(0, Math.min(255, r))),
    Math.round(Math.max(0, Math.min(255, g))),
    Math.round(Math.max(0, Math.min(255, b))),
  ]
}

/** Parameters controlling the modular-knot volume bake. */
export interface BakeModularKnotParams {
  /** Cubic grid edge length in voxels (default `144`). */
  size?: number
  /** Maximum geodesic word length to enumerate (default `8`). */
  maxLen?: number
  /** Tube Gaussian radius in voxel units (default `1.6`). */
  tubeRadius?: number
  /** Trefoil-core tube Gaussian radius in voxel units (default `2.2`). */
  trefoilRadius?: number
  /** Cap on the number of shortest geodesics to splat (default `24`). */
  geodesicCount?: number
}

/** Result of a volume bake: a row-major RGBA8 cube of edge `size`. */
export interface ModularKnotVolume {
  /** RGBA8 voxel data, `size³·4` bytes, x fastest then y then z. */
  data: Uint8Array
  /** Grid edge length in voxels. */
  size: number
}

/**
 * Splat a Gaussian brush of color `(r, g, b)` and density into the volume at a
 * world-space point, accumulating max-density and density-weighted color.
 *
 * Color is stored density-weighted in a float accumulator by the caller; here
 * we write into the working float buffers. Kept O(brush³) per sample.
 */
function splat(
  rAcc: Float32Array,
  gAcc: Float32Array,
  bAcc: Float32Array,
  dAcc: Float32Array,
  size: number,
  p: Vec3,
  radius: number,
  color: Vec3,
  amplitude: number
): void {
  // World [-1, 1] → voxel [0, size-1].
  const cx = (p[0] * 0.5 + 0.5) * (size - 1)
  const cy = (p[1] * 0.5 + 0.5) * (size - 1)
  const cz = (p[2] * 0.5 + 0.5) * (size - 1)
  // 2σ cutoff: a Gaussian tube is already <14% of peak at 2σ; extending to 3σ
  // ~triples the per-sample brush volume for negligible visual gain. Keeping
  // the reach tight is what holds the 144³ bake well under ~50 ms.
  const reach = Math.ceil(radius * 2)
  const inv2r2 = 1 / (2 * radius * radius)

  const x0 = Math.max(0, Math.floor(cx) - reach)
  const x1 = Math.min(size - 1, Math.ceil(cx) + reach)
  const y0 = Math.max(0, Math.floor(cy) - reach)
  const y1 = Math.min(size - 1, Math.ceil(cy) + reach)
  const z0 = Math.max(0, Math.floor(cz) - reach)
  const z1 = Math.min(size - 1, Math.ceil(cz) + reach)

  for (let z = z0; z <= z1; z++) {
    const dz = z - cz
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        const r2 = dx * dx + dy * dy + dz * dz
        const w = amplitude * Math.exp(-r2 * inv2r2)
        if (w < 1e-4) continue
        const idx = x + size * (y + size * z)
        // idx is provably in-bounds (loop bounds clamped to [0, size-1]); the
        // `!` reads satisfy noUncheckedIndexedAccess on these typed arrays.
        dAcc[idx] = dAcc[idx]! + w
        rAcc[idx] = rAcc[idx]! + w * color[0]
        gAcc[idx] = gAcc[idx]! + w * color[1]
        bAcc[idx] = bAcc[idx]! + w * color[2]
      }
    }
  }
}

/**
 * Bake the Modular Knot / Rademacher Horizon scene into an `N³` RGBA8 volume.
 *
 * Splats the trefoil core (bright, near-white, high density) plus one tube per
 * geodesic — each wound `|Φ|` times in the meridian and colored by the
 * {@link phiColor | diverging Φ colormap} — into a row-major RGBA8 cube. The
 * RGB channels carry the density-weighted color; the A channel carries density
 * normalized to `0..255`. Splatting is `O(curves · samples · brush)` and runs
 * in well under ~50 ms at the default `144³`.
 *
 * @param params - {@link BakeModularKnotParams} bake controls.
 * @returns The {@link ModularKnotVolume} (data + size).
 */
export function bakeModularKnotVolume(params: BakeModularKnotParams = {}): ModularKnotVolume {
  const size = params.size ?? 144
  const maxLen = params.maxLen ?? 8
  const tubeRadius = params.tubeRadius ?? 1.6
  const trefoilRadius = params.trefoilRadius ?? 2.2
  const geodesicCount = params.geodesicCount ?? 24

  const voxels = size * size * size
  const data = new Uint8Array(voxels * 4)

  // Float accumulators: density-weighted color + density.
  const rAcc = new Float32Array(voxels)
  const gAcc = new Float32Array(voxels)
  const bAcc = new Float32Array(voxels)
  const dAcc = new Float32Array(voxels)

  // ── Trefoil core: bright near-white, high amplitude ──
  // Amplitude is set well above the geodesic-tube amplitude so the trefoil
  // remains the brightest, whitest, highest-density feature even where a
  // geodesic tube crosses it (density-weighted color stays near-white there).
  const TREFOIL_AMP = 4.0
  // Sample density: the trefoil's arc length spans ≈ 4× the box, so ~1.6·size
  // samples space them well under one voxel apart for a continuous tube.
  const trefoilSamples = Math.max(256, Math.ceil(size * 1.6))
  for (let i = 0; i < trefoilSamples; i++) {
    const t = (i / trefoilSamples) * 2 * Math.PI
    splat(rAcc, gAcc, bAcc, dAcc, size, TREFOIL(t), trefoilRadius, [252, 252, 255], TREFOIL_AMP)
  }

  // ── Geodesic tubes ──
  const geos = enumerateModularGeodesics(maxLen).slice(0, geodesicCount)
  const maxAbsPhi = geos.reduce((m, g) => Math.max(m, Math.abs(g.phi)), 1)
  const maxLength = geos.reduce((m, g) => Math.max(m, g.length), 1)
  // Each geodesic torus circumference is ≲ box size; ~size samples keep the
  // tube continuous without oversampling across 24 curves.
  const tubeSamples = Math.max(128, size)

  for (let gi = 0; gi < geos.length; gi++) {
    const geo = geos[gi]
    if (geo === undefined) continue
    const color = phiColor(geo.phi, maxAbsPhi) as Vec3
    // Major radius grows with length; minor radius modest. Phase spreads layout.
    const lenFrac = geo.length / maxLength
    const majorR = (0.28 + 0.42 * lenFrac) * EMBED_RADIUS
    const minorR = 0.16 * EMBED_RADIUS
    const phase = (gi / Math.max(1, geos.length)) * 2 * Math.PI
    const amp = 1.0
    for (let i = 0; i < tubeSamples; i++) {
      const u = (i / tubeSamples) * 2 * Math.PI
      splat(
        rAcc,
        gAcc,
        bAcc,
        dAcc,
        size,
        geodesicPoint(u, geo.phi, majorR, minorR, phase),
        tubeRadius,
        color,
        amp
      )
    }
  }

  // ── Normalize density to [0, 255] and resolve color = weighted average ──
  let maxD = 0
  for (let i = 0; i < voxels; i++) {
    if (dAcc[i]! > maxD) maxD = dAcc[i]!
  }
  const invMaxD = maxD > 0 ? 1 / maxD : 0

  for (let i = 0; i < voxels; i++) {
    const d = dAcc[i]!
    const o = i * 4
    if (d > 0) {
      // Density-weighted average color (already in 0..255 space).
      data[o] = Math.round(Math.max(0, Math.min(255, rAcc[i]! / d)))
      data[o + 1] = Math.round(Math.max(0, Math.min(255, gAcc[i]! / d)))
      data[o + 2] = Math.round(Math.max(0, Math.min(255, bAcc[i]! / d)))
      data[o + 3] = Math.round(Math.max(0, Math.min(255, d * invMaxD * 255)))
    } else {
      data[o] = 0
      data[o + 1] = 0
      data[o + 2] = 0
      data[o + 3] = 0
    }
  }

  return { data, size }
}
