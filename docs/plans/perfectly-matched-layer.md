# Plan: Perfectly Matched Layer (PML) Absorbing Boundaries

## Problem

Every compute-based quantum mode (TDSE, BEC, Pauli, Dirac, Free Scalar Field) uses a finite N-dimensional lattice for time evolution. The wavefunction is evolved via split-operator Strang splitting with Stockham FFT, which assumes periodic boundary conditions. A Complex Absorbing Potential (CAP) is applied after each timestep to damp outgoing waves before they wrap around:

```
ψ(x) *= exp(-α · (d/W)²)
```

where `d` is the distance from the nearest lattice face, `W` is the absorber width (fraction of grid), and `α` is the damping strength.

This has two fundamental defects:

1. **Reflections.** The CAP creates a potential step at the physical/absorber interface. Incoming waves partially reflect before being absorbed. The steeper the damping profile, the worse the reflection. The gentler it is, the less it absorbs. This is an inherent tradeoff with no good operating point.

2. **Visible cube boundary.** Residual density at the lattice edge is rendered as a hard cubic surface in the 3D volume. The wavefunction appears to "fill a box" rather than existing in free space. This is scientifically misleading — the cube is a simulation artifact, not physics.

## Solution: Perfectly Matched Layer

A PML replaces the ad-hoc CAP with a mathematically derived absorbing region that has **zero reflection at the interface** by construction. Waves entering the PML decay exponentially and never return to the physical domain. The interior solution is identical to an infinite-domain simulation.

### Mathematical Foundation

The PML works by complex coordinate stretching. In the absorbing layer, the spatial coordinate is analytically continued into the complex plane:

```
x → x̃(x) = x + (i/ω) ∫₀ˢ σ(s') ds'
```

where `σ(x) ≥ 0` is the absorption profile (zero in the physical domain, positive in the PML). This transforms propagating waves `e^{ikx}` into exponentially decaying solutions `e^{ikx} · e^{-k ∫σ ds/ω}` without changing the wave equation's impedance at the interface.

For the Schrödinger equation `iℏ ∂ψ/∂t = Hψ`, the PML modifies the spatial derivatives:

```
∂/∂x → (1/s(x)) · ∂/∂x
```

where `s(x) = 1 + iσ(x)/ω₀` is the complex stretching function and `ω₀` is a reference frequency (typically the dominant wave frequency).

### Formulation for Split-Operator FFT

Following [Antoine, Lorin, Tang 2020] and [Nissen, Kreiss 2011], the PML for the time-dependent Schrödinger equation with split-step FFT uses the auxiliary differential equation (ADE) approach.

The modified Schrödinger equation in the PML region becomes:

```
iℏ ∂ψ/∂t = -(ℏ²/2m) Σ_d (1/s_d) ∂/∂x_d [(1/s_d) ∂ψ/∂x_d] + V(x)ψ - iσ̃(x)ψ
```

where `s_d(x_d) = 1 + iσ_d(x_d)/ω₀` is the per-dimension stretching function.

For the split-operator method, this decomposes into:

**Kinetic step (k-space):** The standard kinetic phase kick `exp(-iℏk²dt/(2m))` is modified to include the PML damping. In k-space, the PML stretching becomes a complex frequency:

```
k_d → k_d / s_d
```

Since `s_d` is position-dependent, the PML kinetic step cannot be a pure k-space multiplication. Instead, we use the ADE formulation with an auxiliary field.

**Potential step (x-space):** The potential half-step gains an additional damping term:

```
ψ → ψ · exp(-[iV(x)/ℏ + σ̃(x)] · dt/2)
```

where `σ̃(x) = Σ_d σ_d(x_d)` is the total absorption at position x. This is the same as the CAP but with a carefully designed profile.

**ADE approach for the kinetic step:** Introduce auxiliary fields `φ_d` for each spatial dimension:

```
∂φ_d/∂t = -σ_d · φ_d + σ_d · ψ
```

The kinetic operator acts on `ψ + Σ_d φ_d` rather than on `ψ` alone. The auxiliary fields capture the "memory" of the PML and ensure reflectionless absorption.

### Practical Simplification: Absorbing-Potential PML (AP-PML)

For our split-operator FFT solver, the simplest effective PML formulation avoids auxiliary fields entirely. Following [Antoine, Lorin 2019], the **absorbing-potential PML** modifies only the potential half-step:

```
ψ → ψ · exp(-(iV/ℏ + σ(x) + iσ(x)·R(x)) · dt/2)
```

where:
- `σ(x)` is the absorption profile (real, ≥ 0, zero in physical domain)
- `R(x)` is a rotation profile that ensures impedance matching

The key insight is that for the Schrödinger equation, a **complex absorbing potential** of the form `W(x) = -σ(x)(1 + iR(x))` achieves near-PML performance when the profiles are optimally chosen:

```
σ(x) = σ_max · (d/L_PML)^p          (polynomial grading, p = 3 optimal)
R(x) = R_max · (d/L_PML)^(p-1)       (matched rotation profile)
```

where:
- `d` = distance into the PML from the interface
- `L_PML` = PML thickness
- `σ_max = -(p+1) · ln(R_target) / (2 · L_PML)` for target reflection coefficient `R_target`
- `R_max` is tuned to minimize reflection at the dominant wavenumber

This is applied during the potential half-step as a multiplicative factor, identical to the current CAP but with a superior profile that matches the impedance.

### Absorption Profile Design

The current CAP uses a quadratic profile: `damp = α · (d/W)²`. The optimal PML profile is cubic with matched parameters:

```
σ(x) = σ_max · (d / L_PML)³
```

with `σ_max` chosen to achieve a target reflection coefficient `R_target ≈ 10⁻⁶`:

```
σ_max = -4 · ln(10⁻⁶) / (2 · L_PML) ≈ 27.6 / L_PML
```

For a grid of size N with PML width W (fraction), `L_PML = W · N · Δx`:

```
σ_max = 27.6 / (W · N · Δx)
```

## Affected Modes

| Mode | Equation | Components | Current Absorber | PML Approach |
|------|----------|------------|------------------|--------------|
| TDSE | `iℏ ∂ψ/∂t = [-ℏ²∇²/(2m) + V]ψ` | 1 scalar | `tdseAbsorber.wgsl` | AP-PML in potential half-step |
| BEC | `iℏ ∂ψ/∂t = [-ℏ²∇²/(2m) + V + g\|ψ\|²]ψ` | 1 scalar | Reuses TDSE absorber | Same as TDSE |
| Pauli | `iℏ ∂ψ/∂t = [p²/(2m) + V + μ_B σ·B]ψ` | 2 spinor | `pauliAbsorber.wgsl` | AP-PML in potential half-step |
| Dirac | `iℏ ∂ψ/∂t = [cα·p + βmc² + V]ψ` | 2^⌊(N+1)/2⌋ | `diracAbsorber.wgsl` | AP-PML in potential half-step |
| Free Scalar | `∂²φ/∂t² = c²∇²φ - m²c⁴φ` | 2 (φ, π) | None (periodic) | AP-PML (needs new absorber) |

**Not affected:** Harmonic Oscillator and Hydrogen Orbital modes. These are analytic (not lattice-computed) and their wavefunctions naturally decay to zero. They use the density grid for rendering performance but the density is genuinely zero at the boundary.

## Implementation

### Phase 1: Optimal Absorption Profile (replaces CAP)

Replace the quadratic CAP damping with a cubic PML-optimal profile in all absorber shaders. This is a drop-in replacement that requires no new buffers, bind groups, or pipeline changes.

**Files to modify:**
- `src/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/pauliAbsorber.wgsl.ts`
- `src/rendering/webgpu/shaders/schroedinger/compute/diracAbsorber.wgsl.ts`

**Change:** Replace the damping computation in each absorber:

```wgsl
// BEFORE (CAP — quadratic, impedance-mismatched):
let ratio = (W - distFromEdge) / W;
let damp = params.absorberStrength * ratio * ratio;

// AFTER (PML-optimal — cubic grading with matched parameters):
let ratio = (W - distFromEdge) / W;
let damp = params.absorberStrength * ratio * ratio * ratio;
```

Additionally, compute `absorberStrength` from the target reflection coefficient rather than exposing it as a raw parameter. Add a uniform field `pmlTargetReflection` (default `1e-6`) and derive:

```
σ_max = -(p+1) · ln(R_target) / (2 · W · N · spacing)
```

**Uniform changes:**
- Add `pmlOrder: u32` (polynomial order, default 3) to each uniform struct
- Add `pmlTargetReflection: f32` (default 1e-6)
- Compute `σ_max` on CPU and pass as `absorberStrength` (derived, not user-tuned)

**Store changes:**
- Add `pmlTargetReflection` to TDSE, BEC, Pauli, Dirac config types
- Deprecate `absorberStrength` as a direct slider — replace with `pmlTargetReflection` logarithmic slider (1e-3 to 1e-10)
- Keep `absorberWidth` (now called `pmlWidth`) — this is still physically meaningful
- Keep `absorberEnabled` (now `pmlEnabled`)

### Phase 2: Widen Default PML Region

The current default absorber width is 15% of the grid per side. For PML to be effective:
- Minimum: 10% (20 grid points at N=200)
- Recommended: 15-20%
- Aggressive: 25%

At 15% width with cubic grading and σ_max tuned for R_target = 10⁻⁶, the PML should reduce boundary reflection by ~60 dB compared to the current quadratic CAP.

**Default changes:**

| Parameter | Current Default | New Default |
|-----------|----------------|-------------|
| `absorberWidth` → `pmlWidth` | 0.15 | 0.20 |
| `absorberStrength` → computed | 10.0 | auto from R_target |
| (new) `pmlTargetReflection` | — | 1e-6 |

### Phase 3: Free Scalar Field Absorber

The Free Scalar Field mode currently has NO absorber — it uses purely periodic boundaries. This means waves wrap around the domain and interfere with themselves. Add a PML absorber for this mode.

**Files to create:**
- `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarAbsorber.wgsl.ts`

**Files to modify:**
- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts` — add absorber dispatch after each timestep
- `src/lib/geometry/extended/types.ts` — add `absorberEnabled`, `pmlWidth`, `pmlTargetReflection` to `FreeScalarConfig`
- `src/stores/slices/geometry/types.ts` — add setters

The Free Scalar Field stores two real fields (φ, π) rather than a complex wavefunction. The damping is applied as:
```
φ *= exp(-σ(x) · dt)
π *= exp(-σ(x) · dt)
```

### Phase 4: Auxiliary-Field PML (Full PML, Optional)

For maximum accuracy, implement the full ADE-PML with auxiliary fields. This requires:
- N additional storage buffers (one auxiliary field per spatial dimension per wavefunction component)
- An additional compute pass per timestep to update the auxiliary fields
- Modified kinetic phase kick that accounts for the PML stretching

This is significantly more complex and may not be necessary if the AP-PML from Phase 1-2 achieves sufficient absorption. **Only implement if Phase 1-2 testing shows inadequate performance for specific use cases** (e.g., very low-energy waves where the polynomial CAP profile has poor absorption).

**Additional buffers per mode:**

| Mode | Components | Aux fields (per dim) | Total aux buffers (3D) |
|------|-----------|---------------------|----------------------|
| TDSE | 1 | 1 Re + 1 Im | 6 |
| BEC | 1 | 1 Re + 1 Im | 6 |
| Pauli | 2 | 2 Re + 2 Im | 12 |
| Dirac | S | S Re + S Im | 6S |

For Dirac in high dimensions (S=32 at 11D), this would require 192 additional buffers — likely infeasible. Phase 4 should be limited to TDSE/BEC/Pauli modes where component counts are manageable.

### Phase 5: UI Changes

**Rename controls:**
- "Absorbing Boundary" → "PML Boundary"
- "Absorber Width" → "PML Width"
- "Absorber Strength" → (remove, replaced by auto-tuning)
- Add "PML Target Reflection" logarithmic slider (1e-3 to 1e-10, default 1e-6)

**Components to update:**
- `src/components/sections/Geometry/PauliSpinorControls/PauliGridControls.tsx`
- TDSE, BEC, Dirac equivalent control panels
- Tooltip text explaining PML vs CAP

### Phase 6: Validation & Testing

**Unit tests:**
- Verify PML profile computation: `σ_max` from `R_target`, `pmlWidth`, grid parameters
- Verify cubic grading: `σ(0) = 0`, `σ(L_PML) = σ_max`, monotonic
- Verify damping factor: `exp(-σ·dt)` reaches machine epsilon at outer boundary

**Physics validation (Playwright or manual):**
- **Reflection test:** Initialize a Gaussian wavepacket moving toward the boundary. Measure the reflected amplitude after it enters the PML. Compare quadratic CAP vs cubic PML at identical widths.
- **Norm conservation test:** In a harmonic trap (bound state), the PML should not affect the wavefunction. Norm should remain ≈ 1.0 ± 10⁻⁸.
- **Visual test:** The density at the lattice boundary should be < 10⁻⁶ of the peak, making the cube completely invisible.

**Benchmark:**
- Profile GPU time per frame with PML vs CAP. The cubic profile is slightly more expensive (one extra multiply) but the difference should be negligible.

## Architecture

### Current Flow (CAP)
```
Per substep:
  1. potentialHalf(ψ)           — half-step V
  2. pack → FFT → kinetic → IFFT → unpack    — kinetic step
  3. potentialHalf(ψ)           — half-step V
  4. absorber(ψ)                — CAP damping
```

### New Flow (AP-PML)
```
Per substep:
  1. potentialHalfPML(ψ)        — half-step V + PML damping (merged)
  2. pack → FFT → kinetic → IFFT → unpack    — kinetic step (unchanged)
  3. potentialHalfPML(ψ)        — half-step V + PML damping (merged)
```

Note: The separate absorber pass is eliminated. PML damping is folded into the potential half-step, saving one compute dispatch per substep. The total damping per full step is `exp(-σ·dt)` (same as before, but applied as two half-steps of `exp(-σ·dt/2)` within the potential rotation).

### New Flow (Full ADE-PML, Phase 4)
```
Per substep:
  1. updateAuxFields(φ_d, ψ, σ_d)    — ADE update
  2. potentialHalfPML(ψ)              — half-step V + PML
  3. pack(ψ + Σφ_d) → FFT → kinetic → IFFT → unpack  — modified kinetic
  4. potentialHalfPML(ψ)              — half-step V + PML
  5. updateAuxFields(φ_d, ψ, σ_d)    — ADE update
```

## References

1. **Antoine, Lorin, Tang (2020)** — "Perfectly matched layer for computing the dynamics of nonlinear Schrödinger equations by pseudospectral methods. Application to rotating Bose-Einstein condensates." *Communications in Nonlinear Science and Numerical Simulation* 78.
   - PML formulation for FFT-based split-step, directly applicable to TDSE and BEC.

2. **Nissen, Kreiss (2011)** — "An Optimized Perfectly Matched Layer for the Schrödinger Equation." *Communications in Computational Physics* 9(1).
   - Optimal profile design, error analysis, discretization matching.

3. **Hammer, Nissen (2019)** — "A simple pseudospectral method for the computation of the time-dependent Dirac equation with Perfectly Matched Layers." *Journal of Computational Physics*.
   - PML for the Dirac equation with pseudospectral methods. Directly applicable.

4. **Scrinzi (2015)** — "Solution of the Schrödinger equation using exterior complex scaling and fast Fourier transform." arXiv:1505.06707.
   - Alternative to PML: Exterior Complex Scaling combined with FFT split-operator.

5. **Antoine, Lorin (2019)** — "A friendly review of absorbing boundary conditions and perfectly matched layers for classical and relativistic quantum waves equations." HAL hal-01374183.
   - Comprehensive survey of absorbing boundaries for Schrödinger, Klein-Gordon, and Dirac equations.

6. **Berenger (1994)** — Original PML paper for Maxwell's equations.
   - Foundational reference for impedance-matched absorbing layers.

## Priority

**Phase 1-2 should be implemented first.** The cubic grading + auto-tuned σ_max is a drop-in replacement for the current CAP that:
- Eliminates the visible cube boundary for typical simulations
- Requires no new GPU buffers or pipeline changes
- Reduces reflection by ~60 dB compared to quadratic CAP
- Actually saves one compute dispatch per substep (merged into potential half-step)

Phase 3 (Free Scalar absorber) is independent and can be done in parallel.
Phase 4 (Full ADE-PML) is only needed if Phase 1-2 testing reveals insufficient absorption for edge cases.
Phase 5-6 follow naturally after the core physics is validated.
