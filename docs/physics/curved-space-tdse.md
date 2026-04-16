# Curved-Space TDSE

## Overview

The curved-space TDSE feature solves the time-dependent Schrödinger equation on
a fixed background spatial metric via the Laplace–Beltrami kinetic operator.
The lattice carries a 3D complex wavefunction ψ(x, t); the kinetic term is
replaced by the covariant form that accounts for the metric g_μν on a
chart-aligned grid, so the dynamics see curvature through the coefficients of
the discretized Laplacian and the proper volume element √|g|.

The feature supports eight metric kinds — flat (δ_μν), Morris–Thorne wormhole,
Schwarzschild exterior (isotropic coordinates), de Sitter (time-dependent flat
FRW), anti-de Sitter (Poincaré half-space), 2-sphere compactification, flat
3-torus (periodic), and a double-throat wormhole. Flat and torus go through the
existing split-step FFT pipeline unchanged; every other metric uses a
position-space finite-difference Laplace–Beltrami discretization with a
classical RK4 integrator.

This is **not** a QFT-in-curved-spacetime calculation. There is no
backreaction, no particle creation from vacuum modes, no classical geodesic
integration, no Einstein field equation solution, no spinor structure, and no
(3+1) Lorentzian metric. The "time" in TDSE is the non-relativistic Schrödinger
parameter; the metric is purely spatial, sourced as a pedagogical background
rather than evolved.

## Mathematical Core

The curved-space Hamiltonian on a spatial manifold with diagonal metric is

```
Ĥ = −(ℏ²/2m) · (1/√|g|) · ∂_μ [ √|g| · g^μν · ∂_ν ψ ] + V·ψ
```

For diagonal metrics (all supported kinds), the cross terms vanish and the
kinetic operator becomes a sum over axes of the conservative-form derivative
`(1/√|g|) ∂_μ [ √|g| g^μμ ∂_μ ψ ]`. Flat-space reduction δ_μν ⇒ g^μμ = 1 and
√|g| = 1 recovers `−(ℏ²/2m) ∇²ψ` exactly.

Inner products use the proper volume element:

```
⟨φ | ψ⟩_g = ∫ φ*(x) ψ(x) √|g(x)| dⁿx
```

Norm conservation, expectation values, and the proper-volume density view all
use this measure.

## Supported Metrics

| kind | Params | Line element / inverse metric | Ricci scalar | Integrator | Valid domain / clamps |
|---|---|---|---|---|---|
| `flat` | — | ds² = δ_ij dxⁱ dxʲ; g^μμ = 1 | 0 | Split-step FFT | All dimensions |
| `morrisThorne` | `throatRadius b₀` | ds² = dl² + r(l)² dΩ²; r(l)=√(b₀²+l²); axis 0 = l | 2(1−r'²)/r² − 2r''/r | RK4 + FD | b₀ ∈ [0.1, 5.0]; latticeDim ≥ 2 (Morris & Thorne, *Am. J. Phys.* 56, 395, 1988) |
| `schwarzschild` | `schwarzschildMass M` | g_ij = ψ⁴δ_ij; ψ = 1 + M/(2r); isotropic | 0 (vacuum); Kretschmann K = 48M²/r⁶ | RK4 + FD | M ∈ [0.01, 10.0]; r clamped to max(M/2, 0.01) (Wald §6.1) |
| `deSitter` | `hubbleRate H` | g_ij = a(t)² δ_ij; a(t)=exp(H·t) | n(n−1)H² (n = latticeDim) | RK4 + FD, stage-time sampled | H ∈ [0, 5]; time-dependent (Carroll §8) |
| `antiDeSitter` | `adsRadius L` | g_ij = (L/z)² δ_ij; axis 0 = z > 0 | −n(n−1)/L² | RK4 + FD | L ∈ [0.1, 10]; z clamped to ≥ 0.05 (Carroll §8) |
| `sphere2D` | `sphereRadius R` | ds² = R² (dθ² + sin²θ dφ²); axes (θ,φ) = (1,2) | 2/R² | RK4 + FD | R ∈ [0.1, 10]; latticeDim ≥ 3; θ clamped to [ε, π−ε], ε = 0.05 (Carroll §3.7) |
| `torus` | `torusPeriod [L₀,L₁,L₂]` | flat δ_ij with xⁱ ≡ xⁱ + Lⁱ | 0 | Split-step FFT (periodic) | Lⁱ ∈ [0.5, 20] |
| `doubleThroat` | `doubleThroatSeparation s`, `doubleThroatRadius b₀` | ds² = dl² + r(l)² dΩ²; r(l) smoothed Morris–Thorne with shoulders at ±s/2 | Sum of two MT Ricci contributions at l ∓ s/2 | RK4 + FD | s ∈ [0.2, 20]; b₀ ∈ [0.1, 5.0]; latticeDim ≥ 2 |

## Integrator Selection

Integrator kind is chosen automatically from the metric kind:

- **Flat + Torus** → existing Strang split-step FFT path
  (`src/lib/physics/tdse/splitStep.ts` and the GPU FFT compute passes).
  Invariant: non-curved presets must produce identical trajectories before and
  after the v2 landing. The split-step path does not go through the curved
  kinetic module at all.
- **All other metrics** → classical 4-stage RK4 with a finite-difference
  Laplace–Beltrami kinetic applied in position space. The CPU reference lives
  in `src/lib/physics/tdse/metrics/curvedIntegratorRef.ts`; the GPU mirror
  lives in `src/rendering/webgpu/passes/TDSECurvedIntegrator.ts`. Both drive
  the same WGSL kinetic kernel in
  `src/rendering/webgpu/shaders/schroedinger/compute/tdseCurvedKinetic.wgsl.ts`.

The FD stencil is the standard 2nd-order central difference on a staggered
arrangement: fluxes `F_μ = √|g| g^μμ (∂_μ ψ)` are evaluated on half-integer
faces, then `∂_μ F_μ / √|g|` gives the kinetic action at the cell centre.

## Time-Dependent Metrics

Only de Sitter is time-dependent in v2. RK4 samples the metric at four stage
times within a step (t, t+dt/2, t+dt/2, t+dt); the GPU integrator uploads four
`stageIndex{0..3}` uniform buffers so the shader can evaluate a(t)=exp(H·t) at
the correct per-stage time.

**Known limitation**: When `stepsPerFrame > 1`, all steps within a single
animation frame currently share the same frame-start `simTime` for their stage
indexing. The drift across a frame is O((H·dt·stepsPerFrame)²) and is small
whenever H·dt ≪ 1 (true for all shipped presets). Documented rather than fixed
because correcting it would require per-step uniform rewrites and the error is
below the integrator's own RK4 truncation error at default settings.

## Boundary Conditions

| Kind | Boundary treatment |
|---|---|
| `flat`, `morrisThorne`, `schwarzschild`, `deSitter`, `sphere2D`, `doubleThroat` | Dirichlet (ψ = 0 outside the grid). Combined with an optional complex absorbing potential of width `absorberWidth` for packet disposal. |
| `torus` | Periodic wrap on all axes (CPU ref and WGSL shader), period `torusPeriod`. |
| `antiDeSitter` | Hard clamp at z_min = 0.05 (IR cutoff). Dirichlet on the clamped surface; this behaves like a reflecting boundary near the conformal boundary z→0. **Not** a conformal / holographic boundary condition. |
| `sphere2D` φ axis | Dirichlet — **not** periodic. In v2a the chart is a flat 2D chart of the sphere with θ-pole buffers; true φ periodicity was deferred. Keep packets away from the axis-2 boundaries. |

Sphere2D pole buffer ε = 0.05 on θ avoids the 1/sin²θ singularity at the
poles; packets spending time within ε of a pole will see the frozen metric and
are physically unreliable.

## Visualization

Two render-side toggles were added in Wave 6:

- **Ricci-scalar overlay** (`showCurvatureOverlay`, `curvatureOverlayOpacity`)
  — diverging colormap (cool → blue, hot → red) applied to the sampled
  `ricciScalar(cfg, x, t)` field and blended over the wavefunction density.
  Opt-in; default off. Useful for making invariant curvature visible on sight,
  e.g. the red wash on the `sphereCompactification` preset.
- **Proper-volume density view** (`densityView: 'proper'`) — multiplies |ψ|²
  by √|g| before tonemapping so the displayed density is the proper-volume
  integrand. On strongly curved regions (e.g. AdS near z = 0.05) this compresses
  the bulk and expands the boundary; on expanding de Sitter backgrounds it
  visibly stretches the packet with a(t).

Both bake into `src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts`.

**Hazard**: Auto-scale combined with proper-volume view on highly curved
regions can wash out the packet (√|g| varies by orders of magnitude across the
grid for Schwarzschild near r=M/2 or AdS near z=0.05). Users seeing a blank
field should disable auto-scale or switch back to coordinate density.

## Known Limitations

- **Stage-time drift for de Sitter** across `stepsPerFrame > 1` (see above).
  Small at shipped defaults, O((H·dt·stepsPerFrame)²).
- **sphere2D φ boundary is Dirichlet, not periodic.** Packets must stay
  bounded away from the axis-2 grid edges.
- **AdS boundary treated as Dirichlet at z = 0.05.** Produces
  reflecting-like behaviour, not a conformal boundary condition; this is not
  an AdS/CFT demo.
- **doubleThroat radius** uses a closed form with one central basin and two
  soft shoulders at ±s/2, rather than two fully separated local minima. The
  plan's proposed form did not yield two minima; the shipped form still models
  a "twin-constriction" geometry but the shape is r(0) < r(±s/2) < r(∞).
- **No metric-aware split-step.** All curved metrics go through RK4 (≈ 4× the
  per-step cost of flat FFT — four stages × comparable work per stage). Metric
  reuse of the flat FFT was deferred; the v2 plan's "split-step for static
  metrics" item did not ship.
- **No backreaction, no spinors, no (3+1) spacetime.** Purely a spatial 3-slice
  with a non-relativistic Schrödinger equation.

## Performance Notes

RK4 on the curved FD Laplace–Beltrami is approximately 4× the per-step cost of
the flat split-step FFT path: four stages, each doing one FD stencil evaluation
plus one pointwise multiply. Memory bandwidth on the stencil dominates; the
metric is sampled per-step (or per-stage for de Sitter) but its evaluation cost
is negligible next to the stencil.

Preset defaults (`dt`, `stepsPerFrame`, `gridSize`) were chosen so curved
presets run interactively (≥ 30 fps) on a mid-tier discrete GPU at the default
[128, 64, 64] or [64, 64, 64] grid. Users lifting `gridSize` above
[128, 128, 128] should proportionally reduce `stepsPerFrame` or `dt` to keep
frames under budget.

## Preset Index

| id | Metric | Physics summary | What it is not |
|---|---|---|---|
| `wormholeWavepacket` (v1) | morrisThorne | Gaussian packet propagating along the proper-distance axis of a Morris–Thorne throat, showing partial reflection and curvature-induced dispersion at the bottleneck. | Not a traversable wormhole trip; a single ψ on a single connected 3-slice. |
| `wormholeEntangledPair` | doubleThroat | Two Gaussians launched outward on a double Morris–Thorne geometry, each reflecting off the opposite throat shoulder. | Not a Bell-pair experiment; two classically-separable packets on a shared background. |
| `schwarzschildOrbit` | schwarzschild | Packet launched tangentially on a Schwarzschild spatial slice, showing curvature-induced lensing and dispersion around r = M/2. | Not a classical geodesic orbit; no proper-time evolution along a worldline. |
| `gravitationalRedshift` | schwarzschild | Phase view showing de Broglie wavelength varying with depth through the ψ⁴ conformal factor. | Not a proper-time clock comparison; a (3+1) metric is required for a true redshift measurement. |
| `cosmologicalRedshift` | deSitter | Packet in expanding FRW space; physical wavelengths grow as a(t) = exp(H·t). Uses proper-volume density view to make the stretching visible. | Not a QFT-in-curved-spacetime calculation; no particle creation, no vacuum states. |
| `sphereCompactification` | sphere2D | Packet on a 2-sphere of radius R in a (θ, φ) chart, with the Ricci overlay showing the uniform R = 2/R² curvature. | Not a Kaluza–Klein reduction; just the Laplace–Beltrami operator on a 2-sphere chart. |
| `torusEigenstates` | torus | Resonant plane wave with `k = 2` on a period-π 3-torus, illustrating momentum quantization on a compact space. | Not a compactified-universe model; period π is a pedagogical choice. |
| `adsBoundaryBounce` | antiDeSitter | Packet launched toward the AdS conformal boundary on the Poincaré chart, showing reflective-like behaviour from the steepening (L/z)² factor. | Not an AdS/CFT holographic-duality demo; Schrödinger on a fixed AdS spatial slice. |

## URL Parameter Reference

| Param | Type | Range | Meaning |
|---|---|---|---|
| `tdse_metric` | enum | flat, morrisThorne, schwarzschild, deSitter, antiDeSitter, sphere2D, torus, doubleThroat | Selects the active spatial metric kind. |
| `tdse_b0` | float | [0.1, 5.0] | Morris–Thorne throat radius b₀. |
| `tdse_sm` | float | [0.01, 10.0] | Schwarzschild mass M (geometrized G = c = 1). |
| `tdse_h` | float | [0, 5] | de Sitter Hubble rate H; a(t) = exp(H·t). |
| `tdse_ads` | float | [0.1, 10] | Anti-de Sitter radius L. |
| `tdse_sr` | float | [0.1, 10] | 2-sphere radius R. |
| `tdse_tp0` | float | [0.5, 20] | Torus period along axis 0. |
| `tdse_tp1` | float | [0.5, 20] | Torus period along axis 1. |
| `tdse_tp2` | float | [0.5, 20] | Torus period along axis 2. |
| `tdse_dts` | float | [0.2, 20] | Double-throat separation s between the two shoulders along axis 0. |
| `tdse_dtb` | float | [0.1, 5.0] | Double-throat shared radius (falls back to `tdse_b0`). |
| `tdse_co` | 0/1 | — | Ricci-scalar curvature overlay toggle. |
| `tdse_co_op` | float | [0, 1] | Curvature overlay opacity. |
| `tdse_dv` | enum | coordinate, proper | Density view: coordinate |ψ|² or proper-volume √|g|·|ψ|². |

Metric-specific params are only emitted when the active `tdse_metric` needs
them; unknown params are silently ignored (forward-compatible per the URL
serializer contract).

## Code Pointers

- `src/lib/physics/tdse/metrics/types.ts` — `MetricKind`, `MetricConfig`,
  clamp bounds, `isTimeDependentMetric`, `hasPeriodicBoundary`,
  `describeMetric`.
- `src/lib/physics/tdse/metrics/evaluator.ts` — pure `sampleMetric`,
  `ricciScalar`, `kretschmannScalar` per metric kind.
- `src/lib/physics/tdse/metrics/curvedKineticRef.ts` — CPU reference for the
  FD Laplace–Beltrami kinetic action.
- `src/lib/physics/tdse/metrics/curvedIntegratorRef.ts` — CPU RK4 reference
  integrator; used as the GPU oracle in unit tests.
- `src/lib/physics/tdse/metrics/index.ts` — barrel of the module.
- `src/lib/physics/tdse/curvedMetricPresets.ts` — the seven v2 scenario
  presets.
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseCurvedKinetic.wgsl.ts`
  — WGSL FD Laplace–Beltrami kinetic kernel.
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseCurvatureHelpers.wgsl.ts`
  — metric-sampling helpers shared by the kinetic and visualization shaders.
- `src/rendering/webgpu/passes/TDSECurvedIntegrator.ts` — GPU RK4 driver for
  the curved integrator path.
- `src/components/sections/Geometry/SchroedingerControls/MetricControls.tsx`
  — UI surface for metric selection and parameter sliders.

## References

- Morris, M. S. & Thorne, K. S. *Wormholes in spacetime and their use for
  interstellar travel: A tool for teaching general relativity.* Am. J. Phys.
  **56**, 395 (1988). DOI: 10.1119/1.15620. (Morris–Thorne throat; double-throat.)
- Wald, R. M. *General Relativity.* University of Chicago Press, 1984.
  (§6.1: Schwarzschild isotropic coordinates, Kretschmann scalar.)
- Carroll, S. M. *Spacetime and Geometry: An Introduction to General
  Relativity.* Addison-Wesley, 2004. (§3.7: 2-sphere metric and curvature;
  §8: de Sitter and anti-de Sitter spacetimes.)
- Birrell, N. D. & Davies, P. C. W. *Quantum Fields in Curved Space.*
  Cambridge University Press, 1982. (Context for what this feature
  deliberately does **not** do — QFT vacuum structure, particle creation.)
