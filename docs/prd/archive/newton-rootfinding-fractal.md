# Newton / Root-Finding Fractals

## Overview

**Feature**: Newton/Root-Finding Fractals - A fractal type based on Newton's method for solving `F(z) = 0`. The fractal structure emerges from the boundaries between basins of attraction, creating veins, membranes, and branching organic patterns.

**Core concept**: Instead of escape-time iteration, Newton's method `z_{n+1} = z_n - F(z_n) / F'(z_n)` converges to roots. The fractal boundaries appear where convergence is slow or ambiguous.

**Why it morphs well**: Basin boundaries in hypercomplex space are extremely sensitive to slice orientation, producing dramatic changes in vein/membrane structure.

**Reference**: See `docs/prd/extended-fractal-types.md` Section 3 for mathematical foundation.

---

## Specification Summary

**Feature**: Newton Fractal Renderer
**User Stories (Jira Tickets)**: 14
**Estimated Total Effort**: ~24 man-days

### Stories Overview
| # | Story | Role | Est. Size | Dependencies |
|---|-------|------|-----------|--------------|
| 1 | Core Newton Fractal Renderer | Developer | ~2.5 days | None |
| 2 | Polynomial Selection & Configuration | User | ~2 days | Story 1 |
| 3 | Damping Factor Control | User | ~1 day | Story 1 |
| 4 | Convergence Visualization Modes | User | ~2 days | Story 1 |
| 5 | Root Visualization Options | User | ~1.5 days | Story 1 |
| 6 | D-Dimensional Rotation System | User | ~2 days | Story 1 |
| 7 | Lighting System Integration | User | ~2 days | Story 1 |
| 8 | Shadow System Integration | User | ~1.5 days | Story 7 |
| 9 | Color Algorithm System | User | ~2 days | Story 1, 4 |
| 10 | Opacity/Transparency Modes | User | ~2 days | Story 1 |
| 11 | Animation System - Polynomial Coefficients | User | ~2 days | Story 2 |
| 12 | Animation System - Damping | User | ~1 day | Story 3 |
| 13 | Animation System - Slice Drift | User | ~1.5 days | Story 6 |
| 14 | Performance & Quality Controls | User | ~1.5 days | Story 1 |

---

## User Story 1: Core Newton Fractal Renderer

**User story:** As a user, I want to view a Newton fractal so that I can explore the intricate basin boundaries of root-finding algorithms.

**Acceptance criteria**
1. User can select "Newton" from the fractal type selector in the geometry panel
2. When selected, the viewport displays a 3D slice through the 4D quaternion Newton fractal
3. The fractal is rendered using raymarching on a scalar field derived from:
   - Convergence speed (iterations to converge)
   - Or `length(F)` as an isosurface value
   - Or basin boundary measure
4. Default polynomial is `q³ - 1` (classic Newton fractal with 3 roots)
5. Default dimension is 4D (quaternion space)
6. Iteration count defaults to 32 with convergence tolerance 0.001
7. Quaternion inverse is computed as `qinv(q) = conj(q) / dot(q,q)`
8. The fractal responds to standard camera controls
9. Frame rate remains above 30fps at default quality

**Test scenarios**

Scenario 1: Select Newton fractal type
- Given the user is viewing any fractal in the viewport
- When the user selects "Newton" from the fractal type dropdown
- Then the viewport displays the Newton fractal with basin boundary structures

Scenario 2: Default cubic polynomial
- Given the user has just selected Newton fractal
- When the fractal renders with default settings
- Then three distinct convergence basins are visible corresponding to the three roots of `z³ - 1`

Scenario 3: Convergence stability
- Given the raymarcher samples various points in quaternion space
- When Newton iteration runs to convergence
- Then no NaN artifacts occur even at basin boundaries

Scenario 4: Camera interaction
- Given the user is viewing the Newton fractal
- When the user orbits, pans, or zooms
- Then the fractal view updates smoothly

---

## User Story 2: Polynomial Selection & Configuration

**User story:** As a user, I want to choose different polynomials so that I can explore Newton fractals with varying numbers of roots and complexity.

**Acceptance criteria**
1. Polynomial preset dropdown offers:
   - "Cubic (z³ - 1)": 3 roots, classic Newton
   - "Quartic (z⁴ - 1)": 4 roots, more complex boundaries
   - "Quintic (z⁵ - 1)": 5 roots
   - "Quadratic (z² - 1)": 2 roots, simpler structure
   - "Custom Cubic": User-defined coefficients
   - "Custom Quartic": User-defined coefficients
2. For custom polynomials, coefficient sliders appear:
   - For `az³ + bz² + cz + d - k`, sliders for a, b, c, d, k
   - Coefficient ranges: -2.0 to 2.0, step 0.01
3. The constant term `k` can be a quaternion (4 components)
4. Changes update the fractal in real-time
5. Tooltip explains root count relationship to polynomial degree

**Test scenarios**

Scenario 1: Switch to quartic polynomial
- Given cubic polynomial (z³ - 1) is active
- When the user selects "Quartic (z⁴ - 1)"
- Then the fractal updates to show 4-basin structure with more complex boundaries

Scenario 2: Adjust custom coefficients
- Given "Custom Cubic" is selected
- When the user adjusts coefficient `b` from 0 to 0.5
- Then the fractal structure changes to reflect the modified polynomial

Scenario 3: Quaternion constant k
- Given custom polynomial is active
- When the user adjusts the k quaternion components
- Then root positions shift and basin boundaries morph

Scenario 4: Invalid polynomial (leading coefficient zero)
- Given the user sets the leading coefficient to 0
- When the fractal attempts to render
- Then a warning message appears: "Leading coefficient must be non-zero" and fractal uses last valid configuration

---

## User Story 3: Damping Factor Control

**User story:** As a user, I want to control the Newton iteration damping so that I can tune convergence behavior and basin structure.

**Acceptance criteria**
1. Damping factor slider available (range: 0.5-1.5, default: 1.0)
2. Newton step becomes: `z = z - damping * (F(z) / F'(z))`
3. Damping < 1.0 produces more stable but slower convergence (smoother boundaries)
4. Damping > 1.0 produces faster but potentially unstable convergence (chaotic boundaries)
5. Changes update fractal in real-time
6. Tooltip: "Controls step size in Newton iteration. Values < 1 smooth boundaries, > 1 create chaos."

**Test scenarios**

Scenario 1: Decrease damping for smoother boundaries
- Given damping is 1.0
- When the user decreases damping to 0.7
- Then basin boundaries become smoother and less fractal

Scenario 2: Increase damping for chaotic boundaries
- Given damping is 1.0
- When the user increases damping to 1.3
- Then basin boundaries become more chaotic and detailed

Scenario 3: Extreme damping stability
- Given the user sets damping to 1.5
- When the fractal renders
- Then it remains stable without diverging to infinity

---

## User Story 4: Convergence Visualization Modes

**User story:** As a user, I want to choose how convergence data is visualized so that I can see different aspects of the Newton fractal.

**Acceptance criteria**
1. Visualization mode dropdown offers:
   - "Convergence Speed": Surface based on iteration count to converge
   - "Residual Field": Surface where `length(F)` equals threshold
   - "Basin Boundaries": Emphasizes edges between convergence regions
   - "Root Distance": Based on final distance to nearest root
   - "Mixed": Combination of speed and boundary emphasis
2. For "Convergence Speed" mode:
   - Isosurface threshold slider (1-30 iterations, default: 10)
3. For "Residual Field" mode:
   - Tolerance threshold slider (0.0001-0.1, default: 0.001)
4. For "Basin Boundaries" mode:
   - Boundary sensitivity slider (0.1-2.0, default: 1.0)
5. Each mode produces distinct visual characteristics

**Test scenarios**

Scenario 1: Switch to Basin Boundaries mode
- Given Convergence Speed mode is active
- When the user selects "Basin Boundaries"
- Then the visualization emphasizes the boundaries between convergence regions as ridges/veins

Scenario 2: Adjust convergence threshold
- Given Convergence Speed mode with threshold 10
- When the user changes threshold to 20
- Then the isosurface expands to include slower-converging regions

Scenario 3: Residual field visualization
- Given any mode is active
- When the user selects "Residual Field" with tolerance 0.01
- Then the surface shows where Newton iteration residual equals the threshold

---

## User Story 5: Root Visualization Options

**User story:** As a user, I want to visualize root locations so that I can understand the relationship between roots and basins.

**Acceptance criteria**
1. "Show Roots" toggle (default: off)
2. When enabled, small spheres or markers appear at root locations in the 3D slice
3. Root colors match basin colors when using basin-colored mode
4. Root size slider (0.01-0.1 of scene scale, default: 0.03)
5. Root positions are computed analytically for standard polynomials
6. For quaternion polynomials, roots are approximated via sampling

**Test scenarios**

Scenario 1: Enable root visualization
- Given "Show Roots" is disabled
- When the user enables root visualization
- Then small markers appear at the locations where the polynomial equals zero

Scenario 2: Root colors match basins
- Given basin coloring is active with distinct colors per basin
- When root visualization is enabled
- Then each root marker matches the color of its corresponding basin

Scenario 3: Adjust root marker size
- Given roots are visible with default size
- When the user increases root size to 0.08
- Then root markers become larger and more prominent

---

## User Story 6: D-Dimensional Rotation System

**User story:** As a user, I want to rotate the 4D slice orientation so that I can explore different cross-sections through the Newton fractal basins.

**Acceptance criteria**
1. Rotation controls for all 4D planes: XY, XZ, YZ, XW, YW, ZW
2. Each rotation slider: 0° to 360° with continuous wrapping
3. Rotations in XW, YW, ZW dramatically reshape basin boundary structure
4. "Reset Rotations" button returns all to 0°
5. Basis vectors computed and sent to shader

**Test scenarios**

Scenario 1: Rotate to reveal different basin structure
- Given all rotations at 0°
- When the user rotates YW plane by 45°
- Then basin boundaries transform to show a different 3D cross-section

Scenario 2: Combined 4D rotations
- Given XW at 30°
- When the user also rotates ZW by 45°
- Then both rotations combine correctly

Scenario 3: Temporal stability during rotation
- Given continuous rotation animation is enabled
- When the fractal rotates through 360°
- Then basin structures morph smoothly without popping or discontinuities

---

## User Story 7: Lighting System Integration

**User story:** As a user, I want lighting controls so that basin boundaries and surface details are well-defined.

**Acceptance criteria**
1. All standard lighting parameters (same as Mandelbulb):
   - Light enabled, color, direction angles
   - Ambient intensity/color (default: 0.25)
   - Diffuse/specular intensity
   - Shininess
2. Multi-light system (up to 4 lights)
3. Tone mapping with algorithm selection
4. Fresnel rim lighting
5. Normals computed via numerical gradient of convergence field

**Test scenarios**

Scenario 1: Enhance boundary visibility with lighting
- Given default flat lighting
- When the user increases specular intensity to 1.5 with low shininess (16)
- Then basin boundary ridges become more prominent

Scenario 2: Rim lighting for basin edges
- Given Fresnel rim lighting is disabled
- When the user enables it with intensity 1.0
- Then basin boundary edges glow distinctly

---

## User Story 8: Shadow System Integration

**User story:** As a user, I want shadows so that the three-dimensional structure of basin boundaries is clearer.

**Acceptance criteria**
1. Shadow controls (same as Mandelbulb):
   - Shadow enabled toggle
   - Quality: Low, Medium, High, Ultra
   - Softness slider
   - Animation mode
2. Shadows cast from basin ridges and membrane structures

**Test scenarios**

Scenario 1: Enable shadows for depth
- Given shadows are disabled
- When the user enables High quality shadows
- Then basin boundary ridges cast shadows revealing their 3D structure

Scenario 2: Soft shadows for organic appearance
- Given shadows enabled with softness 0.5
- When the user increases softness to 1.5
- Then shadows become diffuse and more organic

---

## User Story 9: Color Algorithm System

**User story:** As a user, I want coloring options so that I can visualize basins, convergence speed, and boundaries distinctly.

**Acceptance criteria**
1. All 8 standard color algorithms plus Newton-specific options
2. Newton-specific coloring modes:
   - "Basin ID": Distinct color per convergence basin (root)
   - "Convergence Gradient": Color based on iteration count
   - "Root Distance Gradient": Color based on final distance to root
3. Basin ID mode auto-assigns distinct hues to each root
4. Convergence gradient uses cosine palette mapped to iteration count
5. Combined modes allow basin + convergence overlay

**Test scenarios**

Scenario 1: Basin ID coloring
- Given any coloring mode is active
- When the user selects "Basin ID" mode
- Then each convergence basin displays a distinct, solid color

Scenario 2: Convergence gradient overlay
- Given Basin ID mode is active
- When the user enables "Convergence Gradient" overlay
- Then basin colors are modulated by convergence speed (darker = faster convergence)

Scenario 3: Smooth iteration coloring
- Given convergence-based coloring is active
- When viewing basin boundaries
- Then colors transition smoothly without banding (via smooth iteration count log(log(r)))

---

## User Story 10: Opacity/Transparency Modes

**User story:** As a user, I want transparency so that I can see through basin surfaces to internal structures.

**Acceptance criteria**
1. All 4 opacity modes (same as Mandelbulb):
   - Solid, Simple Alpha, Layered Surfaces, Volumetric Density
2. Layered surfaces reveal nested basin boundary structure
3. Volumetric density creates misty basin visualization

**Test scenarios**

Scenario 1: Layered basin surfaces
- Given Solid mode is active
- When the user selects Layered Surfaces with 3 layers
- Then multiple convergence threshold surfaces render as nested transparent shells

Scenario 2: Volumetric basin fog
- Given any mode is active
- When the user selects Volumetric Density
- Then basins appear as colored fog with boundaries as density variations

---

## User Story 11: Animation System - Polynomial Coefficients

**User story:** As a user, I want to animate polynomial coefficients so that root positions move and basins morph organically.

**Acceptance criteria**
1. Coefficient animation toggle (default: off)
2. Animates the constant term `k` in quaternion space
3. Animation path options:
   - Circular orbit (k traces a circle in 4D)
   - Lissajous path (complex multi-frequency pattern)
   - Random walk (bounded Brownian motion)
4. Path amplitude controls (0.01-1.0, default: 0.2)
5. Path frequency controls (0.01-0.2 Hz, default: 0.03)
6. Animation respects global playback state

**Test scenarios**

Scenario 1: Enable coefficient animation
- Given coefficient animation is disabled
- When the user enables "Circular orbit" with amplitude 0.3
- Then the constant k moves in a circle and basins shift accordingly

Scenario 2: Lissajous path animation
- Given circular animation is active
- When the user switches to "Lissajous path"
- Then k traces a complex pattern and basins morph in intricate ways

Scenario 3: Pause animation
- Given coefficient animation is playing
- When the user clicks global pause
- Then k stops moving and fractal freezes

---

## User Story 12: Animation System - Damping

**User story:** As a user, I want to animate the damping factor so that basin boundary complexity varies over time.

**Acceptance criteria**
1. Damping animation toggle (default: off)
2. Damping min slider (0.5-1.0, default: 0.7)
3. Damping max slider (1.0-1.5, default: 1.2)
4. Oscillation speed (0.01-0.1 Hz, default: 0.02)
5. Smooth sine wave interpolation

**Test scenarios**

Scenario 1: Enable damping animation
- Given damping animation is disabled
- When the user enables with range 0.8-1.2
- Then basin boundaries oscillate between smooth and chaotic

Scenario 2: Wide damping range
- Given damping range is 0.8-1.2
- When the user changes to 0.6-1.4
- Then boundary complexity variation becomes more dramatic

---

## User Story 13: Animation System - Slice Drift

**User story:** As a user, I want to drift the 4D slice origin so that different basin cross-sections are revealed over time.

**Acceptance criteria**
1. Slice drift toggle (default: off)
2. Drift amplitude (0.01-0.5, default: 0.05)
3. Drift frequency (0.01-0.2 Hz, default: 0.03)
4. Multi-frequency motion for organic feel
5. Drift combines with manual rotations

**Test scenarios**

Scenario 1: Enable slice drift
- Given slice drift is disabled
- When the user enables with amplitude 0.1
- Then the 3D cross-section slowly shifts through 4D space

Scenario 2: Combine drift with rotation
- Given slice drift is enabled
- When the user also applies manual rotation
- Then both motions combine for complex exploration

---

## User Story 14: Performance & Quality Controls

**User story:** As a user, I want quality controls so that I can balance detail with frame rate.

**Acceptance criteria**
1. Quality presets: Draft, Standard, High, Ultra
2. Settings map to iterations, tolerance, raymarch steps
3. Newton-specific: iteration count has more impact than other fractals
4. Quality multiplier slider (0.25-1.0)
5. Adaptive quality toggle
6. Convergence tolerance affects both quality and performance

**Test scenarios**

Scenario 1: Adjust quality preset
- Given Standard quality
- When the user selects Ultra
- Then basin boundaries become more detailed with finer structure

Scenario 2: Tight tolerance for detail
- Given tolerance is 0.001
- When the user tightens to 0.0001
- Then boundaries become sharper but iteration count increases

---

## Placeholders Requiring Confirmation
- Exact polynomial coefficient defaults for custom presets
- Optimal convergence tolerance for visual quality vs performance
- Root position computation for quaternion polynomials

## Open Questions
- Should fractional powers (z^2.5) be supported for exotic Newton fractals?
- Should relaxed Newton methods (other than simple damping) be offered?
- How should degenerate cases (multiple equal roots) be handled visually?

## Dependencies Between Stories
- Stories 2-6, 7, 9, 10 can be developed in parallel after Story 1
- Story 8 depends on Story 7
- Story 9 partially depends on Story 4 for convergence data
- Stories 11-13 depend on their respective parameter stories

## Ready for Development: YES
