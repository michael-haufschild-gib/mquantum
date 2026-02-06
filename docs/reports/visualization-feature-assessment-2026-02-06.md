# Visualization Feature Assessment

**Date**: 2026-02-06
**Scope**: Educational and visual features for the Schroedinger wavefunction renderer
**Source PRDs**: `/docs/prd/archive/schroedinger/` (from mdimension project)

---

## 1. PRD Feature Status

### Implemented (6/15)

| # | Feature | Implementation |
|---|---------|----------------|
| 02 | Blackbody Radiation Coloring | `blackbody(Temp)` in `emission.wgsl.ts`, COLOR_ALG_BLACKBODY (alg 10), maps density to 0-12000K |
| 04 | Depth-Based Absorption (Beer-Lambert) | `computeAlpha()` in `absorption.wgsl.ts`, RGB per-channel transmittance, early exit at T < 0.01 |
| 05 | Anisotropic Scattering (Henyey-Greenstein) | `henyeyGreenstein(dotLH, g)` in `emission.wgsl.ts`, uniform `scatteringAnisotropy` (-0.9 to 0.9) |
| 06 | Powder Effect (Dual-Scattering) | `emission.wgsl.ts`, formula `1 - exp(-rho * densityGain * powderScale * 4)`, uniform `powderScale` |
| 09 | Curl Noise Domain Warping | `curlNoise(p)` + `applyFlow()` in `density.wgsl.ts`, fast/HQ modes, directional bias |
| 15 | Chromatic Dispersion | RGB spectral offset in `integration.wgsl.ts`, radial/view-aligned modes, fast/HQ quality |

### Partially Implemented (2/15)

| # | Feature | Status | Missing |
|---|---------|--------|---------|
| 08 | Blue Noise Dithering | Temporal jitter (Bayer/Halton) exists | No blue noise texture, no stochastic ray offset in full-res mode |
| 13 | Volumetric Self-Shadowing | Secondary ray march (1-8 steps) toward light | Substantially complete; could add density grid acceleration |

### Not Implemented (7/15)

| # | Feature | Complexity | FPS Impact | Physics Insight | Visual Wow |
|---|---------|:----------:|:----------:|:---------------:|:----------:|
| 01 | Phase-Dependent Materiality | Low | Negligible | High | High |
| 03 | Interference Fringing | Low | Negligible | Very High | Medium-High |
| 07 | Soft Depth Intersection | Low | Negligible | None | Low |
| 10 | Electric Arcs (Ridged Noise) | Medium | Medium | Low | High |
| 11 | Quantum Foam | Medium | Medium | Medium | Medium |
| 12 | Probability Current Flow | Medium-High | Low | Very High | Medium |
| 14 | God Rays | Medium | Medium | None | Very High |

---

## 2. Additional Educational Features (Beyond PRDs)

Features not covered by the original PRDs that would enhance the educational value of the simulator.

### 2a. Feature Assessment Table

| Feature | Complexity | FPS Impact | Physics Insight | Visual Wow | Priority |
|---------|:----------:|:----------:|:---------------:|:----------:|:--------:|
| Clipping / Slicing Plane | Low | Negligible | High (3D) / Moderate (N>3) | Medium | A |
| Coordinate Axes + Scale Bar | Low | Negligible | High | Low | A |
| Quantum Number Annotations | Medium | None | Very High | Low | A |
| Energy Level Diagram Overlay | Medium | None | Very High | Medium | B |
| Momentum Space View (Fourier) | High | High (dual render) | Very High | High | C |
| Measurement Collapse Animation | High | Low | High | High | C |

**Priority key**: A = high value, low cost; B = high value, moderate cost; C = high value, high cost

### 2b. Detailed Descriptions

**Clipping / Slicing Plane**
Interactive plane that cuts through the 3D volume, exposing internal structure: radial shells, angular nodal planes, Hermite polynomial zeros. Students can "dissect" the wavefunction. See Section 3 for dimension-dependent analysis.

**Coordinate Axes + Scale Bar**
Labeled x/y/z axes with physically meaningful units (Bohr radii a_0 for hydrogen, oscillator length sqrt(hbar/m*omega) for HO). Gives spatial meaning: "this lobe extends 3 a_0 from the nucleus."

**Quantum Number Annotations**
On-screen labels showing: n, l, m values; node count; lobe signs (+/-); orbital name (e.g. "3d_{z^2}"). For superpositions: component weights and quantum numbers of each term. Bridges mathematical notation to the visual shape.

**Energy Level Diagram Overlay**
2D sidebar or overlay showing the E_n energy ladder with the current state highlighted. For superpositions, show component weights as bar widths. Connects the 3D visualization to textbook energy level diagrams.

**Momentum Space View (Fourier dual)**
Side-by-side or toggle view showing the Fourier transform of the wavefunction. THE visual demonstration of the uncertainty principle: narrow in position corresponds to broad in momentum and vice versa.

**Measurement Collapse Animation**
Animate the superposition wavefunction collapsing to a single eigenstate upon "measurement." Illustrates the measurement postulate. Conceptually tricky to implement without being physically misleading.

---

## 3. Dimension-Dependent Usefulness

The simulator supports 1D through 11D. Not all features are equally useful across all dimensionalities. This section assesses how each proposed feature's educational value scales with dimension.

### Background: How N>3 Rendering Works

For N>3 dimensions, the raymarcher renders a **3D hyperplane slice** through N-D space:
- Dimensions x_1, x_2, x_3 vary spatially (the rendered 3D volume)
- Dimensions x_4 through x_N are fixed to **cross-section slider values** (or animated via slice animation)
- The viewing hyperplane can be **rotated** in N-D space via N-dimensional rotation controls

This is a literal 3D cut through N-D space, not integration/marginalization.

### Assessment Table

| Feature | 1D-2D HO | 3D HO | 3D Hydrogen | 4D-11D HO | 4D-11D H-ND |
|---------|:--------:|:-----:|:-----------:|:---------:|:-----------:|
| Clipping Plane | Low (volume already thin) | Very High | Very High | Moderate | Moderate |
| Coordinate Axes | High | High | Very High | High | High |
| QN Annotations | High | High | Very High | High | High |
| Energy Level Diagram | Very High | Very High | Very High | Very High | Very High |
| Momentum Space | Very High | High | High | Moderate | Moderate |
| Collapse Animation | High | High | High | Medium | Medium |
| Phase Materiality (PRD 01) | High | High | Very High | High | High |
| Interference Fringing (PRD 03) | Very High | Very High | High | Very High | High |
| Prob. Current Flow (PRD 12) | High | High | High | Moderate | Moderate |

### Dimension-Specific Notes

**1D-2D Harmonic Oscillator**
- The volume is inherently thin/flat (extruded along unused axes)
- Clipping plane adds little since the structure is already exposed
- Energy diagrams and annotations are most valuable here: students learn to read quantum numbers before tackling 3D
- Interference fringing is very educational: directly shows the wave nature in a simple setting

**3D Hydrogen Orbitals (primary educational mode)**
- All features at maximum educational value
- Clipping plane is particularly powerful: slice through a 3d orbital to reveal the radial node, angular nodal cone, and lobe sign structure
- QN annotations are essential: "this is the 4f_{xyz} orbital" bridges visual to formalism
- Momentum space view shows the l-dependent angular momentum structure in reciprocal space

**3D Harmonic Oscillator**
- Similar to hydrogen but with Cartesian separability
- Clipping plane reveals Hermite polynomial node planes (straight, not curved like hydrogen)
- Simpler node structure makes it a good teaching progression before hydrogen

**4D-11D Harmonic Oscillator**
- The rendered volume is already a 3D slice; existing cross-section sliders and N-D rotation provide the primary exploration tools
- Clipping plane still shows internal structure within the current slice, but the student is already two levels of abstraction from the full N-D object
- Energy level diagram remains very valuable: the energy spectrum E = hbar*omega*(n_1 + n_2 + ... + n_D + D/2) shows degeneracy patterns that grow combinatorially with dimension
- Interference fringing remains very educational: the separable product structure means fringes appear in all three visible dimensions independently
- Phase materiality works well: phase is a property of the full N-D wavefunction and is displayed correctly in any slice
- Probability current flow and momentum space lose clarity because you're viewing a projected/sliced quantity

**4D-11D Hydrogen N-D**
- 3D hydrogen radial core + independent harmonic oscillators for extra dimensions
- The 3D core structure (radial nodes, angular structure) is preserved and visible
- Extra-dimension HO factors modulate the overall amplitude based on cross-section slider positions
- Same dimension-dependent tradeoffs as N-D HO for features targeting extra dimensions

---

## 4. Recommended Implementation Order

### Tier 1: High value, low cost (implement first)

1. **Coordinate Axes + Scale Bar** — universally useful, trivially cheap, grounds every visualization in physical units
2. **Quantum Number Annotations** — universally useful, makes every state self-documenting for students
3. **Interference Fringing (PRD 03)** — already implemented per user report; verify completeness
4. **Phase-Dependent Materiality (PRD 01)** — already implemented per user report; verify completeness

### Tier 2: High value, moderate cost

5. **Energy Level Diagram Overlay** — universally useful across all dimensions; bridges 3D visualization to textbook theory
6. **Clipping Plane** — most valuable for 3D hydrogen (the primary educational mode); moderate value for N>3
7. **Probability Current Flow (PRD 12)** — already implemented per user report; verify completeness

### Tier 3: High value, high cost

8. **Momentum Space View** — unique educational content (uncertainty principle); requires dual rendering or precomputed FFT
9. **Measurement Collapse Animation** — illustrates core QM postulate but must be designed carefully to avoid being misleading

### Tier 4: Visual polish (implement if time permits)

10. **God Rays (PRD 14)** — cinematic wow factor, no physics content
11. **Soft Depth Intersection (PRD 07)** — removes clipping artifacts
12. **Blue Noise Dithering (PRD 08)** — reduces banding; partially exists already
13. **Electric Arcs (PRD 10)** — decorative, no physics basis
14. **Quantum Foam (PRD 11)** — marginal physics content (vacuum fluctuations)
