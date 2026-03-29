# Pauli Spinor Mode

## Purpose

Documents the mathematical formulation, SU(2) Zeeman rotation, magnetic field
models, and equation-to-code mapping for the Pauli equation solver.

## 1. Theoretical Basis

### 1.1 The Pauli Equation

The Pauli equation describes a non-relativistic spin-½ particle in an external
electromagnetic field. In this implementation (no vector potential A):

    iℏ ∂ψ/∂t = [p²/(2m) + V(x) + μ_B σ·B(x)] ψ

where:
- ψ = (ψ_↑, ψ_↓) is a 2-component complex spinor
- p²/(2m) = -ℏ²∇²/(2m) is the scalar kinetic energy (identity in spinor space)
- V(x) is a scalar potential (identity in spinor space)
- μ_B σ·B is the Zeeman interaction (SU(2) rotation in spinor space)
- σ = (σ_x, σ_y, σ_z) are the Pauli matrices

The Pauli equation is the non-relativistic limit of the Dirac equation. In
natural units, μ_B = 1 (the Bohr magneton is absorbed into B).

**Source**: [Wikipedia: Pauli equation](https://en.wikipedia.org/wiki/Pauli_equation).

### 1.2 Numerical Method

The Pauli equation is solved by Strang split-step Fourier, with each half-step
factored as:

    U_half = e^{-i[V + μ_B σ·B] dt/(2ℏ)}

This factors exactly into two commuting operations:

1. **Scalar potential phase** (both components):
   ψ_c → exp(-iV·dt/(2ℏ)) · ψ_c

2. **Zeeman SU(2) rotation** (mixes components):
   (ψ_↑, ψ_↓) → U_Z · (ψ_↑, ψ_↓)

The factorization is exact because V·I and σ·B commute (V is proportional to
the identity matrix in spinor space). The kinetic step applies the same phase
rotation exp(-iℏk²dt/(2m)) to both spinor components independently — no
inter-component mixing.

- **Temporal convergence**: O(dt²) from Strang splitting.
- **Stability**: Unconditionally stable (unitary).

Full convergence analysis: [`compute-solver-convergence.md`](compute-solver-convergence.md) §2.1.

### 1.3 Zeeman SU(2) Matrix

The Zeeman rotation matrix is computed via the Cayley-Klein parameterization:

    θ_B = |B|·dt/(2ℏ)
    n̂ = B/|B|
    U_Z = cos(θ_B)·I - i·sin(θ_B)·(σ·n̂)

Expanded as a 2×2 matrix:

    U_Z = [[cos θ - i·sin θ·n_z,    -sin θ·(n_y + i·n_x)],
            [sin θ·(n_y - i·n_x),     cos θ + i·sin θ·n_z]]

This is an exact SU(2) rotation of the spinor by angle 2θ_B about the axis n̂
on the Bloch sphere. When |B| = 0, U_Z = I (no rotation).

**Code**: `pauliPotentialHalf.wgsl.ts:149–183`.

**Source**: [Wikipedia: Pauli equation](https://en.wikipedia.org/wiki/Pauli_equation).

## 2. Magnetic Field Models

| Field type | Formula | B components | Code line |
|-|-|-|-|
| Uniform | B = B₀(sin θ cos φ, sin θ sin φ, cos θ) | Constant direction | `pauliPotentialHalf.wgsl.ts:113–121` |
| Gradient | B = (B₀ + g·z) ẑ | Inhomogeneous along z | `pauliPotentialHalf.wgsl.ts:122–125` |
| Rotating | B = B₀(cos ωt, sin ωt, 0) | Time-dependent, xy-plane | `pauliPotentialHalf.wgsl.ts:126–130` |
| Quadrupole | B = g(z x̂ + x ẑ) | Position-dependent, xz-plane | `pauliPotentialHalf.wgsl.ts:131–137` |

## 3. Scalar Potential Models

| Potential | Formula | Code line |
|-|-|-|
| None | V = 0 | `pauliPotentialHalf.wgsl.ts:66` (potentialType 0) |
| Harmonic trap | V = ½mω²\|x\|² | `pauliPotentialHalf.wgsl.ts:67–73` |
| Barrier | V = V₀ for \|x₀\| < w/2 | `pauliPotentialHalf.wgsl.ts:74–79` |
| Double well | V = V₀(1 - exp(-\|x\|²/w²)) | `pauliPotentialHalf.wgsl.ts:80–88` |

## 4. Physical Phenomena

### 4.1 Larmor Precession

In a uniform field B = B₀ ẑ, a spin initially in the x-direction precesses
about z at the Larmor frequency ω_L = γB₀, where γ is the gyromagnetic ratio.
The spin expectation values oscillate:

    ⟨σ_x⟩(t) = cos(ω_L t),  ⟨σ_y⟩(t) = sin(ω_L t)

**Preset**: `larmorPrecession` — uniform field along z, spin starts in xy-plane.

**Source**: [Wikipedia: Larmor precession](https://en.wikipedia.org/wiki/Larmor_precession).

### 4.2 Stern-Gerlach Effect

In a gradient field B = (B₀ + g·z)ẑ, the spin-dependent force F = ±μ_B g ẑ
separates the wavepacket into spin-up and spin-down components. This is a
spatial measurement of spin.

**Preset**: `sternGerlach` — gradient field, superposition initial state.

**Source**: [Wikipedia: Stern-Gerlach experiment](https://en.wikipedia.org/wiki/Stern%E2%80%93Gerlach_experiment).

### 4.3 Rabi Oscillations

A rotating transverse field at the Larmor frequency drives resonant transitions
between spin-up and spin-down. The transition probability oscillates at the
Rabi frequency Ω_R = μ_B B₁/ℏ.

**Preset**: `spinFlip` — rotating field at resonance.

**Source**: [Wikipedia: Rabi cycle](https://en.wikipedia.org/wiki/Rabi_cycle).

## 5. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| p²/(2m) kinetic phase (per component) | `pauliKinetic.wgsl.ts:55–76` |
| e^{-iV dt/(2ℏ)} scalar potential | `pauliPotentialHalf.wgsl.ts:91–105` |
| U_Z = cos(θ)I - i sin(θ)(σ·n̂) | `pauliPotentialHalf.wgsl.ts:149–183` |
| FFT (Stockham auto-sort) | `tdseStockhamFFT.wgsl.ts` (shared) |
| PML absorber | `pauliAbsorber.wgsl.ts` |
| Initialization | `pauliInit.wgsl.ts` |
| Diagnostics | `pauliDiagnostics.wgsl.ts` |

## 6. Accuracy Characterization

### 6.1 Kinetic Step

The kinetic operator p²/(2m) is a scalar in spinor space, so both components
receive the same phase rotation. This is exact in k-space (no spatial error).
The phase is reduced to [-π, π] before computing cos/sin
(`pauliKinetic.wgsl.ts:58`) to maintain f32 precision at high k.

### 6.2 Zeeman Step

The SU(2) matrix is computed from cos(θ_B) and sin(θ_B) where θ_B = |B|dt/(2ℏ).
The matrix is unitary to f32 precision: each step preserves total norm to O(ε).
For non-uniform fields, the SU(2) rotation varies across the lattice, producing
position-dependent spinor mixing.

### 6.3 Commutator Error

The Strang splitting assumes [T, V + σ·B] ≈ 0 over a time step. For slowly
varying fields (|∂B/∂t| · dt ≪ |B|), the commutator error is small. The
rotating-field preset (`spinFlip`) has time-dependent B, where the error scales
as O(ω·dt) per step. The preset dt is chosen to keep ω·dt < 0.01.

## 7. Validation

The Pauli solver shares the split-step infrastructure with the TDSE solver.
Mode-specific validation:

| Benchmark | Test | Tolerance |
|-|-|-|
| Norm conservation (all coin presets) | E2E rendering tests | visual (non-black pixels) |
| Lindblad pure dephasing (off-diagonal decay) | `analyticalBenchmarks.test.ts` | 2% |
| Lindblad populations unchanged | `analyticalBenchmarks.test.ts` | 10⁻¹⁰ |
| Purity trajectory | `analyticalBenchmarks.test.ts` | 2% |

The Lindblad benchmarks test the open-quantum extension of the Pauli system,
validating the density matrix evolution against exact analytical solutions for
the pure dephasing channel.

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Pauli equation](https://en.wikipedia.org/wiki/Pauli_equation) —
  Non-relativistic spin-½ Hamiltonian, SU(2) rotation.
- [Wikipedia: Larmor precession](https://en.wikipedia.org/wiki/Larmor_precession) —
  Precession frequency ω_L = γB.
- [Wikipedia: Stern-Gerlach experiment](https://en.wikipedia.org/wiki/Stern%E2%80%93Gerlach_experiment) —
  Spin-dependent spatial separation.
- [Wikipedia: Rabi cycle](https://en.wikipedia.org/wiki/Rabi_cycle) —
  Resonant spin transitions, Rabi frequency.
