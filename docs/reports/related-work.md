# Related Work

## Landscape

Quantum wavefunction visualization tools fall into four categories: educational applets, research computation frameworks, web-based visualizers, and desktop/HPC solvers. Each category makes different trade-offs between physical fidelity, interactivity, accessibility, and scope.

**Educational applets** (PhET, Falstad) prioritize conceptual accessibility over physical completeness. They visualize 1D–3D systems with pre-computed solutions, typically without real-time PDE integration or GPU acceleration.

**Research frameworks** (QuTiP, Qiskit, GPUE) provide full programmatic control over Hamiltonian construction and open-system dynamics, but produce static 2D plots (Matplotlib, gnuplot) rather than interactive 3D renderings. They require local Python/C++ environments.

**Web visualizers** (QMwebJS, Evanescence, Wavefiz, marl0ny QM-Simulator-2D) run in the browser but are limited to specific systems (hydrogen orbitals, 1D/2D Schrödinger equation) and use WebGL or canvas-based rendering without compute-shader PDE solvers.

**Desktop/HPC solvers** (GPUE, COMSOL, Phoenix) achieve research-grade spatial resolution for specific equations (Gross-Pitaevskii, TDSE) but require CUDA hardware or commercial licenses and produce offline visualizations.

This system occupies an unserved intersection: browser-native, GPU-accelerated, multi-equation quantum visualization across 1D–11D with publication-quality rendering. No existing tool combines more than two of these six properties simultaneously.

## Feature Matrix

### Physics Scope

| Capability | This System | QuTiP | Falstad | QMwebJS | Evanescence | marl0ny 2D | GPUE | PhET |
|-|-|-|-|-|-|-|-|-|
| Harmonic oscillator | 1D–11D | Any | 1D, 3D | 3D | — | 2D | — | 1D |
| Hydrogen orbitals | 3D + N-D extension | Any (manual) | 3D | 3D | 3D | — | — | — |
| TDSE (time-dependent) | 1D–3D, split-step FFT on GPU | Yes (CPU) | 1D only | — | — | 2D | — | 1D |
| Dirac equation | 3D, N-D Clifford algebra | Manual | — | — | — | 2D | — | — |
| Pauli equation | 3D, spin-½ in B-field | Manual | — | — | — | — | — | — |
| BEC (Gross-Pitaevskii) | 1D–3D, GPU leapfrog | — | — | — | — | — | 3D (CUDA) | — |
| Free scalar field (Klein-Gordon) | 1D–3D lattice | — | — | — | — | — | — | — |
| Open quantum (Lindblad) | Density matrix, decoherence channels | Yes (core feature) | — | — | — | — | — | — |
| Superposition states | Up to 8 terms | Unlimited | Limited | — | — | Yes | — | — |
| Max spatial dimensions | 11 | Arbitrary Hilbert space | 3 | 3 | 3 | 2 | 3 | 1 |

### Rendering and Visualization

| Capability | This System | QuTiP | Falstad | QMwebJS | Evanescence | marl0ny 2D | GPUE |
|-|-|-|-|-|-|-|-|
| Volume ray marching | Yes (WGSL) | — | — | — | — | — | ParaView (offline) |
| Isosurface extraction | Yes (GPU) | — | Java3D | — | — | — | VTK (offline) |
| Wigner phase-space | GPU compute cache | Matplotlib 2D | — | — | — | — | — |
| Position/momentum dual | Full Fourier toggle | Plot either | — | — | — | — | — |
| PBR lighting (GGX) | Yes | — | — | — | — | — | — |
| Bloom / tone mapping | Yes | — | — | — | — | — | — |
| Anti-aliasing (FXAA + SMAA) | Yes | — | — | — | — | — | — |
| Temporal reprojection | Yes | — | — | — | — | — | — |
| Cross-section / 2D slices | Yes | — | Yes | — | — | N/A (2D native) | — |
| Nodal lines / surfaces | Yes | — | — | — | — | — | — |
| Radial probability overlay | Yes | — | — | — | — | — | — |
| Real-time animation | 60 fps GPU | — | ~15 fps Java | — | Static | ~30 fps WebGL | Offline |

### Numerical Methods

| Method | This System | QuTiP | marl0ny 2D | GPUE |
|-|-|-|-|-|
| Analytical eigenstates (GPU) | Hermite, Laguerre, Y_lm in WGSL | N/A | — | — |
| Split-step FFT | Stockham FFT in WGSL compute | — | Split-operator (WebGL) | Split-step (CUDA) |
| Leapfrog (scalar field) | WGSL compute | — | — | — |
| Density matrix propagation | Lindblad integrator (JS + GPU) | RK4/Adams (CPU) | — | — |
| Clifford algebra (Dirac) | Rust/WASM + WGSL | — | Staggered grid | — |
| Perfectly matched layers | PML absorbers in WGSL | — | — | — |
| Eigenfunction caching | GPU compute pass | — | — | — |

### Platform and Accessibility

| Property | This System | QuTiP | Falstad | QMwebJS | Evanescence | marl0ny 2D | GPUE | PhET |
|-|-|-|-|-|-|-|-|-|
| Runs in browser | Yes | No (Python) | Yes (Java/JS) | Yes | Yes | Yes | No (CUDA) | Yes |
| GPU API | WebGPU | — | — | WebGL | WebGL | WebGL | CUDA | — |
| Compute shaders | Yes (WGSL) | — | — | — | — | — | Yes (CUDA) | — |
| Install required | None | pip + deps | None/Java | None | None | None | CUDA toolkit | None |
| Open source | Yes | Yes | Partial | Yes | Yes | Yes | Yes | No |
| Mobile support | Limited (WebGPU) | No | No | Partial | Yes | Yes | No | Yes |

## Scope Boundaries

This system does **not** compete with:

- **Quantum computing frameworks** (Qiskit, Cirq, PennyLane) — qubit gates, circuit simulation, and quantum algorithms are an entirely different domain from wavefunction visualization.
- **Quantum chemistry packages** (Q-Chem, Gaussian, ORCA) — molecular orbital calculations, DFT, and electronic structure are out of scope.
- **Arbitrary Hamiltonian solvers** (QuTiP, QuantumOptics.jl) — this system visualizes specific, physically motivated quantum systems with hardcoded analytical bases and discretization schemes. It cannot accept user-defined Hamiltonians as symbolic input.
- **Research-grade HPC solvers** (GPUE at high resolution) — browser GPU memory limits constrain grid resolution below what dedicated CUDA solvers achieve for publication-quality numerical research.

## Unique Contributions

No existing tool simultaneously provides:

1. **N-dimensional quantum visualization** (1D–11D) with real-time interaction — all competitors cap at 3D or require offline rendering for higher dimensions.
2. **Multi-equation coverage** in a single platform — harmonic oscillator, hydrogen, TDSE, Dirac, Pauli, BEC, Klein-Gordon, and Lindblad open-system dynamics, each with GPU-accelerated compute.
3. **Browser-native GPU compute** — WebGPU compute shaders for split-step FFT, field evolution, and density matrix propagation, with zero-install deployment.
4. **Publication-quality rendering** integrated with physical simulation — PBR lighting, volumetric ray marching, bloom, temporal reprojection, and anti-aliasing applied to physically accurate wavefunctions.
5. **Phase-space visualization** (Wigner function) as a GPU-cached render mode within the same pipeline as position-space and momentum-space views.
6. **Open quantum system dynamics** with real-time 3D visualization of decoherence — Lindblad master equation integrated into the rendering pipeline, showing density matrix evolution as volumetric emission rather than 2D line plots.

The closest partial overlaps are QuTiP (open quantum + Wigner, but 2D plots only), GPUE (GPU BEC, but CUDA-only), and marl0ny (browser TDSE + Dirac, but 2D only). None approaches the breadth or rendering quality of this system within a zero-install browser environment.

## References

- QuTiP: J.R. Johansson et al., "QuTiP 2: A Python framework for the dynamics of open quantum systems," Comp. Phys. Comm. 184, 1234 (2013). https://qutip.org/
- Falstad: Paul Falstad, "Math, Physics, and Engineering Applets." https://www.falstad.com/mathphysics.html
- QMwebJS: I. Figueiras et al., "QMwebJS — An Open Source Software Tool to Visualize and Share Time-Evolving Three-Dimensional Wavefunctions," Mathematics 8(3), 430 (2020). https://www.mdpi.com/2227-7390/8/3/430
- Evanescence: https://al2me6.github.io/evanescence/
- marl0ny QM-Simulator-2D: https://github.com/marl0ny/QM-Simulator-2D
- GPUE: J.R. Schloss and L.J. O'Riordan, "GPUE: Graphics Processing Unit Gross-Pitaevskii Equation solver." https://github.com/GPUE-group/GPUE
- PhET Interactive Simulations: https://phet.colorado.edu/
- Orbital Visualizer: https://lightcone-games.itch.io/orbital-visualizer
- Adventures in Phase Space (Wigner): https://wigner.quantumoptics.fun/
- Wavefiz: https://ridiculousfish.com/wavefiz/
