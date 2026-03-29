# Harmonic Oscillator Mode

## Purpose

Documents the mathematical formulation and equation-to-code mapping for the
quantum harmonic oscillator mode, covering 1D eigenfunctions, N-dimensional
product structure, and superposition.

## 1. Theoretical Basis

### 1.1 The 1D Quantum Harmonic Oscillator

The energy eigenfunctions of the 1D quantum harmonic oscillator (in natural
units ℏ = m = 1) are:

    φ_n(x, ω) = (ω/π)^{1/4} · (1/√(2^n n!)) · H_n(√ω · x) · e^{-½ωx²}

where H_n is the physicist's Hermite polynomial of degree n, and ω is the
angular frequency of the oscillator.

The energy eigenvalues are E_n = ω(n + ½).

**Source**: [Wikipedia: Quantum harmonic oscillator](https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator).

### 1.2 N-Dimensional Product Structure

For D dimensions with independent frequencies ω_d per axis, the N-D
eigenfunction is a product of 1D eigenfunctions:

    Ψ_{n₁...n_D}(x₁,...,x_D) = Π_d φ_{n_d}(x_d, ω_d)

The total energy is E = Σ_d ω_d(n_d + ½).

This factorization is exact because the N-D harmonic potential V = ½ Σ_d ω_d² x_d²
is separable. The implementation evaluates each 1D factor independently and
multiplies them, which is both exact and efficient.

### 1.3 Superposition

The mode supports superposition of up to 8 terms, each with independently
chosen quantum numbers per dimension. The superposition wavefunction is:

    Ψ_super(x, t) = Σ_k c_k · Ψ_k(x) · e^{-iE_k t}

where the coefficients c_k are normalized so that Σ_k |c_k|² = 1. The
time-dependent phase factors produce interference patterns that evolve
periodically (or quasi-periodically for incommensurate frequencies).

Random seeding selects quantum numbers per term and per dimension, producing
visually varied superpositions.

## 2. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| φ_n(x, ω) = (ω/π)^{1/4} · (1/√(2^n n!)) · H_n(√ω·x) · e^{-½ωx²} | `ho1d.wgsl.ts:40–62` |
| 1/√(2^n n!) normalization constants (n = 0..6) | `ho1d.wgsl.ts:20–28` (LUT `HO_NORM`) |
| H_n(u) Hermite polynomial via recurrence | `hermite.wgsl.ts` |
| N-D product Ψ = Π_d φ_{n_d}(x_d, ω_d) | `hoNDVariants.wgsl.ts` |
| Superposition Σ_k c_k Ψ_k e^{-iE_k t} | `hoSuperpositionVariants.wgsl.ts` |
| Per-dimension frequency ω_d | `uniforms.wgsl.ts` (omega array in `SchroedingerUniforms`) |

## 3. Accuracy Characterization

### 3.1 Hermite Polynomial Recurrence

The Hermite polynomial is evaluated via the standard three-term recurrence:

    H_0(u) = 1,  H_1(u) = 2u
    H_{n+1}(u) = 2u · H_n(u) - 2n · H_{n-1}(u)

For n ≤ 6 (the UI maximum), the recurrence is backward-stable. The maximum
|H_6(u)| for |u| within the rendering volume (|u| ≲ 5) is ~720, well within
f32 range. Per-step relative error is O(ε) where ε = 2⁻²³ ≈ 1.19 × 10⁻⁷,
giving total recurrence error ≤ 6ε ≈ 7.2 × 10⁻⁷.

### 3.2 Gaussian Envelope

The term e^{-½u²} is clamped to u² ≤ 40 (`ho1d.wgsl.ts:50`) to prevent
f32 underflow. At u² = 40, e^{-20} ≈ 2 × 10⁻⁹, which is below the
visualization threshold. No visible artifacts result from this clamp.

### 3.3 N-D Product Accumulation

For D dimensions, the wavefunction is a product of D independent 1D factors.
Each factor has relative error ≤ 1 × 10⁻⁶ (recurrence + normalization +
Gaussian). The product accumulates multiplicatively:

    Total relative error ≤ D × 1 × 10⁻⁶ ≈ 1.1 × 10⁻⁵ (worst case D = 11)

This is ~400× below the 8-bit visualization precision floor (4 × 10⁻³).

## 4. Validation

| Benchmark | Test file | Tolerance |
|-|-|-|
| Normalization ∫\|φ_n\|² dx = 1 | `analyticalBenchmarks.test.ts` | 10⁻¹⁰ |
| Orthogonality ⟨φ_n\|φ_m⟩ = 0 | `analyticalBenchmarks.test.ts` | 10⁻¹⁰ |
| Frequency scaling (ω = 0.5, 1, 2, 4) | `analyticalBenchmarks.test.ts` | 10⁻¹⁰ |
| HO_NORM constants = 1/√(2^n n!) | `analyticalBenchmarks.test.ts` | exact |
| Hermite coefficients match H_n(u) | `analyticalBenchmarks.test.ts` | exact |
| Hermite recurrence identity | `hermitePolynomials.property.test.ts` | 10⁻¹⁰ |
| Hermite parity H_n(-x) = (-1)^n H_n(x) | `hermitePolynomials.property.test.ts` | 10⁻¹⁰ |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Quantum harmonic oscillator](https://en.wikipedia.org/wiki/Quantum_harmonic_oscillator) —
  Eigenfunction formula, normalization, energy spectrum.
