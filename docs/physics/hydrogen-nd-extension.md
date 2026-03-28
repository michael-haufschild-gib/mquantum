# N-Dimensional Hydrogen Atom Extension

## Purpose

Documents the theoretical basis and numerical error bounds for the D-dimensional
hydrogen atom implementation. Covers the parameter mapping from the standard
D-dimensional Coulomb problem to the WGSL shader code, the normalization
convention chosen for visualization, and quantitative floating-point error analysis.

## 1. Theoretical Basis

### 1.1 The D-Dimensional Coulomb Problem

The D-dimensional hydrogen atom Schrödinger equation separates in hyperspherical
coordinates (r, Ω) into a radial equation and an angular equation. The radial
equation for the reduced wavefunction u(r) = r^{(D-1)/2} R(r) takes the form:

    -u'' + [λ(λ+1)/r² - 1/r - E] u = 0

where the effective angular momentum is:

    λ = l + (D - 3) / 2

This is structurally identical to the 3D radial equation with l replaced by λ.
The angular equation yields D-dimensional hyperspherical harmonics built from
Gegenbauer polynomials.

**Source**: Dong, S.-H. *Wave Equations in Higher Dimensions* (Springer, 2011),
Part I (SO(n) group theory, angular momentum), Ch. 7 (Coulomb Potential — radial
solutions and energy spectrum in D dimensions).
Also Avery, J. *Hyperspherical Harmonics: Applications in Quantum Theory*
(Kluwer, 1989). The radial wavefunction form is independently confirmed by
Jana (2025, arXiv:2502.03565) eq. for R_{nℓ}(r) with ν = n + (d-3)/2.

### 1.2 Key Parameters

| Parameter | Formula | Physical meaning |
|-|-|-|
| Effective angular momentum | λ = l + (D-3)/2 | Centrifugal barrier shift from extra dimensions |
| Radial quantum number | n_r = n - l - 1 | Number of radial nodes (unchanged from 3D) |
| Effective principal number | n_eff = n_r + λ + 1 = n + (D-3)/2 | Determines energy and orbital extent |
| Energy | E_n(D) = -1/(2 n_eff²) | In Hartree atomic units |
| Radial wavefunction | R(r) = N × ρ^λ × L_{n_r}^{2λ+1}(ρ) × e^{-ρ/2} | ρ = 2r/(n_eff × a₀) |

At D = 3: λ = l, n_eff = n, and all formulas reduce to the standard hydrogen atom.

### 1.3 Physical Properties Preserved

The D-dimensional extension preserves these properties of the Coulomb problem:

1. **Correct node count**: R_{n,l}^{(D)}(r) has exactly n_r = n - l - 1 radial nodes,
   independent of D. Verified by `hydrogenRadialND.test.ts` (node-counting tests for
   D = 3, 5, 7, 11).

2. **l-degeneracy of energy**: E_n(D) depends only on n and D, not on l (or the
   angular momentum chain l₁ ≥ l₂ ≥ ... ≥ |m|). This is the D-dimensional analog of
   the Coulomb degeneracy. Verified by `hydrogenEnergyND.test.ts` ("energy is
   independent of l").

3. **Asymptotic behavior**: R(r) → r^λ as r → 0 (correct centrifugal suppression),
   R(r) → e^{-r/(n_eff a₀)} as r → ∞ (exponential decay with correct length scale).

4. **Orthogonality**: Radial wavefunctions with different n_r are orthogonal under
   the weight function used by the associated Laguerre polynomials. The D-dimensional
   angular harmonics are orthogonal on the (D-1)-sphere S^{D-1}.

5. **D = 3 identity**: Explicitly verified by `hydrogenRadialND.test.ts` (point-by-point
   comparison with the standard 3D R_nl) and `hydrogenNDCoupled.test.ts` (coupled mode
   matches standard Y_lm for D = 3).

### 1.4 Normalization Convention

**Convention**: The code normalizes radial wavefunctions with the **3D volume
element** r² dr for all dimensions D:

    ∫₀^∞ |R_{n,l}^{(D)}(r)|² r² dr = 1

This differs from the standard D-dimensional normalization ∫|R|² r^{D-1} dr = 1
used in the physics literature (e.g., Dong Ch. 7). The 3D convention is
chosen because:

- The renderer always integrates along 3D rays through the volume, so the natural
  weight is r² dr regardless of the mathematical dimension.
- The `densityScale` uniform provides user-adjustable amplitude compensation.
- The angular structure (nodes, symmetry, relative density distribution) is
  identical under both conventions — only the overall amplitude differs.

The normalization constant in the code (`hydrogenRadialNormND` in
`hydrogenRadial.wgsl.ts:204–217`) uses the front factor (2/(n_eff·a₀))^{3/2},
which corresponds to the 3D convention. For the true D-dimensional convention,
this would be (2/(n_eff·a₀))^{D/2}.

### 1.5 Equation-to-Code Mapping

| Physics formula | Reference | Code location |
|-|-|-|
| D-dim radial Schrödinger eq. | Dong Ch. 7 | Implicit in `hydrogenRadialND` structure |
| λ = l + (D-3)/2 | Dong Ch. 7; Jana (2025) | `hydrogenRadial.wgsl.ts:244` |
| n_eff = n + (D-3)/2 | Dong Ch. 7; Jana (2025) ν = n+(d-3)/2 | `hydrogenRadial.wgsl.ts:246`, `hydrogenNDCommon.wgsl.ts:186` |
| E = -1/(2 n_eff²) | Dong Ch. 7 | `hydrogenNDCommon.wgsl.ts:187` |
| R = N ρ^λ L_{n_r}^{2λ+1}(ρ) e^{-ρ/2} | Dong Ch. 7; Jana (2025) eq. for R_{nℓ} | `hydrogenRadial.wgsl.ts:238–276` |
| Normalization constant N | Dong Ch. 7 | `hydrogenRadial.wgsl.ts:204–217` (3D convention, see §1.4) |
| Hyperspherical harmonics Y_{l₁...} | Dong Part I; Avery (1989) | `hypersphericalHarmonics.wgsl.ts:256–371` |
| Per-layer Gegenbauer norm N_k | Dong Part I | `hypersphericalHarmonics.wgsl.ts:218–248` |
| Gegenbauer polynomial C_n^α(x) | Dong Part I; standard recurrence | `hydrogenRadial.wgsl.ts:312–330` |
| L² eigenvalue = ℓ(ℓ+d-2)ℏ² | Jana (2025); Dong Part I | Angular momentum in D dims |

> **Note**: "Dong Ch. 7" refers to the Coulomb Potential chapter of Dong (2011).
> "Dong Part I" refers to the SO(n) group theory and angular momentum chapters.
> Specific equation numbers are not cited because the book content could not be
> independently verified online. Consult the physical copy for exact equation
> references.

## 2. Floating-Point Error Analysis

All GPU computations use f32 (IEEE 754 single precision).
Machine epsilon: ε = 2⁻²³ ≈ 1.19 × 10⁻⁷.

### 2.1 LUT Precision

Two lookup tables store precomputed transcendental values:

| LUT | Size | Stored as | Max absolute value | Truncation error |
|-|-|-|-|-|
| `LN_GAMMA_HALF` | 30 entries (n = 1..30) | f32 | 25.19 | ≤ ε × 25.19 ≈ 3.0 × 10⁻⁶ |
| `LN_FACTORIAL_LUT` | 23 entries (k = 0..22) | f32 | 48.47 | ≤ ε × 48.47 ≈ 5.8 × 10⁻⁶ |

These are absolute errors in ln-domain. When exponentiated, an absolute error δ in
ln(x) produces relative error ≈ δ in x (for small δ). So each LUT lookup contributes
at most ~6 × 10⁻⁶ relative error to the final normalization — well within f32 precision.

### 2.2 LUT Index Bounds

The LUTs must not be accessed out of bounds. The maximum indices are derived from
UI parameter limits: n ≤ 7, l ≤ 6, D ≤ 11.

**LN_GAMMA_HALF** (accessed in `lnHypersphericalLayerNorm`):

    gammaArgDen = 2·lk + (D - k - 1) + 2

    Worst case: k = 0, lk = l₁ = 6, D = 11
    → 2×6 + 11 - 0 - 1 + 2 = 24 ≤ 30 ✓

    gammaArgNum = 2·lkp1 + (D - k - 1)

    Worst case: k = 0, lkp1 = l₂ = 5, D = 11
    → 2×5 + 11 - 0 - 1 = 20 ≤ 30 ✓

**LN_FACTORIAL_LUT** (accessed in `hydrogenRadialNormND`):

    denomFactIdx = n_r + 2λ + 1 = n + l + D - 3

    Worst case: n = 7, l = 6, D = 11
    → 7 + 6 + 11 - 3 = 21 ≤ 22 ✓

Both LUTs have sufficient entries. The out-of-range guards (`lnGammaHalf` returns 0.0
for n > 30, `lnFactorial` returns 0.0 for k > 22) are unreachable within UI limits.

### 2.3 Gegenbauer Recurrence Stability

The Gegenbauer polynomial C_n^α(x) is evaluated via the three-term recurrence:

    C_{i+1} = [2(i + α - 1) × x × C_i - (i + 2α - 2) × C_{i-1}] / (i + 1)

For |x| ≤ 1, |C_n^α(x)| ≤ C_n^α(1) = C(n + 2α - 1, n), where C denotes the
binomial coefficient. Within UI limits:

- Max recurrence degree: n = l₁ - l₂ ≤ 6
- Max α = l₂ + (D - k - 2)/2 ≤ 5 + (11 - 0 - 2)/2 = 9.5
- Max |C_6^{9.5}(1)| = C(24, 6) = 134,596

This is large but well within f32 range (max ~3.4 × 10³⁸). The relative error
per recurrence step is O(ε). For 6 steps:

    Relative error ≤ 6 × ε ≈ 7.2 × 10⁻⁷

### 2.4 Log-Space Normalization

`lnHypersphericalLayerNorm` computes:

    lnNormSq = log(prefactor) + lnNkFact + lnGammaNum - 0.6931472 - lnGammaDen

Five f32 additions. Each introduces ≤ ε rounding. Combined absolute error in
ln-domain:

    δ_ln ≤ 5 × ε × max(|term|) ≈ 5 × 1.19×10⁻⁷ × 25.19 ≈ 1.5 × 10⁻⁵

The subsequent `exp(0.5 × lnNormSq)` amplifies this to relative error ≈ δ_ln in
the normalization constant, i.e., ≤ 1.5 × 10⁻⁵.

### 2.5 Full Product Chain

For D = 11, the hyperspherical harmonic evaluates D - 3 = 8 Gegenbauer layers.
Each layer contributes:

- Normalization: ≤ 1.5 × 10⁻⁵ relative error
- Gegenbauer value: ≤ 7.2 × 10⁻⁷ relative error
- sin^{l_{k+1}} power: ≤ l_{max} × ε ≈ 7.2 × 10⁻⁷ relative error
- Multiplication: ε per multiply

Per-layer relative error: ≤ 1.7 × 10⁻⁵.

Over 8 layers (multiplicative accumulation):

    Total relative error ≤ 8 × 1.7 × 10⁻⁵ ≈ 1.4 × 10⁻⁴

### 2.6 Error Budget Assessment

| Component | Relative error bound | Notes |
|-|-|-|
| LUT lookup (single) | ≤ 6 × 10⁻⁶ | f32 truncation of f64 values |
| Gegenbauer recurrence | ≤ 7.2 × 10⁻⁷ | 6 steps max, backward-stable |
| Log-space normalization | ≤ 1.5 × 10⁻⁵ | 5-term sum |
| Full angular product (D=11) | ≤ 1.4 × 10⁻⁴ | 8 layers worst case |
| Radial wavefunction | ≤ 2 × 10⁻⁵ | Laguerre recurrence + norm |
| **Total wavefunction** | **≤ 2 × 10⁻⁴** | Angular × radial |

**Visualization precision requirement**: 8-bit color channels provide ~0.4%
(4 × 10⁻³) precision. The worst-case numerical error (2 × 10⁻⁴) is **~20× below**
the visualization precision floor. For 10-bit HDR (~0.1% precision), the error is
still ~5× below the threshold.

**Conclusion**: f32 precision is sufficient for all parameter combinations within
UI limits (n ≤ 7, l ≤ 6, D ≤ 11). No double-precision fallback or extended LUTs
are needed.

### 2.7 Boundary Cases

Near angular or radial **nodes** (where |ψ| → 0), the *relative* error can grow
large, but the *absolute* error remains bounded by the analysis above multiplied
by the peak wavefunction amplitude. Since volume rendering maps absolute density
to color (not relative), node regions render correctly as dark zones. The early-exit
guards at |ψ| < 10⁻¹⁵ in the shader code prevent wasted computation in these regions.

## References

- Dong, S.-H. *Wave Equations in Higher Dimensions*. Springer, 2011. ISBN 978-94-007-1916-3.
  DOI: [10.1007/978-94-007-1917-0](https://link.springer.com/book/10.1007/978-94-007-1917-0).
  - Part I: SO(n) group theory, angular momentum, hyperspherical harmonics
  - Ch. 7: Coulomb Potential — D-dimensional hydrogen radial solutions, energy spectrum
- Avery, J. *Hyperspherical Harmonics: Applications in Quantum Theory*. Kluwer, 1989.
  ISBN 978-0-7923-0165-3. DOI: [10.1007/978-94-009-2323-2](https://link.springer.com/book/10.1007/978-94-009-2323-2).
- Jana, A. "Generalized Radial Uncertainty Product for d-Dimensional Hydrogen Atom."
  arXiv:2502.03565, 2025. Confirms ν = n + (d-3)/2 and radial wavefunction form.
  [arxiv.org/abs/2502.03565](https://arxiv.org/abs/2502.03565).
- Louck, J.D. and Shaffer, W.H. "Generalized orbital angular momentum and the n-fold
  degenerate quantum-mechanical oscillator: Part I." *J. Mol. Spectroscopy* **4**(1–6),
  285–297 (1960). DOI: [10.1016/0022-2852(60)90090-4](https://www.sciencedirect.com/science/article/abs/pii/0022285260900904).
- Higham, N.J. *Accuracy and Stability of Numerical Algorithms*, 2nd ed. SIAM, 2002.
  ISBN 978-0-89871-521-7. DOI: [10.1137/1.9780898718027](https://epubs.siam.org/doi/10.1137/1.9780898718027).
