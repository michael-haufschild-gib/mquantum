# Dirac Equation Mode

## Purpose

Documents the mathematical formulation, N-dimensional Clifford algebra
construction, matrix exponential propagator, and physical phenomena for
the lattice Dirac equation solver.

## 1. Theoretical Basis

### 1.1 The Dirac Equation

The time-dependent Dirac equation in N spatial dimensions:

    iℏ ∂ψ/∂t = H_Dirac ψ = [c α·p + βmc² + V(x)] ψ

where:
- ψ is an S-component complex spinor (S depends on dimension, see §2)
- α = (α₁, ..., α_N) and β are S×S Hermitian matrices satisfying the
  Clifford algebra
- c is the speed of light, m is the particle rest mass
- p = -iℏ∇ is the momentum operator
- V(x) is a scalar potential (acts as V·I on the spinor)

**Source**: [Wikipedia: Dirac equation](https://en.wikipedia.org/wiki/Dirac_equation).
Thaller, B. *The Dirac Equation*. Springer, 1992.
DOI: [10.1007/978-3-662-02753-0](https://link.springer.com/book/10.1007/978-3-662-02753-0).

### 1.2 Numerical Method

The Dirac equation is solved by Strang split-step Fourier:

    ψ(t+dt) ≈ e^{-iV dt/2} · FFT⁻¹[e^{-iH_free(k) dt} · FFT[e^{-iV dt/2} · ψ(t)]]

The potential half-step is a scalar phase rotation (V acts as V·I on the
spinor). The kinetic step involves an S×S matrix exponential at each k-point.

- **Temporal convergence**: O(dt²) from Strang splitting.
- **Stability**: Unconditionally stable (unitary).

Full convergence analysis: [`compute-solver-convergence.md`](compute-solver-convergence.md) §2.3.

### 1.3 Exact Matrix Exponential

The free Dirac Hamiltonian in k-space, H_free(k) = cα·ℏk + βmc², satisfies
the Clifford algebra identity H² = E²·I, where E = √((cℏ|k|)² + (mc²)²) is
the relativistic energy-momentum relation. This allows the matrix exponential
to be computed in closed form:

    exp(-iH·dt/ℏ) = cos(E·dt/ℏ)·I - i·sin(E·dt/ℏ)·(H/E)

This is exact — no Taylor truncation or Padé approximation. The only temporal
error is the Strang splitting between kinetic and potential steps.

**Code**: `diracKinetic.wgsl.ts:141–163`.

**Source**: Standard result from the Clifford algebra anticommutation relations
{γ^μ, γ^ν} = 2η^{μν}I. [Wikipedia: Dirac equation](https://en.wikipedia.org/wiki/Dirac_equation).

## 2. N-Dimensional Clifford Algebra

### 2.1 Spinor Dimension

For N spatial dimensions, the Clifford algebra Cl(N+1) (N alpha matrices + beta)
requires spinor dimension:

    S = 2^⌊(N+1)/2⌋,  minimum 2

| N (spatial) | S (spinor components) |
|-|-|
| 1 | 2 |
| 2 | 2 |
| 3 | 4 |
| 4 | 4 |
| 5 | 8 |
| 6 | 8 |
| 7 | 16 |
| 8 | 16 |
| 9 | 32 |
| 10 | 32 |
| 11 | 64 |

**Code**: `dirac/scales.ts:81–83`, `dirac/cliffordAlgebraFallback.ts:12–14`.

**Source**: [Wikipedia: Higher-dimensional gamma matrices](https://en.wikipedia.org/wiki/Higher-dimensional_gamma_matrices).

### 2.2 Construction via Pauli Tensor Products

The gamma matrices are constructed iteratively using Kronecker products of
Pauli matrices σ₁, σ₂, σ₃:

**Base case** (N = 1, 2): α₁ = σ₁, α₂ = σ₂, β = σ₃.

**Inductive step** (adding 2 dimensions):
- Extend existing: α_j → α_j ⊗ σ₃
- New directions: α_{2k-1} = I ⊗ σ₁, α_{2k} = I ⊗ σ₂
- Extend beta: β → β ⊗ σ₃

After construction, a permutation reorders the basis into standard Dirac form
where β = diag(I_{S/2}, -I_{S/2}), so components 0..S/2-1 are particle and
S/2..S-1 are antiparticle.

**Code**: `dirac/cliffordAlgebraFallback.ts:150–205` (full JS fallback).

**Source**: [Wikipedia: Gamma matrices](https://en.wikipedia.org/wiki/Gamma_matrices)
(construction via tensor products of Pauli matrices).

### 2.3 Verification

The Clifford algebra anticommutation relations are verified by explicit matrix
multiplication for every spatial dimension 1-11:

- {α_i, α_j} = 2δ_{ij}I (286 products checked)
- β² = I
- {α_i, β} = 0

All entries are exactly {0, ±1, ±i} from Pauli tensor products, so no
floating-point error accumulates.

**Code**: `cliffordAlgebraFallback.test.ts` (52 tests).

Full verification table: [`validation-methodology.md`](validation-methodology.md)
§Dirac — Clifford Algebra.

## 3. Physical Scales

| Scale | Formula | Code |
|-|-|-|
| Compton wavelength | λ_C = ℏ/(mc) | `dirac/scales.ts:17–19` |
| Zitterbewegung frequency | ω_Z = 2mc²/ℏ | `dirac/scales.ts:29–31` |
| Klein threshold | V₀ = 2mc² | `dirac/scales.ts:41–43` |
| Relativistic energy | E = √((pc)² + (mc²)²) | `dirac/scales.ts:53–55` |
| CFL guideline | dt < min(Δx)/(c√N) | `dirac/scales.ts:67–72` |

**Sources**:
- [Wikipedia: Zitterbewegung](https://en.wikipedia.org/wiki/Zitterbewegung) —
  Trembling motion at angular frequency ω = 2mc²/ℏ.
- [Wikipedia: Klein paradox](https://en.wikipedia.org/wiki/Klein_paradox) —
  Pair creation onset at V₀ = 2mc².
- [Wikipedia: Energy-momentum relation](https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation) —
  Relativistic dispersion E² = (pc)² + (mc²)².

## 4. Supported Physical Phenomena

| Phenomenon | Preset | Physics |
|-|-|-|
| Klein paradox | `kleinParadox` | Supercritical step potential V₀ > 2mc² |
| Zitterbewegung | `zitterbewegung` | Positive/negative energy interference |
| Barrier tunneling | `diracBarrierTunneling` | Relativistic tunneling transmission |
| Relativistic hydrogen | `relativisticHydrogen` | Coulomb potential, fine structure |
| Dirac oscillator | `diracOscillator` | Harmonic trap: E_n = mc²√(1 + 2nℏω/mc²) |
| Spin precession | `spinPrecession` | Inhomogeneous potential spin dynamics |

**Code**: `dirac/presets.ts:24–123`.

## 5. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| H·ψ = (c Σ α_j ℏk_j + βmc²)·ψ | `diracKinetic.wgsl.ts:86–139` |
| exp(-iHt) = cos(Et)I - i sin(Et)(H/E) | `diracKinetic.wgsl.ts:141–163` |
| E = √((cℏ\|k\|)² + (mc²)²) | `diracKinetic.wgsl.ts:74` |
| S = 2^⌊(N+1)/2⌋ | `dirac/scales.ts:81–83` |
| Clifford construction | `dirac/cliffordAlgebraFallback.ts:150–205` |
| Standard Dirac form permutation | `dirac/cliffordAlgebraFallback.ts:120–131` |
| Potential half-step V·I | `diracPotentialHalf.wgsl.ts` |
| PML absorber | `diracAbsorber.wgsl.ts` |
| Diagnostics readback | `diracDiagnostics.wgsl.ts` |

## 6. Accuracy Characterization

### 6.1 Matrix Exponential Precision

The closed-form matrix exponential is exact in infinite precision. In f32, the
dominant error sources are:

1. **Phase reduction**: The argument E·dt/ℏ is reduced to [-π, π] before
   computing cos/sin (`diracKinetic.wgsl.ts:144–145`). The reduction
   `arg - round(arg/(2π))·2π` has relative error O(ε) for |arg| up to ~10⁴.

2. **Matrix-vector multiply**: S² multiplications per spinor per k-point.
   For S = 64 (11D), this is 4096 f32 multiply-adds. Each has O(ε) error,
   but they accumulate as O(√S² · ε) ≈ 64ε ≈ 7.6 × 10⁻⁶.

3. **sinOverE division**: When E → 0 (zero-momentum massless case), the
   division sin(Et)/E is guarded by `select(sinArg/E, 0.0, E < 1e-20)`
   (`diracKinetic.wgsl.ts:149`).

### 6.2 CFL Guideline

The split-step method is unconditionally stable (unitary), so the CFL condition
dt < min(Δx)/(c√N) is a guideline for accuracy, not stability. Exceeding it
causes the Strang splitting error to grow (the kinetic and potential operators
do not commute well at large dt), but the norm is preserved.

## 7. Validation

| Benchmark | Test | Tolerance |
|-|-|-|
| Relativistic dispersion E² = (pc)² + (mc²)² | `validationBenchmarks.test.ts` | 10⁻¹² |
| Rest energy E(p=0) = mc² | `validationBenchmarks.test.ts` | 10⁻¹⁴ |
| Massless limit E(m=0) = pc | `validationBenchmarks.test.ts` | 10⁻¹⁴ |
| ZBW frequency ω = 2mc²/ℏ | `validationBenchmarks.test.ts` | 10⁻¹⁴ |
| Klein threshold V₀ = 2mc² | `validationBenchmarks.test.ts` | 10⁻¹⁴ |
| CFL condition | `validationBenchmarks.test.ts` | 10⁻¹⁰ |
| Clifford algebra (dim 1-11) | `cliffordAlgebraFallback.test.ts` | 10⁻⁶ (52 tests) |
| Spinor dimension formula | `validationBenchmarks.test.ts` | exact |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Dirac equation](https://en.wikipedia.org/wiki/Dirac_equation) —
  Dirac Hamiltonian, Clifford algebra identity.
- Thaller, B. *The Dirac Equation*. Springer, 1992. ISBN 978-3-540-54883-6.
  DOI: [10.1007/978-3-662-02753-0](https://link.springer.com/book/10.1007/978-3-662-02753-0).
- [Wikipedia: Higher-dimensional gamma matrices](https://en.wikipedia.org/wiki/Higher-dimensional_gamma_matrices) —
  Spinor dimension formula, tensor product construction.
- [Wikipedia: Gamma matrices](https://en.wikipedia.org/wiki/Gamma_matrices) —
  Pauli tensor product construction.
- [Wikipedia: Zitterbewegung](https://en.wikipedia.org/wiki/Zitterbewegung) —
  ZBW frequency ω = 2mc²/ℏ.
- [Wikipedia: Klein paradox](https://en.wikipedia.org/wiki/Klein_paradox) —
  Pair creation at V₀ = 2mc².
- [Wikipedia: Energy-momentum relation](https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation) —
  Relativistic dispersion.
