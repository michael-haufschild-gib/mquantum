# Visualization Mode Proposals for N-Dimensional Quantum Simulator

**Date:** 2026-02-07
**Status:** Proposal
**Context:** The simulator currently offers two rendering modes — volumetric (Beer-Lambert cloud) and isosurface (constant-density shell). This report proposes additional modes with educational and visual value.

---

## Current Modes

| Mode | What it shows | Rendering technique |
|------|---------------|-------------------|
| **Volumetric** | Full probability density |psi|^2 as translucent cloud | Front-to-back Beer-Lambert compositing with emission + absorption |
| **Isosurface** | Single density contour (orbital boundary) | SDF raymarching with binary search refinement, PBR lit surface |

---

## Proposed Modes

### Tier 1: High Value, Very Feasible

These build directly on the existing WGSL raymarching infrastructure with minimal new math.

#### 1. Cross-Section Slice

**What:** A 2D cutting plane through the wavefunction, displaying a heatmap of |psi|^2 (or Re(psi), Im(psi)) on the plane surface.

**Educational value:** This is the canonical textbook visualization. Every quantum mechanics textbook (Griffiths, Sakurai, Cohen-Tannoudji) shows orbital cross-sections as 2D density plots. Students can directly compare simulator output to textbook figures.

**Visual:** Color-mapped plane showing orbital structure, node locations, and symmetry at a glance. Interactive plane position/orientation lets students explore internal structure hidden by volumetric rendering.

**Implementation complexity:** Low. Single ray-plane intersection per fragment + one `sampleDensity` call at the hit point. No volume integration needed — trivially cheap compared to current modes. The plane geometry can be a fullscreen quad with ray-plane intersection in the fragment shader.

**Key parameters:**
- Plane normal direction (x/y/z or arbitrary)
- Plane offset along normal
- Color map selection (diverging for Re/Im, sequential for |psi|^2)
- Optional: composite as semi-transparent overlay on volumetric mode

**How it should work in this codebase (WebGPU + WGSL):**
1. Add a new slice sub-mode in Schrödinger uniforms (enabled, mode, normal, offset, opacity, scalar source, color-map ID, window min/max).
2. In WGSL, compute ray-plane intersection in object space:
   - `tPlane = dot(p0 - ro, n) / dot(rd, n)`
   - reject if denominator is near zero, `tPlane < 0`, or hit point is outside current Schrödinger bounding sphere.
3. At hit point, evaluate scalar from existing quantum functions:
   - `|psi|^2` via `sampleDensity(...)`
   - `Re(psi)` and `Im(psi)` via a small helper that returns components from the same `evalPsiDispatch(...)` path used by density.
4. Map scalar to color:
   - sequential map for non-negative scalars (`|psi|^2`)
   - diverging map centered at zero for signed scalars (`Re`, `Im`)
5. Composite behavior:
   - `sliceOnly`: return slice color/alpha directly.
   - `sliceOverlay`: render current volumetric/isosurface first, then alpha blend slice on top in the same fragment path.
6. Keep it cheap:
   - one plane intersection and one wavefunction sample for slice-only mode.
   - one extra sample for overlay mode.

**Recommended data model additions (SchroedingerConfig):**
- `sliceEnabled: boolean`
- `sliceCompositeMode: 'sliceOnly' | 'overlay'`
- `sliceScalar: 'density' | 'real' | 'imag'`
- `slicePlaneMode: 'axisAligned' | 'free'`
- `sliceAxis: 'x' | 'y' | 'z'` (when axis-aligned)
- `sliceNormal: [number, number, number]` (when free)
- `sliceOffset: number` (normalized to object extent)
- `sliceOpacity: number`
- `sliceThickness: number` (0 = infinitely thin sample, >0 = small slab average)
- `sliceColormap: string`
- `sliceAutoWindow: boolean`
- `sliceWindowMin: number`
- `sliceWindowMax: number`
- `sliceProbeEnabled: boolean`

**User-facing UX goals:**
1. A first-time student should get a textbook-like orbital cross-section in less than 10 seconds.
2. A power user should be able to rotate the slice plane freely and inspect nodal structure without opening extra panels.
3. The mode should always explain what is shown (`|psi|^2`, `Re(psi)`, or `Im(psi)`), because color meaning changes by scalar type.

**UI needed (minimal, practical):**

**A. Slice panel location**
- Add a `Cross-Section Slice` control group in `Advanced` (near isosurface and nodal controls).
- Keep this separate from existing 4D+ `parameterValues` sliders (those remain N-D hyper-slice controls).

**B. Core controls (always visible when enabled)**
- Toggle: `Cross-Section Slice` on/off.
- Mode: `Slice Only` vs `Overlay`.
- Scalar: `|psi|^2`, `Re(psi)`, `Im(psi)`.
- Opacity slider.

**C. Plane controls**
- Orientation presets: `XY`, `YZ`, `XZ`.
- Plane offset slider (centered at 0).
- `Free Rotate` toggle:
  - when off: axis-aligned only (fast/simple).
  - when on: show normal controls (3-number input and normalize automatically).
- `Reset Plane` button (returns to XY at offset 0).

**D. Color controls**
- Colormap selector.
- `Auto Range` toggle.
- Manual min/max controls when auto-range is off.
- Zero-center lock for diverging maps (forced on for `Re`/`Im`).

**E. Optional analysis controls**
- `Probe` toggle: hover plane to read `(x,y,z)`, scalar value, and optional phase.
- `Contour Lines` toggle (draw iso-lines on plane for textbook-style diagrams).

**What users can do and how they interact:**
1. **Quick textbook view**
   - Enable slice, keep defaults (`XY`, offset `0`, scalar `|psi|^2`).
   - Immediately see familiar orbital cross-sections.
2. **Node hunting**
   - Switch scalar to `Re(psi)` or `Im(psi)`.
   - Use diverging map; nodes appear where color crosses neutral midpoint.
3. **Internal structure exploration**
   - Use offset slider or mouse-wheel-over-plane to sweep through the orbital.
   - In overlay mode, compare the slice to the surrounding cloud/surface.
4. **Arbitrary cuts**
   - Turn on free rotate.
   - Drag plane gizmo ring/normal handle (or numeric normal input) to inspect oblique planes.
5. **Measurement/probe workflow**
   - Enable probe.
   - Hover or click to pin sample values for discussion in class/lab notes.

**Interaction design details (user-friendly defaults):**
- Default state: `sliceEnabled=false` (no surprise visual change in existing scenes).
- On first enable:
  - `sliceCompositeMode='overlay'`
  - `sliceScalar='density'`
  - `sliceAxis='z'` (XY plane)
  - `sliceOffset=0`
  - `sliceOpacity=0.75`
  - `sliceAutoWindow=true`
- Presets for students:
  - `Textbook XY`
  - `Node Finder (Re)`
  - `Node Finder (Im)`
  - `Compare with Volume`
- Clamp and sanitize all user inputs:
  - normalize normals
  - clamp offset to visible bound
  - enforce `windowMin < windowMax`.

**N-D behavior rules (important for pedagogy):**
- For dimensions 4-11, the rendered 3D object is already a hyper-slice controlled by `parameterValues`.
- The new cross-section slice should operate *inside that current 3D projection*.
- UI copy should explicitly state this:
  - "2D plane through the current 3D projection (after higher-dimension slice settings)."

**Implementation plan (phased, low risk):**
1. **Phase 1 (fastest value):**
   - Axis-aligned plane only (`XY/YZ/XZ`), offset slider, `|psi|^2` scalar, slice-only mode.
2. **Phase 2:**
   - Add overlay compositing, `Re/Im` scalars, diverging colormaps, auto windowing.
3. **Phase 3:**
   - Add free-rotation plane (normal vector UI + gizmo), probe readout.
4. **Phase 4 (polish):**
   - Add contour lines, presets, keyboard shortcuts, tutorial hints.

**Performance and correctness notes:**
- This mode is cheaper than volumetric and isosurface, so it can be the "safe mode" fallback on low-end GPUs.
- If density-grid acceleration is enabled without phase payload, disable or warn for `Re/Im` slice scalar modes.
- For visual stability, optional small-thickness slab averaging (2-3 taps along normal) reduces aliasing near steep gradients.

**Testing plan:**
- Store tests:
  - defaults, clamping, normal normalization, window validation.
- UI tests:
  - control visibility by mode, scalar-specific options (sequential vs diverging), reset behavior.
- Shader-composition tests:
  - slice blocks included/excluded as expected.
- Playwright:
  - no WebGPU validation errors when toggling slice, changing scalar, sweeping offset rapidly.

**Success criteria (user outcomes):**
1. Student can reproduce canonical `1s`, `2p`, `3d` cross-sections in under 1 minute.
2. Instructor can demonstrate nodal planes using `Re/Im` without switching rendering mode.
3. No major FPS drop when enabling slice overlay in default quality settings.

---

#### 2. Nested Transparent Isosurfaces

**What:** Instead of a single opaque shell, render 3-5 concentric translucent shells at logarithmically spaced density thresholds. Shows the "onion layer" structure of orbitals.

**Educational value:** Radial nodes become visible as gaps between shells. Students see that hydrogen n=3 has 2 radial nodes, n=4 has 3, etc. The relationship between quantum numbers and spatial structure becomes immediately tangible. Also shows how probability density falls off with distance — outer shells are fainter.

**Visual:** Translucent nested shells with depth-dependent coloring. Phase can be mapped to hue on each shell. Visually striking and immediately conveys quantum number structure that neither volumetric nor single-isosurface mode can show clearly.

**Implementation complexity:** Low-moderate. Extend the existing isosurface raymarcher to continue after the first hit. Accumulate multiple surface contributions with front-to-back alpha compositing. Each shell gets its own threshold from a logarithmic distribution.

**Key parameters:**
- Number of shells (3-5)
- Threshold range (min/max log-density)
- Per-shell opacity (outer shells more transparent)
- Shell spacing mode (linear, logarithmic, or custom)

---

#### 3. Probability Current (j-field)

**What:** The probability current density **j** = (hbar/2mi)(psi* grad(psi) - psi grad(psi*)) = (hbar/m)|psi|^2 grad(phi), where phi is the spatial phase. This vector field shows where probability is "flowing."

**Educational value:** This is the only way to visualize angular momentum. For hydrogen orbitals with m != 0, probability circulates around the z-axis — you cannot see this in |psi|^2 alone. Demonstrates probability conservation (div j = 0 for stationary states). For superposition states, shows the time-dependent probability flow that creates interference.

**Visual:** Streamlines or colored arrows on the isosurface or within the volume. For m=1 p-orbital: elegant toroidal circulation. For superpositions: dynamic flow patterns that pulse with time evolution.

**Implementation complexity:** Moderate. The ingredients already exist — `evalPsi(...)`, phase extraction, and tetrahedral finite-difference infrastructure. The key requirement is to compute **physical** current (not the existing noise-based "probability flow" effect) and then render that vector field with mode-specific overlays.

**How it should work in this codebase (WebGPU + WGSL):**
1. Compute **j** in object space from complex wavefunction derivatives:
   - preferred stable form: `j = (hbar/m) * Im(conj(psi) * grad(psi))`
   - component form: if `psi = a + i b`, then `j = (hbar/m) * (a * grad(b) - b * grad(a))`
   - this avoids phase-wrap artifacts near nodal zeros better than naive finite differences on `phase`.
2. Reuse existing tetrahedral sampling pattern (`volume/integration.wgsl.ts`) to get `grad(a)` and `grad(b)`:
   - sample `psi` at 4 tetra points around `pos`
   - reconstruct central `psi` and gradients with the same `0.75 / delta` stencil scaling already used for density gradients.
3. Define a compact helper in WGSL:
   - `sampleProbabilityCurrent(pos, t, delta, uniforms) -> vec4f`
   - return `(jx, jy, jz, |j|)` in object-space 3D projection coordinates.
4. Use density gating before visualization:
   - suppress vectors when `rho < rhoMin` to avoid noisy singular behavior near nodal voids.
   - optionally suppress when `|j| < jMin` for visual clarity.
5. Render overlays by mode:
   - `isosurface`: evaluate **j** at surface hit point and draw surface-local arrows/LIC.
   - `volumetric`: evaluate **j** at dominant density samples and accumulate vector cue color.
6. Preserve current architecture:
   - keep all logic in WGSL shader blocks + existing shader composition pipeline.
   - no WebGL/Three.js path.

**Important current-state clarification (must be explicit in requirements):**
- Existing fields `probabilityFlowEnabled/probabilityFlowSpeed/probabilityFlowStrength` currently modulate density with animated noise in `density.wgsl.ts`.
- That effect is artistic motion and **not** physical probability current.
- New j-field feature must be separate, with separate naming in UI and config.

**Recommended data model additions (SchroedingerConfig):**
- `probabilityCurrentEnabled: boolean`
- `probabilityCurrentStyle: 'magnitude' | 'arrows' | 'surfaceLIC' | 'streamlines'`
- `probabilityCurrentPlacement: 'isosurface' | 'volume'`
- `probabilityCurrentScale: number` (vector length/intensity multiplier)
- `probabilityCurrentSpeed: number` (advection animation speed)
- `probabilityCurrentDensityThreshold: number` (hide in low-ρ regions)
- `probabilityCurrentMagnitudeThreshold: number` (hide tiny vectors)
- `probabilityCurrentLineDensity: number` (glyph/streamline density)
- `probabilityCurrentStepSize: number` (integration step for LIC/streamline)
- `probabilityCurrentSteps: number` (max integration steps)
- `probabilityCurrentColorMode: 'magnitude' | 'direction' | 'circulationSign'`

**UI needed (minimal but complete):**

**A. Placement**
- Add a `Probability Current (j)` subgroup in `Advanced > Quantum Effects`.
- Keep legacy `probabilityFlow*` (if retained) under `Artistic` as `Legacy Flow Noise` to avoid physics confusion.

**B. Core controls (always visible when enabled)**
- Toggle: `Probability Current (j)` on/off.
- Style select: `Magnitude`, `Arrows`, `Surface LIC`, `Streamlines`.
- Placement select: `Isosurface` or `Volume`.
- Vector scale slider.
- Animation speed slider.

**C. Visibility controls**
- `Density Threshold` slider (`rhoMin`).
- `Current Threshold` slider (`jMin`).
- `Line/Glyph Density` slider.

**D. Style-specific controls**
- For `Arrows`:
  - arrow length scale
  - arrow opacity
- For `Surface LIC`:
  - LIC contrast
  - integration step size
  - integration steps
- For `Streamlines`:
  - seed count/density
  - streamline length
  - integration steps

**E. Color controls**
- Color mode: magnitude, direction hue (azimuth), or circulation sign.
- Magnitude range: auto/manual min/max.
- Optional legend toggle (`|j|` units shown as normalized if physical constants are absorbed).

**User interaction goals:**
1. Student can switch to `Probability Current (j)` and immediately see "no flow" for real stationary states and circulation for `m != 0`.
2. Instructor can demonstrate angular momentum direction reversal by changing sign of `m`.
3. Users can reduce clutter with density/current thresholds instead of disabling the feature.

**Behavior rules and constraints:**
- In higher dimensions (4D-11D), show current in the current 3D projection only (after `parameterValues` slicing), same rule as other visual modes.
- If density-grid mode lacks needed complex-gradient payload, auto-fallback to direct sampling (or show a clear capability warning).
- Near nodal zeros (`|psi| ~ 0`), clamp or fade vectors to avoid unstable direction flips.
- For `useRealOrbitals=true` in hydrogen, expect weaker or zero circulation in states represented as real combinations; UI should not imply guaranteed swirl in every state.

**Implementation plan (phased, low-risk):**
1. **Phase 1: Physical scalar preview**
   - implement physical **j** computation
   - add `magnitude` color overlay only (no arrows/streamlines)
   - add thresholds + scale controls
2. **Phase 2: Isosurface arrows**
   - add surface-local arrow glyph rendering at iso hits
   - add direction/magnitude color modes
3. **Phase 3: Surface LIC**
   - add LIC style for smooth flow texture on isosurface
4. **Phase 4: Volume streamlines (optional advanced)**
   - seed/advection-based trajectories in volume
   - performance-gated by quality preset

**Performance notes:**
- Reusing tetrahedral infrastructure keeps cost manageable.
- Gate expensive current evaluation to meaningful density regions.
- Expect highest cost in volumetric + streamlines; keep as opt-in advanced style.

**Testing plan:**
- Store tests:
  - defaults, clamping, style-specific parameter bounds, visibility gating.
- UI tests:
  - correct conditional controls by style/placement.
  - legacy flow-noise and physical j-field clearly separated.
- Shader tests:
  - `sampleProbabilityCurrent` block presence and style-define toggles.
- Physics sanity tests (numeric tolerances):
  - real stationary state -> near-zero **j**.
  - hydrogen with opposite `m` signs -> opposite circulation direction.
  - stationary eigenstate -> low divergence indicator in sampled regions.
- Playwright:
  - no WebGPU validation errors during rapid style/mode toggling.

**Success criteria (user outcomes):**
1. `m = 0` and real-orbital states show near-zero current as expected.
2. `m = +1` vs `m = -1` visibly reverses circulation.
3. Superpositions show time-varying flow without major FPS regression in default quality.

---

### Tier 2: High Wow Factor, Moderate Effort

These require new mathematical formulations but produce uniquely compelling visualizations.

#### 4. Wigner Function (Phase-Space)

**What:** The Wigner quasi-probability distribution W(x,p) represents the quantum state in phase space (position x vs momentum p). Unlike classical probability distributions, W can be negative — these negative regions are the signature of quantum behavior.

**Educational value:** Demonstrates the quantum-classical boundary. Coherent states appear as positive Gaussian blobs (classical-like). Number states (Fock states) show concentric rings with negative valleys. Superposition states display interference fringes in phase space. This is the most direct visualization of "quantumness" vs "classicalness."

**Visual:** For 1D harmonic oscillator: a 2D heatmap with diverging colormap (blue = negative, red = positive). Negative regions are visually arresting — they represent genuinely non-classical behavior. For 3D: pick a radial 1D slice and show the (r, p_r) phase space.

**Implementation complexity:** Moderate. For 1D HO, the Wigner function of Fock states has a closed-form expression involving Laguerre polynomials:
```
W_n(x,p) = (-1)^n / (pi * hbar) * L_n(2H/hbar*omega) * exp(-H/hbar*omega)
```
where H = p^2/2m + m*omega^2*x^2/2. For superpositions, W is a sum with cross-terms. New shader evaluation + 2D rendering path (could reuse the slice infrastructure from mode 1).

**Key parameters:**
- Phase-space axis ranges
- Color map (diverging, emphasizing negative regions)
- Superposition cross-term visibility toggle
- Classical trajectory overlay (ellipse in phase space)

---

#### 5. Momentum-Space Orbital

**What:** The Fourier transform of psi(r) gives phi(k), the momentum-space wavefunction. |phi(k)|^2 shows the probability distribution of momenta.

**Educational value:** Viscerally demonstrates the uncertainty principle. A tightly localized position-space orbital (small spatial extent) becomes broad in momentum space, and vice versa. Hydrogen s-orbitals become spherical in k-space, p-orbitals become dumbbells rotated 90 degrees. Students see that position and momentum representations are complementary.

**Visual:** Same rendering techniques (volumetric or isosurface) but in momentum space. Side-by-side or toggle between position/momentum views. The visual transformation is striking — familiar orbital shapes become their "duals."

**Implementation complexity:** Moderate. For hydrogen, the momentum-space wavefunctions have closed-form Fock-Podolsky expressions. For HO, the eigenstates are self-dual under Fourier transform (same functional form in both spaces). New `evalPsiMomentum` function in the shader; the rest of the rendering pipeline is reused.

**Key parameters:**
- Toggle: position space vs momentum space
- Momentum scale factor
- Side-by-side comparison mode

---

### Tier 3: Educational Overlays

These augment existing modes rather than replacing them.

#### 6. Radial Probability Overlay

**What:** P(r) = 4*pi*r^2*|R(r)|^2 visualized as a transparent spherical shell whose opacity varies with r. Shows the "most likely radius" at a glance.

**Educational value:** The Bohr radius (most probable distance) for hydrogen 1s is the most-taught result in quantum mechanics. For higher n, the radial distribution shows multiple peaks separated by nodes. Students see why "orbital" doesn't mean "orbit" — the electron has a spread of probable distances.

**Visual:** Semi-transparent sphere that pulses in opacity at the most probable radius. Can be combined with any other mode as a subtle overlay. For n=3,l=0: three concentric bright rings where the radial probability peaks.

**Implementation complexity:** Low. During isosurface or volumetric raymarching, modulate alpha by P(r) evaluated at each sample point. The radial wavefunction R(r) is already computed. This is essentially a post-process tint.

**Key parameters:**
- Overlay opacity
- Whether to show P(r) as shell brightness or as a 1D plot overlay
- Peak markers at most probable radii

---

## Priority Recommendation

For a PhD thesis on quantum physics simulation pedagogy:

| Priority | Mode | Rationale |
|----------|------|-----------|
| 1 | **Cross-Section Slice** | Universal educational standard. Cheap. Directly comparable to all textbook figures. |
| 2 | **Nested Isosurfaces** | Visually stunning. Shows structure invisible in other modes. Low incremental effort. |
| 3 | **Probability Current** | Unique differentiator — no other educational tool shows this in real-time 3D. |
| 4 | **Wigner Function** | High novelty for 1D HO. Demonstrates quantum-classical correspondence. |
| 5 | **Momentum-Space** | Demonstrates uncertainty principle visually. Closed-form expressions available. |
| 6 | **Radial Probability** | Simple overlay, enhances existing modes. |

Modes 1-2 can be implemented within the existing shader composition system as new main block generators (like `generateMainBlockIsosurface`). Mode 3 requires a new vector field visualization path. Modes 4-5 require new mathematical evaluations but can reuse the rendering pipeline.

## External Design References (used for UX choices)

- ParaView docs: slice representation patterns (surface, tri-planar, etc.) support adding both simple and expert plane modes.  
  https://docs.paraview.org/en/v5.10.1/UsersGuide/filteringData.html
- VTK `vtkImagePlaneWidget`: established interaction model for slice translation and plane orientation handles.  
  https://vtk.org/doc/release/4.2/html/classvtkImagePlaneWidget.html
- 3D Slicer slice controls: practical UI precedent for offset sliders and orientation workflows.  
  https://slicer.readthedocs.io/en/latest/user_guide/user_interface.html#slice-view
- Matplotlib colormap guidance: sequential for ordered nonnegative magnitudes, diverging for signed fields around a critical midpoint.  
  https://matplotlib.org/stable/users/explain/colors/colormaps.html
- Hydrogen orbital instructional figures with planar/orientation examples reinforcing textbook-style cross-sections for teaching.  
  https://chem.libretexts.org/Courses/University_of_California_Davis/UCD_Chem_110A%3A_Physical_Chemistry__I/UCD_Chem_110A%3A_Physical_Chemistry_I_%28Koski%29/Text/06%3A_The_Hydrogen_Atom/6.02%3A_The_Quantum_Mechanical_H-atom
