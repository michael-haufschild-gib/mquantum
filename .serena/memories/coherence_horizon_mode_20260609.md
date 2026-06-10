# Coherence Horizon mode (2026-06-09, commits 6b42ac0d + b493abcd)

New analytic quantum mode `coherenceHorizon` — Coherence-Sourced Gravity (CSG): a two-branch cat state whose l1-norm branch coherence C = 1−δ sources a Schwarzschild–Tangherlini horizon r_h = horizonScale·C^(1/(d−2)), d ∈ [3,11]. Dedicated geodesic WGSL main block (`mainCoherenceHorizon.wgsl.ts`) integrates null geodesics via the Binet vector form a = −(d/2)·μ·h²·r̂/r^(d+1): horizon shadow, photon ring at r_ph = r_h(d/2)^(1/(d−2)), Einstein arcs, √f redshift. δ=1 evaporates the horizon exactly while diagonal density is invariant.

## Architecture decisions (reusable for future dedicated-main-block modes)
- The mode owns a **dedicated main block** selected first in `selectMainBlock` (composeConfig.ts); compose.ts skips quantum-math + volume blocks entirely via `isCoherenceHorizon` (tiny shader, no Metal occupancy cliff).
- `buildShaderConfig` has a dedicated early-return branch forcing off densityGrid/eigencache/temporal/nodal/crossSection/etc — keeps bind-group layout in lockstep with `CoherenceHorizonStrategy` which declares NO additional entries.
- `isPipeline2D` + `buildPipelineOutputs` + `applyModeOverrides` all CH-aware (never 2D/wigner/temporal-MRT).
- Strategy: registry `strategy: 'coherenceHorizon'`, no compute passes, physics-based `computeBoundingRadius` (uses δ=0 horizon so the cube never pumps while δ animates).
- Uniforms: 8 f32 appended to SchroedingerUniforms (layout + WGSL must match; r_h and (d−2) CPU-precomputed in `packCoherenceHorizon`).
- Color algorithms implemented in-block per family (mixed/phase/blackbody/viridis/densityContours) + allowlist in `getAvailableColorAlgorithms` + fallback to 'mixed' in ColorAlgorithmSelector (registry defaultColorAlgorithm 'mixed' — the analytic default 'radialDistance' is NOT supported).
- UI gated for the mode: representation toggle, Advanced Rendering section (null), Quantum Effects (UnavailableSection), isosurface (supportsSchroedingerSurfaceMode).
- WGSL validation: `enumerateCoherenceHorizon` surface ('coherence-horizon') in tests/rendering/wgsl uses production `buildShaderConfig` at d=3..11.
- IDs: shaderUniformId 10, stateSaveId 12, URL params ch_dec/ch_sep/ch_w/ch_k/ch_hs/ch_rg/ch_glow (+ch_preset), 5 scenario presets.

## Key perf lesson (orthonormal-basis collapse)
Never call `transformToND` per raymarch step. The slice basis is an orthonormal triad, so |B·p+o|² = |p|² + 2p·(Bᵀo) + |o|² and Bᵀ(B·p+o) = p + Bᵀo collapse all per-step N-D math to 3D ops on per-fragment constants (bto, oSq, axis0 row). Measured 29→60 fps at 2560×1440. Also: share one pow(1/r, exponent) between redshift and bending; step budget 5/2 per LOD sample keeps ≥6 samples per fringe.

## Physics testing pattern
JS twin of the WGSL density (`catStateDensity` in lib/physics/coherenceHorizon.ts, "keep in sync" comment) enables CPU tests of GPU math: diagonal δ-invariance, fringe non-negativity, Schwarzschild limits (r_ph=1.5r_h, b_c=(3√3/2)r_h), V_eff maximum at r_ph.

## Interesting finding
Dimension-dependence of coherence-sourced evaporation: r_h ∝ C^(1/(d−2)) means 3D horizons die gradually with decoherence but 11D horizons persist until δ→1 then collapse abruptly — "extra dimensions make coherence-sourced spacetime brittle".

## Follow-up threads
Skybox lensing (sample env cubemap for escaped/captured rays), Lindblad-driven δ(t), Kerr–Tangherlini rotation (frame-dragged arcs), Hawking-style ring luminosity ∝ dδ/dt.
