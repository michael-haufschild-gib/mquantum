Created a detailed implementation plan for TDSE dynamics at docs/plans/tdse-time-dependent-dynamics-plan-2026-02-20.md.

Key decisions:
- Introduce a new quantum mode (recommended name: tdseDynamics) rather than overloading freeScalarField semantics.
- Reuse freeScalar compute/render architecture patterns: config hashing, dense storage buffers, per-frame stepping, density-grid export, dirty-flag store updates, and selective pass rebuild logic in WebGPUScene.
- Phase solver strategy: v1 real-space split real/imag stencil evolution for fast integration; optional phase-2 split-operator spectral backend for power-of-two periodic grids.
- UI placement: mode entry in ObjectTypeExplorer; TDSEControls in SchroedingerControls Field Configuration; runtime TDSE controls in SchroedingerAnimationDrawer.
- Performance strategy: no per-frame allocations, adaptive stepsPerFrame, device-tier site budgets, incremental potential updates, sparse diagnostics readback, full integration with existing qualityMultiplier/renderResolutionScale/FPS cap flow.
- Testing plan includes physics unit tests (norm drift, propagation, tunneling trends), store tests, WGSL composition tests, and Playwright runtime smoke tests.

Primary external references included in plan:
- Feit/Fleck/Steiger split-operator method
- Crank-Nicolson and Strang splitting foundations
- Schrödinger PML reference
- Floquet/driven systems review
- WebGPU/WGSL official specs and MDN compute pipeline docs.