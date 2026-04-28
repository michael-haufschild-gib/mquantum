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
in `a` from the WdW equation so the solver sees a pure second-order
operator.

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
    V(φ)   = ½ m² φ₁² + ½ (m·α)² φ₂² + Λ
    c_U    = 36 π²

where `α = inflatonMassAsymmetry` defaults to `1`.

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

The first two `a` slabs are seeded by the boundary data and a Taylor
step. The Taylor acceleration follows the reduced equation sign:

```text
χ₁ = χ₀ + da·χ′₀ + ½da² · [ (1/a₀²)·∇²_φχ₀ + U₀·χ₀ ]
```

For slabs `ia ≥ 2`, Lorentzian bulk cells use a semi-implicit
Crank-Nicolson update for the φ-Laplacian and keep `U·χ` explicit at
the current slab:

```text
χ_next − (da²/2)·L_next·χ_next
  = 2χ_cur − χ_prev + (da²/2)·L_prev·χ_prev + da²·U_cur·χ_cur
L = (1/a²)·∇²_φ
```

The 2D solve is factorised by ADI into two 1D Thomas solves over
Neumann-Laplacian rows/columns. This is unconditionally stable for the
bulk homogeneous modes; the old CFL diagnostic remains only as an
accuracy warning.

### φ boundaries

`∇²_φ` uses second-order central differences with zero-flux Neumann
ghost cells:

```text
χ_{-1,j} = χ_{0,j},   χ_{N,j} = χ_{N−1,j}
χ_{i,-1} = χ_{i,0},   χ_{i,N} = χ_{i,N−1}
```

Edge cells evolve normally. They are not pinned to zero; the earlier
ghost-zero Dirichlet rule is gone.

### Euclidean region

The Euclidean (`U > 0`) region is still split per φ-column.

**Transition band** — cells between the turning surface and
`WDW_WKB_MATCH_PHASE_THRESHOLD` use the explicit recurrence plus the
soft absorber `exp(−η·√U·da)`. The absorber is not branch-selective and
intentionally violates the raw PDE, so residual checks exclude these
stencils.

**Deep band / Stage 2** — at the first deep-band slab, the solver
captures the current numerical `χ` as a match coefficient. Deeper slabs
receive the analytic WKB tail

```text
χ(a, φ) = χ_match(φ) · (U_match / U(a))^{1/4} · exp(−(S_E(a) − S_E_match))
```

This fallback is boundary-condition-agnostic: it preserves whatever
branch mixture reached the match cell.

**Stage 3 Airy/Langer overwrite** — after the march, each column with a
turning surface and at least two Lorentzian asymptotic samples
(`|ζ| ≥ AIRY_CONNECTION_LZETA_MIN`, currently `1.5`) is refit to the
Langer basis and every Euclidean cell in that column is overwritten:

```text
χ(a) = (ζ/U)^{1/4} · [ c₁·Ai(ζ) + c₂·Bi(ζ) ]
```

Branch policy: Hartle-Hawking and DeWitt discard `Bi` (`c₂ = 0`);
Vilenkin enforces the outgoing combination (`c₂ = +i·c₁`). Columns with
no viable extraction keep the Stage-2 values. This includes no-turning
columns, turnings outside the grid, and high-Λ / low-`|ζ|` columns where
the Lorentzian side is too shallow for asymptotic fitting.

`WDW_CHI_CLAMP`, `WDW_CHI_SOFT_CLAMP`, `WDW_RESIDUAL_CLAMP_GUARD`, and
the density-packer soft-clamp filter are removed.

## Boundary conditions

| BC              | Key          | Current seed at `a_min` |
| --------------- | ------------ | ----------------------- |
| Hartle–Hawking  | `noBoundary` | `V > 0`: Langer-uniform pure `Ai`; `V = 0`: `√a·J_{1/4}` with Gaussian gauge envelope; `V < 0`: real standing wave `\|U\|^{-1/4}·cos Φ_L` with Gaussian gauge envelope. |
| Vilenkin        | `tunneling`  | `V > 0`: Langer-uniform `Ai + i·Bi`; `V = 0`: outgoing Hankel `H_{1/4}^{(1)}` with Gaussian gauge envelope; `V < 0`: outgoing WKB `\|U\|^{-1/4}·exp(+iΦ_L)`. |
| DeWitt          | `deWitt`     | Implements `χ(0, φ) = 0`; bootstraps finite `a_min` with `χ(a_min, φ) = a_min·exp(−½(φ₁²+φ₂²))` and `∂_aχ(a_min, φ) = exp(−½(φ₁²+φ₂²))`. |

Each generator lives in
`src/lib/physics/wheelerDeWitt/boundaryConditions.ts`; HH/Vilenkin
delegate to `hhLangerSeed.ts`. DeWitt is an enforced node plus Gaussian
derivative seed, not a fully determined exact proposal.

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
   - `R` = clean `rhoNorm = clamp(|χ|² / maxRho_render, 0, 1)`.
   - `G` = `log(R + 1e-10)`.
   - `B` = `arg(χ)`.
   - `A` = `max(streamlineAlpha, srmtAlpha)`.
   `R` and `G` never include overlays. WKB/SRMT overlays are composited
   by the WdW shader branch from positive `A`, before density alpha, so
   density gain, contrast, adaptive stepping, and empty-space skipping
   continue to operate on clean `|χ|²`.
4. **SRMT coordinator**: when enabled, all three clocks are queued to
   a dedicated Web Worker sequentially — see the SRMT diagnostic
   section.

World mapping: the renderer uses normalized display axes for WdW:

```text
densityGridHalfExtent = [ boundingRadius, boundingRadius, boundingRadius ]
boundingRadius = max(0.25, aMax)
```

The texture coordinates still map to the physical solver ranges
`a ∈ [aMin, aMax]` and `φ ∈ [-phiExtent, +phiExtent]`, but the displayed
volume is intentionally normalized so the `a` axis does not collapse
into a thin slab beside the wider `φ` ranges. This is a rendering
normalization, not a metric-faithful embedding of minisuperspace.
`inflatonMassAsymmetry` still changes the solver potential and cached
`χ`; curated presets reset `α = 1`, and `α ≠ 1` remains an SRMT
discriminator experiment.

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
├── hhLangerSeed.ts         HH / Vilenkin Langer-uniform seed dispatch
├── exactColumnSolution.ts  Column reference solutions by sign of V
├── implicitBulk.ts         Crank-Nicolson ADI Neumann bulk solve
├── airyConnection.ts       Stage-3 Airy/Langer extraction + overwrite
├── solver.ts               Solver orchestrator, bands, Stage-2 fallback
├── solverDiagnostics.ts    Operator residual and output diagnostics
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
  - `analyticFixtures.test.ts`: published Bessel-table pin (1e-10),
    Wronskian identity (1e-12 series / 5e-8 asymptotic), free-case
    ODE residual.
  - `solverAnalytic.test.ts`: solver-vs-fixture pointwise comparison
    on the three minisuperspace regimes (free, AdS, dS) using the
    test-only `customBoundary` constant-φ slab. See
    `docs/physics/wheeler-dewitt-analytic-fixtures.md` for the full
    derivation, BC↔Bessel-coefficient mapping, and tolerance
    rationale.
- `src/tests/lib/physics/srmt/*`: SVD, Lanczos, Schmidt reshape, modular
  Hamiltonian, HJ operator against harmonic-oscillator analytics, WKB
  phase, Bisognano-Wichmann cross-check, diagnostic composition.
- `src/tests/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy.*`:
  strategy end-to-end, SRMT worker dispatch, queue semantics.
- `src/tests/components/sections/Geometry/SchroedingerControls/*Srmt*`:
  UI panel rendering and store wiring.
- `scripts/playwright/wdw-srmt-*.spec.ts`: E2E rendering + physics.
