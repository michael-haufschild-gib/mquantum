# Schroedinger Rendering FPS Optimization Opportunities (Constant Rotation)

Date: 2026-02-06  
Scope: Schroedinger core rendering path, hot path, and optional features  
Method: Code-read only (no tests run)

## Notes

- Assumption: rotation animation is continuously active.
- Estimates are non-additive and scene-dependent.
- Targets preserve visual quality, fidelity/detail, and physical accuracy.
- Impact column legend: `Q` = visual quality/fidelity/detail, `A` = physical accuracy.

## Optimization Opportunities (20)

| # | Optimization opportunity | What to change | Est. FPS impact (constant rotation) | Impact on quality/fidelity/detail and physical accuracy |
|---|---|---|---|---|
| 1 | Version-gate lighting uniforms | Update lighting GPU uniforms only when lighting state version changes. | +1% to +3% | Q: 0, A: 0 |
| 2 | Cache color conversion in lighting path | Convert hex->linear RGB once per state change, not every frame. | +1% to +2% | Q: 0, A: 0 |
| 3 | Split static vs dynamic uniforms | Keep time/camera/rotation dynamic; update physics blocks only on change. | +2% to +5% | Q: 0, A: 0 |
| 4 | Version-gate basis uniforms | Repack basis uniforms only on basis-version changes. | +0% to +2% | Q: 0, A: 0 |
| 5 | Avoid bound-geometry churn | Add quantization/hysteresis to bound-driven mesh rebuild triggers. | +0% to +2% | Q: 0, A: 0 |
| 6 | Precompute Hermite/Laguerre coefficients | Precompute recurrence/normalization constants on parameter changes. | +4% to +10% | Q: 0, A: 0 |
| 7 | Specialize by wavefunction family | Separate harmonic/hydrogen/hydrogen-ND shader pipelines. | +5% to +12% | Q: 0, A: 0 |
| 8 | Specialize by optional physics toggles | Compile nodal/phase/dispersion/AO-shadow variants to remove inner-loop branches. | +6% to +15% | Q: 0, A: 0 |
| 9 | Specialize by superposition term count | Use fixed loop bounds for active term count (1..8). | +4% to +9% | Q: 0, A: 0 |
| 10 | Fix density-grid world-bound mismatch | Use identical dynamic bounds in compute and sampling spaces. | +3% to +8% | Q: +, A: ++ |
| 11 | Add phase-capable grid path | Store required psi components in grid for phase modes to avoid recompute. | +8% to +18% (phase modes) | Q: 0, A: 0 |
| 12 | Use lower-bandwidth grid format in density-only modes | Use `r16float` density grid when phase channels are unnecessary. | +4% to +10% | Q: 0, A: 0 |
| 13 | Conservative empty-space skipping | Build occupancy/majorant volume and skip guaranteed-empty ray segments. | +8% to +25% (sparse scenes) | Q: 0, A: 0 |
| 14 | Reuse sampled densities for AO/shadow | Reuse already-sampled densities where mathematically equivalent. | +4% to +9% | Q: 0, A: 0 |
| 15 | Physically-bounded early termination | End integration when remaining contribution is below conservative bound. | +2% to +9% | Q: 0*, A: 0* |
| 16 | Cache Bokeh bind groups/uniform arrays | Remove per-frame bind-group creation and temp typed-array allocations. | +1% to +3% | Q: 0, A: 0 |
| 17 | Cache FrameBlending resources | Reuse bind groups and skip redundant history copies when equivalent. | +1% to +4% | Q: 0, A: 0 |
| 18 | Reduce temporal pass CPU churn | Persist temporal bind groups/scratch buffers and avoid redundant copies. | +2% to +6% | Q: 0, A: 0 |
| 19 | Render-graph per-frame memoization | Evaluate pass enabled-state once and reuse frame-context snapshots. | +1% to +3% | Q: 0, A: 0 |
| 20 | WASM ABI optimization for rotations | Pass plane indices (not strings) and use in-place typed buffers. | +5% to +15% (CPU-bound) | Q: 0, A: 0 |
