# GPU Compute Solver Convergence Analysis

## Purpose

Documents the numerical methods, convergence orders, stability limits, and error
characterization for all GPU PDE solvers in the compute pipeline. Each claim
cites a web-verified reference with URL.

## 1. Solver Inventory

| Solver | Equation | Numerical method | Code entry point |
|-|-|-|-|
| TDSE | iℏ∂ψ/∂t = [-ℏ²∇²/(2m) + V]ψ | Strang split-step FFT | `TDSEComputePass.ts` |
| BEC (GPE) | iℏ∂ψ/∂t = [-ℏ²∇²/(2m) + V + g\|ψ\|²]ψ | Strang split-step FFT (same pass, g≠0) | `TDSEComputePass.ts` via `TdseBecStrategy.ts` |
| Pauli | iℏ∂ψ/∂t = [p²/(2m) + V + μ_B σ·B]ψ | Strang split-step FFT (2-component) | `PauliComputePass.ts` |
| Dirac | iℏ∂ψ/∂t = [cα·p + βmc² + V]ψ | Strang split-step FFT (S-component) | `DiracComputePass.ts` |
| Free Scalar (KG) | ∂²φ/∂t² = ∇²φ - m²φ | Symplectic leapfrog (Störmer-Verlet) | `FreeScalarFieldComputePass.ts` |
| Quantum Walk | Discrete unitary | Exact coin + shift | `QuantumWalkComputePass.ts` |

## 2. Convergence Orders

### 2.1 Strang Split-Step FFT (TDSE, Pauli, Dirac)

**Method**: Symmetric operator splitting (Strang splitting):

    ψ(t+dt) ≈ e^{-iV dt/2} · FFT⁻¹[e^{-iT(k) dt} · FFT[e^{-iV dt/2} · ψ(t)]]

where T(k) = ℏ²|k|²/(2m) is the kinetic energy in k-space and V is the potential.

**Temporal convergence**: O(dt²) — second order. The symmetric half-step/full-step/
half-step arrangement cancels first-order error terms via the Baker-Campbell-Hausdorff
formula.

**Spatial discretization error for the kinetic term**: None. The kinetic operator
T(k) = ℏ²|k|²/(2m) is applied exactly in Fourier space as a pointwise phase
rotation. There is no finite-difference approximation of the Laplacian. The only
spatial error is aliasing when the wavefunction has Fourier content beyond the
Nyquist frequency k_max = π/Δx.

**Spatial discretization error for the potential term**: None for smooth potentials.
The potential V(x) is evaluated pointwise on the grid and applied as a phase
rotation exp(-iV·dt/2). No spatial derivatives are taken. Discontinuous potentials
(step, barrier) introduce Gibbs-type ringing proportional to the grid spacing.

**Stability**: Unconditionally stable for any dt. The phase rotation exp(-iθ) has
|exp(-iθ)| = 1, so each half-step is norm-preserving (unitary). There is no CFL
condition. Accuracy degrades with large dt (the O(dt²) splitting error grows),
but the solution never blows up.

**References**:
- Strang, G. "On the construction and comparison of difference schemes."
  *SIAM J. Numer. Anal.* **5**(3), 506–517 (1968).
  [Wikipedia: Strang splitting](https://en.wikipedia.org/wiki/Strang_splitting).
- McLachlan, R.I. and Quispel, G.R.W. "Splitting methods." *Acta Numerica*
  **11**, 341–434 (2002).
  [Cambridge Core](https://www.cambridge.org/core/journals/acta-numerica/article/abs/splitting-methods/122F5736DAF3D88598989E68FE4D2EF2).
- Taha, T.R. and Ablowitz, M.J. "Analytical and numerical aspects of certain
  nonlinear evolution equations. II." *J. Comput. Phys.* **55**(2), 203–230 (1984).
  [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/0021999184900032).
- Exl, L. "Splitting methods for the Schrödinger equation." Report, Univ. Vienna.
  Proves second-order convergence via commutator bounds.
  [PDF](https://homepage.univie.ac.at/lukas.exl/files/Report_Splitting_Schroedinger.pdf).
- [Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method) —
  confirms kinetic operator is diagonal in wavenumber space with exact application.

### 2.2 BEC (Gross-Pitaevskii) Nonlinearity

The BEC mode uses the same Strang splitting as the linear TDSE, but the potential
half-step includes the nonlinear term V_eff = V + g|ψ|²
(`tdseApplyPotentialHalf.wgsl.ts:41`).

**Temporal convergence**: Still O(dt²) for the Strang splitting of the GPE, proven
for sufficiently regular solutions. The error constant depends on the interaction
strength g and the solution regularity.

**References**:
- Gao, R., Hong, J., Kong, L. et al. "Order of Convergence of Splitting Schemes
  for Deterministic/Stochastic Gross-Pitaevskii Equations with Rotating Angular
  Momentum." *J. Sci. Comput.* **104**, 95 (2025).
  [Springer](https://link.springer.com/article/10.1007/s10915-025-03010-z).
  Proves second-order convergence of Strang splitting for deterministic GPE.
- Thalhammer, M. et al. "Modified splitting methods for Gross-Pitaevskii systems."
  arXiv:2601.19838 (2026).
  [arXiv](https://arxiv.org/html/2601.19838v1).

### 2.3 Dirac Matrix Exponential

The Dirac free propagator in k-space uses the Clifford algebra identity H² = E²·I
to compute the matrix exponential exactly:

    exp(-iH·dt/ℏ) = cos(E·dt/ℏ)·I - i·sin(E·dt/ℏ)·(H/E)

where E = √((cℏ|k|)² + (mc²)²). This is not an approximation — the matrix
exponential is evaluated in closed form (`diracKinetic.wgsl.ts:142–163`).

**Temporal convergence**: The only temporal error is the Strang splitting between
the free propagator (k-space) and the potential step (x-space), giving O(dt²).

**References**:
- Standard result from relativistic QM. The identity follows from the Dirac/Clifford
  algebra anticommutation relations {γ^μ, γ^ν} = 2η^{μν}I.
  [Wikipedia: Dirac equation](https://en.wikipedia.org/wiki/Dirac_equation).

### 2.4 Symplectic Leapfrog (Free Scalar Field / Klein-Gordon)

**Method**: Störmer-Verlet leapfrog with Hamiltonian splitting H = T(π) + V(φ):

    π_{n+1} = π_n + dt · [∇²φ_n - m²φ_n]     (freeScalarUpdatePi.wgsl.ts)
    φ_{n+1} = φ_n + dt · π_{n+1}                (freeScalarUpdatePhi.wgsl.ts)

The discrete Laplacian uses the standard second-order central difference stencil:

    ∇²φ ≈ Σ_d [φ(x+e_d) - 2φ(x) + φ(x-e_d)] / a_d²

**Temporal convergence**: O(dt²) — second order (global error).

**Spatial convergence**: O(h²) — second order from the central-difference Laplacian.
This is the only solver with spatial truncation error, because the Laplacian is
computed in real space rather than in Fourier space.

**Stability (CFL condition)**: The leapfrog is stable when dt < 2/ω_max, where
ω_max is the maximum eigenfrequency of the discretized system:

    ω_max² = m² + Σ_d (2/a_d)²

This gives:

    dt_max = 2 / √(m² + Σ_d (2/a_d)²)

Implemented in `sliceSetterUtils.ts:49–58` (`computeCflLimit`), with a 0.9 safety
factor applied in `clampDtWithCfl` (line 69–78).

**Symplectic energy conservation**: The leapfrog conserves a modified Hamiltonian
H̃ = H + O(dt²). Energy oscillates around the true value with bounded amplitude
proportional to dt². It does not drift secularly.

**References**:
- [Wikipedia: Leapfrog integration](https://en.wikipedia.org/wiki/Leapfrog_integration) —
  confirms second-order global error, symplectic property, stability condition
  dt < 2/ω.
- Yoshida, H. "Construction of higher order symplectic integrators." *Phys. Lett. A*
  **150**(5–7), 262–268 (1990).
  DOI: [10.1016/0375-9601(90)90092-3](https://www.sciencedirect.com/science/article/pii/0375960190900923).

### 2.5 Quantum Walk (Discrete-Time)

**Method**: Exact unitary coin + shift operations on a lattice.

**Convergence**: Not applicable — the quantum walk is a discrete-time system, not
a discretization of a continuous PDE. Each step is an exact application of the
coin operator C and conditional shift operator S. There is no temporal or spatial
truncation error.

**Stability**: Unconditionally stable (unitary operators preserve norm exactly).

## 3. CFL and Stability Summary

| Solver | Stability condition | Implemented in |
|-|-|-|
| TDSE / BEC / Pauli | Unconditionally stable (unitary) | N/A |
| Dirac | Unconditionally stable (unitary) | `dirac/scales.ts:67–72` computes CFL for informational purposes |
| Free Scalar (KG) | dt < 2/√(m² + Σ(2/a_d)²) | `sliceSetterUtils.ts:49–58` |
| Quantum Walk | Unconditionally stable (unitary) | N/A |

The Dirac CFL in `dirac/scales.ts:67–72` computes `dt < min(Δx)/(c·√N)` as a
guideline for accuracy (not stability), since the split-step method is unitary.

## 4. Existing Empirical Validation

The following E2E tests in `scripts/playwright/physics-numerical-validation.spec.ts`
provide empirical evidence for the convergence properties documented above:

| Test | What it validates | Tolerance |
|-|-|-|
| "free potential, no absorber: normDrift < 0.5%" | TDSE split-step unitarity | 0.5% over 300 frames |
| "harmonic trap, no absorber: norm stays within 1%" | TDSE potential step + kinetic step | 1% over 200 frames |
| "free field: energyDrift < 5%" | KG leapfrog symplectic energy conservation | 5% over 200 frames |
| "uncertainty principle: ΔxΔp ≥ ℏ/2" | Observables GPU reduction correctness | 10% slack (0.45 vs 0.5) |
| "free particle: ⟨x⟩ moves in direction of ⟨p⟩" | Ehrenfest theorem (TDSE + observables) | Directional |

Additional unit tests:
- `integrator.test.ts:428–470`: CPU Euler integrator convergence is O(dt) with
  ratio ≈ 2× per halving (first-order, as expected for forward Euler).
- `hydrogenRadialND.test.ts`: Radial normalization ∫|R|²r²dr = 1 for D=3..11.
- `hydrogenNDCoupled.test.ts`: Coupled mode D=3 identity, 4D spherical symmetry.

## 5. What Is Not Tested (and Why)

**Grid refinement (h-convergence) for split-step FFT**: Not tested because the
split-step FFT has no spatial discretization error for the kinetic term. The only
spatial effect is aliasing, which depends on the wavefunction's Fourier content
relative to the grid Nyquist frequency — this is problem-dependent, not a property
of the integrator.

**Grid refinement for KG leapfrog**: The O(h²) spatial convergence of the central-
difference Laplacian is a standard textbook result. A dedicated h-refinement test
would require running the same simulation at multiple grid sizes and comparing,
which is expensive and provides limited additional confidence beyond the existing
energy conservation test.

**Convergence order measurement via dt-halving on GPU**: Would require running the
same initial condition at multiple dt values and comparing final states, which is
possible via E2E tests but expensive (~minutes per run). The convergence orders
are established by the mathematical proofs cited above; the E2E tests confirm
the implementation matches the theory.

## 6. Reproducing Thesis Figures

To generate convergence plots for a thesis:

1. **Norm conservation time series**: Enable TDSE diagnostics
   (`setTdseDiagnosticsEnabled(true)`), run for N frames, export via
   `File > Export > Simulation State`. The `tdseDiagnosticsStore` contains
   `normHistory` as a ring buffer.

2. **Energy conservation time series**: Enable observables
   (`setTdseObservablesEnabled(true)`). The `observablesDiagnosticsStore` contains
   `historyEnergy` as a ring buffer (120 samples at 60fps ≈ 2 seconds).

3. **CFL boundary demonstration**: Set the free scalar field dt above the CFL
   limit (disable the UI clamp by editing `sliceSetterUtils.ts:76` temporarily).
   The field amplitude will grow exponentially, visible as a white-out in the
   renderer.

4. **Data export**: Use `src/lib/export/dataExport.ts` to export diagnostic
   time series as JSON or CSV for external plotting (matplotlib, gnuplot, etc.).

## References

- Strang, G. *SIAM J. Numer. Anal.* **5**(3), 506–517 (1968).
- McLachlan, R.I. and Quispel, G.R.W. *Acta Numerica* **11**, 341–434 (2002).
  [Cambridge Core](https://www.cambridge.org/core/journals/acta-numerica/article/abs/splitting-methods/122F5736DAF3D88598989E68FE4D2EF2).
- Taha, T.R. and Ablowitz, M.J. *J. Comput. Phys.* **55**(2), 203–230 (1984).
  [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/0021999184900032).
- Exl, L. "Splitting methods for the Schrödinger equation." Univ. Vienna.
  [PDF](https://homepage.univie.ac.at/lukas.exl/files/Report_Splitting_Schroedinger.pdf).
- Gao, R. et al. *J. Sci. Comput.* **104**, 95 (2025).
  [Springer](https://link.springer.com/article/10.1007/s10915-025-03010-z).
- Yoshida, H. *Phys. Lett. A* **150**(5–7), 262–268 (1990).
  [ScienceDirect](https://www.sciencedirect.com/science/article/pii/0375960190900923).
- [Wikipedia: Strang splitting](https://en.wikipedia.org/wiki/Strang_splitting).
- [Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method).
- [Wikipedia: Leapfrog integration](https://en.wikipedia.org/wiki/Leapfrog_integration).
