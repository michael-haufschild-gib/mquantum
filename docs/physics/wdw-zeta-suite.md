# The Wavefunction of the Arithmetic Universe — WDW ⊗ ζ Visualization Suite

**Status**: design locked 2026-06-22. Ten new analytic quantum modes that merge
the **Wheeler–DeWitt superspace** with the **Riemann zeta function**.

## Thesis & motif

Guiding motif (immutable): **"it is a constraint, not a flow."**

Sharper still: **visualize constraint, not deduction or flow.** Superspace and ζ
are a landscape/geometry where there is **no other option to be this way** — not
*generated* by a process, but the *only* configuration their world permits.
Inevitability made visible. This is the ∃!-rigidity lesson: an off-line zero
would be an extra degree of freedom the completed object has no room to absorb;
the structures look **solved, locked, forced** — pinned points, perfect tilings
that admit no gap, forced shells, crystalline equilibria. **The math must be
correct; it need not "make sense"** — physical nonsense is allowed in service of
beauty, provided every ingredient is a real theorem-grade object.

Licensed to wander the whole arithmetic landscape, not just ζ: the critical
line and its neighbourhood, **Frobenius / weight-cohomology purity** (Deligne:
eigenvalues forced onto `|α| = q^(w/2)` — proven RH over 𝔽_q), **𝔽₁** and the
adelic/absolute geometry, the negative-norm ghost index **κ₋**, and
**hypertranscendence** (Hölder: ζ satisfies no algebraic differential equation —
it cannot be produced by any finite flow; it is a pure constraint-object). These
are the doctrinal backbone of "constraint, not flow."

The Wheeler–DeWitt equation `Ĥψ = 0` has no external clock — dynamics is not
*generated*, it is *selected* by the constraint plus boundary conditions and the
physical inner product. Transferred to ζ (per the hypertranscendence/metaphor
notes): the raw amplitude `ζ(s)` is the *kinematic* wavefunction; the completed

```
ξ(s) = ½ s(s−1) π^(−s/2) Γ(s/2) ζ(s),    ξ(s) = ξ(1−s)
```

is the *physical* state. The functional equation is its WDW constraint, the
Γ-factor its boundary condition, the Euler product its local matter content, the
explicit formula its holographic dictionary, and **RH is the statement that the
completed state has no negative-norm / off-seam ghost sectors (κ₋ = 0)** — every
genuine spectral degree of freedom lies on the constraint seam `Re s = ½`.

Every mode renders a *static constraint structure*. Animation is permitted only
as (a) the shared turntable (object rotation for 3D legibility, driven by
`animationStore` — never a bespoke shader spin), or (b) slicing a frozen block
(relational time). **No mode may read as a one-parameter time-flow.**

## Engineering backbone (shared, performant)

All ten modes use the proven **CPU-bake → 3D RGBA8 texture → trilinear raymarch**
pattern (same family as `modularKnot`): the heavy math runs once on the CPU /
in `bake*` functions whenever a bake-affecting field changes, producing an `N³`
RGBA8 volume (RGB = density-weighted color, A = density). The shader does one
`textureSampleLevel` per march step → 45+ fps independent of math complexity.

Shared helpers (built once):
- `src/lib/physics/wdwZeta/volumeBake.ts` — splat / normalize / signed-diverging
  & thermal & viridis color ramps / complex-ζ-ξ-Γ (Riemann–Siegel + Euler–
  Maclaurin) / modular-domain reduction / explicit-formula phasor sums.
- `BakedVolumeStrategy` base — 3D texture lifecycle (create / upload / re-bake
  hash / dispose) + group-2 binding-2 texture & binding-3 sampler.
- `bakedVolumeRaymarch.wgsl.ts` — the shared raymarch loop + color-algorithm
  emission dispatch; each `mainXxx.wgsl.ts` wraps it with a mode emission style.

Cross-cutting feature compliance (per mode):
- **Emission/glow**: read `schroedinger.emissionIntensity` (= shared
  `appearanceStore.faceEmission`, Advanced ▸ "Emission & Rim") × `densityGain`.
  NO geometry-tab glow slider, NO bespoke glow config field.
- **Rotation**: the shared `animationStore` turntable rotates the object
  modelMatrix; model-space-sampled volumes inherit it. NO bespoke `flow` spin.
- **Color algorithms**: gate via `getAvailableColorAlgorithms()` allowlist; each
  mode whitelists only meaningful algorithms (≥ `mixed`,`phase`,`blackbody`,
  `viridis`,`densityContours`), implemented in the shared emission dispatch.
- **Iso mode**: disabled via `supportsSchroedingerSurfaceMode → false` for ALL
  ten suite modes (gated by `isWdwZetaMode`). Each renders through the shared
  dedicated volumetric block — which already presents the structure as a glowing
  surface/relief — so the shared density-grid isosurface pipeline never composes
  and the surface toggle would be a no-op.
- **Analysis tab**: a tailored `*AnalysisContent` per mode with a real readout
  (zero counts, GUE spacing, Möbius mean, spectral staircase, κ₋ …); the generic
  cross-section is suppressed.
- **Advanced render**: only the shared "Emission & Rim" group is shown (SSS /
  Volume-Effects hidden) — render controls live in Advanced, not Geometry.
- **Presets**: ≥ 2 scenario presets each, in the shared ScenarioSelector.
- **URL**: a `*Serializer.ts` with disjoint short keys, gated on the active mode.

## The ten modes

| # | Key | Name | WDW side | ζ side | Form |
|---|-----|------|----------|--------|------|
| 1 | `constraintSeam` | The Constraint Seam | functional eq = WDW constraint; no-boundary; self-adjoint boundary; Davenport–Heilbronn = wrong boundary | ξ(s)=ξ(1−s); zeros pinned to Re s=½; off-line ghost zeros | luminous relief folded about a mirror canyon (the seam); **iso-enabled** |
| 2 | `moebiusNoBoundary` | The Möbius No-Boundary Sum | Hartle–Hawking ψ_HH as Poincaré/Möbius sum over modular images (Godet 2025) | μ(n)/n weights; squarefree-void lacework; SL(2,ℤ) tessellation | hyperbolic arithmetic mandala on the Poincaré disk |
| 3 | `forcedCell` | The Forced Cell | xp dilation = the forced near-horizon constraint; the area quantum 2πℏ is the *only* permitted cell | H=½(xp+px); Weyl term N(E); hyperbolae xp=E_n at zero heights tiled into rigid Planck cells | a locked lattice of Planck cells along the xp hyperbolae — no other tiling possible |
| 4 | `turningSurface` | The Turning Surface | minisuperspace turning surface U(a,φ)=0; Airy fold caustic (allowed/forbidden) | explicit formula ψ(x)=x−Σ x^ρ/ρ scores prime-ridges on the allowed side | glowing curved fold/cliff with Airy interference fringes |
| 5 | `primonMultiverse` | The Third-Quantized Multiverse | third quantization ψ̂=Σ(â u+â†u\*); universe–antiuniverse pairs | primon gas Z(β)=ζ(β); Hagedorn ignition β→1⁺ | sparse prime-constellation lattice igniting into a Hagedorn firestorm |
| 6 | `frobeniusWheel` | The Frobenius Wheel | weight filtration foliates superspace; each weight = a frozen shell of the constraint | Deligne purity: Frobenius eigenvalues on H^w forced onto `\|α\|=q^(w/2)`; RH-over-𝔽_q (proven); the archetype of "zeros have no choice" | nested luminous weight-circles in ℂ with pinned eigenvalue-points, lifted into 3D shells by weight |
| 7 | `dewittCone` | The DeWitt Null Cone | indefinite supermetric light-cone; Ĥψ=0 mass-shell; conformal mode = sole timelike axis | ζ-zero standing-wave latitude rings on the cone | open double null cone ringed by spectral latitudes |
| 8 | `selbergSpectrum` | The Selberg Length Spectrum | WDW Laplacian on hyperbolic minisuperspace ℍ/Γ; trace formula; true Hilbert–Pólya | Selberg zeta; closed-geodesic lengths ⇄ eigenvalues | embedded hyperbolic surface threaded with glowing geodesics + dual comb |
| 9 | `adelicWavefunction` | The Adelic Wavefunction | adelic quantum cosmology ψ=ψ_∞ Π_p ψ_p; Connes modular flow canonical (no clock) | p-adic Bruhat–Tits trees per prime; Euler product; Sonin cokernel | luminous fractal forest of p-adic trees → an Archimedean core |
| 10 | `weilPositivity` | The Ghost Sector | norm of the no-boundary state (Cotler–Jensen); κ₋ = negative-norm ghost count | Weil explicit-formula quadratic form Q_W; RH ⟺ Q_W ⪰ 0 | luminous positive-definite landscape with (counterfactual) ghost wells |

Each mode has a signature **interactive scientific control** that changes the
math (not just the look): #1 ghost-sector injection, #2 Möbius cutoff N, #3
Planck-cell density / level count, #4 m²/Λ potential & explicit-formula term
count, #5 β (temperature) toward Hagedorn, #6 base prime q & max weight w (the
purity shells), #7 number of spectral rings, #8 genus / geodesic-length cutoff,
#9 prime set & tree depth, #10 off-line-zero injection (κ₋ probe).

## Build order

0. Shared foundation (`volumeBake.ts`, `BakedVolumeStrategy`, raymarch helper).
1. Mode #1 end-to-end + e2e verify (validates the whole pipeline).
2–10. Remaining modes, reusing the foundation.
Final: e2e suite — every mode renders pixels AND holds > 40 fps.

## 4D extension (the wild fourth degree of freedom)

Every 3D-only ζ/prime mode (the 11 suite modes + Hilbert–Pólya + Modular Knot)
now supports **dimension 4** (registry `dimensions.max = 4`). The 4th degree of
freedom is the genuine W axis of the N-D slice basis: the shared shader extracts
`w` from basis row 3 (`fragmentMain`), and a baked dimension signal (`wzDim()` /
`wzFourth()`, a one-vec4 LUT slot at `WDW_ZETA_DIM_OFFSET`) tells each `wzMapN`
it is at dim 4 so its **wild form shows at rest**, with `w` adding real 4D motion
under an XW/YW/ZW rotation. At dim 3 the W-row is null and `wzFourth()=0`, so the
3D render is byte-identical (the 4D code is gated off). Per-mode wild forms:

| Mode | 4D form |
|---|---|
| constraintSeam | vortex-pillar colonnade (one lit column per pinned zero) |
| moebiusNoBoundary | hyperbolic 3-ball Fabergé shells (μ-void lacework) |
| forcedCell | phase-cell basket-weave (conjugate ±Eₙ hyperbola looms) |
| turningSurface | swallowtail-pleated caustic |
| primonMultiverse | Hopf-fibered multiverse (3 interlinked rings) |
| frobeniusWheel | Hopf-linked Clifford tori |
| dewittCone | de Sitter hyperboloid hourglass |
| selbergSpectrum | knotted geodesic horn-torus |
| adelicWavefunction | wound 4D hyper-fractal |
| weilPositivity | rippled positivity hyper-bowl + ghost wormhole |
| fieldOneElement | cyclotomic spiral-rose |
| hilbertPolya | Matsubara veil-lift (θ shifted by ω = w) |
| modularKnot | Rademacher screw (w winds the tangle; auto-spin removed, basis rotation) |

**Shader file split**: `mainWdwZetaVolume.wgsl.ts` exceeded the 600-line cap after
the wild forms, so the SDF builders (`wzMap0`–`wzMap10` + dispatch + normal/AO)
moved to `mainWdwZetaSdf.wgsl.ts`, composed between `wdwZetaLib` and the main
fragment block. `mainWdwZetaVolume` keeps colour + `fragmentMain`.

**Scenarios are dimension-guarded**: each mode gets one 4D-only scenario (`*4D`
id) carrying `dimension: 4` + an initial W-rotation; the suite/HP/Knot setters
apply that dimension+rotation, and `ScenarioSelector.zetaGroup` filters the menu
by the current dimension (3D scenarios at dim 3, 4D scenarios at dim 4; modes
with no 4D scenario — riemannZeta, bifurcationHorizon — stay unfiltered).
Lighting lesson: large-area emissive blooms to white; the 4D forms use LIT
surfaces for area and thin emissive only for accents (tubes/beads/rings).
