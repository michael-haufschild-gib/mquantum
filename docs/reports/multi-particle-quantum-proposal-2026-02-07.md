# Multi-Particle Quantum Systems Proposal

**Date:** 2026-02-07
**Status:** Proposal
**Context:** The simulator currently models single-particle wavefunctions (HO and hydrogen) in 1D-11D. This report proposes extending to multi-particle quantum systems by reinterpreting the existing N-dimensional infrastructure as configuration space.

---

## Core Insight: Configuration Space = N-Dimensional Space

Two quantum particles don't live independently in 3D. Their joint state is a single wavefunction **ψ(r₁, r₂)** in **6D configuration space**. The probability density |ψ(r₁, r₂)|² gives the joint probability of finding particle 1 at r₁ **and** particle 2 at r₂.

This project already renders wavefunctions up to 11 dimensions by slicing higher-dimensional spaces into 3D views. Two particles in 3D = a 6D wavefunction = a problem the renderer already knows how to handle.

| Particles | Each in | Config space dim | Within 11D limit? |
|-----------|---------|:----------------:|:-----------------:|
| 2 | 1D | 2D | Yes |
| 2 | 2D | 4D | Yes |
| 2 | 3D | 6D | Yes |
| 2 | 4D | 8D | Yes |
| 2 | 5D | 10D | Yes |
| 3 | 1D | 3D | Yes |
| 3 | 2D | 6D | Yes |
| 3 | 3D | 9D | Yes |

---

## Why NOT "Two Clouds in 3D"

The naive approach — placing two independent probability clouds in the same 3D scene — is **physically wrong**. Two independent single-particle wavefunctions ψ_a(r) and ψ_b(r) rendered as separate volumes represents a classical picture. Any visual "interaction" (deformation, repulsion, merging) would be ad-hoc with no connection to the Schrodinger equation.

Students would learn the wrong lesson: that quantum particles are little clouds floating in shared 3D space. The correct picture is that the entire multi-particle system is described by one wavefunction in configuration space.

---

## Physics: Exchange Symmetry

For two **identical** particles, quantum mechanics requires:

- **Bosons** (integer spin): symmetric wavefunction
- **Fermions** (half-integer spin, e.g. electrons): antisymmetric wavefunction

For two non-interacting particles occupying single-particle states ψ_a and ψ_b:

```
ψ_boson(r₁, r₂)  = [ψ_a(r₁)·ψ_b(r₂) + ψ_b(r₁)·ψ_a(r₂)] / √2
ψ_fermion(r₁, r₂) = [ψ_a(r₁)·ψ_b(r₂) - ψ_b(r₁)·ψ_a(r₂)] / √2
```

Key consequence: for fermions, if ψ_a = ψ_b, then ψ_fermion = 0 everywhere. Two fermions cannot occupy the same single-particle state. This is the **Pauli exclusion principle** — the foundation of the periodic table, chemical bonding, and the stability of matter.

For distinguishable particles (no exchange requirement):

```
ψ_distinguishable(r₁, r₂) = ψ_a(r₁) · ψ_b(r₂)
```

---

## What It Would Look Like

### Two 1D Particles (2D Configuration Space) — Clearest Demo

The (x₁, x₂) plane shows |ψ(x₁, x₂)|² as a 2D density plot. Renders directly with dimension=2 using the existing volumetric renderer.

| State | Visual pattern |
|-------|---------------|
| **Distinguishable** | Rectangular grid (product of 1D densities). No correlation. |
| **Bosons, same state** | Enhanced density along diagonal x₁=x₂. Particles cluster. |
| **Bosons, different states** | Symmetric pattern, brighter on diagonal. |
| **Fermions, different states** | Dark **nodal line** along x₁=x₂. Zero probability at equal positions. |
| **Fermions, same state** | Identically zero everywhere (Pauli exclusion). |

The fermion nodal line along x₁=x₂ is the **exchange hole** — a dramatic, immediately visible manifestation of Pauli exclusion. No force pushes the particles apart; the antisymmetry of the wavefunction makes equal-position states impossible.

### Two 3D Particles (6D Configuration Space)

The renderer shows a 3D volume (particle 1's conditional distribution), with three slice sliders controlling particle 2's assumed position (x', y', z'):

- **Unentangled product state:** Moving particle 2's position has no effect on particle 1's cloud. Independence.
- **Fermion antisymmetric state:** As particle 2's position is dragged toward a region where particle 1 is dense, a **hole** opens in particle 1's cloud at that location. The exchange hole — quantum avoidance without any force.
- **Boson symmetric state:** The opposite — particle 1's cloud **brightens** near particle 2's position. Boson bunching.

The dynamic, real-time response when dragging particle 2's position is the visual wow factor. The cloud morphs, holes open and close, density redistributes — all governed by exact quantum mechanics.

---

## Specific Systems to Implement

### System 1: Two 1D Harmonic Oscillators (2D Config Space)

**Priority: Highest (start here)**

The simplest and most visually clear multi-particle system.

**Single-particle states:** Hermite-Gaussian eigenstates φ_n(x) of the 1D HO. Already implemented.

**Two-particle states to demonstrate:**

| Demo | State a | State b | Statistics | What it shows |
|------|---------|---------|------------|---------------|
| Ground state | n=0 | n=0 | Boson | Both in ground state, symmetric blob |
| Pauli exclusion | n=0 | n=0 | Fermion | Identically zero — exclusion principle |
| Exchange hole | n=0 | n=1 | Fermion | Nodal line on diagonal — exchange hole |
| Boson bunching | n=0 | n=1 | Boson | Enhanced diagonal — bunching |
| Excited fermion | n=0 | n=2 | Fermion | More complex nodal structure |

**Parameters:**
- Quantum number for state a: n_a (0-6)
- Quantum number for state b: n_b (0-6)
- Statistics toggle: Distinguishable / Boson / Fermion

**Implementation:** Dimension is set to 2. The shader evaluates φ_{n_a}(x₁)·φ_{n_b}(x₂) ± φ_{n_b}(x₁)·φ_{n_a}(x₂), using the existing 1D HO evaluator.

### System 2: Two 3D Hydrogen Electrons (Helium-like, 6D Config Space)

**Priority: High (the flagship demo)**

Two electrons in a hydrogen-like potential. Non-interacting approximation (ignoring electron-electron Coulomb repulsion) with exchange symmetry.

**Single-particle states:** Hydrogen orbitals ψ_{nlm}(r,θ,φ). Already implemented.

**Two-particle states to demonstrate:**

| Demo | State a | State b | Statistics | What it shows |
|------|---------|---------|------------|---------------|
| Helium ground | 1s | 1s | — (needs spin) | Both electrons in 1s (spin-paired) |
| Excited helium | 1s | 2s | Fermion | Exchange hole in s-wave |
| Orbital structure | 1s | 2p | Fermion | Directional exchange hole |
| Same-l exclusion | 2p(m=0) | 2p(m=1) | Fermion | Angular exchange structure |

**Note on spin:** For the spatial part alone, two electrons in the same orbital (e.g., both 1s) require a spin-singlet state, making the spatial part symmetric. The full story requires spin, but for spatial-only visualization, we can simply offer the boson/fermion toggle on the spatial wavefunction and explain that the spin part provides the other half.

**Parameters:**
- State a: (n, l, m) quantum numbers
- State b: (n, l, m) quantum numbers
- Spatial symmetry: Symmetric (spin-singlet) / Antisymmetric (spin-triplet)
- Particle 2 position: (x', y', z') via slice sliders

**Implementation:** Dimension is set to 6. Dims 1-3 are particle 1's position (rendered volume), dims 4-6 are particle 2's position (slice sliders, relabeled). The shader evaluates ψ_{n_a,l_a,m_a}(r₁)·ψ_{n_b,l_b,m_b}(r₂) ± ψ_{n_b,l_b,m_b}(r₁)·ψ_{n_a,l_a,m_a}(r₂).

### System 3: Three 1D Particles (3D Config Space)

**Priority: Medium (extension)**

Three particles in 1D = 3D configuration space (x₁, x₂, x₃). Renders as a full 3D volumetric cloud.

**Exchange symmetry for three identical particles:**

```
ψ_fermion(r₁,r₂,r₃) = (1/√6) Σ_P sgn(P) · ψ_{a}(r_{P(1)}) · ψ_{b}(r_{P(2)}) · ψ_{c}(r_{P(3)})
```

This is the **Slater determinant** — the foundation of computational chemistry (Hartree-Fock method). The antisymmetrization over all 6 permutations creates nodal surfaces wherever any two coordinates are equal.

**Visual:** A 3D cloud with three nodal planes (x₁=x₂, x₁=x₃, x₂=x₃). The probability density is zero whenever any two particles coincide. Visually stunning — a 3D volume carved by three intersecting planes.

**Parameters:**
- Quantum numbers for states a, b, c
- Statistics: Distinguishable / Boson / Fermion

### System 4: Two N-D Harmonic Oscillators (2N-D Config Space)

**Priority: Lower (thesis extension)**

Two particles each in D-dimensional space = 2D-dimensional configuration space. Extends the multi-particle concept into the project's N-dimensional domain.

- Two 2D particles → 4D config space → existing 4D slicing
- Two 3D particles → 6D → existing 6D slicing
- Two 4D particles → 8D → existing 8D slicing
- Two 5D particles → 10D → within 11D limit

**Educational value:** Shows that exchange symmetry and Pauli exclusion are not 3D-specific — they hold in any number of spatial dimensions. The exchange hole exists in all dimensions.

---

## Scientific Value

| Concept | Significance |
|---------|-------------|
| **Pauli exclusion principle** | Foundation of atomic structure, periodic table, chemical bonding, stability of matter |
| **Exchange symmetry** | Boson/fermion distinction — fundamental classification of all particles |
| **Quantum entanglement** | The defining non-classical feature of quantum mechanics, basis of quantum computing |
| **Configuration space vs physical space** | Deep conceptual distinction that students consistently struggle with |
| **Exchange hole** | Explains electron shells, metallic bonding, Fermi pressure in white dwarfs |
| **Slater determinant** | Foundation of computational chemistry (Hartree-Fock, DFT) |
| **Boson bunching** | Explains Bose-Einstein condensation, laser coherence |

No mainstream educational tool visualizes multi-particle wavefunctions in configuration space in real-time. The closest existing work is [Qolour's two-qubit visualization](https://www.qolour.io/whitepaper) for discrete spin states, not spatial wavefunctions.

---

## Implementation Architecture

### Shader Evaluation

The core computation at each ray sample point:

```wgsl
// r1 = ray sample position (dims 1-3, or 1-D for lower-dim cases)
// r2 = slice position (dims D+1 through 2D)

let psi_a_at_r1 = evalSingleParticlePsi(stateA, r1);  // complex
let psi_b_at_r1 = evalSingleParticlePsi(stateB, r1);  // complex
let psi_a_at_r2 = evalSingleParticlePsi(stateA, r2);  // complex
let psi_b_at_r2 = evalSingleParticlePsi(stateB, r2);  // complex

// Exchange symmetry
let term1 = cmul(psi_a_at_r1, psi_b_at_r2);
let term2 = cmul(psi_b_at_r1, psi_a_at_r2);

var psi_total: vec2f;
if (symmetry == BOSON) {
    psi_total = (term1 + term2) * INV_SQRT2;
} else if (symmetry == FERMION) {
    psi_total = (term1 - term2) * INV_SQRT2;
} else {
    psi_total = term1;  // distinguishable
}

let density = dot(psi_total, psi_total);  // |ψ|²
```

This calls the **existing** single-particle evaluators (`evalPsiHO1D`, `evalPsiHydrogen`, etc.) — no new mathematical machinery required.

### Performance

- 4x single-particle evaluations per sample (instead of 1x)
- For three particles: 9x evaluations (3 states × 3 positions) plus 6 permutations
- Density grid precomputation can partially offset this for the rendered-volume dimensions
- Particle 2's position (slice parameters) changes infrequently (only on slider drag), so the density grid for the current slice can be cached

### UI Changes

- New quantum mode: `'multiParticle'` alongside `'harmonicOscillator'` and `'hydrogenND'`
- State A / State B quantum number selectors (reuse existing HO/hydrogen controls)
- Statistics toggle: Distinguishable / Boson / Fermion
- Slice sliders relabeled: "Particle 2 Position (x, y, z)" instead of "Dimension 4, 5, 6 Slice"
- Optional: marginal density view (integrate over particle 2) as overlay

### What Existing Infrastructure Handles Already

| Capability | Status |
|------------|--------|
| N-dimensional coordinate slicing | Exists (up to 11D) |
| Slice parameter UI sliders | Exists |
| Single-particle HO evaluator | Exists |
| Single-particle hydrogen evaluator | Exists |
| Volumetric Beer-Lambert rendering | Exists |
| Isosurface rendering | Exists |
| Density grid compute pass | Exists |
| Time evolution (phase rotation) | Exists |
| Nodal surface detection | Exists (exchange nodes would appear automatically) |

### What Needs to Be Built

| Component | Effort | Notes |
|-----------|:------:|-------|
| Multi-particle wavefunction evaluator | Medium | Calls existing evaluators, adds symmetrization |
| `multiParticle` quantum mode in store | Low | New mode enum value + state fields |
| State A / State B UI selectors | Low | Reuse existing quantum number controls |
| Statistics toggle (distinguishable/boson/fermion) | Low | Single toggle component |
| Slice slider relabeling | Low | Context-dependent label text |
| Multi-particle presets | Low | Curated (n_a, l_a, m_a, n_b, l_b, m_b, symmetry) combos |
| Three-particle Slater determinant evaluator | Medium | 6 permutations, sign tracking |
| Educational annotations | Medium | "Exchange hole", "Pauli exclusion" labels |

---

## Recommended Demo Sequence (for thesis presentation)

1. **Two 1D HO fermions** (2D view): Show the exchange hole nodal line. Toggle boson/fermion to see it appear/disappear. Toggle distinguishable to see it vanish entirely. Clearest possible demonstration.

2. **Pauli exclusion**: Set both particles to the same state (n_a = n_b = 0). Toggle to fermion — density drops to exactly zero everywhere. "Two electrons cannot occupy the same state."

3. **Two 3D hydrogen electrons** (6D, sliced): One in 1s, one in 2p. Drag particle 2's position around the orbital. Watch the exchange hole track particle 2's position — wherever you "put" electron 2, electron 1 avoids it.

4. **Boson vs fermion**: Same setup, toggle statistics. Bosons cluster (photon bunching), fermions avoid (electron shells). The same mathematical structure, opposite physical behavior.

5. **Three 1D fermions** (3D view): Slater determinant with three intersecting nodal planes. "This is the mathematical structure behind all of computational chemistry."

6. **Two 4D particles** (8D config space): "Exchange symmetry is not a 3D phenomenon — it holds in any dimension." The Pauli exclusion principle in higher dimensions.

---

## Future Extensions (Beyond This Proposal)

### Coulomb Interaction (Helium Atom)

Adding electron-electron repulsion V(r₁,r₂) = e²/|r₁-r₂| requires variational or numerical methods. Possible approaches:
- **Perturbative:** Use the non-interacting states as basis, add first-order energy correction. Wavefunction stays the same, only energies shift.
- **Variational (Hylleraas):** Parameterized trial wavefunction with electron-electron distance dependence. Could be evaluated in the shader with a few additional parameters.
- **Configuration Interaction:** Expand in a basis of Slater determinants. Computationally expensive but exact in principle.

The non-interacting + exchange symmetry version proposed here is already physically rich and could serve as the foundation for perturbative corrections later.

### Entanglement Measures

Overlay a quantitative entanglement measure (e.g., von Neumann entropy of the reduced density matrix) as the user changes states. Product states show zero entanglement; antisymmetrized states show maximal entanglement for same-orbital fermions.

### Molecular Bonding

Two hydrogen atoms at variable separation → H₂ molecule formation. The bonding orbital (symmetric) vs antibonding orbital (antisymmetric) emerges from the exchange symmetry. This connects quantum mechanics to chemistry in the most direct way possible. Requires adding a second nuclear potential center.
