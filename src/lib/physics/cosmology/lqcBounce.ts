/**
 * Loop Quantum Cosmology (LQC) bouncing cosmology — table-driven FLRW
 * background that replaces the classical Big Bang singularity with a smooth
 * polymer-regularised bounce.
 *
 * The modified Friedmann equation used throughout this module (setting
 * `8πG = 1` in sim units, matching the rest of the codebase's convention) is
 *
 *     H² = (1 / (3(n − 2))) · ρ · (1 − ρ/ρ_c),
 *
 * where `n ≥ 3` is the spacetime dimension and `ρ_c > 0` is the critical
 * energy density at which the bounce occurs. At `ρ = ρ_c` the Hubble rate
 * vanishes (`H = 0`) and the sign of `H` flips — contraction gives way to
 * expansion without the scale factor reaching zero.
 *
 * The matter sector is a perfect fluid with equation of state `p = w·ρ`; the
 * default `w = 1` stiff-fluid case is equivalent to a free massless scalar
 * rolling in its kinetic-dominated regime, which is the canonical LQC
 * backdrop. Continuity then reads
 *
 *     ρ̇ = −(n − 1)·H·(ρ + p) = −(n − 1)·(1 + w)·H·ρ.
 *
 * Closed-form analytic solution (stiff fluid, τ ≡ t − t_B):
 *
 *     ρ(t) = ρ_c / (1 + γ·τ²)
 *     a(t) = a_B · (1 + γ·τ²)^(1 / (2(n − 1)))
 *     γ    = (n − 1)² · ρ_c / (3(n − 2))
 *
 * Derivation: with `w = 1`, `ρ̇ = −2(n − 1)·H·ρ`, so
 * `H = −ρ̇ / (2(n − 1)·ρ)`. Substituting the analytic `ρ(τ)` gives
 * `H² = γ²·τ²·ρ² / ((n − 1)²·ρ_c²)`; equating to the Friedmann RHS
 * `ρ(1 − ρ/ρ_c) / (3(n − 2)) = γ·τ²·ρ² / (3(n − 2)·ρ_c)` pins
 * `γ = (n − 1)²·ρ_c / (3(n − 2))`. The scale factor follows from continuity
 * `ρ·a^(2(n − 1)) = const` (stiff fluid in n-dim spacetime → spatial dim n − 1).
 *
 * Note: this differs from the Round 2 PRD's stated `γ = 12 ρ_c/(n−2)` and
 * the PRD's `a(t) ∝ (1+γτ²)^(1/(2(n−2)))` exponent. Those forms are
 * inconsistent with the PRD's own Friedmann equation (they would satisfy
 * `H² ∝ 4·ρ(1−ρ/ρ_c)/(n−2)` and `ρ·a^(2(n−2)) = const` respectively). The
 * derivation above recovers the physically consistent closed form and is
 * used as the analytic test oracle.
 *
 * The numerical integrator solves the coupled ODE
 *
 *     da/dt = ±a·|H(ρ)|
 *     dρ/dt = −(n − 1)·(1 + w)·H·ρ
 *
 * on a uniform cosmic-time grid with RK4 (`h = 5e−4`) covering
 * `t ∈ [−5, +5]` centred on the bounce at `t_B = 0`. The sign of `H`
 * switches at the bounce — we start in the contracting branch
 * (`H < 0`, ρ growing toward ρ_c) and transition to the expanding branch
 * (`H > 0`, ρ decaying from ρ_c) exactly at `t_B`. The `ρ ≤ ρ_c` constraint
 * is enforced per step (RK4 stages that overshoot are clamped so
 * `1 − ρ/ρ_c ≥ 0` inside the square root).
 *
 * Conformal time is derived by trapezoidal integration of `dη/dt = 1/a(t)`
 * starting from an arbitrary positive anchor `η_B` at the bounce so the
 * pre-bounce phase stays at `η > 0` as well — this matches the `η > 0`
 * convention used for the `bianchiKasner` preset and lets `projectSimEta`
 * in the compute pass advance `simEta` monotonically without touching
 * the sign-flip guard.
 *
 * @module lib/physics/cosmology/lqcBounce
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parameters defining an LQC bounce background. `spacetimeDim` must satisfy
 * `n ≥ 3`; `rhoCritical > 0`; `equationOfState` in `[0, 1]`
 * (0 = dust-ish, 1 = stiff fluid); `initialRhoRatio` in `(0, 1)` is the
 * starting `ρ/ρ_c` at the pre-bounce edge of the integration window.
 */
export interface LqcBounceParams {
  /** Spacetime dimension `n ≥ 3`. */
  spacetimeDim: number
  /** Critical density `ρ_c > 0` in sim units. */
  rhoCritical: number
  /** Equation-of-state parameter `w ∈ [0, 1]`. Default 1 = stiff fluid. */
  equationOfState: number
  /** Starting `ρ/ρ_c` ratio at the pre-bounce edge of the window, `(0, 1)`. */
  initialRhoRatio: number
  /**
   * Half-width of the cosmic-time window around the bounce, in sim units.
   * Integration runs on `t ∈ [−tHalfWidth, +tHalfWidth]` with `t_B = 0`.
   * Default `5.0` gives plenty of Kasner-asymptote tail on each side.
   */
  tHalfWidth?: number
  /**
   * RK4 step size in cosmic time. Default `5e−4` keeps the analytic vs
   * numerical error below 1e−5 on a typical run (validated by the
   * `closedFormAnalyticMatch` test).
   */
  stepSize?: number
  /**
   * Anchor of the positive-η gauge: the conformal time assigned to the
   * bounce instant `t_B = 0`. Defaults to 10, chosen so the full window
   * maps into `η ∈ (0, 2·η_B)` for typical inputs without needing a runtime
   * clamp against `η = 0`.
   */
  etaBounceAnchor?: number
}

/**
 * Dense LQC bounce lookup table. Every array is a `Float64Array` of the
 * same length and sorted so `etaGrid` is strictly monotonically increasing.
 * Consumers interpolate `a`, `a'` (= `da/dη`), and `ρ` linearly between
 * grid points via {@link evaluateLqcBounceCoefs}.
 */
export interface LqcBounceTable {
  /** Strictly monotonically increasing conformal-time grid (`η > 0`). */
  readonly etaGrid: Float64Array
  /** Scale factor `a(η)` on the grid. */
  readonly aGrid: Float64Array
  /** `da/dη = ȧ · a = H · a²` on the grid. */
  readonly aPrimeGrid: Float64Array
  /** Matter density `ρ(η)` on the grid. */
  readonly rhoGrid: Float64Array
  /** Conformal time at the bounce (`η(t_B)`). */
  readonly etaBounce: number
  /** Cosmic time at the bounce (always `0` by construction). */
  readonly tBounce: number
  /** Monotonicity flag — always `false` because `a(η)` has a minimum at `η_B`. */
  readonly isMonotonic: false
}

/**
 * Per-frame coefficient bundle returned by {@link evaluateLqcBounceCoefs}.
 * Mirrors the struct layout expected by `background.computeCosmologyCoefs`.
 */
export interface LqcBounceCoefs {
  /** Scale factor `a(η)`. */
  a: number
  /** `a'(η) = da/dη`. Positive post-bounce, negative pre-bounce. */
  aPrime: number
  /** `a^(−(n−2))` — drift coefficient for `δφ' = A · π`. */
  A: number
  /** `a^(n−2)` — gradient coefficient. */
  B: number
  /** `a^n` — volume-form coefficient. */
  B_full: number
  /** Matter density at `η` (interpolated). */
  rho: number
}

// ───────────────────────────────────────────────────────────────────────────
// Physics helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Analytic closed-form stiffness coefficient
 * `γ = (n − 1)² · ρ_c / (3(n − 2))` appearing in the stiff-fluid (`w = 1`)
 * analytic bounce solution `ρ(τ) = ρ_c / (1 + γτ²)`,
 * `a(τ) = a_B · (1 + γτ²)^(1 / (2(n − 1)))`.
 *
 * Exposed for unit-test oracles; the numerical integrator does not consume it.
 *
 * @param spacetimeDim - Spacetime dimension `n ≥ 3`.
 * @param rhoCritical - Critical density `ρ_c`.
 * @returns `γ` in sim units.
 */
export function stiffFluidGamma(spacetimeDim: number, rhoCritical: number): number {
  const nm1 = spacetimeDim - 1
  const nm2 = spacetimeDim - 2
  return (nm1 * nm1 * rhoCritical) / (3 * nm2)
}

/**
 * Modified-Friedmann Hubble rate magnitude for LQC:
 * `|H| = √(ρ (1 − ρ/ρ_c) / (3(n − 2)))`. Returns `0` when the radicand is
 * non-positive (at or past the bounce).
 *
 * @param spacetimeDim - Spacetime dimension `n`.
 * @param rhoCritical - Critical density `ρ_c`.
 * @param rho - Matter density `ρ` at which to evaluate.
 * @returns Hubble magnitude `|H|`, clamped to `≥ 0`.
 */
export function lqcHubbleMagnitude(spacetimeDim: number, rhoCritical: number, rho: number): number {
  if (!(rho > 0) || !(rhoCritical > 0)) return 0
  const ratio = rho / rhoCritical
  const factor = 1 - ratio
  if (!(factor > 0)) return 0
  const h2 = (rho * factor) / (3 * (spacetimeDim - 2))
  return h2 > 0 ? Math.sqrt(h2) : 0
}

// ───────────────────────────────────────────────────────────────────────────
// Validation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Validate an {@link LqcBounceParams} object. Throws with a descriptive
 * message on any constraint violation. Mirrors the "strict-then-soft" style
 * used by `scaleFactorAmplitude` so callers can surface the error to the UI.
 *
 * @param params - Parameters under test.
 * @throws {RangeError} On any invalid input.
 */
export function validateLqcBounceParams(params: LqcBounceParams): void {
  const { spacetimeDim, rhoCritical, equationOfState, initialRhoRatio } = params
  if (!Number.isFinite(spacetimeDim) || spacetimeDim < 3) {
    throw new RangeError(
      `LqcBounceParams.spacetimeDim must be a finite number >= 3, got ${spacetimeDim}`
    )
  }
  if (!Number.isFinite(rhoCritical) || rhoCritical <= 0) {
    throw new RangeError(
      `LqcBounceParams.rhoCritical must be a finite number > 0, got ${rhoCritical}`
    )
  }
  if (!Number.isFinite(equationOfState) || equationOfState < 0 || equationOfState > 1) {
    throw new RangeError(
      `LqcBounceParams.equationOfState must be in [0, 1], got ${equationOfState}`
    )
  }
  if (!Number.isFinite(initialRhoRatio) || initialRhoRatio <= 0 || initialRhoRatio >= 1) {
    throw new RangeError(
      `LqcBounceParams.initialRhoRatio must be in (0, 1), got ${initialRhoRatio}`
    )
  }
  if (params.tHalfWidth !== undefined) {
    if (!Number.isFinite(params.tHalfWidth) || params.tHalfWidth <= 0) {
      throw new RangeError(
        `LqcBounceParams.tHalfWidth must be a finite number > 0, got ${params.tHalfWidth}`
      )
    }
  }
  if (params.stepSize !== undefined) {
    if (!Number.isFinite(params.stepSize) || params.stepSize <= 0) {
      throw new RangeError(
        `LqcBounceParams.stepSize must be a finite number > 0, got ${params.stepSize}`
      )
    }
  }
  if (params.etaBounceAnchor !== undefined) {
    if (!Number.isFinite(params.etaBounceAnchor) || params.etaBounceAnchor <= 0) {
      throw new RangeError(
        `LqcBounceParams.etaBounceAnchor must be a finite number > 0, got ${params.etaBounceAnchor}`
      )
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Parameter resolution
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolve the effective integration window half-width for the bounce table.
 *
 * If the caller supplies `tHalfWidth` we honor it verbatim. Otherwise we pick
 * the cosmic-time point `τ*` at which the stiff-fluid analytic oracle hits
 * `initialRhoRatio`, clamped to `[2, 50]` so undersized windows still cover
 * the near-bounce region and oversized windows don't bake Kasner tails that
 * round to zero in f32.
 *
 * Shared by {@link computeLqcBounceBackground} and
 * {@link getOrComputeLqcBounceTable}: the former uses it to drive the RK4
 * loop, the latter uses it to build cache keys that match. Keeping the
 * formula in a single place prevents a drift where the two callers compute
 * slightly different `tHalfWidth` and the cache key never matches the table.
 *
 * @param params - Bounce parameters (only `tHalfWidth`, `spacetimeDim`,
 *                 `rhoCritical`, `initialRhoRatio` are consulted).
 * @returns The `tHalfWidth` that the actual integrator will use.
 */
function resolveTHalfWidth(params: LqcBounceParams): number {
  if (params.tHalfWidth !== undefined) return params.tHalfWidth
  const gamma = stiffFluidGamma(params.spacetimeDim, params.rhoCritical)
  const tStar = gamma > 0 ? Math.sqrt((1 / params.initialRhoRatio - 1) / gamma) : 5
  return Math.max(2, Math.min(50, tStar))
}

// ───────────────────────────────────────────────────────────────────────────
// ODE system
// ───────────────────────────────────────────────────────────────────────────

/**
 * State vector for the RK4 integrator. `[a, ρ]` in cosmic time `t`. `H`
 * is computed from `ρ` alone — the sign is provided by the caller so the
 * integrator knows which branch (contracting / expanding) it's on.
 */
type LqcState = readonly [a: number, rho: number]

/**
 * RHS of the coupled LQC ODE at state `(a, ρ)` given the Hubble sign:
 *
 *     da/dt = sign · a · |H(ρ)|
 *     dρ/dt = −sign · (n − 1)(1 + w) · |H(ρ)| · ρ
 *
 * The `|H|` magnitude handles the `ρ → ρ_c` limit gracefully (→ 0); the
 * sign parameter encodes whether we're contracting (`-1`) or expanding
 * (`+1`). The bounce itself corresponds to `H = 0` (ρ = ρ_c), at which
 * point `(da/dt, dρ/dt) = (0, 0)` — the integrator freezes momentarily
 * before we flip the sign.
 *
 * @param state - `[a, ρ]`.
 * @param spacetimeDim - Spacetime dimension `n`.
 * @param rhoCritical - Critical density `ρ_c`.
 * @param equationOfState - EoS parameter `w`.
 * @param hubbleSign - `+1` expanding, `-1` contracting.
 * @returns `[da/dt, dρ/dt]`.
 */
function lqcRhs(
  state: LqcState,
  spacetimeDim: number,
  rhoCritical: number,
  equationOfState: number,
  hubbleSign: number
): [number, number] {
  const [a, rho] = state
  // Clamp ρ to avoid a complex square root at `ρ = ρ_c + ε`. When RK4's
  // intermediate stages overshoot the bounce we nudge them back.
  const rhoSafe = Math.min(Math.max(rho, 0), rhoCritical)
  const hMag = lqcHubbleMagnitude(spacetimeDim, rhoCritical, rhoSafe)
  const dadt = hubbleSign * a * hMag
  const drhoDt = -hubbleSign * (spacetimeDim - 1) * (1 + equationOfState) * hMag * rhoSafe
  return [dadt, drhoDt]
}

/**
 * RK4 step for the coupled (a, ρ) system. `h` is cosmic-time step size;
 * `hubbleSign` is frozen for the step (the caller flips it between steps
 * when the bounce is crossed).
 *
 * Post-step we clamp `ρ ∈ [0, ρ_c]` and `a > 0` to tame numerical drift at
 * the exact bounce instant where `H ≡ 0` and RK4's four stage evaluations
 * may round the state just over the ρ = ρ_c boundary.
 */
function rk4Step(
  state: LqcState,
  h: number,
  spacetimeDim: number,
  rhoCritical: number,
  equationOfState: number,
  hubbleSign: number
): LqcState {
  const k1 = lqcRhs(state, spacetimeDim, rhoCritical, equationOfState, hubbleSign)
  const s2: LqcState = [state[0] + (h / 2) * k1[0], state[1] + (h / 2) * k1[1]]
  const k2 = lqcRhs(s2, spacetimeDim, rhoCritical, equationOfState, hubbleSign)
  const s3: LqcState = [state[0] + (h / 2) * k2[0], state[1] + (h / 2) * k2[1]]
  const k3 = lqcRhs(s3, spacetimeDim, rhoCritical, equationOfState, hubbleSign)
  const s4: LqcState = [state[0] + h * k3[0], state[1] + h * k3[1]]
  const k4 = lqcRhs(s4, spacetimeDim, rhoCritical, equationOfState, hubbleSign)
  const aNext = state[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
  const rhoNext = state[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
  const aClamped = aNext > 0 ? aNext : state[0]
  const rhoClamped = Math.min(Math.max(rhoNext, 0), rhoCritical)
  return [aClamped, rhoClamped]
}

// ───────────────────────────────────────────────────────────────────────────
// Table assembly
// ───────────────────────────────────────────────────────────────────────────

/**
 * Integrate one branch of the bounce and record `(t, a, ρ)` samples. The
 * branch starts from `(t0, a0, ρ0)` and advances by `h` for `nSteps`, with
 * `hubbleSign` held fixed across the branch. When the RHS becomes
 * physically trivial at the bounce (`H → 0` and dρ/dt → 0 on both branches
 * so RK4 does nothing), the caller restarts the next branch from the
 * recorded end state with the flipped sign.
 *
 * Contracting branch: `hubbleSign = −1` advances t backward in cosmic time
 * (`h < 0`), so we go from `t = 0` → `t = −tHalf`. Expanding branch:
 * `hubbleSign = +1`, `h > 0`, t = 0 → t = +tHalf.
 */
function integrateBranch(
  t0: number,
  a0: number,
  rho0: number,
  h: number,
  nSteps: number,
  spacetimeDim: number,
  rhoCritical: number,
  equationOfState: number,
  hubbleSign: number
): { ts: Float64Array; as: Float64Array; rhos: Float64Array } {
  const ts = new Float64Array(nSteps + 1)
  const as = new Float64Array(nSteps + 1)
  const rhos = new Float64Array(nSteps + 1)
  ts[0] = t0
  as[0] = a0
  rhos[0] = rho0
  let state: LqcState = [a0, rho0]
  let t = t0
  for (let i = 1; i <= nSteps; i++) {
    state = rk4Step(state, h, spacetimeDim, rhoCritical, equationOfState, hubbleSign)
    t += h
    ts[i] = t
    as[i] = state[0]
    rhos[i] = state[1]
  }
  return { ts, as, rhos }
}

/**
 * Join the pre- and post-bounce branches into a single cosmic-time-ordered
 * sample set. The pre-bounce branch was integrated backward in t
 * (t_B → −tHalf), so we reverse it before concatenation to get
 * −tHalf → +tHalf ordering.
 */
function joinBranches(
  pre: { ts: Float64Array; as: Float64Array; rhos: Float64Array },
  post: { ts: Float64Array; as: Float64Array; rhos: Float64Array }
): { ts: Float64Array; as: Float64Array; rhos: Float64Array } {
  // pre.ts[0] = 0 (bounce); pre.ts[last] = -tHalf. Drop the first sample
  // before reversing so we don't duplicate the bounce instant (post.ts[0]
  // also equals 0).
  const preLen = pre.ts.length - 1 // exclude bounce (index 0)
  const postLen = post.ts.length
  const total = preLen + postLen
  const ts = new Float64Array(total)
  const as = new Float64Array(total)
  const rhos = new Float64Array(total)
  for (let i = 0; i < preLen; i++) {
    const src = preLen - i // pre indices [1..preLen] reversed
    ts[i] = pre.ts[src]!
    as[i] = pre.as[src]!
    rhos[i] = pre.rhos[src]!
  }
  for (let j = 0; j < postLen; j++) {
    ts[preLen + j] = post.ts[j]!
    as[preLen + j] = post.as[j]!
    rhos[preLen + j] = post.rhos[j]!
  }
  return { ts, as, rhos }
}

/**
 * Trapezoidal integration of `dη/dt = 1/a(t)` to produce the conformal-time
 * grid. Anchors `η(t_B) = etaAnchor` so both branches sit at `η > 0`,
 * compatible with the existing `η > 0` Bianchi-I convention in
 * `projectSimEta` and the `resolveEta0ForPresetSwitch` setter.
 *
 * Returns `etaGrid` aligned with `ts` (same length, same indexing).
 */
function integrateConformalTime(
  ts: Float64Array,
  as: Float64Array,
  etaAnchor: number,
  tBounce: number
): Float64Array {
  const n = ts.length
  const eta = new Float64Array(n)
  // Locate the sample nearest tBounce — the branches were stitched so
  // exactly one sample sits at t = tBounce (by construction from
  // joinBranches).
  let bounceIdx = 0
  let bounceDist = Math.abs(ts[0]! - tBounce)
  for (let i = 1; i < n; i++) {
    const d = Math.abs(ts[i]! - tBounce)
    if (d < bounceDist) {
      bounceDist = d
      bounceIdx = i
    }
  }
  eta[bounceIdx] = etaAnchor

  // Integrate forward from the bounce via trapezoid rule.
  for (let i = bounceIdx + 1; i < n; i++) {
    const dt = ts[i]! - ts[i - 1]!
    const inv = 0.5 * (1 / as[i - 1]! + 1 / as[i]!)
    eta[i] = eta[i - 1]! + dt * inv
  }
  // Integrate backward from the bounce. `etaGrid` is stored in cosmic-time
  // order (t: -tHalf → +tHalf), so η at index 0 is the SMALLEST value.
  // With dη/dt = 1/a > 0, traversing i from bounceIdx-1 down to 0 walks
  // dt < 0 and picks up dη < 0 via the trapezoid rule — the desired
  // monotonically-increasing-in-i grid. `etaAnchor` must be large enough
  // that no η reaches ≤ 0; the caller-supplied default (10) covers the
  // entire integration window for typical params.
  for (let i = bounceIdx - 1; i >= 0; i--) {
    const dt = ts[i]! - ts[i + 1]! // negative
    const inv = 0.5 * (1 / as[i + 1]! + 1 / as[i]!)
    eta[i] = eta[i + 1]! + dt * inv
  }
  return eta
}

/**
 * Compute `a'(η) = da/dη = a · ℋ = a · (a'/a) = ... ` — from the cosmic-time
 * Hubble rate via `da/dη = (da/dt) · (dt/dη) = (da/dt) · a = H · a²`. We
 * pick up the signed `H` from the modified-Friedmann magnitude plus the
 * pre/post bounce sign convention: `H < 0` for pre-bounce (contracting,
 * i < bounceIdx), `H > 0` for post-bounce, `H = 0` at the bounce.
 *
 * @param as - Scale factor samples.
 * @param rhos - Density samples (same indexing).
 * @param bounceIdx - Index of the bounce sample in both arrays.
 * @param spacetimeDim - Spacetime dimension `n`.
 * @param rhoCritical - Critical density `ρ_c`.
 */
function computeAPrime(
  as: Float64Array,
  rhos: Float64Array,
  bounceIdx: number,
  spacetimeDim: number,
  rhoCritical: number
): Float64Array {
  const n = as.length
  const aPrime = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const hMag = lqcHubbleMagnitude(spacetimeDim, rhoCritical, rhos[i]!)
    const sign = i < bounceIdx ? -1 : i > bounceIdx ? 1 : 0
    aPrime[i] = sign * hMag * as[i]! * as[i]!
  }
  return aPrime
}

/**
 * Compute the full LQC bounce lookup table. The returned object is safe to
 * cache — no internal references are held. See the module-level
 * documentation for the physics; see `evaluateLqcBounceCoefs` for the
 * per-frame consumer.
 *
 * @param params - Bounce parameters. Validated before any integration.
 * @returns Dense lookup table covering the full pre-bounce → bounce →
 *          post-bounce window in one monotonically increasing `η` grid.
 */
export function computeLqcBounceBackground(params: LqcBounceParams): LqcBounceTable {
  validateLqcBounceParams(params)
  const {
    spacetimeDim,
    rhoCritical,
    equationOfState,
    stepSize = 5e-4,
    etaBounceAnchor = 10,
  } = params

  const tBounce = 0
  const aBounce = 1 // gauge choice; overall amplitude drops out of the FSF spectrum

  const tHalfWidth = resolveTHalfWidth(params)

  // How many RK4 steps per branch. Integer round-down so h stays exactly
  // equal to stepSize (no end-point bias) and the branch terminates at or
  // just inside the window edge.
  const nSteps = Math.max(1, Math.floor(tHalfWidth / stepSize))

  // Contracting branch: starts at ρ = ρ_c (bounce), integrates BACKWARD in
  // cosmic time. Need initial ρ for the backward branch — the physics
  // dictates ρ = ρ_c at the bounce, so we start there and let RK4 push ρ
  // back down to some lower value as t decreases. The `initialRhoRatio`
  // param is a diagnostic — it tells us the density we *expect* at the
  // window edge; if the numerical integrator's endpoint lands at roughly
  // ρ_c · initialRhoRatio we know the window captured enough of the
  // Kasner tail. See the `initialRhoRatio` handling in the store for how
  // it actually affects the run.
  //
  // NOTE: `initialRhoRatio` is also used as a sanity check by the
  // classical-limit test — in the `ρ_c → ∞` limit with fixed initial
  // density, the window edge ρ should be determined entirely by the
  // stiff-fluid continuity (ρ·a^(2(n−1)) = const), decoupled from ρ_c.
  // The store feeds this param in from the UI so the user can tune how
  // far "away" from the bounce the integrator starts.
  //
  // Seed each branch slightly off the exact bounce because `ρ = ρ_c`
  // is a degenerate fixed point of the ODE — RK4 would produce all-zero
  // derivatives and never leave it. Near the bounce the analytic
  // expansion gives `ρ(τ) = ρ_c − c·τ²` with
  // `c = (n−1)²(1+w)²ρ_c² / (12(n−2))`, which matches `γ·ρ_c` in the
  // stiff-fluid (`w = 1`) case and drops to zero smoothly as `w → −1`.
  // `a(τ) ≈ a_B` to leading order; the quadratic correction is subdominant.
  // We seed at `τ = ±stepSize` and RK4 takes over for the remaining
  // `nSteps - 1` steps on each branch.
  const nm1_seed = spacetimeDim - 1
  const nm2_seed = spacetimeDim - 2
  const wPlus1 = 1 + equationOfState
  const cCoef =
    (nm1_seed * nm1_seed * wPlus1 * wPlus1 * rhoCritical * rhoCritical) / (12 * nm2_seed)
  const tauSeed = stepSize
  const rhoSeed = Math.max(0, rhoCritical - cCoef * tauSeed * tauSeed)
  // a(τ) from stiff-fluid continuity ρ·a^(2(n−1)) = const (exact for w=1)
  // approximates the general-w case to O(τ⁴), which is well inside the
  // RK4 truncation error for `stepSize = 5e−4`.
  const aSeed =
    rhoSeed > 0 ? aBounce * Math.pow(rhoCritical / rhoSeed, 1 / (2 * nm1_seed)) : aBounce

  // Contracting branch — seed at t = -stepSize with (aSeed, rhoSeed),
  // run the remaining `nSteps − 1` steps backward in cosmic time.
  const preInterior = integrateBranch(
    tBounce - tauSeed,
    aSeed,
    rhoSeed,
    -stepSize,
    nSteps - 1,
    spacetimeDim,
    rhoCritical,
    equationOfState,
    -1
  )
  // Prepend the bounce sample so `pre.ts[0] = tBounce` (the `joinBranches`
  // contract) is preserved.
  const pre = {
    ts: new Float64Array(nSteps + 1),
    as: new Float64Array(nSteps + 1),
    rhos: new Float64Array(nSteps + 1),
  }
  pre.ts[0] = tBounce
  pre.as[0] = aBounce
  pre.rhos[0] = rhoCritical
  for (let i = 0; i < preInterior.ts.length; i++) {
    pre.ts[i + 1] = preInterior.ts[i]!
    pre.as[i + 1] = preInterior.as[i]!
    pre.rhos[i + 1] = preInterior.rhos[i]!
  }

  // Post-bounce expanding branch — seed at t = +stepSize with (aSeed, rhoSeed),
  // run `nSteps − 1` steps forward.
  const postInterior = integrateBranch(
    tBounce + tauSeed,
    aSeed,
    rhoSeed,
    stepSize,
    nSteps - 1,
    spacetimeDim,
    rhoCritical,
    equationOfState,
    +1
  )
  const post = {
    ts: new Float64Array(nSteps + 1),
    as: new Float64Array(nSteps + 1),
    rhos: new Float64Array(nSteps + 1),
  }
  post.ts[0] = tBounce
  post.as[0] = aBounce
  post.rhos[0] = rhoCritical
  for (let i = 0; i < postInterior.ts.length; i++) {
    post.ts[i + 1] = postInterior.ts[i]!
    post.as[i + 1] = postInterior.as[i]!
    post.rhos[i + 1] = postInterior.rhos[i]!
  }

  // Contracting branch: integrated from bounce backward (ts: 0 → -tHalf),
  // reversed by joinBranches into cosmic-time order (-tHalf → 0). With
  // hubbleSign = -1 and h < 0, Δa = |h|·a·|H| > 0, so `a` grows as we
  // integrate backward — physically correct: pre-bounce has H < 0 (a
  // shrinks with cosmic time), so going backward in time a grows from
  // a_B = 1 at t_B toward its Kasner asymptote at t = -tHalf.
  const joined = joinBranches(pre, post)
  // After joinBranches, the array is [pre reversed, post], ordering
  // cosmic time monotonically from -tHalf → +tHalf with the bounce
  // sitting at index pre.ts.length - 1 (= nSteps, since pre.ts has
  // nSteps + 1 entries and we drop the first one).
  const bounceIdx = nSteps // index of t = tBounce in the joined array

  const etaGrid = integrateConformalTime(joined.ts, joined.as, etaBounceAnchor, tBounce)
  // When using the default anchor (10) with a large adaptive window, the
  // pre-bounce conformal-time span can push etaGrid[0] non-positive,
  // violating the positive-η contract. Shift the whole grid upward.
  if (params.etaBounceAnchor === undefined && etaGrid[0]! <= 0) {
    const shift = 1 - etaGrid[0]!
    for (let i = 0; i < etaGrid.length; i++) {
      etaGrid[i] = etaGrid[i]! + shift
    }
  }
  const aPrimeGrid = computeAPrime(joined.as, joined.rhos, bounceIdx, spacetimeDim, rhoCritical)

  return {
    etaGrid,
    aGrid: joined.as,
    aPrimeGrid,
    rhoGrid: joined.rhos,
    etaBounce: etaGrid[bounceIdx]!,
    tBounce,
    isMonotonic: false,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Interpolated evaluator
// ───────────────────────────────────────────────────────────────────────────

/**
 * Binary-search the largest `i` such that `etaGrid[i] ≤ eta`. Returns `0`
 * if `eta` is below the grid minimum and `etaGrid.length - 2` if above
 * the maximum (so the caller can always index `[i, i+1]` safely).
 */
function lowerBoundIndex(etaGrid: Float64Array, eta: number): number {
  const n = etaGrid.length
  if (n < 2) return 0
  if (eta <= etaGrid[0]!) return 0
  if (eta >= etaGrid[n - 1]!) return n - 2
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1
    if (etaGrid[mid]! <= eta) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Linear interpolation in one grid, selected by the `etaGrid` sample
 * bracket `[i, i+1]` and fractional position `t ∈ [0, 1]`.
 */
function linearInterpolate(grid: Float64Array, i: number, t: number): number {
  return grid[i]! * (1 - t) + grid[i + 1]! * t
}

/**
 * Evaluate the LQC bounce coefficients at a conformal time `η`, returning
 * the per-frame bundle expected by the FSF Hamiltonian integrator.
 *
 * Endpoint clamping: `η` outside the table's `[etaMin, etaMax]` window is
 * clamped to the nearest endpoint. The caller (the FSF compute pass) is
 * already responsible for keeping `simEta` inside the window via the
 * `tHalfWidth` setting; the clamp is a last-line-of-defence.
 *
 * @param table - Precomputed bounce table.
 * @param eta - Conformal time at which to evaluate.
 * @param spacetimeDim - Spacetime dimension `n`. Needed to raise `a` to
 *                       `n − 2` / `n` for the canonical `(A, B, B_full)`
 *                       coefficient triple.
 * @returns Per-frame coefficients.
 */
export function evaluateLqcBounceCoefs(
  table: LqcBounceTable,
  eta: number,
  spacetimeDim: number
): LqcBounceCoefs {
  const i = lowerBoundIndex(table.etaGrid, eta)
  const e0 = table.etaGrid[i]!
  const e1 = table.etaGrid[i + 1]!
  const denom = e1 - e0
  const tRaw = denom > 0 ? (eta - e0) / denom : 0
  // Clamp the fractional position to [0, 1] so an out-of-range `eta`
  // returns the endpoint value instead of extrapolating.
  const tInterp = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw
  const a = linearInterpolate(table.aGrid, i, tInterp)
  const aPrime = linearInterpolate(table.aPrimeGrid, i, tInterp)
  const rho = linearInterpolate(table.rhoGrid, i, tInterp)

  const nm2 = spacetimeDim - 2
  // n >= 3 is enforced upstream, so n - 2 >= 1. Use `a^(n-2)` via pow,
  // accepting the slight double→double round-off; the `a^n` factor reuses
  // the result times `a²` to save one pow call per frame.
  const B = Math.pow(a, nm2)
  const A = B > 0 ? 1 / B : 1
  const B_full = B * a * a

  return { a, aPrime, A, B, B_full, rho }
}

// ───────────────────────────────────────────────────────────────────────────
// Module-level cache
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cache key for the LQC table. The params are value-compared so the cache
 * correctly invalidates when *any* input changes.
 */
interface LqcCacheKey {
  spacetimeDim: number
  rhoCritical: number
  equationOfState: number
  initialRhoRatio: number
  tHalfWidth: number
  stepSize: number
  etaBounceAnchor: number
}

/** Maximum total byte budget for the LQC LRU cache (~4 MB). */
const LQC_CACHE_MAX_BYTES = 4 * 1024 * 1024

/**
 * Map-backed LRU: JavaScript `Map` preserves insertion order. A cache hit
 * re-inserts the entry at the tail; when the map is full, the head entry
 * (the oldest) is evicted. This gives amortised O(1) lookup + update with
 * no external dependency.
 */
const lqcCache = new Map<string, LqcBounceTable>()

/**
 * Build a deterministic cache key string from the resolved LQC params.
 * Each field is stringified with enough precision to distinguish semantic
 * changes but not so much that rounding flicker invalidates the entry.
 */
function lqcCacheKeyString(k: LqcCacheKey): string {
  return [
    k.spacetimeDim,
    k.rhoCritical,
    k.equationOfState,
    k.initialRhoRatio,
    k.tHalfWidth,
    k.stepSize,
    k.etaBounceAnchor,
  ].join('|')
}

/**
 * Memoised {@link computeLqcBounceBackground}. Returns the cached table
 * when the params match a previous invocation; rebuilds otherwise. The
 * FSF compute pass invokes this every substep under an active `lqcBounce`
 * preset, so the cache is essential — a full rebuild touches ~20k float
 * samples.
 *
 * The cache is a byte-budgeted LRU ({@link LQC_CACHE_MAX_BYTES}) so a user
 * toggling between two presets (A → B → A → B) hits the cache every call
 * instead of rebuilding on each switch.
 *
 * @param params - Bounce parameters.
 * @returns Cached or freshly computed lookup table.
 */
export function getOrComputeLqcBounceTable(params: LqcBounceParams): LqcBounceTable {
  // The effective `tHalfWidth` is shared with `computeLqcBounceBackground`
  // via `resolveTHalfWidth` — identical input params therefore always hash
  // to the same key regardless of whether the caller passed `tHalfWidth`
  // explicitly or relied on the adaptive default.
  const key: LqcCacheKey = {
    spacetimeDim: params.spacetimeDim,
    rhoCritical: params.rhoCritical,
    equationOfState: params.equationOfState,
    initialRhoRatio: params.initialRhoRatio,
    tHalfWidth: resolveTHalfWidth(params),
    stepSize: params.stepSize ?? 5e-4,
    etaBounceAnchor: params.etaBounceAnchor ?? 10,
  }
  const keyStr = lqcCacheKeyString(key)
  const cached = lqcCache.get(keyStr)
  if (cached) {
    // Refresh recency: Map preserves insertion order, so delete + re-insert
    // moves the entry to the tail.
    lqcCache.delete(keyStr)
    lqcCache.set(keyStr, cached)
    return cached
  }
  const table = computeLqcBounceBackground(params)
  lqcCache.set(keyStr, table)
  // Evict oldest entries until total byte budget is respected.
  let totalBytes = 0
  for (const t of lqcCache.values()) {
    totalBytes +=
      t.etaGrid.byteLength + t.aGrid.byteLength + t.aPrimeGrid.byteLength + t.rhoGrid.byteLength
  }
  while (totalBytes > LQC_CACHE_MAX_BYTES && lqcCache.size > 1) {
    const oldest = lqcCache.keys().next().value
    if (oldest === undefined) break
    const evicted = lqcCache.get(oldest)!
    totalBytes -=
      evicted.etaGrid.byteLength +
      evicted.aGrid.byteLength +
      evicted.aPrimeGrid.byteLength +
      evicted.rhoGrid.byteLength
    lqcCache.delete(oldest)
  }
  return table
}

/**
 * Test-only helper: clear the memoised tables so cache state does not leak
 * across `vitest` runs. Production code never needs this.
 */
export function __resetLqcBounceCacheForTests(): void {
  lqcCache.clear()
}
