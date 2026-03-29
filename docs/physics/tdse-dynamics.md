# TDSE Dynamics Mode

## Purpose

Documents the mathematical formulation, discretization, potential types, and
extended features of the time-dependent Schrödinger equation (TDSE) solver.

## 1. Theoretical Basis

### 1.1 The Time-Dependent Schrödinger Equation

The TDSE in N spatial dimensions (natural units ℏ = 1, m = 1 unless overridden):

    iℏ ∂ψ/∂t = [-ℏ²∇²/(2m) + V(x)] ψ

The solver evolves a complex wavefunction ψ(x, t) on a periodic lattice using
the Strang split-step Fourier method.

**Source**: [Wikipedia: Schrödinger equation](https://en.wikipedia.org/wiki/Schr%C3%B6dinger_equation).

### 1.2 Strang Split-Step Method

Each time step applies symmetric operator splitting:

    ψ(t+dt) ≈ e^{-iV dt/2} · FFT⁻¹[e^{-iT(k) dt} · FFT[e^{-iV dt/2} · ψ(t)]]

where T(k) = ℏ²|k|²/(2m) is the kinetic energy in Fourier space.

- **Temporal convergence**: O(dt²) — second order (Strang splitting).
- **Spatial error for kinetic term**: Zero. The kinetic operator is diagonal
  in k-space and applied exactly as a pointwise phase rotation.
- **Stability**: Unconditionally stable (unitary — |e^{-iθ}| = 1).

Full convergence analysis: [`compute-solver-convergence.md`](compute-solver-convergence.md) §2.1.

**Source**: Strang, G. *SIAM J. Numer. Anal.* **5**(3), 506–517 (1968).
[Wikipedia: Strang splitting](https://en.wikipedia.org/wiki/Strang_splitting).
[Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method).

### 1.3 Imaginary-Time Propagation

Setting t → -iτ (Wick rotation) converts the TDSE into a diffusion equation:

    ∂ψ/∂τ = [ℏ²∇²/(2m) - V] ψ

Excited states decay exponentially faster than the ground state (rate ∝ e^{-E_n τ}),
so repeated application + renormalization projects onto the ground state. The
potential half-step becomes a real exponential decay (`exp(-V·dτ/(2ℏ))`) instead
of a phase rotation.

**Source**: [Wikipedia: Imaginary time](https://en.wikipedia.org/wiki/Imaginary_time).

## 2. Potential Types

All potentials are evaluated pointwise on the lattice grid. CPU-side profile
computation for the energy diagram HUD is in `potentialProfile.ts:16–93`.

| Potential | Formula | Code location |
|-|-|-|
| Free | V = 0 | `tdsePotential.wgsl.ts` |
| Barrier | V = V₀ for \|x₀ - c\| < w/2 | `tdsePotential.wgsl.ts` |
| Step | V = V₀ for x₀ > c | `tdsePotential.wgsl.ts` |
| Finite well | V = -V₀ for \|x₀\| < w/2 | `tdsePotential.wgsl.ts` |
| Harmonic trap | V = ½mω²\|x\|² | `tdsePotential.wgsl.ts` |
| Double slit | V = V₀ where wall, two gaps of width s | `tdsePotential.wgsl.ts` |
| Periodic lattice | V = V₀ cos²(πx/a) | `tdsePotential.wgsl.ts` |
| Double well | V = λ(x² - a²)² - εx | `tdsePotential.wgsl.ts` |
| Driven | Time-periodic barrier oscillation | `tdsePotential.wgsl.ts` |
| Custom expression | User-entered formula via expression parser | `expressionParser.ts` |

## 3. Extended Features

### 3.1 Anderson Disorder

The solver supports on-site disorder potentials for Anderson localization
studies. Independent random energies are assigned to each lattice site:

- **Uniform**: V(r) ~ U[-W/2, W/2]
- **Gaussian**: V(r) ~ N(0, W)

where W is the disorder strength. The PRNG is seeded for reproducibility across
realizations.

The Inverse Participation Ratio (IPR = Σ|ψ|⁴ / (Σ|ψ|²)²) is tracked as a
diagnostic. IPR ranges from 1/N (fully extended) to 1 (fully localized).

**Code**: `anderson/disorderPotential.ts`, `tdse/diagnostics.ts:29` (IPR field).

**Source**: Anderson, P.W. "Absence of Diffusion in Certain Random Lattices."
*Phys. Rev.* **109**, 1492–1505 (1958).
DOI: [10.1103/PhysRev.109.1492](https://link.aps.org/doi/10.1103/PhysRev.109.1492).
[Wikipedia: Anderson localization](https://en.wikipedia.org/wiki/Anderson_localization).

### 3.2 Quantum Scar Detection

The scar metric computes the overlap between wavefunction probability density
and classical trajectories at the same energy. This is a heuristic — it does
NOT perform a true periodic-orbit search. Classical trajectories are random
energy-shell samples, not guaranteed periodic.

The correlation metric:

    C = ∫|ψ|² · W dx / (∫|ψ|² dx · ⟨W⟩)

where W(x) = Σ_t exp(-|x - x_orbit(t)|² / (2ε²)) is a Gaussian tube around
the trajectory. C > 1 indicates excess density along the orbit (possible scar).
C ≈ 1 indicates a uniformly spread state (Berry conjecture).

**Code**: `tdse/scarMetric.ts:63–177`, `tdse/classicalOrbit.ts` (symplectic
Störmer-Verlet integrator for classical trajectories).

**Source**: Heller, E.J. "Bound-State Eigenfunctions of Classically Chaotic
Hamiltonian Systems: Scars of Periodic Orbits." *Phys. Rev. Lett.* **53**, 1515
(1984). DOI: [10.1103/PhysRevLett.53.1515](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.53.1515).

### 3.3 Level Spacing Statistics

The solver computes nearest-neighbor level spacing distributions and classifies
quantum systems using the Brody parameter β:

- β = 0: Poisson distribution P(s) = exp(-s) — integrable or localized
- β = 1: Wigner-Dyson GOE P(s) = (π/2)s·exp(-πs²/4) — chaotic or extended

**Code**: `tdse/levelSpacing.ts:47`.

### 3.4 GPU Diagnostics

Runtime diagnostics are read back from the GPU every N frames:

| Observable | Formula | Purpose |
|-|-|-|
| Total norm | \|\|ψ\|\|² = Σ\|ψ\|² | Unitarity check (should be ≈ 1) |
| Norm drift | (norm - norm₀)/norm₀ | Integration error accumulation |
| R coefficient | norm_left / (norm_left + norm_right) | Reflection measurement |
| T coefficient | norm_right / (norm_left + norm_right) | Transmission measurement |
| IPR | Σ\|ψ\|⁴ / (Σ\|ψ\|²)² | Localization measure |

**Code**: `tdse/diagnostics.ts:12–31`.

### 3.5 Observables (Expectation Values)

Position and momentum expectation values are computed on the GPU via parallel
reduction:

- ⟨x⟩ = Σ x·\|ψ(x)\|², ⟨x²⟩ = Σ x²·\|ψ(x)\|²
- ⟨p⟩ via FFT: Σ ℏk·\|ψ̃(k)\|², ⟨p²⟩ = Σ (ℏk)²·\|ψ̃(k)\|²
- Δx·Δp ≥ ℏ/2 (uncertainty principle verification)

**Code**: `observablesPositionReduce.wgsl.ts`, `observablesMomentumReduce.wgsl.ts`.

## 4. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| e^{-iV·dt/(2ℏ)} potential half-step | `tdseApplyPotentialHalf.wgsl.ts:40–58` |
| e^{-iℏk²dt/(2m)} kinetic step | `tdseApplyKinetic.wgsl.ts` |
| FFT (Stockham auto-sort) | `tdseStockhamFFT.wgsl.ts` |
| Imaginary-time exp(-V·dτ/2ℏ) | `tdseApplyPotentialHalf.wgsl.ts:46–49` |
| V_eff = V + g\|ψ\|² (BEC coupling) | `tdseApplyPotentialHalf.wgsl.ts:41` |
| PML absorbing boundary | `tdseAbsorber.wgsl.ts` |
| Norm renormalization | `renormalize.wgsl.ts` |
| Collapse (Gaussian projection) | `collapseGaussian.wgsl.ts` |

## 5. Accuracy Characterization

### 5.1 Temporal Error

The Strang splitting has global error O(dt²). For a typical dt = 0.01 in
natural units, the error per time step is O(10⁻⁶). Over 1000 steps (t = 10),
the accumulated error is O(10⁻⁴). The norm drift E2E test confirms < 0.5%
drift over 300 frames (`physics-numerical-validation.spec.ts`).

### 5.2 Spatial Aliasing

The kinetic operator is exact in k-space. The only spatial error is aliasing
when the wavefunction has Fourier content beyond the Nyquist frequency
k_max = π/Δx. This is problem-dependent: well-resolved wavepackets (width ≫ Δx)
have negligible aliasing; sharp features (step potentials, barriers) produce
Gibbs-type ringing proportional to Δx.

### 5.3 PML Absorber

The perfectly matched layer absorbs outgoing waves by applying a smooth damping
profile near the boundaries. This breaks unitarity locally (norm decreases as
amplitude exits the domain). The damping profile is a polynomial ramp to avoid
reflections at the PML onset.

**Code**: `pml/profile.ts`, `tdseAbsorber.wgsl.ts`.

## 6. Validation

| Benchmark | Test | Tolerance |
|-|-|-|
| Norm conservation (free) | `physics-numerical-validation.spec.ts` | 0.5% over 300 frames |
| Norm conservation (harmonic trap) | `physics-numerical-validation.spec.ts` | 1% over 200 frames |
| Free Gaussian spreading σ(t) | `validationBenchmarks.test.ts` | 2% |
| Strang convergence order | `validationBenchmarks.test.ts` | ratio ∈ [2.5, 6.0] |
| Barrier tunneling T(E) | `validationBenchmarks.test.ts` | 10% |
| Uncertainty principle ΔxΔp ≥ ℏ/2 | `physics-numerical-validation.spec.ts` | 10% slack |
| Ehrenfest theorem ⟨x⟩ direction | `physics-numerical-validation.spec.ts` | directional |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Schrödinger equation](https://en.wikipedia.org/wiki/Schr%C3%B6dinger_equation) —
  TDSE formulation.
- [Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method) —
  Split-step Fourier method, kinetic operator exact in k-space.
- [Wikipedia: Strang splitting](https://en.wikipedia.org/wiki/Strang_splitting) —
  Symmetric splitting, O(dt²) convergence.
- Anderson, P.W. "Absence of Diffusion in Certain Random Lattices."
  *Phys. Rev.* **109**, 1492–1505 (1958).
  DOI: [10.1103/PhysRev.109.1492](https://link.aps.org/doi/10.1103/PhysRev.109.1492).
- Heller, E.J. "Bound-State Eigenfunctions of Classically Chaotic Hamiltonian
  Systems: Scars of Periodic Orbits." *Phys. Rev. Lett.* **53**, 1515 (1984).
  DOI: [10.1103/PhysRevLett.53.1515](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.53.1515).
