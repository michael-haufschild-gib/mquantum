# Free Scalar Field Mode

## Purpose

Documents the mathematical formulation, lattice discretization, vacuum state
sampling, and self-interaction for the Klein-Gordon free scalar field solver.

## 1. Theoretical Basis

### 1.1 The Klein-Gordon Equation

The real scalar field φ(x, t) satisfies the Klein-Gordon equation:

    ∂²φ/∂t² = ∇²φ - m²φ

In Hamiltonian form with conjugate momentum π = ∂φ/∂t:

    dπ/dt = ∇²φ - m²φ
    dφ/dt = π

This is a classical field theory — the "quantum" aspect enters through the
initial conditions (vacuum state sampling, see §3).

**Source**: [Wikipedia: Klein-Gordon equation](https://en.wikipedia.org/wiki/Klein%E2%80%93Gordon_equation).

### 1.2 Self-Interaction (Optional)

When self-interaction is enabled, the potential is V(φ) = λ(φ² - v²)², adding
a force term:

    dπ/dt = ∇²φ - m²φ - 4λφ(φ² - v²)

where λ is the coupling and v is the vacuum expectation value. This is the
standard Mexican-hat (double-well) potential of scalar field theory.

**Code**: `freeScalarUpdatePi.wgsl.ts:46–49`.

## 2. Lattice Discretization

### 2.1 Symplectic Leapfrog Integrator

The equations of motion are integrated using the Störmer-Verlet (leapfrog)
method:

    π_{n+1} = π_n + dt · [∇²φ_n - m²φ_n]     (momentum kick)
    φ_{n+1} = φ_n + dt · π_{n+1}                (position drift)

This is a symplectic integrator: it conserves a modified Hamiltonian
H̃ = H + O(dt²). Energy oscillates around the true value with bounded
amplitude proportional to dt² — it does not drift secularly.

**Code**: `freeScalarUpdatePi.wgsl.ts:52` (π update),
`freeScalarUpdatePhi.wgsl.ts:23` (φ update).

Full convergence analysis: [`compute-solver-convergence.md`](compute-solver-convergence.md) §2.4.

**Source**: [Wikipedia: Leapfrog integration](https://en.wikipedia.org/wiki/Leapfrog_integration).

### 2.2 Discrete Laplacian

The Laplacian uses the standard second-order central difference stencil with
periodic boundary conditions:

    ∇²φ ≈ Σ_d [φ(x+e_d) - 2φ(x) + φ(x-e_d)] / a_d²

This is the only solver with spatial truncation error: O(h²) per dimension.

**Code**: `freeScalarUpdatePi.wgsl.ts:28–38`.

### 2.3 Lattice Dispersion Relation

The discrete Laplacian modifies the continuum dispersion ω² = m² + |k|² to:

    ω² = m_eff² + Σ_d [2 sin(πn_d/N_d) / a_d]²

where n_d is the mode index and a_d is the lattice spacing. This matches the
continuum at low k and deviates near the Nyquist frequency.

**Code**: `freeScalar/vacuumSpectrum.ts:45–66` (`computeOmegaK`).

### 2.4 CFL Stability Condition

The leapfrog is stable when dt < 2/ω_max, where ω_max is the maximum
eigenfrequency:

    ω_max² = m² + Σ_d (2/a_d)²

A 0.9 safety factor is applied in the UI.

**Code**: `sliceSetterUtils.ts:49–58` (`computeCflLimit`),
`sliceSetterUtils.ts:69–78` (`clampDtWithCfl`).

## 3. Vacuum State Sampling

### 3.1 Theory

The free-field vacuum state has Gaussian correlations with mode-dependent
variances:

    ⟨|φ_k|²⟩ = N/(2ω_k),  ⟨|π_k|²⟩ = Nω_k/2

where N = total lattice sites (compensates for IFFT 1/N normalization), and
φ_k and π_k are uncorrelated.

### 3.2 Sampling Algorithm

For each independent k-mode:

1. **Self-conjugate modes** (k = -k mod N): Draw a real Gaussian with
   variance N/(2ω_k).
2. **Paired modes** (k ≠ -k): Draw complex Gaussians with per-component
   variance N/(4ω_k), enforce Hermitian symmetry φ_{-k} = conj(φ_k).

After inverse FFT, the real-space fields φ(x) and π(x) are strictly real.
A seeded PRNG (Mulberry32) ensures deterministic initialization.

**Code**: `freeScalar/vacuumSpectrum.ts:191–283` (`sampleVacuumSpectrum`).

**Source**: Tong, D. *Quantum Field Theory*. Cambridge Lecture Notes.
[DAMTP](https://www.damtp.cam.ac.uk/user/tong/qft.html) — free field
quantization, vacuum correlators.

### 3.3 Auto-Scale Normalization

The estimated maximum field value for display normalization uses a 3-sigma
bound: 3√(variance_per_site), where variance_per_site = (1/N) Σ_k 1/(2ω_k).

**Code**: `freeScalar/vacuumSpectrum.ts:301–316` (`estimateVacuumMaxPhi`).

## 4. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| dπ/dt = ∇²φ - m²φ | `freeScalarUpdatePi.wgsl.ts:43` |
| dφ/dt = π | `freeScalarUpdatePhi.wgsl.ts:23` |
| ∇²φ (central differences, periodic) | `freeScalarUpdatePi.wgsl.ts:28–38` |
| Self-interaction -4λφ(φ²-v²) | `freeScalarUpdatePi.wgsl.ts:46–49` |
| ω_k (lattice dispersion) | `freeScalar/vacuumSpectrum.ts:45–66` |
| Vacuum sampling ⟨\|φ_k\|²⟩ = N/(2ω_k) | `freeScalar/vacuumSpectrum.ts:229–230` |
| CFL: dt < 2/ω_max | `sliceSetterUtils.ts:49–58` |
| PML absorber | `freeScalarAbsorber.wgsl.ts` |

## 5. Accuracy Characterization

### 5.1 Temporal Error

O(dt²) global error from the leapfrog. Energy oscillates around the true value
with amplitude O(dt²) but does not drift — this is the symplectic property.
The E2E test confirms < 5% energy drift over 200 frames.

### 5.2 Spatial Error

O(h²) from the central-difference Laplacian. This causes the lattice
dispersion to deviate from the continuum dispersion at high k (near Nyquist).
Low-k modes are accurately propagated; high-k modes have modified phase
velocity.

### 5.3 CFL Violation

If dt > 2/ω_max, the leapfrog becomes linearly unstable: field amplitudes grow
exponentially. This manifests as a white-out in the renderer. The UI clamps dt
to 0.9 × CFL limit to prevent this.

## 6. Validation

| Benchmark | Test | Tolerance |
|-|-|-|
| Zero mode ω(k=0) = m_eff | `validationBenchmarks.test.ts` | 10⁻¹⁰ |
| Non-zero mode dispersion | `validationBenchmarks.test.ts` | 10⁻⁶ |
| Nyquist mode dispersion | `validationBenchmarks.test.ts` | 10⁻¹⁰ |
| Vacuum phi variance (200 seeds) | `kSpaceOccupation.test.ts` | 20% (statistical) |
| Real-space E = k-space E | `kSpaceOccupation.test.ts` | 1% |
| Energy conservation (E2E) | `physics-numerical-validation.spec.ts` | 5% over 200 frames |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Klein-Gordon equation](https://en.wikipedia.org/wiki/Klein%E2%80%93Gordon_equation) —
  Klein-Gordon formulation.
- [Wikipedia: Leapfrog integration](https://en.wikipedia.org/wiki/Leapfrog_integration) —
  Störmer-Verlet, symplectic property, CFL condition.
- Tong, D. *Quantum Field Theory*. Cambridge Lecture Notes.
  [DAMTP](https://www.damtp.cam.ac.uk/user/tong/qft.html) —
  Free field quantization, vacuum state.
