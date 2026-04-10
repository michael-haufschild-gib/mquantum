# ADR-010: FSF cosmology late-time integrator and proper-density visualization

**Status**: Accepted
**Date**: 2026-04-11
**Deciders**: Project maintainer

## Context

The Free Scalar Field compute pass supports a Mukhanov-Sasaki bridge that
evolves a canonical `(δφ, π_δφ)` lattice on a prescribed FLRW background
(de Sitter, Kasner, ekpyrotic, Minkowski — see `presets.ts`,
`background.ts`, `adiabaticVacuum.ts`). The integrator is a symplectic
leapfrog with cosmology coefficients `(A, B, C) = (a^{-(n-2)}, a^{n-2},
a^n)` written into the uniform buffer once per sub-step, evaluated at the
current conformal time `η`.

Under the `deSitterVacuum` preset with `autoScale=true` and the
`energyDensity` field view, users reported a specific visual pathology:

> The field renders for a while, slowly disappears, then after some
> seconds of darkness there is a sudden white flash.

Instrumentation captured the failure mode at
`scripts/playwright-output/fsf-desitter-autoscale-flash.json`:

| frame | simEta    | a    | nSub | diagTotalEnergy | maxPhi  | maxPi   |
|-------|-----------|------|------|------------------|---------|---------|
| 1248  | -1.0e-2   | 100  | 1    | 194              | 0.017   | 57      |
| 1249  | -1.0e-3   | 1000 | 1    | 194 (stale)      | 0.017   | 57      |
| 1255  | -1.0e-3   | 1000 | 3    | NaN              | NaN     | NaN     |

The failure was a compound of **four independent issues**, each of which
had to be addressed for the visualization to be both numerically stable
and physically meaningful:

### Issue 1: CFL preview at the wrong end of the outer step

`computeAdaptiveSubsteps` was evaluated only at the current `simEta`.
In de Sitter `a(η) ∝ 1/|η|` grows monotonically toward the singularity,
so a preview at the start of the step missed the discontinuous jump
to `COSMOLOGY_ETA_FLOOR`. The pi dispatch at the end of the step then
ran with post-jump coefficients but the stale `nSub = 1` interval —
the effective `dt · ω` landed at ~5, well above the leapfrog stability
limit of 2, and the leapfrog detonated in a single step.

### Issue 2: Marginal CFL safety factor

`COSMOLOGY_CFL_SAFETY` was `1.8`, putting `sub_dt · ω` just inside the
strict stability limit. Even after fixing Issue 1, float32 roundoff
during the transient triggered by the coefficient jump at the floor
pushed individual lattice cells over the edge into Inf, and Inf
propagated to NaN through the discrete Laplacian's `phi[i+1] - phi[i-1]`
stencil (`Inf - Inf = NaN`).

### Issue 3: Non-adiabatic pumping at the floor crossing

Even with strict CFL stability, the leapfrog is not energy-conserving
when the cosmology coefficients change faster than the mode oscillator
period. At the floor crossing, `a(η)` changes by a factor of ~10 over a
single outer step, driving the mode oscillators out of their
instantaneous Bunch-Davies ground state and pumping their canonical
amplitudes up by orders of magnitude before they settle. CFL stability
guarantees bounded growth; it does not guarantee *adiabatic* evolution.
Pure CFL-based sub-stepping is necessary but not sufficient.

### Issue 4: Canonical Hamiltonian density is not a physical observable

Even with numerics fully under control, the `energyDensity` view
displayed the *canonical Hamiltonian density*

```text
H_can(x) = ½ aKinetic π² + ½ aPotential (∇δφ)² + ½ m²·aFull δφ² + aFull V(δφ)
```

This is the integrand of the conformal-time action, per unit
*comoving* volume. It is not what a local observer would measure. In
de Sitter the `aFull = a^n` factor on the mass term grows faster than
`|δφ|²` decays, so the displayed "energy density" artificially *grows*
at late times — producing a visually alarming brightening in exactly
the regime where physics says the field is diluting. The shader was
rendering a coordinate artifact, not a physical field.

## Decision

Apply four targeted fixes in a single coordinated change. Each
addresses one of the issues above and each is independent in the sense
that reverting any one would reintroduce its symptom; together they
make the late-time de Sitter integrator both numerically stable and
physically faithful.

### 1. CFL preview at both endpoints of the outer step

Extract a pure module-level helper `projectSimEta(currentEta, dt)` that
mirrors the floor/sign clamp of the mutating `advanceSimEta` method
(which now delegates to it, so the clamp math lives in exactly one
place). In the leapfrog loop, evaluate cosmology coefficients at both
`simEta` and `projectSimEta(simEta, dtFull)` and take the stricter
sub-step count `nSub = max(nSubStart, nSubEnd)`. For `a(η) ∝ |η|^q` the
scale factor is monotonic over the outer step, so max-of-endpoints
equals max-over-interval; a single check handles both growing-a (de
Sitter) and shrinking-a (Kasner/ekpyrotic) presets without a
preset-specific branch.

### 2. Tighten `COSMOLOGY_CFL_SAFETY` from 1.8 to 1.0

`dt·ω < 1.0` puts the leapfrog amplification eigenvalues well inside
the strict stability disk (`h²ω² ≤ 1` vs the boundary at 4), leaving
factor-of-2 margin for float32 roundoff and transient overshoot. The
cost is at most ~2× more sub-steps at the deepest late-time regime;
everywhere else `ω · dt ≪ 1` already and nothing changes.

### 3. Add adaptive adiabatic sub-stepping alongside CFL

New module helper `computeAdiabaticSubsteps(coefsStart, coefsEnd)`
returns the minimum `nSub` such that the fractional change in the
zero-mode frequency `ω₀ ≈ m·a` per sub-step stays below
`COSMOLOGY_ADIABATIC_SAFETY = 0.1`. The final sub-step count is
`nSub = max(nSubCfl, nSubAdiab)`. The adiabatic bound is mathematically
capped at `nSub ≤ 20` (the relative change `|Δa| / a_avg` cannot exceed
2), well below `COSMOLOGY_MAX_SUBSTEPS = 32`; only the CFL branch can
push toward the cap. Under Minkowski or the identity fallback
`a_start = a_end` and the adiabatic check returns 1, so the flat
background path is bit-identical to the pre-ADR behavior.

### 4. Raise `COSMOLOGY_ETA_FLOOR` from 1e-3 to 1e-2

At `|η| = 0.01` every mode on the default 64³/Δ=0.1 lattice is already
super-horizon (`k_min · |η| ≪ 1`), so the physics is frozen and further
evolution toward `η → 0⁻` would add nothing observable. Raising the
floor:

- Keeps `a` ≤ 1/(H · 0.01) = 100 in the default preset (vs. 1000 at
  the old floor), so `aFull = a^n` stays in a comfortable float32
  range and no coefficient jumps overflow.
- Allows the adiabatic sub-stepper to handle the floor approach with
  `nSub ≤ 4` — empirically verified in the post-fix trace.
- Still provides 1000× scale-factor dynamic range from the default
  `eta0 = -10`, which is enough to see the mode-freezing transition.

### 5. Display proper energy density instead of canonical Hamiltonian

Divide `fieldValue` by `aFull` in the `energyDensity` branch of
`freeScalarWriteGrid.wgsl.ts`. The physical derivation:

```text
ρ_proper = T_{μν} u^μ u^ν      where u^μ = (1/a, 0, ..., 0) is the
                                 comoving observer's 4-velocity
         = T_{00} / a²
         = ½(δφ')²/a² + ½(∇δφ)²/a² + ½ m² δφ² + V(δφ)
```

After substituting the canonical momentum `π = a^{n-2} · δφ'`, every
term of `H_can` scales uniformly by `1/a^n`, so

```text
ρ_proper = H_can / a^n = H_can / aFull
```

and the division commutes past all four terms (kinetic, gradient,
mass, self-interaction). Build the canonical sum as before, divide
once at the end. Under Minkowski `aFull = 1` so the division is a
bit-identical no-op — every pre-ADR test passes unchanged. Under
cosmology the division removes the `a^n` coordinate inflation and
the visualization decays in step with the physics. The `analysisMode = 1`
Hamiltonian decomposition `(K, G, V)` is divided by the same factor
for consistency.

`estimateFsfMaxFieldValue` is updated to match: the auto-scale
calibration for `energyDensity` now divides the canonical estimate by
`aFull(η₀)`, so `normRho ≈ 1` at the initial time. Under Minkowski
this is again a bit-identical no-op.

## Alternatives Considered

### Freeze the cosmological clock at the floor

Stop advancing `simEta` past the floor and run the field on frozen
coefs. Rejected: physics says the field continues to evolve in late-time
de Sitter (super-horizon modes freeze, but the background keeps
stretching); freezing the clock trades a numerical problem for a
physics lie.

### Keep displaying canonical H density and explain it in the UI

Rejected: the canonical density has no local physical meaning; the
user's question "what's scientifically most accurate?" is answered by
"proper density", period. Documentation cannot compensate for
displaying the wrong observable.

### Smaller `dt` near the floor via an implicit integrator

Rejected for scope: an implicit symplectic scheme with time-varying
coefficients is a significant development project. Adaptive
sub-stepping on an explicit leapfrog is the minimal correct fix for
the observed failure mode and keeps the integrator simple.

### Dynamic `maxFieldValue` recalibration based on diagnostics readback

Rejected for scope: would make the auto-scale track the current
field statistics rather than freeze at `η₀`. Useful but orthogonal to
the core issue (which was displaying the wrong observable). Worth
revisiting as a separate improvement if the user finds the physically
correct late-time fade too dim to see.

## Consequences

**Positive**:

- No NaN or Inf anywhere in a 45-second de Sitter cosmology run
  (verified: `scripts/playwright-output/fsf-desitter-autoscale-flash.json`,
  `First NaN at index: -1`).
- The mid-run "bright cube reappearance" is gone: the shader now
  displays the proper energy density, which decays smoothly in step
  with the physics instead of artificially inflating via the
  `aFull = a^n` coordinate factor.
- Non-adiabatic energy pumping at the floor crossing reduced from 92×
  (pre-ADR) to 2.15× (post-ADR) — not zero, since we're still on a
  discrete lattice with a finite floor, but small enough that the
  visualization is smooth.
- Under Minkowski every change is a bit-identical no-op. All 6079
  pre-existing tests still pass without modification to their
  expected values.
- Ten new unit tests pin the new behavior: the purity and contract of
  `projectSimEta`, the adiabatic substep count at the boundary of the
  10% safety threshold, the `1/aFull(η₀)` rescale in the cosmology
  branches of `estimateFsfMaxFieldValue`, and the Minkowski
  bit-identity of every change.
- The CFL preview, adiabatic check, and floor math are all extracted
  as pure module-level helpers — trivially testable without spinning
  up a GPU device.

**Negative**:

- The late-time field visualization fades toward black as the proper
  energy density decays. This is scientifically correct but looks
  less visually striking than the (numerically broken) canonical
  display did. Users who want to see the frozen super-horizon state
  at late times should switch to `fieldView='phi'`, which decays more
  gently because `|δφ| ∝ |η|^{3/2 − ν}` with `ν ≈ 1.118` for m=H=1 is
  a ~400× decay vs. the ~10⁴× decay of `ρ_proper` over the same
  interval.
- The proper-density conversion introduces one extra float division
  per lattice voxel per frame in the write-grid shader. Negligible
  at default grid sizes.
- `COSMOLOGY_ETA_FLOOR = 1e-2` caps the late-time horizon-crossing
  transition slightly earlier than the previous `1e-3`. For presets
  that want to go deeper the user must lower the floor manually and
  accept that the numerical integrator will trade accuracy for
  progress — but with four independent safeguards (CFL preview,
  tight CFL safety, adiabatic sub-stepping, proper-density display)
  the failure mode is now "graceful sub-step pressure" rather than
  "sudden NaN flash".
- The diagnostics readback (`computeFsfDiagnostics`) still reports the
  canonical Hamiltonian, not the proper energy density. This is
  intentional — the diagnostics panel is for verifying the
  integrator's internal conservation laws (energy drift, norm), and
  those laws are written in terms of canonical variables. The
  distinction between "what the integrator tracks" and "what the
  observer measures" is now explicit in the shader comments but is
  a potential source of confusion if someone compares panel numbers
  against rendered brightness.

**Verification**:

- Unit tests: `npx vitest run` — 6079 tests pass.
- Playwright: `scripts/playwright/fsf-desitter-autoscale-flash.spec.ts`
  — 45s run, no NaN, `maxNSub = 4` (well below the cap), smooth
  energy decay.
- The captured trace at
  `scripts/playwright-output/fsf-desitter-autoscale-flash.json`
  is the regression artifact for this ADR; any future change to the
  cosmology integrator should re-run that spec and confirm the
  post-ADR numerical signature.
