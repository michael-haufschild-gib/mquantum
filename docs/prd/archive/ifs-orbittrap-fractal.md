# IFS / Orbit-Trap Field Fractals

## Overview

**Feature**: IFS/Orbit-Trap Field Fractals - A fractal type that iterates a transform and measures how close the orbit comes to geometric "traps" (planes, spheres, tori, lines) in N-dimensional space. The resulting field produces soft tissue, foamy bubbles, and wispy membrane structures.

**Core concept**: Instead of a strict SDF fractal surface, track `d = min(d, distanceToTrap(z))` during iteration. The accumulated minimum distance creates a scalar field for rendering.

**Why it morphs well**: Trap geometry can be defined in any dimensions, and rotating the slice changes which dimensions intersect the traps, creating dramatically different membrane/bubble patterns.

**Reference**: See `docs/prd/extended-fractal-types.md` Section 5 for mathematical foundation.

---

## Specification Summary

**Feature**: IFS Orbit-Trap Fractal Renderer
**User Stories (Jira Tickets)**: 15
**Estimated Total Effort**: ~26 man-days

### Stories Overview
| # | Story | Role | Est. Size | Dependencies |
|---|-------|------|-----------|--------------|
| 1 | Core IFS Orbit-Trap Renderer | Developer | ~2.5 days | None |
| 2 | Iteration Transform Selection | User | ~2 days | Story 1 |
| 3 | Plane Trap Configuration | User | ~1.5 days | Story 1 |
| 4 | Sphere Trap Configuration | User | ~1.5 days | Story 1 |
| 5 | Torus Trap Configuration | User | ~2 days | Story 1 |
| 6 | Multi-Trap Blending | User | ~1.5 days | Stories 3-5 |
| 7 | Isosurface Threshold Control | User | ~1 day | Story 1 |
| 8 | D-Dimensional Rotation System | User | ~2 days | Story 1 |
| 9 | Lighting System Integration | User | ~2 days | Story 1 |
| 10 | Shadow System Integration | User | ~1.5 days | Story 9 |
| 11 | Color Algorithm System | User | ~2 days | Story 1 |
| 12 | Opacity/Transparency Modes | User | ~2 days | Story 1 |
| 13 | Animation System - Trap Motion | User | ~2 days | Stories 3-5 |
| 14 | Animation System - Trap Blending | User | ~1.5 days | Story 6 |
| 15 | Performance & Quality Controls | User | ~1.5 days | Story 1 |

---

## User Story 1: Core IFS Orbit-Trap Renderer

**User story:** As a user, I want to view an IFS Orbit-Trap fractal so that I can explore soft, foamy, and membrane-like structures.

**Acceptance criteria**
1. User can select "Orbit Trap" from the fractal type selector in the geometry panel
2. When selected, the viewport displays a 3D slice through the N-dimensional orbit-trap field
3. The fractal is rendered by raymarching an isosurface of the orbit-trap field
4. Field computation: iterate transform F(z), track dTrap = min(dTrap, trapDistance(z))
5. Default iteration transform: Simple contraction/rotation (IFS attractor)
6. Default trap: Single sphere trap at origin with radius 0.5
7. Dimension selector: 3D-11D (default: 4D)
8. Iteration count defaults to 20
9. Isosurface threshold default: 0.1
10. Raymarch uses smaller steps (safety factor 0.5) since field is not a true SDF
11. Frame rate remains above 30fps at default quality

**Test scenarios**

Scenario 1: Select Orbit-Trap fractal type
- Given the user is viewing any fractal
- When the user selects "Orbit Trap" from dropdown
- Then the viewport displays soft, membrane-like structures

Scenario 2: Default sphere trap
- Given default configuration with sphere trap
- When the fractal renders
- Then bubble-like structures appear where orbit passes near the sphere

Scenario 3: Field stability
- Given raymarching the orbit-trap field
- When step sizes are computed
- Then smaller steps (safety factor) ensure stable rendering of non-SDF field

Scenario 4: Camera interaction
- Given the user is viewing the Orbit-Trap fractal
- When the user orbits, pans, zooms
- Then the soft structures update smoothly

---

## User Story 2: Iteration Transform Selection

**User story:** As a user, I want to choose and configure the iteration transform so that I can control the underlying fractal dynamics.

**Acceptance criteria**
1. Transform preset dropdown:
   - "Contraction": z = scale * z + offset (simple IFS)
   - "Rotation + Scale": z = scale * rotate(z) + offset
   - "Fold + Scale": BoxFold(z) * scale + offset
   - "Kali-like": abs(z) / dot(z,z) + c
   - "Bulb-like": Simplified bulb power transform
2. For "Contraction" and "Rotation + Scale":
   - Scale slider (0.3-0.95, default: 0.7)
   - Offset vector sliders (per dimension, -1.0 to 1.0)
3. For "Rotation + Scale":
   - Rotation angles per plane (0-360°)
4. For "Fold + Scale":
   - Fold limit slider (0.5-2.0)
   - Scale slider (0.3-2.0)
5. Transform preview toggle: Shows orbit path for a sample point
6. Changes update fractal in real-time

**Test scenarios**

Scenario 1: Select rotation transform
- Given "Contraction" is active
- When the user selects "Rotation + Scale"
- Then fractal structure changes to show rotational patterns

Scenario 2: Adjust scale factor
- Given scale is 0.7
- When the user increases scale to 0.9
- Then structures become larger and less dense

Scenario 3: Adjust offset
- Given offset is (0, 0, 0, 0)
- When the user changes offset to (0.5, -0.3, 0.2, 0.1)
- Then the attractor center shifts and structure changes

Scenario 4: Preview orbit path
- Given transform is configured
- When the user enables "Preview orbit"
- Then a line traces the orbit path for a sample starting point

---

## User Story 3: Plane Trap Configuration

**User story:** As a user, I want to configure plane traps so that I can create membrane and sheet structures.

**Acceptance criteria**
1. Plane trap toggle (default: off)
2. When enabled, plane trap parameters appear:
   - Normal vector sliders (N-dimensional unit vector, auto-normalized)
   - Plane height/offset slider (-2.0 to 2.0, default: 0.0)
   - Trap mode dropdown:
     - "Single-sided": abs(dot(z, n) - h)
     - "Double-sided": abs(abs(dot(z, n)) - h)
3. Quick normal presets for common orientations:
   - "X-axis plane", "Y-axis plane", "Z-axis plane", "W-axis plane"
   - "Diagonal" (equal components)
4. Plane trap creates flat membrane structures
5. Multiple plane traps can be enabled (see Story 6)
6. Tooltip: "Plane traps create membrane structures where the orbit passes near the plane"

**Test scenarios**

Scenario 1: Enable plane trap
- Given plane trap is disabled
- When the user enables plane trap with X-axis normal
- Then flat membrane structures appear perpendicular to X axis

Scenario 2: Adjust plane height
- Given plane trap is enabled with height 0.0
- When the user changes height to 0.5
- Then membrane shifts to new location

Scenario 3: Double-sided plane
- Given single-sided plane trap
- When the user selects "Double-sided" mode
- Then membrane appears at both +h and -h distances from origin

Scenario 4: High-dimensional normal
- Given 6D fractal with plane trap
- When the user sets normal to emphasize dimension 5
- Then membranes appear based on 5th dimension coordinate

---

## User Story 4: Sphere Trap Configuration

**User story:** As a user, I want to configure sphere traps so that I can create bubble and foam structures.

**Acceptance criteria**
1. Sphere trap toggle (default: on for initial experience)
2. When enabled, sphere trap parameters appear:
   - Center position sliders (N-dimensional, -2.0 to 2.0 per axis)
   - Radius slider (0.1-2.0, default: 0.5)
   - Trap mode dropdown:
     - "Shell": abs(length(z - center) - R) (hollow sphere)
     - "Solid": length(z - center) - R (solid sphere)
3. Quick center presets:
   - "Origin", "X-offset", "Y-offset", "Diagonal offset"
4. Multiple sphere traps can be enabled (see Story 6)
5. Sphere traps create bubble/foam-like structures
6. Tooltip: "Sphere traps create bubble structures where the orbit passes near the sphere surface"

**Test scenarios**

Scenario 1: Adjust sphere radius
- Given sphere trap is enabled with radius 0.5
- When the user increases radius to 1.0
- Then bubble structures become larger

Scenario 2: Shell vs Solid mode
- Given Shell mode is active
- When the user selects Solid mode
- Then hollow bubbles become solid spherical regions

Scenario 3: Move sphere center
- Given sphere center is at origin
- When the user moves center to (0.5, 0.5, 0, 0)
- Then bubble structures shift off-center

Scenario 4: Small radius precision
- Given the user sets radius to 0.1
- When the fractal renders
- Then small, precise bubble structures appear without artifacts

---

## User Story 5: Torus Trap Configuration

**User story:** As a user, I want to configure torus traps so that I can create ring and tube structures.

**Acceptance criteria**
1. Torus trap toggle (default: off)
2. When enabled, torus trap parameters appear:
   - Major radius slider (0.3-2.0, default: 0.7)
   - Minor radius slider (0.05-0.5, default: 0.2)
   - Axis plane dropdown: Which 2 dimensions define the torus plane
     - "XY", "XZ", "YZ", "XW", "YW", "ZW" (based on dimension)
   - Center position sliders
3. Torus distance formula uses selected plane dimensions
4. Creates ring/tube structures in the selected orientation
5. Tooltip: "Torus traps create ring structures. Select which dimensional plane contains the ring."

**Test scenarios**

Scenario 1: Enable torus trap
- Given torus trap is disabled
- When the user enables torus with XY plane, major radius 0.7, minor 0.2
- Then ring/tube structures appear in the XY plane

Scenario 2: Change torus plane
- Given torus in XY plane
- When the user changes to XW plane
- Then ring structure reorients to 4D-influenced cross-section

Scenario 3: Adjust radii
- Given major 0.7, minor 0.2
- When the user sets major 1.0, minor 0.4
- Then ring becomes larger with thicker tube

Scenario 4: Thin torus
- Given minor radius 0.2
- When the user decreases to 0.05
- Then ring structure becomes very thin/wire-like

---

## User Story 6: Multi-Trap Blending

**User story:** As a user, I want to combine multiple traps so that I can create complex hybrid structures.

**Acceptance criteria**
1. "Add Trap" button allows up to 4 simultaneous traps
2. Each trap has an individual weight slider (0.0-1.0, default: 1.0)
3. Trap combination modes:
   - "Minimum": d = min(trap1, trap2, ...) - intersection of trap regions
   - "Average": d = weighted average of trap distances
   - "Smooth Min": Smooth minimum (soft blending) with smoothness parameter
4. Smooth min smoothness slider (0.01-0.5, default: 0.1)
5. Traps can be individually enabled/disabled without removing
6. Trap list shows all configured traps with quick toggles

**Test scenarios**

Scenario 1: Add second trap
- Given single sphere trap is active
- When the user clicks "Add Trap" and configures a plane trap
- Then both trap structures appear, combined

Scenario 2: Adjust trap weights
- Given sphere (weight 1.0) and plane (weight 1.0) are active
- When the user reduces sphere weight to 0.3
- Then sphere structures become fainter while plane structures dominate

Scenario 3: Smooth min blending
- Given Minimum mode with two sphere traps
- When the user selects "Smooth Min" with smoothness 0.2
- Then where trap regions meet, there's a smooth blend instead of sharp edge

Scenario 4: Maximum trap count
- Given 4 traps are already configured
- When the user attempts to add a 5th trap
- Then the "Add Trap" button is disabled with tooltip "Maximum 4 traps"

---

## User Story 7: Isosurface Threshold Control

**User story:** As a user, I want to adjust the isosurface threshold so that I can control how much of the orbit-trap field is rendered as surface.

**Acceptance criteria**
1. Isosurface threshold slider (0.01-1.0, default: 0.1)
2. Lower threshold: Thinner, more delicate membrane structures
3. Higher threshold: Thicker, more solid structures
4. "Auto-threshold" toggle: Automatically adjusts threshold based on trap configuration
5. Threshold preview: Shows approximate thickness visualization
6. Tooltip: "Controls how close the orbit must pass to traps to create a surface"

**Test scenarios**

Scenario 1: Decrease threshold for delicate structures
- Given threshold is 0.1
- When the user decreases to 0.02
- Then membrane/bubble structures become very thin and delicate

Scenario 2: Increase threshold for solid structures
- Given threshold is 0.1
- When the user increases to 0.5
- Then structures become thick and blob-like

Scenario 3: Auto-threshold
- Given manual threshold is set
- When the user enables "Auto-threshold"
- Then threshold adjusts based on trap radii to produce consistent structure thickness

---

## User Story 8: D-Dimensional Rotation System

**User story:** As a user, I want to rotate the N-dimensional slice so that I can explore how trap structures intersect different cross-sections.

**Acceptance criteria**
1. Rotation controls for all planes based on dimension
2. Each rotation slider: 0° to 360°
3. Rotating changes which dimensions of trap geometry are visible in the 3D slice
4. "Reset Rotations" button
5. Basis vectors sent to shader

**Test scenarios**

Scenario 1: Rotate to reveal torus structure
- Given 4D fractal with torus trap in XW plane
- When the user rotates XW by 45°
- Then torus cross-section changes from ring to ellipse to figure-eight patterns

Scenario 2: Rotate plane trap
- Given plane trap with W-axis normal
- When the user rotates YW plane
- Then membrane orientation changes in the 3D slice

---

## User Story 9: Lighting System Integration

**User story:** As a user, I want lighting controls so that soft membrane structures are well-defined.

**Acceptance criteria**
1. All standard lighting parameters
2. Orbit-trap specific: Higher ambient recommended (default: 0.4) for soft structures
3. Multi-light system (up to 4 lights)
4. Tone mapping and Fresnel rim lighting
5. Normals computed via numerical gradient of orbit-trap field

**Test scenarios**

Scenario 1: Light membrane structures
- Given default lighting on orbit-trap fractal
- When the fractal renders
- Then membrane surfaces show clear depth and dimensionality

Scenario 2: Rim lighting for bubble edges
- Given bubble structures from sphere trap
- When the user enables Fresnel rim at 1.0
- Then bubble edges glow distinctly

---

## User Story 10: Shadow System Integration

**User story:** As a user, I want shadows so that the layered membrane structures show depth.

**Acceptance criteria**
1. Shadow controls (same as Mandelbulb)
2. Orbit-trap specific: Soft shadows recommended for organic appearance
3. Shadows may be complex due to multiple thin surfaces

**Test scenarios**

Scenario 1: Shadows through membranes
- Given multiple membrane layers
- When shadows are enabled
- Then shadows pass through translucent membranes creating depth

Scenario 2: Soft shadow organic look
- Given shadows enabled with softness 1.0
- When rendering bubble structures
- Then shadows are diffuse and organic-looking

---

## User Story 11: Color Algorithm System

**User story:** As a user, I want coloring options that complement the soft membrane structures.

**Acceptance criteria**
1. All 8 standard color algorithms
2. Orbit-trap specific coloring modes:
   - "Trap Distance": Color based on minimum trap distance (how close orbit came)
   - "Trap ID": Different color per trap (when multiple traps active)
   - "Iteration Depth": Color based on which iteration hit the trap minimum
3. Cosine gradient presets optimized for soft structures:
   - "Soap Bubble" (iridescent pastels)
   - "Ocean Foam" (blue-white)
   - "Tissue" (pink-flesh tones)

**Test scenarios**

Scenario 1: Trap distance coloring
- Given any coloring mode is active
- When the user selects "Trap Distance" mode
- Then colors indicate how close orbit approached traps (closer = more saturated)

Scenario 2: Trap ID coloring
- Given sphere trap and plane trap active
- When the user selects "Trap ID" mode
- Then sphere-dominated regions show one color, plane-dominated another

Scenario 3: Soap bubble preset
- Given Cosine Gradient mode
- When the user selects "Soap Bubble" preset
- Then membranes show iridescent pastel colors

---

## User Story 12: Opacity/Transparency Modes

**User story:** As a user, I want transparency so that the layered membrane nature of orbit-traps is visible.

**Acceptance criteria**
1. All 4 opacity modes
2. Orbit-trap specific: Transparency highly recommended to show layered structure
3. Layered Surfaces particularly effective (default: 3 layers, opacity 0.4)
4. Volumetric mode creates fog/mist effect through membranes

**Test scenarios**

Scenario 1: Layered membrane visualization
- Given Solid mode is active
- When the user selects Layered Surfaces with 4 layers
- Then multiple nested membrane shells are visible

Scenario 2: Volumetric foam
- Given any mode is active
- When the user selects Volumetric Density
- Then the structure appears as translucent foam/mist

---

## User Story 13: Animation System - Trap Motion

**User story:** As a user, I want to animate trap positions and parameters so that membrane structures flow and morph.

**Acceptance criteria**
1. Per-trap animation controls:
   - Sphere: Animate center position, radius
   - Plane: Animate normal direction, height
   - Torus: Animate center, radii, axis rotation
2. Motion patterns:
   - "Orbit": Trap center traces circular path
   - "Oscillate": Trap parameters oscillate sinusoidally
   - "Drift": Slow random walk
3. Animation speed control per trap (0.01-0.2 Hz)
4. Phase offset per trap for coordinated motion
5. Global animation respects playback state

**Test scenarios**

Scenario 1: Animate sphere trap orbit
- Given sphere trap at origin
- When the user enables "Orbit" motion for sphere center
- Then bubbles flow as sphere center moves in a circle

Scenario 2: Animate plane height
- Given plane trap with height 0
- When the user enables "Oscillate" on height
- Then membrane waves up and down

Scenario 3: Coordinate multiple trap animations
- Given sphere and plane traps both animated
- When the user sets phase offset of 0.5 for plane
- Then traps animate with half-cycle offset creating wave-like motion

---

## User Story 14: Animation System - Trap Blending

**User story:** As a user, I want to animate trap weights so that structures fade in and out or morph between trap types.

**Acceptance criteria**
1. Weight animation toggle per trap
2. Weight oscillation range (0.0-1.0 min, 0.0-1.0 max)
3. Oscillation speed (0.01-0.1 Hz)
4. "Crossfade" preset: One trap fades in as another fades out
5. "Pulse" preset: All traps pulse together

**Test scenarios**

Scenario 1: Crossfade between traps
- Given sphere trap and torus trap active
- When the user enables "Crossfade" preset
- Then sphere structures fade out as torus structures fade in

Scenario 2: Pulse all traps
- Given multiple traps active
- When the user enables "Pulse" preset
- Then all structures pulse in brightness/density together

---

## User Story 15: Performance & Quality Controls

**User story:** As a user, I want quality controls accounting for the field-based rendering.

**Acceptance criteria**
1. Quality presets: Draft, Standard, High, Ultra
2. Orbit-trap specific: Lower raymarch step size (safety factor 0.5) due to non-SDF field
3. Step size multiplier slider (0.3-1.0)
4. Iteration count slider (10-50)
5. Quality multiplier (0.25-1.0)
6. Adaptive quality toggle
7. Field gradient quality: "Fast" (2-point) or "Accurate" (6-point)

**Test scenarios**

Scenario 1: Adjust step size multiplier
- Given default step size 0.5
- When the user increases to 0.8
- Then rendering is faster but thin membranes may have artifacts

Scenario 2: Accurate gradient for smooth normals
- Given "Fast" gradient mode
- When the user selects "Accurate" mode
- Then surface normals become smoother but slower to compute

---

## Placeholders Requiring Confirmation
- Optimal default trap parameters for initial experience
- Recommended iteration counts for different trap configurations
- Performance impact of multiple trap evaluation

## Open Questions
- Should custom trap shapes (capsule, box, cylinder) be supported?
- Should trap positions support expressions/formulas for procedural placement?
- Should there be a "trap editor" mode with visual manipulation?

## Dependencies Between Stories
- Stories 2-7, 8, 9, 11, 12 can be developed in parallel after Story 1
- Story 6 depends on Stories 3-5
- Story 10 depends on Story 9
- Stories 13-14 depend on their respective trap configuration stories

## Ready for Development: YES
