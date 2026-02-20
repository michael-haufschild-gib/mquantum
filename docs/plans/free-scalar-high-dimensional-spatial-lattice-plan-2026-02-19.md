# Plan: Free Scalar Field with True High-D Spatial Lattice (d > 3)

Date: 2026-02-19
Status: Proposed
Scope: `freeScalarField` extension to physically true spatial dimensions above 3

## 1. Objective

Extend the free scalar field module from the current 1D-3D spatial lattice to a true `d`-dimensional spatial lattice (`d = 4..11`), preserving Klein-Gordon lattice dynamics and physically consistent observables.

This option targets the physically direct interpretation:

```text
phi = phi(x1, x2, ..., xd, t)
```

with all `d` directions treated as spatial directions in the lattice Hamiltonian.

## 2. Current Constraints in This Codebase

The current implementation is explicitly 1D-3D lattice physics embedded into a 3D density texture pipeline:

- free-scalar lattice dimensionality type is limited to `1 | 2 | 3`
  - `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts`
- free-scalar controls expose only 1D/2D/3D
  - `/Users/Spare/Documents/code/mquantum/src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx`
- compute pass stores `phi/pi` on a flattened 3D-indexed lattice and writes to fixed `64^3` density texture
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/shaders/schroedinger/compute/freeScalarWriteGrid.wgsl.ts`
- free-scalar mode forces global scene dimension to at least 3 and bypasses 2D pipeline
  - `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts`
  - `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/WebGPUScene.tsx`

## 3. Physics Target

## 3.1 Continuum target

```text
L = 1/2 * (d_mu phi d^mu phi - m^2 phi^2)
pi = d_t phi
H = integral d^d x 1/2 * (pi^2 + |grad phi|^2 + m^2 phi^2)
```

## 3.2 d-dimensional lattice Hamiltonian

```text
H = 1/2 * sum_n [
  pi_n^2
  + m^2 phi_n^2
  + sum_{i=1..d} ((phi_{n+e_i} - phi_n)^2 / a_i^2)
]
```

## 3.3 Equations of motion

```text
d_t phi_n = pi_n
d_t pi_n = Laplacian_d(phi)_n - m^2 phi_n

Laplacian_d(phi)_n = sum_{i=1..d} (phi_{n+e_i} - 2 phi_n + phi_{n-e_i}) / a_i^2
```

## 3.4 Dispersion relation for validation

```text
omega_k^2 = m^2 + sum_{i=1..d} [ (2/a_i) * sin(k_i*a_i/2) ]^2
```

## 4. High-Level Design

## 4.1 Data model changes

Extend free-scalar config from 3-axis vectors to variable-length arrays:

- `spatialDim: 1..11` (new, replaces `latticeDim`)
- `gridShape: number[]` length = `spatialDim`
- `spacing: number[]` length = `spatialDim`
- `modeK: number[]` length = `spatialDim`
- `packetCenter: number[]` length = `spatialDim`

Touchpoints:

- `/Users/Spare/Documents/code/mquantum/src/lib/geometry/extended/types.ts`
- `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/types.ts`
- `/Users/Spare/Documents/code/mquantum/src/stores/slices/geometry/schroedingerSlice.ts`

## 4.2 State representation backends

Full dense `N^d` storage is intractable past low `d`. Implement backend strategy:

1. Dense backend (kept for `d <= 4` small grids)
2. Sparse-grid backend (Smolyak-like / hierarchical)
3. Compressed spectral backend (Fourier-domain truncation / low-rank)

Backend selected by `(d, gridShape, device capability)` with explicit user-visible warnings and hard caps.

## 4.3 Compute architecture

Introduce new pass family:

- `FreeScalarNDStateComputePass`
- optional `FreeScalarNDObservablesComputePass`

Responsibilities:

- generic ND neighbor indexing (not hard-coded x/y/z)
- leapfrog update for chosen backend
- generation of 3D renderable observable volume (slice/projection) for existing raymarcher

Renderer integration:

- `/Users/Spare/Documents/code/mquantum/src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

## 4.4 Rendering strategy

Do not attempt direct `d`D texture rendering. Instead:

- keep 3D raymarch output texture contract
- add deterministic reduction from ND state to render volume:
  - axis slice: fix dimensions 4..d at parameter values
  - projected density: integrate selected extra axes
  - principal-component projection (optional advanced mode)

Shader pathway remains density-grid based for free scalar.

## 4.5 UI semantics

Split controls explicitly:

- `Physical Spatial Dimension (d)` for free-scalar physics
- `Render Projection Mode` for 3D visualization mapping
- `Extra-Dimension Slice Controls` for dimensions 4..d

Avoid overloading global geometry dimension semantics.

## 5. Performance and Numerical Stability

## 5.1 Scaling controls

- strict maximum site budget per backend
- estimated memory + step cost preview before apply
- automatic downgrade path (dense -> sparse -> compressed)

## 5.2 Stability controls

- generalized CFL-like `dt` bound for ND spacing
- backend-specific stability/aliasing warnings
- mandatory re-clamp of `dt` when `d`, spacing, or mass changes

## 5.3 Device-tier policies

- low-tier: cap to modest `d`/resolution with sparse/compressed only
- high-tier: allow larger truncation budgets

## 6. Scientific Validation Plan

## 6.1 Deterministic checks

- ND dispersion agreement for selected modes
- convergence trends as `dt -> 0`
- symmetries for isotropic setups (`a_i` equal, symmetric initial conditions)

## 6.2 Conservation checks

- total energy decomposition and drift threshold by backend
- cross-backend consistency at matched truncation quality

## 6.3 Visualization checks

- reduced 3D density is stable across camera changes
- slice/projection modes are reproducible and parameter-driven

## 7. Implementation Phases

Phase 1 (foundation):

1. Add ND config schema and store actions.
2. Add backend-selection scaffolding and budget estimator.
3. Add UI semantic split (physical dim vs render projection mode).

Phase 2 (physics engine):

1. Implement ND leapfrog in dense backend for small sizes.
2. Implement generic ND indexing and boundary handling.
3. Validate dispersion and energy for `d=4`.

Phase 3 (scalability):

1. Add sparse/compressed backend path.
2. Add runtime fallback and capability gating.
3. Expand validation suite to `d=5..11` representative cases.

Phase 4 (UX and observables):

1. Add ND correlators/spectrum diagnostics.
2. Add projection mode explanations and educational tooltips.
3. Add preset scenarios for high-dimensional behavior.

## 8. Risks and Mitigations

1. Curse of dimensionality (memory/compute blowup).
   Mitigation: backend strategy, strict caps, fallback policy.

2. Numerical instability with aggressive `dt`.
   Mitigation: generalized CFL clamp + warnings + test gates.

3. Misleading visuals due projection choices.
   Mitigation: explicit projection labels and reproducible slice controls.

4. Complexity creep across renderer/store/shader boundaries.
   Mitigation: isolate ND-specific logic in dedicated passes/modules and keep existing 3D raymarch contract unchanged.

## 9. Definition of Done

1. Free scalar supports physically true `d > 3` spatial evolution with explicit `d` controls.
2. At least one scalable backend beyond naive dense storage is production-ready.
3. Dispersion and energy diagnostics pass for representative `d=4..7` cases.
4. Existing harmonic/hydrogen paths are unaffected.
5. UI clearly distinguishes physical dimension from visualization projection.

## 10. References

- Sparse-grid high-dimensional PDE methods: https://arxiv.org/abs/1710.09356
- Compressed Fourier high-dimensional PDE methods: https://arxiv.org/abs/2206.01255



478
2309686574
23
1237429979
