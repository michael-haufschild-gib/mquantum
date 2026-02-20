Revised TDSE plan in docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md per user instruction to remove phased rollout.

Current plan characteristics:
- Single target-state implementation only (no staged/fallback architecture).
- Chosen solver architecture: split-operator Strang splitting spectral TDSE as the sole solver path.
- GPU design: dedicated TDSEComputePass with FFT stages, potential half-steps, kinetic step, absorber, diagnostics, and density-grid export.
- Integration points remain ObjectTypeExplorer + SchroedingerControls + SchroedingerAnimationDrawer + WebGPUSchrodingerRenderer + WebGPUScene.
- Performance requirements are explicit and mandatory (device-tier site budgets, adaptive substeps, zero-allocation hot loop, dirty-hash rebuild policy, reuse qualityMultiplier/renderResolutionScale/maxFps controls).
- Verification defined as one final acceptance bar, not phased checkpoints.