# Roadmap: Research-Grade Expansion

Strategic guide for closing the gap to research software while preserving the N-dimensional visualizer identity.

## Guiding Principle

Every expansion must pass two tests:

1. **Does it amplify the N-dimensional identity?** — What only this tool can do.
2. **Does it add research credibility?** — What makes a reviewer take it seriously.

Features scoring high on both axes are prioritized. Generic solver features that compete with QuTiP on its home turf are deprioritized.

## Phase A: Unique Visual Signatures

Low-to-medium effort features that produce publishable images and leverage the N-D capability.

### A1. Quantum Carpet (Spacetime Diagram)

Accumulate |ψ(x_i, t)|² along a selectable spatial axis into a 2D rolling texture. Display as a heatmap panel.

- **N-D unique**: Show carpets for multiple dimensional axes simultaneously — revealing how dynamics along different dimensions of the same N-D potential differ. No existing tool produces N-dimensional quantum carpets.
- **Implementation**: Small compute pass to extract a 1D slice from the N-D grid each frame, write into a rolling 2D texture (position × time). Render as a 2D heatmap panel alongside the 3D viewport. The TDSE solver already runs — this is pure visualization.
- **Effort**: Medium-low.
- **Thesis value**: Very high — fractal interference tapestries, quantum revivals, Talbot effect, all in N-D.

### A2. Classical-Quantum Correspondence Overlay

Render the Ehrenfest trajectory ⟨x⟩(t) as a glowing trail embedded inside the quantum probability cloud.

- **For HO**: Trajectories are analytical sinusoids with per-dimension ω values (already in config). No solver needed — just evaluate the formula.
- **"ℏ slider"**: Scales wavepacket width parameter. At minimum ℏ, the cloud hugs the classical trail. At physical ℏ, the cloud dominates.
- **N-D**: Classical orbits are N-dimensional Lissajous figures, projected into the 3D viewport alongside the probability density.
- **Depends on**: A3 (observable computation) for the ⟨x⟩(t) trajectory from TDSE/BEC modes.
- **Implementation**: Line/particle overlay rendered as a separate pass or vertex buffer. HO trajectories are closed-form; TDSE/BEC trajectories come from A3's computed ⟨x_i⟩(t).
- **Effort**: Medium.

### A3. Observable Expectation Values

GPU reduction passes for ⟨x_i⟩, ⟨x_i²⟩, ⟨p_i⟩, ⟨p_i²⟩ across all N dimensions. Derive Δx_i, Δp_i, uncertainty product Δx_i·Δp_i ≥ ℏ/2, and ⟨E⟩.

- **Implementation strategy**:
  - **Position-space** (⟨x_i⟩, ⟨x_i²⟩): Multi-channel GPU reduction. One dispatch, N output channels — each accumulates x_i·|ψ|² or x_i²·|ψ|² across the grid.
  - **Momentum-space** (⟨p_i⟩, ⟨p_i²⟩): Piggyback on the existing FFT round-trip during the split-step kinetic stage. After the forward FFT (when ψ is in k-space), compute k_i·|φ(k)|² before the inverse FFT. Avoids an extra FFT round-trip.
  - **Display**: Extend existing diagnostic panel (TDSE has norm/R/T; Pauli has ⟨σ_z⟩). Add sparkline charts for uncertainty products over time.
- **N-D note**: Up to 11 dimensions means up to 22 expectation values (position + momentum per axis). A single multi-channel reduction pass handles this efficiently.
- **Effort**: Medium.
- **Research value**: High — validates physics (ΔxΔp ≥ ℏ/2 verified live), enables Ehrenfest theorem demonstration.

## Phase B: Research Infrastructure

Infrastructure that makes the tool credible to reviewers and useful to collaborators.

### B1. Simulation State Save/Load

GPU readback of the full ψ grid → compressed binary blob → download/upload. Includes all configuration (potential, initial conditions, time step, quantum mode).

- **Enables**: Reproducibility (share exact simulation state), checkpoint/resume for long evolutions, peer verification.
- **Implementation**: GPU readback infrastructure already exists for diagnostics (`mapAsync` / `getMappedRange` in compute passes). Extend to full ψ buffer. Serialize config from Zustand store. Compress with built-in `CompressionStream` API. Download as `.mqstate` file.
- **Effort**: Medium.
- **Research value**: High — reproducibility is a basic requirement.

### B2. Data Export (CSV/JSON)

Serialize existing diagnostic time-series and wavefunction slices.

- **Observables**: Norm drift, R/T coefficients, observable expectation values (from A3), open quantum metrics (purity, entropy, coherence).
- **Wavefunction slices**: |ψ(x)|² along selected axes at current time step.
- **Implementation**: Serialize existing Zustand store diagnostic histories. One-click download, no server.
- **Effort**: Low.

### B3. Imaginary-Time Propagation

Replace exp(-iHdt) with exp(-Hdt) (Wick rotation) + renormalize each step.

- **The renormalization shader already exists** (`src/rendering/webgpu/shaders/schroedinger/compute/renormalize.wgsl.ts`). It reads `currentNorm` from the diagnostic buffer and scales ψ by √(target/current).
- **Implementation**: Add a mode flag to the TDSE compute pass that switches the kinetic/potential phase rotations from `exp(-i·...)` to `exp(-...)`. After each step, dispatch the existing renormalization pass. For excited states: Gram-Schmidt orthogonalization pass (subtract projections onto previously found states).
- **Enables**: Ground state computation for any potential. Combined with C1 (user-defined potentials), this enables quantum chaos / scarred eigenstates in N-D — publishable original research.
- **Effort**: Medium.

## Phase C: Distinctive N-D Research Features

Higher-effort features that produce original research results.

### C1. User-Defined Potentials (Buffer Approach)

Allow users to specify V(x₁, ..., xₙ) as a mathematical expression.

- **Architecture**: JS-side expression evaluation (NOT WGSL compilation). Parse the expression in JavaScript (using a safe math parser), evaluate V on the N-D grid, upload values as a GPU storage buffer. The WGSL shader reads `V[gridIndex]` from the buffer instead of computing analytically.
- **Why not WGSL compilation**: Avoids building a mini-compiler. The TDSE already operates on a discretized grid — the shader doesn't need to evaluate the formula, only sample a pre-computed buffer.
- **N-D**: Storage buffer with N-D flat indexing. Same approach as existing TDSE grid buffers.
- **Combined with B3**: Find eigenstates of arbitrary potentials in any dimension → quantum chaos, scarred wavefunctions, coupled anharmonic oscillators.
- **Effort**: Medium (expression parser + buffer upload + shader modification).

### C2. Quantum Walk on N-D Lattice

Discrete-time unitary evolution: coin operator + conditional shift on an N-D grid.

- **N-D unique**: Interference patterns form dimension-dependent cross-polytope shapes. Comparing quantum walk spreading across dimensions 2→11 shows how interference topology scales with dimensionality — never visualized before.
- **Connection**: Quantum walks are the algorithmic primitive for Grover's search, quantum PageRank, and topological phase detection.
- **Implementation**: New compute pass. Each step: (a) apply 2N×2N coin unitary to internal state, (b) shift amplitudes on the N-D lattice based on coin outcome. Output is a probability grid, ray-marched identically to TDSE.
- **Effort**: High.
- **Thesis value**: Very high — N-dimensional quantum walks are publishable original research.

### C3. Measurement Simulation (Born Rule Lab)

Click in the volume to sample position from |ψ|². Collapse → re-evolve → accumulate statistics.

- **N-D unique**: Partial measurement — measure along one axis while leaving other dimensions unmeasured. The post-measurement state in the remaining (N−1) dimensions depends on where the measurement landed. This is the N-D conditional wavefunction / partial trace without needing multi-particle.
- **Implementation**: CPU-side rejection sampling from |ψ|² (using existing readback data). Collapse = reset TDSE to narrow Gaussian at sampled point. Accumulated sample positions rendered as a point cloud pass.
- **Effort**: Medium.

## What NOT to Add

| Tempting Feature | Why It's Wrong |
|-|-|
| Multi-particle / entanglement | Exponential memory kills N-D capability. Identity conflict: N-D spatial ≠ tensor product. |
| Arbitrary symbolic Hamiltonian | Competes directly with QuTiP. Less flexible, less validated, less community. |
| Quantum circuit simulation | Qubits ≠ wavefunctions. Entirely different domain. |
| Molecular orbitals / DFT | Quantum chemistry, not quantum mechanics visualization. |
| HPC-grade grid resolution | Browser GPU memory is a hard constraint. Acknowledge and focus on what the browser enables (accessibility, zero-install) rather than fighting it. |

## Sequencing

```
Phase A (identity + publishable images)
  A1 Quantum Carpet ──────────────┐
  A3 Observable Values ────────── ├── A2 Classical-Quantum Overlay
                                  │
Phase B (research infrastructure) │
  B2 Data Export ─────────────────┤
  B1 State Save/Load ─────────── ├── B3 Imaginary Time (needs A3)
                                  │
Phase C (original research)       │
  C1 User Potentials ───────────  ├── C2 Quantum Walk
  C3 Measurement Sim ─────────── ┘
```

Dependencies: A2 requires A3. B3 benefits from C1. All Phase C items are independent of each other.

Recommended start: A1 + A3 + B2 in parallel (no dependencies between them). Then A2 + B1. Then B3 + C1 together (they multiply each other's value). C2 and C3 are independent thesis-novelty features to add when core infrastructure is stable.
