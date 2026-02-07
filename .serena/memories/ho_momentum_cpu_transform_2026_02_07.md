# HO Momentum: CPU Uniform Transform (2026-02-07)

## Architecture
HO momentum mode is NOT a GPU shader feature. It's a **CPU uniform transformation**.

### Physics
HO eigenfunctions are eigenfunctions of the Fourier transform:
`φ̃_n(k, ω) = (-i)^n · φ_n(k, 1/ω)`

Same function, reciprocal ω, complex phase rotation.

### Implementation
In `updateSchroedingerUniforms()`, after writing all uniforms and before `writeUniformBuffer()`:
1. Invert omegas: `ω_j → 1/ω_j` in the uniform buffer
2. Rotate each coefficient by `(-i)^{Σ n_j}` per term
3. Force `representationMode = 0` — shader runs normal position path

### Result
All position-mode optimizations work automatically for HO momentum at 60 FPS:
- Eigencache sees inverted omegas → caches k-space eigenfunctions
- Analytical gradient d/dx → d/dk automatically
- Temporal reprojection works unchanged

### Exception
Hydrogen momentum has genuinely different functional form (Gegenbauer polynomials).
It keeps `representationMode = 1` and its own shader path in `psiBlockHydrogenND`.

### Files Changed
- `psi.wgsl.ts`: Removed generator functions, restored simple const exports
- `compose.ts`: Removed `representation` from shader config, removed momentum shader branching
- `EigenfunctionCacheComputePass.ts`: Removed `representation` from config, effectiveOmega logic
- `WebGPUSchrodingerRenderer.ts`: Added CPU transform, simplified constructor
- `quantum/index.ts`, `schroedinger/index.ts`: Removed generator re-exports
