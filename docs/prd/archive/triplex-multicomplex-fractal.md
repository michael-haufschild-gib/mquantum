# Triplex / Multicomplex Julia Variants

## Overview

**Feature**: Triplex/Multicomplex Julia Variants - Generalizations of complex numbers to higher dimensions (bicomplex, tricomplex, etc.) that provide complex-style Julia/Mandelbulb dynamics in 4D/6D/8D spaces. 3D slices reveal extremely intricate, organic structures.

**Core concept**: Represent numbers as pairs (or triplets) of complex numbers with defined multiplication algebra. Iterate `z = z*z + c` in that algebra. The resulting structures combine the richness of complex dynamics with higher-dimensional freedom.

**Why it morphs well**: Multicomplex algebras have strong cross-dimensional coupling through their multiplication rules, so slice orientation dramatically changes the visible structure.

**Reference**: See `docs/prd/extended-fractal-types.md` Section 6 for mathematical foundation.

---

## Specification Summary

**Feature**: Multicomplex Julia Fractal Renderer
**User Stories (Jira Tickets)**: 14
**Estimated Total Effort**: ~24 man-days

### Stories Overview
| # | Story | Role | Est. Size | Dependencies |
|---|-------|------|-----------|--------------|
| 1 | Core Multicomplex Julia Renderer | Developer | ~2.5 days | None |
| 2 | Algebra Selection | User | ~2 days | Story 1 |
| 3 | Julia Constant Configuration | User | ~1.5 days | Story 1 |
| 4 | Power Variants | User | ~1.5 days | Story 1 |
| 5 | Symmetry Breaking Matrix | User | ~1.5 days | Story 1 |
| 6 | D-Dimensional Rotation System | User | ~2 days | Story 1 |
| 7 | Lighting System Integration | User | ~2 days | Story 1 |
| 8 | Shadow System Integration | User | ~1.5 days | Story 7 |
| 9 | Color Algorithm System | User | ~2 days | Story 1 |
| 10 | Opacity/Transparency Modes | User | ~2 days | Story 1 |
| 11 | Animation System - Multicomplex Constant | User | ~2 days | Story 3 |
| 12 | Animation System - Algebra Interpolation | User | ~1.5 days | Story 2 |
| 13 | Animation System - Slice Drift | User | ~1.5 days | Story 6 |
| 14 | Performance & Quality Controls | User | ~1.5 days | Story 1 |

---

## User Story 1: Core Multicomplex Julia Renderer

**User story:** As a user, I want to view a Multicomplex Julia fractal so that I can explore higher-dimensional complex-like dynamics.

**Acceptance criteria**
1. User can select "Multicomplex Julia" from the fractal type selector
2. When selected, the viewport displays a 3D slice through 4D/6D/8D multicomplex Julia set
3. Default algebra: Bicomplex (4D) - complex number pairs with z*z = (a*a - b*b, 2*a*b)
4. Default Julia constant c produces interesting initial structure
5. Iteration count defaults to 64 with bailout 4.0
6. Dimension is determined by algebra choice (bicomplex=4D, tricomplex=6D, etc.)
7. Distance estimate or potential field rendering with smooth iteration count
8. The fractal responds to standard camera controls
9. Frame rate remains above 30fps at default quality

**Test scenarios**

Scenario 1: Select Multicomplex Julia fractal
- Given the user is viewing any fractal
- When the user selects "Multicomplex Julia" from dropdown
- Then the viewport displays complex-like Julia structure in higher dimensions

Scenario 2: Default bicomplex structure
- Given default bicomplex algebra
- When the fractal renders
- Then the structure shows Julia-set characteristics (connected/disconnected regions)

Scenario 3: Smooth iteration coloring
- Given the fractal is rendering
- When viewing escape regions
- Then colors vary smoothly without banding (log(log(r)) smoothing)

Scenario 4: Camera interaction
- Given the user is viewing the Multicomplex Julia
- When the user orbits, pans, zooms
- Then the fractal view updates smoothly

---

## User Story 2: Algebra Selection

**User story:** As a user, I want to choose different multicomplex algebras so that I can explore various higher-dimensional complex dynamics.

**Acceptance criteria**
1. Algebra dropdown offers:
   - "Bicomplex (4D)": Pairs of complex numbers, z*z = (a*a - b*b, 2*a*b)
   - "Tricomplex (6D)": Triples of complex numbers
   - "Tessarine (4D)": Alternative 4D algebra with different multiplication
   - "Dual Complex (4D)": Complex + dual part (nilpotent component)
   - "Split-Complex (4D)": Hyperbolic complex numbers
2. Each algebra change updates dimension automatically
3. Brief tooltip explains algebra structure for each option
4. Changing algebra resets Julia constant to algebra-appropriate default
5. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Switch to tricomplex
- Given bicomplex algebra is active
- When the user selects "Tricomplex (6D)"
- Then the fractal updates to 6D tricomplex Julia with more complex structure

Scenario 2: Tessarine vs bicomplex
- Given bicomplex is active
- When the user switches to Tessarine
- Then structure changes noticeably due to different multiplication rules

Scenario 3: Algebra-appropriate constant reset
- Given bicomplex Julia constant is (-0.4, 0.6, 0.0, 0.0)
- When the user switches to tricomplex
- Then constant resets to 6D default value

Scenario 4: Dual complex behavior
- Given the user selects "Dual Complex"
- When the fractal renders
- Then the nilpotent dual part creates unique smooth/flat regions

---

## User Story 3: Julia Constant Configuration

**User story:** As a user, I want to configure the Julia constant c so that I can explore different multicomplex Julia shapes.

**Acceptance criteria**
1. Julia constant panel displays sliders for each component (count matches algebra dimension)
2. For bicomplex: 4 sliders (c.a.re, c.a.im, c.b.re, c.b.im)
3. For tricomplex: 6 sliders
4. Each slider range: -2.0 to 2.0, step 0.01
5. "Randomize" button generates algebra-stable random constant
6. Preset dropdown with algebra-specific curated constants:
   - Bicomplex presets: "Spiral", "Dendrite", "Dust", "Connected"
   - Tricomplex presets: "Organic", "Coral", "Web", "Filament"
7. "Complex-like" toggle: Restricts c to lie in complex plane (simpler exploration)
8. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Adjust constant components
- Given bicomplex Julia with default constant
- When the user changes c.b.re from 0 to 0.3
- Then the fractal structure shifts due to the additional complex component

Scenario 2: Load preset
- Given bicomplex algebra
- When the user selects "Spiral" preset
- Then constant updates to produce spiral-like Julia structure

Scenario 3: Complex-like mode
- Given full bicomplex constant
- When the user enables "Complex-like" mode
- Then only c.a.re and c.a.im are adjustable (c.b = 0)

Scenario 4: Randomize constant
- Given any constant
- When the user clicks "Randomize"
- Then a new random constant within stable range is generated

---

## User Story 4: Power Variants

**User story:** As a user, I want to change the iteration power so that I can explore quadratic, cubic, and higher-power multicomplex dynamics.

**Acceptance criteria**
1. Power dropdown/slider: 2, 3, 4, 5, 6, 7, 8
2. Default power: 2 (quadratic Julia)
3. Higher powers computed via repeated multiplication in the chosen algebra
4. Power affects both iteration formula and derivative tracking
5. Tooltip: "Higher powers create more complex folding patterns"

**Test scenarios**

Scenario 1: Cubic multicomplex Julia
- Given power is 2
- When the user changes to power 3
- Then the fractal shows more lobes/branches characteristic of cubic Julia

Scenario 2: High power stability
- Given the user selects power 8
- When the fractal renders
- Then no NaN artifacts occur despite complex computation

---

## User Story 5: Symmetry Breaking Matrix

**User story:** As a user, I want to apply a symmetry-breaking transform so that I can create less regular, more organic structures.

**Acceptance criteria**
1. Symmetry breaking toggle (default: off)
2. When enabled, a small mixing matrix M is applied each iteration
3. Matrix strength slider (0.0-0.2, default: 0.05)
4. Matrix type dropdown:
   - "Rotation": Small rotation in one or more planes
   - "Shear": Asymmetric shear
   - "Scale Anisotropy": Per-axis scaling variation
5. Presets: "Subtle", "Moderate", "Strong"
6. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Enable subtle symmetry breaking
- Given symmetric multicomplex Julia
- When the user enables symmetry breaking with "Subtle" preset
- Then perfect symmetries are broken, structure becomes slightly irregular

Scenario 2: Strong shear
- Given symmetry breaking enabled
- When the user selects "Shear" type with strength 0.15
- Then the structure becomes noticeably twisted/elongated

---

## User Story 6: D-Dimensional Rotation System

**User story:** As a user, I want to rotate the slice orientation so that I can explore different cross-sections through the multicomplex Julia.

**Acceptance criteria**
1. Rotation controls for all planes based on algebra dimension
   - Bicomplex (4D): 6 rotation planes
   - Tricomplex (6D): 15 rotation planes
2. Each rotation slider: 0° to 360°
3. Rotation in non-spatial planes reveals different aspects of multicomplex structure
4. "Reset Rotations" button
5. Basis vectors sent to shader

**Test scenarios**

Scenario 1: Rotate bicomplex in 4D
- Given bicomplex Julia with all rotations at 0°
- When the user rotates XW plane by 45°
- Then the Julia set cross-section changes dramatically

Scenario 2: Tricomplex high-D rotation
- Given tricomplex Julia
- When the user rotates multiple high-dimensional planes
- Then structure reveals 6D complexity not visible at default orientation

---

## User Story 7: Lighting System Integration

**User story:** As a user, I want lighting controls so that the intricate multicomplex structures are well-defined.

**Acceptance criteria**
1. All standard lighting parameters (same as Mandelbulb)
2. Multi-light system (up to 4 lights)
3. Multicomplex-specific: Medium ambient (0.25) recommended for intricate detail
4. Tone mapping and Fresnel rim lighting
5. Normals computed via gradient of escape potential

**Test scenarios**

Scenario 1: Enhance detail visibility
- Given default lighting
- When the user adds secondary fill light
- Then intricate Julia detail becomes more visible

Scenario 2: Specular for Julia "shine"
- Given low specular intensity
- When the user increases specular to 1.5 with shininess 64
- Then smooth Julia surfaces show glossy highlights

---

## User Story 8: Shadow System Integration

**User story:** As a user, I want shadows so that the 3D structure of multicomplex Julia is clear.

**Acceptance criteria**
1. Shadow controls (same as Mandelbulb)
2. Shadows help define depth in complex fractal geometry
3. Soft shadows recommended for organic appearance

**Test scenarios**

Scenario 1: Enable shadows for depth
- Given shadows disabled
- When the user enables Medium quality shadows
- Then Julia lobes cast shadows showing 3D depth

---

## User Story 9: Color Algorithm System

**User story:** As a user, I want coloring options that highlight multicomplex Julia characteristics.

**Acceptance criteria**
1. All 8 standard color algorithms
2. Multicomplex-specific coloring modes:
   - "Potential": Color based on escape potential (smooth)
   - "Complex Angle": Color based on complex argument of final z
   - "Component": Color based on specific algebra component
3. For "Component" mode:
   - Component selector dropdown (a.re, a.im, b.re, b.im, etc.)
4. Smooth iteration count for banding-free gradient coloring
5. Cosine gradient presets: "Classic Julia", "Nebula", "Thermal", "Electric"

**Test scenarios**

Scenario 1: Complex angle coloring
- Given any coloring mode
- When the user selects "Complex Angle" mode
- Then colors encode the angle of the complex result, showing rotational structure

Scenario 2: Component-based coloring
- Given "Component" mode
- When the user selects "b.im" component
- Then colors show variation in the imaginary part of the b component

Scenario 3: Smooth potential coloring
- Given "Potential" mode
- When viewing the Julia set boundary
- Then colors transition smoothly without visible iteration bands

---

## User Story 10: Opacity/Transparency Modes

**User story:** As a user, I want transparency so that I can see internal multicomplex Julia structure.

**Acceptance criteria**
1. All 4 opacity modes (same as Mandelbulb)
2. Layered surfaces reveal nested Julia set structure
3. Volumetric rendering shows density of near-boundary regions

**Test scenarios**

Scenario 1: Layered Julia surfaces
- Given Solid mode
- When the user selects Layered Surfaces with 3 layers
- Then nested Julia isosurfaces are visible

Scenario 2: Volumetric Julia
- Given any mode
- When the user selects Volumetric Density
- Then the Julia set appears as a glowing volume

---

## User Story 11: Animation System - Multicomplex Constant

**User story:** As a user, I want to animate the Julia constant so that the set morphs through different shapes.

**Acceptance criteria**
1. Constant animation toggle (default: off)
2. Animation in multicomplex space along curved paths
3. Path presets:
   - "Circle in complex plane": c moves in circle through c.a
   - "Helix in multicomplex": c traces helix through all components
   - "Figure-8": c traces figure-8 Lissajous curve
   - "Random walk": Bounded Brownian motion
4. Path amplitude (0.1-1.0, default: 0.3)
5. Path frequency (0.01-0.1 Hz, default: 0.02)
6. Per-component phase offsets for complex motion

**Test scenarios**

Scenario 1: Animate on circle
- Given constant animation disabled
- When the user enables "Circle in complex plane" with amplitude 0.3
- Then the Julia set morphs as c traces a circle

Scenario 2: Helix animation
- Given animation enabled
- When the user selects "Helix in multicomplex"
- Then c moves through all algebra dimensions creating complex morphing

Scenario 3: Pause animation
- Given constant animation playing
- When the user clicks pause
- Then the Julia set freezes at current c value

---

## User Story 12: Animation System - Algebra Interpolation

**User story:** As a user, I want to smoothly transition between algebras so that the fractal morphs between different mathematical systems.

**Acceptance criteria**
1. Algebra interpolation toggle (default: off)
2. Source algebra dropdown
3. Target algebra dropdown
4. Interpolation factor slider (0.0-1.0) or animation mode
5. When animating: Factor oscillates between source and target
6. Interpolation speed (0.01-0.05 Hz, default: 0.01)
7. Note: Only certain algebra pairs can be meaningfully interpolated
   - Bicomplex ↔ Tessarine (both 4D)
   - Others may have dimension mismatch warnings

**Test scenarios**

Scenario 1: Interpolate bicomplex to tessarine
- Given bicomplex algebra
- When the user enables interpolation to tessarine with factor 0.5
- Then the fractal shows hybrid characteristics of both algebras

Scenario 2: Animate algebra transition
- Given interpolation enabled
- When the user enables animation mode
- Then algebra blend oscillates and structure morphs between algebra types

Scenario 3: Dimension mismatch warning
- Given bicomplex source
- When the user selects tricomplex target
- Then a warning appears: "Dimension mismatch - interpolation may produce unexpected results"

---

## User Story 13: Animation System - Slice Drift

**User story:** As a user, I want to drift the slice origin so that different regions of the multicomplex Julia are revealed.

**Acceptance criteria**
1. Slice drift toggle (default: off)
2. Drift amplitude (0.01-0.3, default: 0.05)
3. Drift frequency (0.01-0.1 Hz, default: 0.02)
4. Multi-frequency drift for organic motion
5. Drift combines with rotation

**Test scenarios**

Scenario 1: Enable slice drift
- Given slice drift disabled
- When the user enables with amplitude 0.1
- Then the 3D slice slowly moves through higher dimensions

Scenario 2: Combine drift and rotation
- Given drift enabled and rotation animation enabled
- When both run simultaneously
- Then complex exploration of multicomplex space occurs

---

## User Story 14: Performance & Quality Controls

**User story:** As a user, I want quality controls accounting for multicomplex computation cost.

**Acceptance criteria**
1. Quality presets: Draft, Standard, High, Ultra
2. Multicomplex-specific: Higher computation cost per iteration than standard Julia
3. Iteration count slider (32-256, default: 64)
4. Bailout radius slider (2.0-16.0, default: 4.0)
5. Quality multiplier (0.25-1.0)
6. Adaptive quality toggle
7. Algebra-specific optimization: Some algebras (tessarine) are faster than others (tricomplex)
8. Performance warning when using 6D+ algebras on lower-end hardware

**Test scenarios**

Scenario 1: Tricomplex performance
- Given bicomplex algebra with smooth performance
- When the user switches to tricomplex
- Then a performance note appears if frame rate drops significantly

Scenario 2: Quality preset adjustment
- Given Standard quality
- When the user selects High
- Then iteration count increases and detail improves

---

## Placeholders Requiring Confirmation
- Optimal default constants for each algebra type
- Performance characteristics of different algebras
- Best iteration counts for visual quality vs performance

## Open Questions
- Should octonion (8D) algebra be supported despite non-associativity challenges?
- Should there be a "custom algebra" mode with user-defined multiplication rules?
- Should "Mandelbulb mode" (c = initial point) be offered alongside Julia mode?

## Dependencies Between Stories
- Stories 2-6, 7, 9, 10 can be developed in parallel after Story 1
- Story 8 depends on Story 7
- Stories 11-13 depend on their respective parameter stories
- Story 12 depends on Story 2

## Ready for Development: YES
