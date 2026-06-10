# Riemann Zeta "Arithmetic Horizon" mode (2026-06-10, commit 4a3a4ad7)

New analytic quantum mode `riemannZeta` (3D–11D): renders the prime ⇄ ζ-zero duality
as a volumetric quantum density. Spectral synthesis superposes eigenmodes exp(i·t_n·u)
of the first 100 Riemann zeros (Hilbert–Pólya) in the Berry–Keating coordinate u = ln r;
the Born-rule density localizes on shells at exactly the prime powers (explicit formula).
Dual primon-gas source (Source toggle), Hagedorn ignition Z(β)=ζ(β) (memoized
`hagedornPartitionGain`), H=xp dilation flow (genuine unitary evolution), Tangherlini
dilation-horizon core, ℓ/m lobes, cutaway wedge, Montgomery–Odlyzko GUE panel in
Analysis tab. 5 presets, rz_* URL params, ~60 fps.

## Architecture (mirrors coherenceHorizon; one new pattern)
- Structural twin of `coherenceHorizon` for EVERY touchpoint (registry id 11/13,
  dedicated main block `mainRiemannZeta.wgsl.ts`, buildShaderConfig early-return,
  compose skip of quantum-math+volume blocks, uniform scalar tail, UI gating,
  ColorAlgorithmSelector 'mixed' fallback, in-block color algos 3/4/5/19/21).
- NEW pattern: **analytic mode with a group-2 storage buffer**. `RiemannZetaStrategy`
  (isComputeMode=false) returns `additionalLayoutEntries` binding 2 (read-only-storage)
  + getBindGroupEntries with the LUT buffer; `buildBindGroupBlock` emits the
  `@group(2) @binding(2) var<storage, read> riemannLut: array<vec4f>;` declaration
  behind the isRiemannZeta flag (mutually exclusive with wigner cache bindings 2/3).
  CPU LUT (1024×vec4: rho, dRho/du, psiRe, psiIm) regenerated only when
  source|numZeros|beta hash changes, uploaded via queue.writeBuffer in executeFrame.
- World scale: shells at r = RIEMANN_WORLD_SCALE(0.3)·p^k; the packer shifts the
  uniform u-range by ln(s) so the shader needs no extra division.

## Physics/rendering lessons (hard-won, reusable)
1. Explicit-formula renderability: use the EQUAL-HEIGHT cosine sum −2Σ w_n cos(t_n u)
   whose peaks are Λ(n)/√n (≈flat, 0.49..0.71) — the e^{u/2}·Λ(n) form gives 9×
   outer-shell dominance and the inner primes vanish after normalization.
2. Window OUT u=0: all cos(t_n·0)=1 add coherently → giant non-arithmetic spike at
   r=1 with side-lobes; uMin = ln(1.35) > 0.
3. arg S(u) rotates at the mean zero ordinate (~50 rad per unit u) — far beyond march
   sampling; phase COLORING must use a slow carrier (rho·e^{i·5u}); density stays the
   honest reconstruction.
4. Radial-divergence-compensated absorption: optical depth in du = dr/r (the dilation
   parameter) → every shell contributes equal opacity; world-space absorption
   saturates on the geometrically-thicker outer shells.
5. LUT post-processing: BG_CUT 0.2 + gamma 2.0 (monotone → argmax-preserving) kills
   inter-shell ringing fog; zero density outside the LUT u-range (edge-clamp smears
   the boundary sample over the whole core/margin as opaque fog → "beige sphere" bug).
6. Cutaway wedge (x0>0 ∧ x1>0 skip) is what makes a nested-shell onion readable —
   rays to inner shells otherwise always cross every outer shell twice.
7. Primon weight log p·p^{−k(β−1/2)} (the n^{−1/2} = critical-line factor) makes the
   primes-source heights match the zeros-source exactly as β→1 — the duality is
   height-exact, not just position-exact.

## Maintenance notes
- `pnpm test:shaders` surface 'riemann-zeta' (enumerateRiemannZeta, d=3..11).
- Physics tests: src/tests/lib/physics/riemannZeta.test.ts (16) — prime localisation
  ±0.06, duality, Hagedorn monotonic/divergent, GUE-beats-Poisson, redshift, bounding.
- Folder-size moves done in the same commit: setters/horizonModes/ (CH+RZ setters),
  stores/utils/mergeDefaults/ (6 mergeWithDefaults satellites),
  setters/dimensionResize.ts + extended/schroedinger/hydrogenStateSanitize.ts
  (extracted from oversized files). quantumTypesHorizons.ts holds CH+RZ registry entries.
- Bundle budgets raised intentionally (+6.5 kB gzip total across 5 chunks).

## Follow-up threads
Nz=8→100 crystallisation animation; Montgomery pair-correlation overlay; Connes
absorption-spectrum variant; skybox lensing through the dilation horizon; optional
per-shell prime labels (2,3,5,7…).
