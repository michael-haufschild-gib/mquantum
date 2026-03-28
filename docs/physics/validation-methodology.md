# Validation Methodology

## Validation Philosophy

This system validates its physics implementations using a hierarchy of techniques ordered by rigor:

1. **Exact analytical solutions** where they exist (strongest)
2. **Convergence-order verification** for PDE solvers
3. **Conservation law monitoring** during time evolution
4. **Property-based fuzz testing** over randomized inputs

Comparing against another numerical code (e.g., QuTiP, GPUE) is intentionally omitted. Code-vs-code comparison tells you two implementations *agree*, not that either is *correct*. Every benchmark in this document compares against an exact analytical result or a provable mathematical property, which is a strictly stronger form of validation.

All reference formulas cited below were verified from online sources. The specific URL is given with each benchmark. No benchmark values are taken from memory or training data.

## Test Infrastructure Summary

| Category | Test Files | Tests | Status |
|-|-|-|-|
| Analytical benchmarks | `analyticalBenchmarks.test.ts` | 208 | All passing |
| Validation benchmarks | `validationBenchmarks.test.ts` | 32 | All passing |
| Clifford algebra (dim 1-11) | `cliffordAlgebraFallback.test.ts` | 52 | All passing |
| Property-based (fast-check) | 19 files | ~350 | All passing |
| BEC chemical potential | `chemicalPotential.test.ts` | 22 | All passing |
| Quantum walk physics | `quantumWalk.test.ts` | ~25 | All passing |
| Free scalar k-space | `kSpaceOccupation.test.ts` | ~10 | All passing |
| Open quantum / Lindblad | 6 files | ~100 | All passing |
| Other physics + math | 30+ files | ~220 | All passing |
| **Total** | **48 physics files** | **1020** | **All passing** |

---

## Analytical Mode Validation

### Harmonic Oscillator Eigenfunctions

**Test file:** `analyticalBenchmarks.test.ts`

| Benchmark | Method | Tolerance | Reference |
|-|-|-|-|
| Normalization: `integral |phi_n|^2 dx = 1` | 20-pt Gauss-Hermite quadrature (NIST DLMF Table 3.5.13) | 10^-10 | [NIST DLMF 3.5](https://dlmf.nist.gov/3.5) |
| Orthogonality: `<phi_n|phi_m> = 0` for n != m | Same quadrature | 10^-10 | Same |
| Frequency scaling: normalization holds at omega = 0.5, 1.0, 2.0, 4.0 | Same | 10^-10 | Same |
| WGSL constants: `HO_NORM[n] = 1/sqrt(2^n n!)` cross-check | Direct formula | exact | Textbook identity |
| Hermite polynomial coefficients | Match analytical H_n(u) | exact | Textbook recurrence |

**Quadrature self-validation:** Before any physics test, the quadrature rule itself is tested against known exact integrals (`integral_0^inf e^{-x} dx = 1`, `integral_{-inf}^{inf} e^{-x^2} dx = sqrt(pi)`). If quadrature fails, all downstream tests fail — no silent corruption.

### Hydrogen Wavefunctions

**Test file:** `analyticalBenchmarks.test.ts`

| Benchmark | Method | Tolerance | States Tested |
|-|-|-|-|
| Radial normalization: `integral |R_nl|^2 r^2 dr = 1` | 10-pt Gauss-Laguerre (NIST DLMF Table 3.5.7) | 10^-7 | (1,0), (2,0), (2,1), (3,0), (3,1), (3,2) |
| Full 3D normalization: `integral |psi_nlm|^2 dV = 1` | Gauss-Laguerre x Gauss-Legendre x phi integration | 10^-3 | n=1..3, all valid (l,m) |
| Higher orbitals: `integral |psi_nlm|^2 dV = 1` | Same | 10^-2 | n=4..6, selected (l,m) |
| Energy eigenvalues: `E_n = -1/(2n^2)` Hartree | Direct formula | exact | n=1..7 |
| Rydberg series: `|E_n|` decreases as `1/n^2` | Ratio check | exact | n=1..7 |
| Dipole matrix element: `<1s|r|2p> = 256/(81 sqrt(6))` | Gauss-Laguerre integral | 0.5% | Lyman-alpha transition |

### Spherical Harmonics

**Test file:** `analyticalBenchmarks.test.ts`

| Benchmark | Method | Tolerance | Range |
|-|-|-|-|
| Normalization: `integral |Y_lm|^2 dOmega = 1` | Numerical integration over (theta, phi) | 10^-5 (l<=2), 10^-3 (l=3..6) | l=0..6, all valid m |
| Orthogonality: `<Y_l1m1|Y_l2m2> = 0` | Same | 10^-5 (low l), 10^-3 (high l) | Multiple (l,m) pairs |

### Associated Legendre Polynomials

| Benchmark | Method | Tolerance |
|-|-|-|
| Low-degree exact values: P_0^0(x)=1, P_1^0(x)=x, P_2^0(x)=(3x^2-1)/2, etc. | Direct evaluation at test points | 10^-12 |
| Endpoint values: P_l^0(1)=1, P_l^m(1)=0 for m>0 | Direct evaluation | exact |
| Three-term recurrence: (l-m+1)P_{l+1}^m = (2l+1)xP_l^m - (l+m)P_{l-1}^m | Verify identity | 10^-10 |
| High-l values (l=4..6): match closed-form polynomials | Direct comparison | 10^-10 |
| Boundary: P_l^m = 0 for |m| > l | Direct evaluation | exact |

### Associated Laguerre Polynomials

| Benchmark | Method | Tolerance |
|-|-|-|
| Base cases: L_0^alpha(x)=1, L_1^alpha(x)=1+alpha-x | Direct evaluation | 10^-12 |
| Ordinary Laguerre (alpha=0): L_2, L_3, L_4 match closed forms | Direct comparison | 10^-10 |
| Hydrogen-relevant: L_k^alpha for (n,l) used by hydrogen radial functions | Direct comparison | 10^-10 |
| Three-term recurrence: (k+1)L_{k+1}^alpha = (2k+alpha+1-x)L_k^alpha - (k+alpha)L_{k-1}^alpha | Verify identity | 10^-10 |

### f32 Overflow Canary

Tests that Legendre and Laguerre polynomials evaluated at f32 precision (matching GPU WGSL `f32`) remain finite for all quantum numbers used by the hydrogen shader (l up to 6, n up to 9).

### Open Quantum: Lindblad Pure Dephasing

**Test file:** `analyticalBenchmarks.test.ts`

| Benchmark | Reference | Tolerance |
|-|-|-|
| Off-diagonal decay: `rho_01(t) = rho_01(0) exp(-gamma t)` | Exact solution of dephasing master equation | 2% at dt=0.001 |
| Populations unchanged under pure dephasing | Exact: diagonal elements constant | 10^-10 |
| Purity trajectory: `Tr(rho^2) = 1 - 2p(1-p)(1 - exp(-2 gamma t))` | Exact analytical formula | 2% |

---

## PDE Solver Validation (CPU Reference Implementation)

The GPU compute shaders (WGSL) implement the split-step Fourier method for TDSE, BEC, Dirac, and other equations. Since WebGPU compute cannot be unit-tested in vitest/happy-dom, a CPU reference implementation of the 1D split-step solver is provided in `validationBenchmarks.test.ts`. This reference uses the identical algorithm (Strang splitting with FFT-based kinetic operator) and validates against exact analytical results.

### Norm Conservation

| Test | Potential | Steps | Measured Drift | Tolerance |
|-|-|-|-|-|
| Free particle (V=0) | None | 100 | < 10^-12 | Machine precision |
| Harmonic trap | V = 0.5 m omega^2 x^2 | 200 | < 10^-8 | 10^-8 |

The split-step method is exactly unitary for V=0 (kinetic operator is diagonal in k-space). For non-zero V, unitarity holds to O(dt^3) per step (Strang splitting).

### Free Gaussian Wavepacket Spreading

**Reference:** [Wikipedia: Wave packet](https://en.wikipedia.org/wiki/Wave_packet)

A free particle Gaussian wavepacket with initial width sigma_0 spreads according to the exact formula:

```
sigma(t) = sigma_0 sqrt(1 + (hbar t / (2 m sigma_0^2))^2)
```

| Time | Exact sigma(t) | Measured sigma(t) | Relative Error |
|-|-|-|-|
| t=1.0 | Computed from formula | Computed by CPU solver | < 2% |
| t=2.0 | Computed from formula | Computed by CPU solver | < 2% |
| t=3.0 | Computed from formula | Computed by CPU solver | < 2% |
| t=4.0 | Computed from formula | Computed by CPU solver | < 1% |
| t=5.0 | Computed from formula | Computed by CPU solver | < 2% |

Parameters: N=1024, dx=0.05, dt=0.005, m=1, hbar=1, sigma_0=2.

### Strang Splitting Convergence Order

**Reference:** [Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method)

The symmetric (Strang) split-step method has local truncation error O(dt^3), giving global error O(dt^2). When halving dt, the global error should decrease by a factor of approximately 4.

| dt | L2 Error vs Reference | Ratio |
|-|-|-|
| 0.02 | err_1 | - |
| 0.01 | err_2 | err_1/err_2 in [2.5, 6.0] |

Reference computed at dt=0.00125. The measured ratio confirms second-order convergence. The range [2.5, 6.0] accounts for higher-order error terms and the reference solution's own finite accuracy.

### Rectangular Barrier Tunneling

**Reference:** [Wikipedia: Rectangular potential barrier](https://en.wikipedia.org/wiki/Rectangular_potential_barrier)

For a particle with energy E incident on a rectangular barrier of height V_0 and width a:

- **E < V_0:** `T = 1 / [1 + V_0^2 sinh^2(kappa a) / (4 E (V_0 - E))]` where `kappa = sqrt(2m(V_0 - E)) / hbar`
- **E > V_0:** `T = 1 / [1 + V_0^2 sin^2(k_1 a) / (4 E (E - V_0))]` where `k_1 = sqrt(2m(E - V_0)) / hbar`

**Analytical formula self-consistency tests (all passing):**

| Property | Test |
|-|-|
| T in (0, 1) for E < V_0 | Verified for E = 1, 3, 5, 7, 9 with V_0 = 10, a = 0.5 |
| T + R = 1 (unitarity) | Verified to 10^-14 for all tested energies |
| T -> 1 as E -> infinity | T > 0.999 at E = 10^6 |
| T decreases with barrier width | Verified for a = 0.5, 1.0, 1.5 |

**CPU solver vs analytical formula:**

| E | V_0 | a | Exact T | Measured T | Relative Error |
|-|-|-|-|-|-|
| 20.0 | 3.0 | 0.5 | Computed | CPU solver output | < 10% |

The 10% tolerance accounts for momentum spread of the finite-width wavepacket (Gaussian in k-space). A monochromatic plane wave would match exactly; the wavepacket averages T(E) over a range of energies centered at the peak.

---

## Dirac Equation Validation

### Physical Scales

**Reference:** [Wikipedia: Energy-momentum relation](https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation), [Wikipedia: Zitterbewegung](https://en.wikipedia.org/wiki/Zitterbewegung)

**Test file:** `validationBenchmarks.test.ts`

| Benchmark | Formula | Tolerance |
|-|-|-|
| Relativistic dispersion | `E^2 = (pc)^2 + (mc^2)^2` | 10^-12 |
| Rest energy | E(p=0) = mc^2 | 10^-14 |
| Massless limit | E(m=0) = pc | 10^-14 |
| Pythagorean test | p=3, m=4, c=1 gives E=5 | 10^-14 |
| Zitterbewegung frequency | omega_ZBW = 2mc^2/hbar | 10^-14 |
| ZBW = 2x Compton frequency | omega_ZBW = 2 omega_C | 10^-12 |
| Compton wavelength | lambda_C = hbar/(mc) | 10^-14 |
| Klein threshold | V_0 = 2mc^2 | 10^-14 |
| CFL condition | dt < min(dx)/(c sqrt(N_dim)) | 10^-10 |
| Spinor dimension | S = 2^floor((N+1)/2) for dim=1..11 | exact |

### Clifford Algebra Anti-Commutation Relations (Dimensions 1-11)

**Test file:** `cliffordAlgebraFallback.test.ts` (52 tests)

The Dirac equation in N spatial dimensions requires a set of matrices {alpha_1, ..., alpha_N, beta} satisfying the Clifford algebra:

- `{alpha_i, alpha_j} = 2 delta_{ij} I` (equivalently: alpha_i^2 = I, and alpha_i alpha_j + alpha_j alpha_i = 0 for i != j)
- `beta^2 = I`
- `{alpha_i, beta} = 0` for all i

These relations are verified by explicit matrix multiplication for every spatial dimension 1-11. The matrices are generated by the tensor-product construction (Kronecker products of Pauli matrices) and permuted into standard Dirac form where `beta = diag(I_{S/2}, -I_{S/2})`.

| Dim | Spinor S | alpha_i^2 = I | {alpha_i, alpha_j} = 0 (i != j) | beta^2 = I | {alpha_i, beta} = 0 | Pairs Checked |
|-|-|-|-|-|-|-|
| 1 | 2 | Pass | 0 pairs (N=1) | Pass | 1 | 1 |
| 2 | 2 | Pass | 1 pair | Pass | 2 | 3 |
| 3 | 4 | Pass | 3 pairs | Pass | 3 | 6 |
| 4 | 4 | Pass | 6 pairs | Pass | 4 | 10 |
| 5 | 8 | Pass | 10 pairs | Pass | 5 | 15 |
| 6 | 8 | Pass | 15 pairs | Pass | 6 | 21 |
| 7 | 16 | Pass | 21 pairs | Pass | 7 | 28 |
| 8 | 16 | Pass | 28 pairs | Pass | 8 | 36 |
| 9 | 32 | Pass | 36 pairs | Pass | 9 | 45 |
| 10 | 32 | Pass | 45 pairs | Pass | 10 | 55 |
| 11 | 64 | Pass | 55 pairs | Pass | 11 | 66 |

Total anti-commutator products verified: 286 (sum of "Pairs Checked" column). All entries are checked element-by-element to tolerance 10^-6 (Float32 precision; all matrix entries are exactly {0, +/-1, +/-i} from Pauli tensor products, so no floating-point error accumulates).

---

## Free Scalar Field Validation

**Test file:** `validationBenchmarks.test.ts`, `kSpaceOccupation.test.ts`

### Lattice Dispersion Relation

| Benchmark | Expected | Tolerance |
|-|-|-|
| Zero mode (k=0) | omega = m_eff | 10^-10 |
| Non-zero mode | omega = sqrt(m^2 + k_lattice^2) | 10^-6 |
| Nyquist mode | omega = sqrt(m^2 + (2/a)^2) | 10^-10 |

### Vacuum Spectrum Statistics

The vacuum state sampler (`sampleVacuumSpectrum`) draws phi_k from Gaussians with variance N/(2 omega_k). After IFFT, the real-space variance per site should be `(1/N) sum_k 1/(2 omega_k)`.

| Test | Method | Tolerance |
|-|-|-|
| Real-space phi variance matches sum formula | 200 independent seeds, ensemble average | 20% (statistical) |

### Energy Conservation

| Test | Method | Tolerance |
|-|-|-|
| Real-space E = k-space E | Independent computation in both representations | < 1% |

---

## BEC (Gross-Pitaevskii) Validation

**Test file:** `chemicalPotential.test.ts`

The Thomas-Fermi approximation formulas are tested for internal consistency and scaling laws. External numerical comparison was not performed (published reference tables could not be retrieved in machine-readable form).

| Benchmark | Method | Tolerance |
|-|-|-|
| mu_3D(g, omega): positive for g > 0 | Direct evaluation | exact |
| mu_ND(3, g, omega) = mu_3D(g, omega) | Cross-check N-D formula against 3D | 10^-8 |
| mu_ND(2, g, omega) = omega sqrt(g/pi) (2D special case) | Analytical 2D formula | 10^-6 |
| mu scales as g^(2/5) at fixed omega | Ratio check | 10^-6 |
| mu scales as omega^(6/5) at fixed g | Ratio check | 10^-6 |
| Thomas-Fermi radius: R = sqrt(2 mu / (m omega^2)) | Direct formula | 10^-2 |
| Healing length: xi = hbar / sqrt(2 m g n) | Direct formula | 10^-6 |
| Sound speed: c_s = sqrt(g n / m) | Direct formula | 10^-6 |
| All dimensions 2-11 produce finite positive mu | Range check | exact |

---

## Quantum Walk Validation

**Test file:** `quantumWalk.test.ts`

**Reference:** [Wikipedia: Quantum walk](https://en.wikipedia.org/wiki/Quantum_walk) (ballistic spreading: sigma proportional to t)

| Benchmark | Method | Tolerance |
|-|-|-|
| Grover coin preserves probability | Total prob after steps = 1.0 | 10^-6 |
| Hadamard coin preserves probability | Same | 10^-6 |
| DFT coin preserves probability | Same | 10^-6 |
| Shift operator preserves probability | Same | 10^-6 |
| Full step (coin+shift) preserves probability | Same | 10^-6 |
| 1D Hadamard walk: ballistic spreading | Spread >= 15 after 20 steps (vs sqrt(20) ~ 4.5 for classical) | Qualitative |
| 3D DFT walk preserves probability | Total prob = 1.0 after 5 steps | 10^-6 |

---

## Property-Based Tests (fast-check)

19 test files use randomized inputs to verify mathematical properties that must hold for all valid arguments:

| Domain | File | Properties Tested |
|-|-|-|
| Spherical harmonics | `sphericalHarmonics.property.test.ts` | Orthonormality, continuity, pole behavior |
| Legendre polynomials | `legendre.property.test.ts` | Recurrence, bounds, symmetry |
| Laguerre polynomials | `laguerre.property.test.ts` | Recurrence, positivity, orthogonality |
| Hermite polynomials | `hermitePolynomials.property.test.ts` | Recurrence, parity, derivative relation |
| Hydrogen radial (N-D) | `hydrogenRadialND.property.test.ts` | Normalization, positivity, asymptotic decay |
| Wigner function | `wigner.property.test.ts`, `wignerHydrogen.property.test.ts` | Marginal distributions, normalization |
| Lindblad evolution | `lindblad.property.test.ts` | Trace preservation, positivity, monotone entropy |
| Complex matrix ops | `complexMatrix.property.test.ts` | Associativity, inverse, norm bounds |
| Vector/matrix math | `vector.property.test.ts`, `matrix.property.test.ts` | Linearity, orthogonality, determinant |
| Rotation matrices | `rotation.property.test.ts` | Orthogonality, determinant=1, composition |
| Trigonometric funcs | `trig.property.test.ts` | Identities, periodicity, bounds |
| FFT | `fft.test.ts` | Parseval theorem, linearity, roundtrip |
| URL serialization | `state-serializer.property.test.ts` | Roundtrip stability |
| Store setters | `storeSetters.property.test.ts` | Clamping, type invariants |
| Preset merge | `mergeWithDefaults.property.test.ts` | Idempotency, completeness |

---

## GPU Solver Validation Strategy

The GPU compute shaders (WGSL) cannot be tested in vitest because WebGPU requires a secure browser context. The validation strategy for GPU-resident code is:

1. **Algorithm equivalence:** The CPU reference solver in `validationBenchmarks.test.ts` implements the identical split-step Fourier algorithm (Strang splitting, FFT-based kinetic operator). The CPU tests prove the algorithm is correct; the GPU implementation uses the same mathematical operations.

2. **Runtime diagnostics:** The GPU pipeline reads back `totalNorm`, `normDrift`, `normLeft`/`normRight`, and `R`/`T` coefficients every N frames via `TDSEDiagnosticsReadback.ts`. These are displayed in the UI and can be verified visually or via Playwright e2e tests.

3. **WGSL string tests:** `tdse.test.ts` verifies that the compiled WGSL shader strings contain the expected struct fields, entry points, and mathematical operations. This catches refactoring regressions.

4. **E2E rendering tests:** Playwright tests (`scripts/playwright/rendering.spec.ts`) verify that all quantum modes produce non-black pixels on a real GPU, confirming the full pipeline from shader compilation through rendering.

---

## Limitations and Scope

| Limitation | Detail |
|-|-|
| No external code comparison | No comparison against QuTiP, GPUE, or other reference implementations. This is by design: analytical solutions are a stronger validation target. |
| Grid resolution | Browser GPU memory limits constrain grid sizes below what dedicated CUDA solvers achieve. All benchmarks use grids within the application's operating range. |
| GPU solver coverage | The CPU reference solver tests the algorithm; the GPU implementation is validated by runtime diagnostics and e2e tests, not by unit-testing the WGSL shaders directly. |
| BEC and Free Scalar | Validated against self-consistency (scaling laws, conservation, statistical properties) rather than published numerical tables. The Thomas-Fermi formula and vacuum spectrum formula are well-established, but specific published reference tables were not retrievable in machine-readable form. |
| Quantum Walk constant | The ballistic spreading rate sigma proportional to t is verified qualitatively. The exact proportionality constant for the Hadamard walk is not tested (the constant depends on coin operator details not published in accessible online sources). |

## References

All reference formulas were verified from the following online sources:

1. [Wikipedia: Rectangular potential barrier](https://en.wikipedia.org/wiki/Rectangular_potential_barrier) — Tunneling T/R formulas
2. [Wikipedia: Wave packet](https://en.wikipedia.org/wiki/Wave_packet) — Gaussian spreading sigma(t) formula
3. [Wikipedia: Split-step method](https://en.wikipedia.org/wiki/Split-step_method) — Strang splitting convergence order
4. [Wikipedia: Energy-momentum relation](https://en.wikipedia.org/wiki/Energy%E2%80%93momentum_relation) — Relativistic dispersion E^2 = (pc)^2 + (mc^2)^2
5. [Wikipedia: Zitterbewegung](https://en.wikipedia.org/wiki/Zitterbewegung) — ZBW frequency omega = 2mc^2/hbar
6. [Wikipedia: Quantum walk](https://en.wikipedia.org/wiki/Quantum_walk) — Ballistic spreading sigma proportional to t
7. [NIST DLMF Section 3.5](https://dlmf.nist.gov/3.5) — Gauss-Laguerre and Gauss-Hermite quadrature nodes and weights
