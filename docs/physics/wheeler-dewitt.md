# Wheeler–DeWitt Minisuperspace Mode

The Wheeler–DeWitt (WdW) quantum mode simulates canonical quantum
gravity in a **3D minisuperspace** consisting of the FRW scale factor
`a` and two massive inflaton scalars `φ₁`, `φ₂`. Three boundary-condition
proposals for the wavefunction of the universe are supported side-by-side
(Hartle–Hawking, Vilenkin, DeWitt), together with two diagnostic
overlays:

1. **WKB streamlines** — classical-cosmology trajectories seeded in the
   Lorentzian region, integrated along the gradient of a visualisation
   phase field, and rendered as volumetric ridges.
2. **SRMT** — Superspace-Relational Modular Time diagnostic, an L²
   affine-match score between the Schmidt modular spectrum of `χ` and
   the eigenspectrum of a discrete Hamilton–Jacobi operator evaluated on
   a slice orthogonal to a chosen "clock" axis.

Neither overlay re-runs the WdW solver; both consume the cached solver
output.

## Conventions (normative)

Everything in this mode uses `G = ℏ = c = 1` natural units. Numerical
constants and operator helpers live in
`src/lib/physics/wheelerDeWitt/constants.ts`; any file that performs a
computation involving the WdW potential **imports from there** — there
is no "local copy" of `c_U`, `WDW_G_PREFACTOR`, `wdwPotential`, or
`wdwU` elsewhere in the tree.

### Wavefunction substitution

The WdW equation is solved on the reduced amplitude

    χ(a, φ₁, φ₂) = a^{3/2} · Ψ(a, φ₁, φ₂)

where `Ψ` is the canonical Wheeler–DeWitt wavefunction. The `a^{3/2}`
Jacobi factor (conformal-minimal ordering) removes the first-derivative
in `a` from the WdW equation so the leapfrog integrator sees a pure
second-order operator.

Because `a^{3/2}` is real and positive for `a > 0`:

- `|χ|² = a³ · |Ψ|²`: the reduced amplitude boosts the probability
  density by one factor of `a^{3/2}` per real component, consistent
  with the measure on minisuperspace.
- `arg(χ) = arg(Ψ)`: the **WKB phase has no `a^{3/2}` rescaling**.
  `S_phys = ℏ · arg(χ)` is the physical Hamilton–Jacobi action.

The visualisation path (`wheelerDeWitt/wkbStreamlines.ts`) multiplies
`arg(χ)` by `a^{3/2}` before computing gradients. This is a **rendering
choice** — not a physical correction — that steepens the gradient along
the scale-factor axis so streamlines push out of the near-`a_min`
bunching region. The physical extractor lives in
`srmt/wkbPhase.ts` and uses no `a^{3/2}` factor.

### Reduced WdW equation

    [ −∂²_a + (1/a²)(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ = 0

with

    U(a, φ) = −c_U · a² · (1 − (8πG/3) · a² · V(φ))
    V(φ)   = ½ m² (φ₁² + φ₂²) + Λ
    c_U    = 36 π²

### Sign conventions

- `U < 0` → **Lorentzian** (classically allowed) region. Solutions
  oscillate; WKB streamlines are defined.
- `U > 0` → **Euclidean** (classically forbidden) region. Solutions
  are a superposition of growing and decaying exponentials. The
  Hartle–Hawking and DeWitt proposals select the decaying branch; the
  Vilenkin proposal selects an outgoing-wave combination.
- `lorentzianMask` in the solver output is `1` where `U < 0`, `0`
  otherwise. Streamlines integrate only in masked cells.

## Numerical integration

The solver uses an **explicit second-order leapfrog in `a`** with
second-order central-difference φ-Laplacian (ghost-zero Dirichlet).

```text
χ(a+da, φ) = 2 χ(a, φ) − χ(a−da, φ) + da² · [ (1/a²)·∇²_φ χ − U·χ ]
```

### Stability

The explicit scheme has a CFL budget set by

    da² · (1/a_min²) · 8 / dφ²   ≤   WDW_CFL_BUDGET (= 4)

When violated, a dev-only `logger.warn` is emitted (rate-limited through
`WDW_CFL_WARN_BUDGET` so interactive slider sweeps do not spam the
console). The default configuration stays comfortably below the budget;
tests reset the budget via `resetCflWarningBudget()`.

### Euclidean region — split band strategy

Inside the Euclidean region the explicit leapfrog would otherwise
amplify the exponentially-growing WKB branch by ~10¹⁷ across a default
march. The solver splits each φ-column's Euclidean portion at a WKB
phase threshold and handles the two bands differently.

**Transition band** — cells with `0 < (2/3)·√α(φ)·(a−a_turn)^{3/2}
< WDW_WKB_MATCH_PHASE_THRESHOLD` (= 2 by default), where
`α(φ) = ∂_a U|_{a_turn} = 2·c_U·a_turn(φ)`. These cells are close
enough to the turning surface that the WKB prefactor `U^{−1/4}`
diverges and the Airy asymptotics do not apply. Numerical leapfrog +
soft absorber `exp(−η·√U·da)` with `η = 1.0` handles them. The
absorber is NOT branch-selective (it damps the physical decaying
branch by the same rate as the growing branch), but inside the narrow
transition band the amplitude mis-calibration is bounded because the
band itself is shallow (≤ a few slabs thick) and `√U·da` is small.

**Deep band** — cells with WKB phase since turning `≥ 2`. On the first
deep-band slab of each φ-column the solver captures the numerical
χ as the match coefficient and freezes it. Deeper slabs receive the
analytic one-dimensional WKB propagator

```text
χ(a, φ) = χ_match(φ) · (U_match / U(a))^{1/4} · exp(−(S_E(a) − S_E_match))
```

with `S_E(a, φ) = (3 / (4·V)) · (K·V·a² − 1)^{3/2}` in closed form
(see `wdwEuclideanWkbAction` in `constants.ts`). The analytic
propagator preserves whatever branch content the match cell captured
(HH's real decaying, Vilenkin's complex outgoing-wave, DeWitt's
linear-in-a) without numerical amplification. The match cell itself
is not overwritten — it is the boundary condition for the analytic
propagator downstream.

This makes the scheme **boundary-condition-agnostic**: the match
cell's complex value is the BC-specific branch mixture the numerical
integration produced. No per-BC code path is required.

**Residual validity**. `wdwOperatorResidual` accepts two kinds of
stencil:
- All three points Lorentzian → measures leapfrog fidelity in the
  oscillating region.
- All three points deep-band Euclidean → measures the deviation of
  the analytic propagator from the full PDE (sub-leading WKB
  corrections show up here, `O(1/U)` of the leading amplitude).

Transition-band stencils are still excluded because the absorber
there violates the raw PDE by construction.

**Clamp thresholds are gone**. `WDW_CHI_CLAMP`, `WDW_CHI_SOFT_CLAMP`,
`WDW_RESIDUAL_CLAMP_GUARD`, and the density-packer soft-clamp filter
have all been removed. The deep-band analytic tail produces
`|χ| ≲ O(1)` everywhere, bounded by the amplitude at the match cell.

**Future work — Stage-3 Airy matching**. The current transition-band
handler (numerical + absorber) is accurate to ~10% of the deep-band
amplitude, which is sufficient for visualisation. A full Airy-function
treatment in the transition band would deliver per-BC-correct branch
weighting (HH's pure Ai, Vilenkin's outgoing Ai+iBi combination,
DeWitt's linear-in-a matching). For a visualiser this level of
fidelity is overkill; for quantitative downstream consumers (e.g.
Bogoliubov-coefficient extraction, instanton action measurement) it
would be the next correctness frontier.

## Boundary conditions

| BC              | Key         | Interior `χ(a_min, φ)`                    | `∂_a χ(a_min, φ)`                           |
| --------------- | ----------- | ----------------------------------------- | ------------------------------------------- |
| Hartle–Hawking  | `noBoundary`| `exp(−\|S_E\|)` (Euclidean WKB amplitude) | `−(8πG/3)·a·√(1−(8πG/3)·a²V)·χ` (WKB decay) |
| Vilenkin        | `tunneling` | Gaussian × `exp(i·S_L)`, `S_L ≈ a³V/3`    | `i·a²·V·χ` (outgoing Lorentzian wave)       |
| DeWitt          | `deWitt`    | `a_min · exp(−½φ²)` (linear-in-a from 0)  | `χ(a_min) / a_min` (linear ramp from node)  |

Each generator lives in
`src/lib/physics/wheelerDeWitt/boundaryConditions.ts`. They consume
only the physical parameters `(m, Λ, a_min, phiExtent, Nphi)` so the
solver re-uses them unchanged across configs.

## Rendering pipeline

1. **Solver cache** (`WheelerDeWittStrategy`): `solveWheelerDeWitt`
   runs on the CPU when the WdW config hash changes. Output is a
   `Float32Array` of `2·Na·Nphi²` (interleaved re/im) plus a
   `Uint8Array` Lorentzian mask.
2. **Trajectory cache**: `integrateWkbTrajectories` consumes the
   solver output when the trajectory hash changes
   (streamlinesEnabled + streamlineDensity).
3. **Density packer**: `packWdwDensityGrid` trilinear-samples `χ` into
   the shared 96³ rgba16float density texture. Channel layout:
   - `R` = `|χ|² / max(|χ|²)` — normalised probability density
   - `G` = `log(|χ|²)` — log-density for volumetric exposure
   - `B` = `arg(χ)` — phase, used by the phase-density colour algorithm
   - `A` = `max(streamline, SRMT)` — overlay channel
   Both overlays fold into `R` and `G` as well so the raymarcher
   actually renders them (the raymarcher does not consult the alpha
   channel for visibility).
4. **SRMT coordinator**: when enabled, all three clocks are queued to
   a dedicated Web Worker sequentially — see the SRMT diagnostic
   section.

## SRMT diagnostic

The SRMT conjecture is a candidate framework for the "problem of time"
in quantum cosmology. The claim under test: the DeWitt-supermetric
timelike clock (scale factor `a`) uniquely produces a modular
Hamiltonian whose spectrum tracks the Hamilton–Jacobi generator of a
WKB slice. Alternative clocks (`φ₁`, `φ₂`) should yield POORER affine
alignment between the modular and HJ spectra.

The diagnostic is **display-only**: toggling SRMT or changing its
parameters never re-runs the WdW solver. It runs inside
`src/lib/physics/srmt/srmtDiagnostic.worker.ts` so the O(n·k·n²)
Lanczos eigendecomposition does not block the main thread.

### Pipeline

```text
WdW solver output (cached)
        │
        ▼
Schmidt decomposition of χ under the chosen clock → {s_n} descending
        │
        ▼                                  HJ operator on the clock slice
{s_n}                                      (5-stencil finite-difference)
        │                                          │
        ▼                                          ▼
modular spectrum K_n = −log(s_n² + ε)        Lanczos top-k eigenvalues
        │                                          │
        └──────────────────┬───────────────────────┘
                           ▼
                Affine-match quality q = Σ(K − (αE + β))² / Σ K²
                           │
                           ▼
              { schmidtValues, kSpectrum, hjSpectrum,
                affineMatchQuality, slicePlane, sliceK }
```

The dispatcher queues all three clocks (`a`, `φ₁`, `φ₂`) on a single
worker, selected-clock-first. The store receives per-clock quality as
replies arrive; the main `snapshot` field is swapped when the
selected-clock reply arrives.

### Interpretation

- `q < 0.1` → good alignment.
- `0.1 ≤ q < 0.3` → marginal.
- `q ≥ 0.3` → poor alignment.

The "champion" clock is the one with the minimum `q` that also leads
the runner-up by at least `DEFAULT_CHAMPION_TIE_TOLERANCE` (= 0.02).
Near-ties render the three rows without a champion highlight so the UI
does not flicker under noise.

## File map

```text
src/lib/physics/wheelerDeWitt/
├── constants.ts            Physics constants, U, V (single source of truth)
├── boundaryConditions.ts   Hartle–Hawking / Vilenkin / DeWitt initial data
├── solver.ts               Leapfrog integrator, operator residual
├── wkbStreamlines.ts       Trajectory integration, static + pulse overlays
├── densityGrid.ts          rgba16float packer with streamline + SRMT overlays
└── presets.ts              Curated scenario presets

src/lib/physics/srmt/
├── types.ts                SrmtClock, SrmtConfig, SrmtResult
├── constants / operators   (implicit — see below)
├── svd.ts                  Complex SVD via Hermitian-Gram + real embedding
├── schmidt.ts              χ-tensor reshape per clock, SVD entry point
├── modularHamiltonian.ts   K_n = −log(s_n² + ε)
├── hjOperator.ts           5-stencil H_HJ builder + top-k Lanczos
├── lanczos.ts              Full-reorth Lanczos for the top-k HJ eigenvalues
├── wkbPhase.ts             Physical WKB phase extractor (unwrap + smooth)
├── championClock.ts        Clock-winner selection rule (shared)
├── diagnostic.ts           End-to-end orchestrator
├── srmtDiagnostic.worker.ts Web Worker entry point
└── index.ts                Barrel export

src/rendering/webgpu/renderers/strategies/
├── WheelerDeWittStrategy.ts   Integrates solver cache + SRMT dispatcher
└── WheelerDeWittSrmtWorker.ts Worker lifecycle, queue, result cache
```

## Tests

- `src/tests/lib/physics/wheelerDeWitt/*`: solver, boundary conditions,
  WKB streamlines, density grid, SRMT overlay plumbing.
- `src/tests/lib/physics/srmt/*`: SVD, Lanczos, Schmidt reshape, modular
  Hamiltonian, HJ operator against harmonic-oscillator analytics, WKB
  phase, Bisognano-Wichmann cross-check, diagnostic composition.
- `src/tests/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy.*`:
  strategy end-to-end, SRMT worker dispatch, queue semantics.
- `src/tests/components/sections/Geometry/SchroedingerControls/*Srmt*`:
  UI panel rendering and store wiring.
- `scripts/playwright/wdw-srmt-*.spec.ts`: E2E rendering + physics.
