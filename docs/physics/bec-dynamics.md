# BEC Dynamics Mode

## Purpose

Documents the mathematical formulation, Thomas-Fermi approximation, vortex
physics, and turbulence diagnostics for the Bose-Einstein condensate (BEC)
mode, which solves the Gross-Pitaevskii equation (GPE).

## 1. Theoretical Basis

### 1.1 The Gross-Pitaevskii Equation

The GPE describes the mean-field dynamics of a dilute Bose-Einstein condensate:

    iℏ ∂ψ/∂t = [-ℏ²∇²/(2m) + V(x) + g|ψ|²] ψ

where g is the interaction strength (g > 0 repulsive, g < 0 attractive) and
|ψ|² is the particle density. The GPE is the TDSE with an additional nonlinear
term g|ψ|².

**Source**: [Wikipedia: Gross-Pitaevskii equation](https://en.wikipedia.org/wiki/Gross%E2%80%93Pitaevskii_equation).
Pitaevskii, L. and Stringari, S. *Bose-Einstein Condensation*. Oxford
University Press, 2003. ISBN 978-0-19-850719-2.

### 1.2 Numerical Method

The GPE is solved by the same Strang split-step Fourier method as the linear
TDSE. The nonlinear term g|ψ|² is absorbed into the effective potential:

    V_eff(x) = V(x) + g|ψ(x)|²

applied during the potential half-step. Since |ψ|² is evaluated at the current
time step (not self-consistently), this is a first-order treatment of the
nonlinearity within each half-step. The Strang splitting still provides O(dt²)
global convergence for the GPE with sufficiently regular solutions.

Full convergence analysis: [`compute-solver-convergence.md`](compute-solver-convergence.md) §2.2.

**Code**: `tdseApplyPotentialHalf.wgsl.ts:41` — `effectiveV = potential[idx] + params.interactionStrength * density`.

**Source**: Gao, R. et al. "Order of Convergence of Splitting Schemes for
Deterministic/Stochastic Gross-Pitaevskii Equations." *J. Sci. Comput.*
**104**, 95 (2025).
[Springer](https://link.springer.com/article/10.1007/s10915-025-03010-z).

## 2. Thomas-Fermi Approximation

### 2.1 Chemical Potential

In the Thomas-Fermi limit (kinetic energy ≪ interaction energy), the kinetic
term is dropped and the ground-state density is n(r) = (μ - V(r))/g for
μ > V(r), zero otherwise. The chemical potential μ is determined by
normalization.

For a D-dimensional isotropic harmonic trap V = ½mω²|x|² (natural units
ℏ = m = 1):

    μ_D = [D(D+2) · ω^D · g · Γ(D/2) / (2^{D/2+2} · π^{D/2})]^{2/(D+2)}

Special cases:
- D = 2: μ = ω√(g/π)
- D = 3: μ = ½(15g/(4π))^{2/5} · ω^{6/5}

**Code**: `bec/chemicalPotential.ts:52–59` (`thomasFermiMuND`).

**Source**: [Wikipedia: Gross-Pitaevskii equation](https://en.wikipedia.org/wiki/Gross%E2%80%93Pitaevskii_equation)
(Thomas-Fermi approximation section).

### 2.2 Thomas-Fermi Radius

The condensate boundary in a harmonic trap:

    R_TF = √(2μ / (mω²))

**Code**: `bec/chemicalPotential.ts:97–101` (`thomasFermiRadius`).

### 2.3 Healing Length

The minimum length scale of density features in the condensate:

    ξ = ℏ / √(2m·g·n)

where n = |ψ|² is the local density. Features smaller than ξ (e.g., vortex
cores) cost too much kinetic energy to form.

**Code**: `bec/chemicalPotential.ts:119–123` (`healingLength`).

### 2.4 Sound Speed

The Bogoliubov speed of sound (propagation speed of small density perturbations):

    c_s = √(g·n / m)

**Code**: `bec/chemicalPotential.ts:140–144` (`soundSpeed`).

## 3. Vortex Physics

### 3.1 Quantized Vortices

In a superfluid described by ψ = √n · e^{iφ}, the velocity field is
v = (ℏ/m)∇φ, and the circulation around any closed loop is quantized:

    ∮ v · dl = (2πℏ/m) · q

where q is an integer winding number (vortex charge). Vortex cores are
topological defects where the density vanishes and the phase is undefined.

**Source**: [Wikipedia: Quantum vortex](https://en.wikipedia.org/wiki/Quantum_vortex).

### 3.2 N-D Vortex Topology

In D dimensions, a vortex with charge q in the (x_i, x_j) plane is a
(D-2)-dimensional surface where |ψ| = 0. The code supports:

- Single vortex imprinting (any plane)
- Vortex lattices (multiple same-charge vortices)
- Vortex-antivortex pairs (alternating charges)
- Vortex reconnection setups (orthogonal planes, D ≥ 4)

Presets for 4D and 5D vortex reconnection (`bec/presets.ts:118–196`) are
believed to be the first interactive GPE vortex simulations in D > 3.

### 3.3 Dark Solitons

In 1D (or quasi-1D), the GPE with repulsive interactions (g > 0) supports
dark soliton solutions — density dips that propagate without spreading due to
nonlinearity balancing dispersion. A stationary dark soliton has the exact
form ψ(x) ∝ tanh(x / (√2 ξ)).

**Source**: [Wikipedia: Bose-Einstein condensate](https://en.wikipedia.org/wiki/Bose%E2%80%93Einstein_condensate)
(solitons section).

## 4. Incompressible Kinetic Energy Spectrum

### 4.1 Helmholtz Decomposition

For quantum turbulence analysis, the velocity field is decomposed into
compressible (irrotational) and incompressible (solenoidal) components via
the Helmholtz projection in k-space:

    û_incomp(k) = û(k) - k̂(k̂ · û(k))

where û(k) is the Fourier transform of the density-weighted velocity
u(x) = j(x) / |ψ(x)|, with j = (ℏ/m) Im(ψ* ∇ψ) the probability current.

### 4.2 Spectrum Computation

The incompressible kinetic energy spectrum is shell-binned (logarithmic):

    E_incomp(k_n) = ½m Σ_{|k'| ∈ shell(n)} Σ_d |û_incomp_d(k')|²

In the inertial range, quantum turbulence exhibits the Kolmogorov k^{-5/3}
scaling, analogous to classical turbulence.

**Code**: `bec/incompressibleSpectrum.ts:172–359` (`computeIncompressibleSpectrum`).

**Sources**:
- Nore, C., Abid, M. and Brachet, M.E. "Kolmogorov Turbulence in
  Low-Temperature Superflows." *Phys. Rev. Lett.* **78**, 3896 (1997).
  DOI: [10.1103/PhysRevLett.78.3896](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.78.3896).
- Bradley, A.S. and Anderson, B.P. "Energy Spectra of Vortex Distributions in
  Two-Dimensional Quantum Turbulence." *Phys. Rev. X* **2**, 041001 (2012).
  DOI: [10.1103/PhysRevX.2.041001](https://link.aps.org/doi/10.1103/PhysRevX.2.041001).

## 5. Equation-to-Code Mapping

| Physics formula | Code location |
|-|-|
| iℏ∂ψ/∂t = [T + V + g\|ψ\|²]ψ | `TDSEComputePass.ts` via `TdseBecStrategy.ts` |
| V_eff = V + g\|ψ\|² | `tdseApplyPotentialHalf.wgsl.ts:41` |
| μ_D Thomas-Fermi chemical potential | `bec/chemicalPotential.ts:52–59` |
| R_TF = √(2μ/(mω²)) | `bec/chemicalPotential.ts:97–101` |
| ξ = ℏ/√(2mgn) healing length | `bec/chemicalPotential.ts:119–123` |
| c_s = √(gn/m) sound speed | `bec/chemicalPotential.ts:140–144` |
| Helmholtz projection | `bec/incompressibleSpectrum.ts:322–334` |
| E_incomp(k) shell binning | `bec/incompressibleSpectrum.ts:339–344` |

## 6. Accuracy Characterization

### 6.1 Nonlinearity Regime

The split-step treatment of g|ψ|² is first-order within each half-step. For
strong interactions (large g) or rapidly varying density, the splitting error
constant grows. The practical limit is g·|ψ|²·dt ≪ 1 for the phase rotation
to be well-resolved. The UI dt value and stepsPerFrame are tuned per preset
to stay in this regime.

### 6.2 Vortex Core Resolution

A vortex core has size ~ξ (healing length). The grid spacing Δx must satisfy
Δx < ξ for vortex dynamics to be physical. If Δx > ξ, the core cannot be
resolved and vortex motion is dominated by discretization artifacts. The
presets set spacing to resolve ξ with at least 3-4 grid points.

### 6.3 Attractive Interactions (g < 0)

For g < 0, the condensate can undergo collapse when the particle number exceeds
a critical value. The split-step method remains unitary but the solution
develops sharp density spikes that eventually alias on the grid. This is a
physical instability, not a numerical bug — but the grid resolution limits how
far into the collapse the simulation can track accurately.

## 7. Validation

| Benchmark | Test | Tolerance |
|-|-|-|
| μ_3D positive for g > 0 | `chemicalPotential.test.ts` | exact |
| μ_ND(3) = μ_3D cross-check | `chemicalPotential.test.ts` | 10⁻⁸ |
| μ_ND(2) = ω√(g/π) | `chemicalPotential.test.ts` | 10⁻⁶ |
| μ scales as g^{2/5} | `chemicalPotential.test.ts` | 10⁻⁶ |
| μ scales as ω^{6/5} | `chemicalPotential.test.ts` | 10⁻⁶ |
| R_TF formula | `chemicalPotential.test.ts` | 10⁻² |
| ξ formula | `chemicalPotential.test.ts` | 10⁻⁶ |
| c_s formula | `chemicalPotential.test.ts` | 10⁻⁶ |
| GPE norm conservation (g > 0, g < 0) | `validationBenchmarks.test.ts` | 10⁻¹² |
| Bright soliton stationarity | `validationBenchmarks.test.ts` | 1% L2 |
| Strang convergence for GPE | `validationBenchmarks.test.ts` | ratio ∈ [2.5, 6.0] |

Full validation details: [`validation-methodology.md`](validation-methodology.md).

## References

- [Wikipedia: Gross-Pitaevskii equation](https://en.wikipedia.org/wiki/Gross%E2%80%93Pitaevskii_equation) —
  GPE formulation, Thomas-Fermi approximation, solitons.
- Pitaevskii, L. and Stringari, S. *Bose-Einstein Condensation*. Oxford
  University Press, 2003. ISBN 978-0-19-850719-2.
- Nore, C., Abid, M. and Brachet, M.E. *Phys. Rev. Lett.* **78**, 3896 (1997).
  DOI: [10.1103/PhysRevLett.78.3896](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.78.3896).
- Bradley, A.S. and Anderson, B.P. *Phys. Rev. X* **2**, 041001 (2012).
  DOI: [10.1103/PhysRevX.2.041001](https://link.aps.org/doi/10.1103/PhysRevX.2.041001).
- [Wikipedia: Quantum vortex](https://en.wikipedia.org/wiki/Quantum_vortex) —
  Quantized circulation, vortex topology.
- Gao, R. et al. *J. Sci. Comput.* **104**, 95 (2025).
  [Springer](https://link.springer.com/article/10.1007/s10915-025-03010-z).
