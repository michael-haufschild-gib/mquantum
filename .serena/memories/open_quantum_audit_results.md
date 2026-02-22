# Open Quantum System Audit Results

## Session Date: 2026-02-22

## Bugs Fixed
1. **Hydrogen boost distortion**: Per-basis boost in singleBasis.wgsl.ts distorted cross-terms in Tr(ρ|x⟩⟨x|). Fixed: removed per-basis boost, added uniform hydrogenNDBoost after total density summation.
2. **DM mode feature gating**: Nodal surfaces, probability current, phase materiality, interference fringes all used inline evalPsi (single-wavefunction) which is physically incorrect for mixed states. Fixed at 3 levels: runtime uniform guards, compile-time feature flags, color algorithm gating.
3. **Color algorithm fallback**: normalizeColorAlgorithmForQuantumMode fell back to 'diverging' (now excluded in OQ mode). Changed to 'purityMap'.
4. **HO state re-initialization**: HO mode did not force density matrix re-init when config changed (unlike hydrogen mode). Added openQuantumInitialized = false in HO cache invalidation.

## Architecture Notes
- **Energy units**: Rydberg (-1/n²), k_B in Hartree/K — minor inconsistency in absolute thermal rates, compensated by couplingScale slider
- **Basis ordering**: Same hydrogenBasis[] array used for CPU propagator, GPU HydrogenBasisUniforms, and GPU OpenQuantumUniforms — no index mismatch possible
- **Phase channel in DM mode**: Grid stores (density, logDensity, coherenceFraction, 0) — NOT complex phase. Phase-dependent color algorithms 3-10 are excluded via getAvailableColorAlgorithms.
- **HO basis functions are real**: evaluateSingleBasis returns vec2f(phi, 0.0) for HO mode. Time evolution fully encoded in complex ρ_{kl} on CPU.
- **Hydrogen basis**: Extra-dim quantum numbers are all zeros (ground state). Dynamics purely in 3D hydrogen subspace.

## Key Files
- Renderer: src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts (lines 2970-3190 for OQ)
- DM compute: src/rendering/webgpu/shaders/schroedinger/compute/densityGrid.wgsl.ts (densityMatrixComputeBlock)
- Single basis: src/rendering/webgpu/shaders/schroedinger/quantum/singleBasis.wgsl.ts
- Color gating: src/rendering/shaders/palette/types.ts (getAvailableColorAlgorithms)
- OQ emission: src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts (algorithms 16-18)
- Physics: src/lib/physics/openQuantum/ (integrator, propagator, liouvillian, channels, metrics, statePacking)
