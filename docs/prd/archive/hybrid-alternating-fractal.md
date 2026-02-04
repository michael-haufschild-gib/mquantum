# Hybrid / Alternating Formulas Fractals

## Overview

**Feature**: Hybrid/Alternating Formulas Fractals - A fractal type that alternates between two or more transformation rules each iteration, combining characteristics of multiple fractal families (e.g., bulb-power + boxfold/spherefold).

**Core concept**: Instead of one function F, iteration alternates: `F0(z)` on even iterations, `F1(z)` on odd iterations. This creates competing rules that produce rich morphing under rotation.

**Why it morphs well**: The interplay between different transformation types creates structural tension—changes in slice orientation shift how the competing rules interact, producing dramatic shape evolution.

**Reference**: See `docs/prd/extended-fractal-types.md` Section 4 for mathematical foundation.

---

## Specification Summary

**Feature**: Hybrid Fractal Renderer
**User Stories (Jira Tickets)**: 15
**Estimated Total Effort**: ~26 man-days

### Stories Overview
| # | Story | Role | Est. Size | Dependencies |
|---|-------|------|-----------|--------------|
| 1 | Core Hybrid Fractal Renderer | Developer | ~2.5 days | None |
| 2 | Formula Slot Configuration | User | ~2 days | Story 1 |
| 3 | Bulb Power Transform Controls | User | ~1.5 days | Story 1 |
| 4 | BoxFold Transform Controls | User | ~1.5 days | Story 1 |
| 5 | SphereFold Transform Controls | User | ~1.5 days | Story 1 |
| 6 | Formula Blending Controls | User | ~2 days | Story 1 |
| 7 | D-Dimensional Rotation System | User | ~2 days | Story 1 |
| 8 | Lighting System Integration | User | ~2 days | Story 1 |
| 9 | Shadow System Integration | User | ~1.5 days | Story 8 |
| 10 | Color Algorithm System | User | ~2 days | Story 1 |
| 11 | Opacity/Transparency Modes | User | ~2 days | Story 1 |
| 12 | Animation System - Formula Blend | User | ~1.5 days | Story 6 |
| 13 | Animation System - Transform Parameters | User | ~2 days | Stories 3-5 |
| 14 | Animation System - Power Morphing | User | ~1 day | Story 3 |
| 15 | Performance & Quality Controls | User | ~1.5 days | Story 1 |

---

## User Story 1: Core Hybrid Fractal Renderer

**User story:** As a user, I want to view a Hybrid fractal so that I can explore complex structures created by combining multiple transformation rules.

**Acceptance criteria**
1. User can select "Hybrid" from the fractal type selector in the geometry panel
2. When selected, the viewport displays a 3D slice through the N-dimensional hybrid fractal
3. The fractal uses alternating formulas: F0 on even iterations, F1 on odd iterations
4. Default configuration: F0 = Bulb Power (p=8), F1 = BoxFold + SphereFold
5. Distance estimate uses hybrid derivative tracking with safety factor (dist *= 0.8)
6. Iteration count defaults to 16 (lower than single-formula fractals due to combined transforms)
7. Dimension selector: 3D-11D (default: 4D)
8. The fractal responds to standard camera controls
9. Frame rate remains above 30fps at default quality

**Test scenarios**

Scenario 1: Select Hybrid fractal type
- Given the user is viewing any fractal
- When the user selects "Hybrid" from dropdown
- Then the viewport displays a Hybrid fractal combining bulb and fold characteristics

Scenario 2: Default hybrid structure
- Given default configuration (bulb + boxfold/spherefold)
- When the fractal renders
- Then the structure shows both organic bulb curves and crystalline fold edges

Scenario 3: Change dimension
- Given 4D Hybrid fractal
- When the user changes dimension to 6D
- Then additional dimensional folding creates more complex structures

Scenario 4: Derivative safety factor
- Given raymarching is active
- When step sizes are computed
- Then the safety factor prevents over-stepping near complex hybrid boundaries

---

## User Story 2: Formula Slot Configuration

**User story:** As a user, I want to choose which formulas are assigned to each slot so that I can create different hybrid combinations.

**Acceptance criteria**
1. Formula Slot 0 (Even) dropdown offers:
   - "Bulb Power": N-dimensional Mandelbulb power transform
   - "BoxFold": Componentwise fold to box boundary
   - "SphereFold": Radial inversion fold
   - "Kali Reciprocal": abs(z) / dot(z,z) + c
   - "Identity": No transform (pass-through)
2. Formula Slot 1 (Odd) dropdown offers same options
3. "Advanced" toggle reveals additional slots:
   - Slot 2 (every 3rd iteration)
   - Slot 3 (every 4th iteration)
4. Hybrid preset dropdown:
   - "Classic Mandelbox": BoxFold + SphereFold + Scale
   - "Bulb-Box": Bulb Power + BoxFold/SphereFold
   - "Organic Kali": Kali + SphereFold
   - "Triple Hybrid": Three-formula rotation
5. Changes update fractal in real-time
6. Tooltip explains how alternating formulas create hybrid behavior

**Test scenarios**

Scenario 1: Change Slot 0 formula
- Given Slot 0 is Bulb Power
- When the user changes Slot 0 to BoxFold
- Then the fractal updates to show pure boxfold on even iterations

Scenario 2: Load preset
- Given custom configuration is active
- When the user selects "Classic Mandelbox" preset
- Then slots configure for standard Mandelbox formula

Scenario 3: Enable advanced slots
- Given only Slot 0 and Slot 1 are visible
- When the user toggles "Advanced" on
- Then Slots 2 and 3 become available for 4-formula hybrids

Scenario 4: Identity pass-through
- Given Slot 0 is Bulb Power, Slot 1 is Identity
- When the fractal renders
- Then only Bulb Power is applied (every other iteration is pass-through)

---

## User Story 3: Bulb Power Transform Controls

**User story:** As a user, I want to configure the Bulb Power transform so that I can control the organic bulb characteristics in the hybrid.

**Acceptance criteria**
1. When Bulb Power is selected for any slot, its controls panel appears
2. Power slider (range: 2-16, default: 8)
3. Power mode dropdown:
   - "Standard": Full angle-based power (authentic Mandelbulb)
   - "Simplified": normalize(z) * pow(length(z), p) (faster, approximation)
4. Derivative mode:
   - "Accurate": Full derivative tracking
   - "Approximated": dr = dr * |scale| + 1.0 (faster)
5. "Add Original Point" toggle: z = z + p (adds original point after power)
6. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Adjust bulb power
- Given Bulb Power is in Slot 0 with power 8
- When the user changes power to 3
- Then the bulb portions of the hybrid become smoother with fewer lobes

Scenario 2: Switch to simplified mode
- Given Standard power mode is active
- When the user selects "Simplified" mode
- Then the fractal renders faster with slightly different (still valid) bulb structure

Scenario 3: Toggle add original point
- Given "Add Original Point" is disabled
- When the user enables it
- Then the hybrid structure shifts as the original coordinate influences each iteration

---

## User Story 4: BoxFold Transform Controls

**User story:** As a user, I want to configure the BoxFold transform so that I can control the crystalline folding characteristics.

**Acceptance criteria**
1. When BoxFold is selected for any slot, its controls panel appears
2. Fold limit slider (range: 0.5-3.0, default: 1.0)
3. Per-axis fold limit toggle (advanced):
   - When enabled, separate sliders for each dimension's fold limit
4. Fold mode dropdown:
   - "Hard": if (|z[i]| > limit) z[i] = sign(z[i]) * (2*limit - |z[i]|)
   - "Soft": Smooth approximation using tanh
5. Fold visualization toggle: Shows fold planes as faint grid lines
6. Changes update fractal in real-time
7. Tooltip: "BoxFold reflects coordinates back when they exceed the fold limit, creating crystalline structure"

**Test scenarios**

Scenario 1: Adjust fold limit
- Given BoxFold is active with fold limit 1.0
- When the user increases fold limit to 2.0
- Then the crystalline structure becomes larger with less frequent folding

Scenario 2: Per-axis fold limits
- Given uniform fold limit is active
- When the user enables per-axis mode and sets X limit to 1.5, Y limit to 0.5
- Then the structure becomes asymmetric with different fold scales per axis

Scenario 3: Soft fold mode
- Given Hard fold mode is active
- When the user selects Soft fold mode
- Then edges between folded regions become smooth curves instead of sharp creases

---

## User Story 5: SphereFold Transform Controls

**User story:** As a user, I want to configure the SphereFold transform so that I can control the spherical inversion characteristics.

**Acceptance criteria**
1. When SphereFold is selected for any slot, its controls panel appears
2. Min radius slider (range: 0.1-1.0, default: 0.5)
3. Fixed radius slider (range: 0.5-2.0, default: 1.0)
4. SphereFold formula:
   - if (r < minRad): z = z * (fixedRad² / minRad²)
   - else if (r < fixedRad): z = z * (fixedRad² / r²)
   - else: z = z (unchanged)
5. Derivative tracking mode:
   - "Full": Accurate derivative through spherefold
   - "Approximate": dr = dr * |scale|
6. "Invert Sense" toggle: Inverts inside/outside behavior
7. Tooltip: "SphereFold creates spherical inversions, pulling points in/out based on radius"

**Test scenarios**

Scenario 1: Adjust min radius
- Given minRad is 0.5
- When the user decreases minRad to 0.2
- Then the inner spherical void shrinks

Scenario 2: Adjust fixed radius
- Given fixedRad is 1.0
- When the user increases fixedRad to 1.5
- Then the spherical inversion zone expands

Scenario 3: Invert sense
- Given normal SphereFold sense
- When the user toggles "Invert Sense"
- Then spherical structure inverts (convex becomes concave)

---

## User Story 6: Formula Blending Controls

**User story:** As a user, I want to blend between formulas instead of hard-switching so that I can create smoother hybrid transitions.

**Acceptance criteria**
1. Blend mode dropdown:
   - "Hard Switch": Pure alternation (default)
   - "Linear Blend": mix(F0(z), F1(z), blend_factor)
   - "Smooth Step": Smooth blend using iteration-dependent weight
   - "Weighted": User-defined weights per formula
2. For Linear/Smooth blend:
   - Blend factor slider (0.0-1.0): 0 = all F0, 1 = all F1, 0.5 = equal blend
3. For Weighted mode:
   - Weight slider per active formula slot (0.0-1.0)
   - Weights are normalized internally
4. "Per-Iteration Variation" toggle:
   - When enabled, blend factor varies smoothly over iterations
   - Variation amount slider (0.0-1.0)
5. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Enable linear blend
- Given Hard Switch mode is active
- When the user selects Linear Blend with factor 0.5
- Then the fractal shows characteristics of both F0 and F1 simultaneously

Scenario 2: Skew blend toward F0
- Given Linear Blend is active at 0.5
- When the user changes blend factor to 0.2
- Then F0 characteristics dominate while F1 is subtle

Scenario 3: Per-iteration variation
- Given Linear Blend is active
- When the user enables per-iteration variation at 0.5
- Then blend factor oscillates during iteration creating banded structures

---

## User Story 7: D-Dimensional Rotation System

**User story:** As a user, I want to rotate the N-dimensional slice so that I can explore how hybrid formulas interact across different cross-sections.

**Acceptance criteria**
1. Rotation controls for all planes based on dimension (same as Mandelbulb)
2. Each rotation slider: 0° to 360°
3. Rotation dramatically affects how different formula components manifest
4. "Reset Rotations" button
5. Basis vectors computed and sent to shader

**Test scenarios**

Scenario 1: Rotate to emphasize bulb vs fold
- Given 4D hybrid with bulb + boxfold
- When the user rotates XW plane by 45°
- Then the balance between organic and crystalline structure shifts

Scenario 2: High-dimensional hybrid rotation
- Given 6D hybrid fractal
- When multiple higher planes are rotated
- Then complex interplay between formula components creates novel structures

---

## User Story 8: Lighting System Integration

**User story:** As a user, I want lighting controls so that the complex hybrid surfaces are well-illuminated.

**Acceptance criteria**
1. All standard lighting parameters (same as Mandelbulb)
2. Multi-light system (up to 4 lights)
3. Hybrid-specific: Enhanced ambient recommended (default: 0.3) due to complex geometry
4. Tone mapping and Fresnel rim lighting
5. Normals computed via numerical gradient with hybrid-aware step size

**Test scenarios**

Scenario 1: Light complex hybrid geometry
- Given default lighting on hybrid fractal
- When the user adds a second fill light at 90° offset
- Then both crystalline and organic surfaces are well-defined

Scenario 2: Rim lighting for edge definition
- Given complex hybrid surface with many edges
- When the user enables Fresnel rim lighting at 1.2 intensity
- Then edges between bulb and fold regions become clearly visible

---

## User Story 9: Shadow System Integration

**User story:** As a user, I want shadows so that depth in the complex hybrid structure is clear.

**Acceptance criteria**
1. Shadow controls (same as Mandelbulb)
2. Hybrid-specific: Shadow quality "Medium" or higher recommended due to complex geometry
3. Soft shadows help blend crystalline and organic regions visually

**Test scenarios**

Scenario 1: Enable shadows for depth
- Given shadows disabled
- When the user enables High quality shadows
- Then complex hybrid cavities show clear depth through shadowing

Scenario 2: Soft shadows for organic feel
- Given shadows enabled with softness 0.5
- When the user increases to 1.5
- Then the sharp crystalline regions appear more organic

---

## User Story 10: Color Algorithm System

**User story:** As a user, I want coloring options that highlight the hybrid nature of the fractal.

**Acceptance criteria**
1. All 8 standard color algorithms
2. Hybrid-specific coloring modes:
   - "Formula Source": Different hue for iterations using F0 vs F1
   - "Iteration Band": Color bands based on iteration count
   - "Fold Count": Color based on how many folds occurred
3. Cosine gradient with presets optimized for hybrids
4. Distribution controls: power, cycles, offset

**Test scenarios**

Scenario 1: Formula source coloring
- Given any coloring mode is active
- When the user selects "Formula Source" mode
- Then regions dominated by F0 show one color family, F1 shows another

Scenario 2: Fold count coloring
- Given hybrid with BoxFold
- When the user selects "Fold Count" coloring
- Then highly-folded regions appear distinctly colored

---

## User Story 11: Opacity/Transparency Modes

**User story:** As a user, I want transparency so that I can see internal hybrid structure.

**Acceptance criteria**
1. All 4 opacity modes (same as Mandelbulb)
2. Layered surfaces particularly effective for revealing how formulas layer
3. Volumetric rendering shows formula interaction zones

**Test scenarios**

Scenario 1: Layered hybrid surfaces
- Given Solid mode is active
- When the user selects Layered Surfaces with 4 layers
- Then nested hybrid structure reveals how formulas interact at different depths

Scenario 2: Volumetric hybrid
- Given any mode is active
- When the user selects Volumetric Density
- Then the fractal appears as translucent volume showing formula blending

---

## User Story 12: Animation System - Formula Blend

**User story:** As a user, I want to animate the blend factor so that the hybrid smoothly transitions between formula dominance.

**Acceptance criteria**
1. Blend animation toggle (default: off)
2. Blend oscillation range (0.0-1.0 min, 0.0-1.0 max)
3. Oscillation speed (0.01-0.1 Hz, default: 0.02)
4. Oscillation waveform: Sine, Triangle, Sawtooth
5. Animation respects global playback state

**Test scenarios**

Scenario 1: Enable blend animation
- Given blend animation is disabled, blend factor is 0.5
- When the user enables animation with range 0.2-0.8
- Then the fractal oscillates between F0-dominant and F1-dominant

Scenario 2: Sawtooth waveform
- Given sine oscillation is active
- When the user selects sawtooth waveform
- Then blend rises slowly and drops sharply (or vice versa)

---

## User Story 13: Animation System - Transform Parameters

**User story:** As a user, I want to animate individual transform parameters so that the fractal morphs in specific ways.

**Acceptance criteria**
1. Per-transform animation toggles:
   - BoxFold: Animate fold limit
   - SphereFold: Animate min/fixed radius
   - Scale: Animate scale factor (if used)
2. Each animated parameter has:
   - Min/max range sliders
   - Speed control (0.01-0.1 Hz)
   - Phase offset (0.0-1.0)
3. Multiple parameter animations can run simultaneously
4. Presets:
   - "Breathing": Synchronized parameter pulse
   - "Wave": Phased parameter changes
   - "Chaos": Independent random-phase animations

**Test scenarios**

Scenario 1: Animate fold limit
- Given BoxFold is active with fold limit 1.0
- When the user enables fold limit animation with range 0.8-1.5
- Then crystalline structure expands and contracts rhythmically

Scenario 2: Animate sphere radii
- Given SphereFold is active
- When the user enables min radius animation
- Then spherical voids pulse in size

Scenario 3: Combined parameter animation
- Given both BoxFold and SphereFold are animated
- When the user selects "Wave" preset
- Then parameters animate with phase offset creating traveling structure changes

---

## User Story 14: Animation System - Power Morphing

**User story:** As a user, I want to animate the bulb power so that organic structure complexity varies over time.

**Acceptance criteria**
1. Power animation toggle (when Bulb Power is active)
2. Power min/max sliders (2.0-16.0)
3. Oscillation speed (0.01-0.1 Hz)
4. Smooth fractional power interpolation

**Test scenarios**

Scenario 1: Enable power animation
- Given Bulb Power is active with power 8
- When the user enables power animation with range 3-12
- Then bulb lobes vary from smooth (power 3) to spiky (power 12)

---

## User Story 15: Performance & Quality Controls

**User story:** As a user, I want quality controls accounting for hybrid rendering complexity.

**Acceptance criteria**
1. Quality presets: Draft, Standard, High, Ultra
2. Hybrid-specific defaults: Lower iterations (16) due to combined transform cost
3. DE safety factor slider (0.5-1.0, default: 0.8) for step size control
4. Quality multiplier (0.25-1.0)
5. Adaptive quality toggle
6. Per-formula quality options (advanced):
   - Disable expensive formula during rotation

**Test scenarios**

Scenario 1: Adjust quality preset
- Given Standard quality is active
- When the user selects High
- Then hybrid detail increases with potential frame rate decrease

Scenario 2: Adjust DE safety factor
- Given safety factor is 0.8
- When the user increases to 0.95
- Then step sizes increase (faster render) but potential surface artifacts

Scenario 3: Per-formula quality reduction
- Given hybrid with expensive Bulb Power + BoxFold
- When the user enables "Reduce Bulb during animation"
- Then frame rate improves during camera rotation

---

## Placeholders Requiring Confirmation
- Optimal default parameter values for each transform
- Recommended safety factor values for different hybrid combinations
- Performance impact of different formula combinations

## Open Questions
- Should there be more formula types (e.g., Apollonian, Sierpinski)?
- Should formulas be completely user-definable via expression editor?
- How should 3+ formula hybrids be visualized in the UI?

## Dependencies Between Stories
- Stories 2-6, 7, 8, 10, 11 can be developed in parallel after Story 1
- Story 9 depends on Story 8
- Stories 12-14 depend on their respective parameter stories
- Stories 3-5 inform Story 13

## Ready for Development: YES
