# Black Hole Parameter Cleanup Plan

## Overview

This plan addresses three main issues:
1. **Derived parameters exposed as independent controls** - breaking physics relationships
2. **UI duplication** between left Geometry panel and right Advanced panel
3. **Outdated/inconsistent presets** with values outside shader-valid ranges

---

## Part 1: Remove Derived Parameters

### Physics Dependencies

For a Kerr black hole, these values are **mathematically derived** from `spin` (χ):

| Parameter | Formula | For χ=0 | For χ=0.9 | For χ=0.998 |
|-----------|---------|---------|-----------|-------------|
| Event Horizon | r+ = M(1+√(1-χ²)) | 2M | 1.44M | 1.06M |
| Photon Sphere | r_ph = 2M(1+cos(⅔·arccos(-χ))) | 3M | 2.6M | 2.1M |
| ISCO (prograde) | Complex formula | 6M | 2.3M | 1.24M |

**Currently broken:**
- `setBlackHoleSpin()` computes these correctly BUT users can override them
- `diskInnerRadiusMul` is a slider (1-5x) independent of spin
- `photonShellRadiusMul` is settable (1-2x) independent of spin
- Event horizon in shader doesn't shrink with spin at all!

### Changes Required

#### 1.1 Remove from UI: `diskInnerRadiusMul` and `diskOuterRadiusMul` sliders

**File:** `src/components/sections/Geometry/BlackHoleControls.tsx`

**Remove:**
```tsx
// DELETE these sliders (lines 168-190)
<Slider label="Inner Radius" ... />
<Slider label="Outer Radius" ... />
```

**Rationale:** Inner radius = ISCO, derived from spin. Outer radius is purely artistic but confuses users when combined with "scientific" spin parameter.

#### 1.2 Auto-compute derived values in store

**File:** `src/stores/slices/geometry/blackholeSlice.ts`

**Modify `setBlackHoleSpin`** to also compute visual event horizon:

```typescript
setBlackHoleSpin: (spin) => {
  const clamped = clampWithWarning(spin, 0, 0.998, 'spin')
  const state = get()
  const rs = state.blackhole.horizonRadius // Schwarzschild radius
  const M = rs / 2

  const kerr = computeKerrRadii(M, clamped)

  // Derived values (NOT user-controllable)
  const visualEventHorizon = kerr.eventHorizon // Shrinks with spin
  const diskInnerRadiusMul = kerr.iscoPrograde / rs
  const photonShellRadiusMul = kerr.photonSpherePrograde / rs

  set((s) => ({
    blackhole: {
      ...s.blackhole,
      spin: clamped,
      // Store derived values for shader use
      _visualEventHorizon: visualEventHorizon,
      diskInnerRadiusMul,
      photonShellRadiusMul: Math.max(1.0, photonShellRadiusMul),
    },
  }))
}
```

#### 1.3 Update shader to use visual event horizon

**File:** `src/rendering/shaders/blackhole/gravity/horizon.glsl.ts`

Add new uniform and use it:
```glsl
uniform float uVisualEventHorizon; // Computed from spin, smaller than rs

bool isInsideHorizon(float ndRadius) {
  return ndRadius < uVisualEventHorizon; // Not uHorizonRadius!
}
```

#### 1.4 Remove from config interface (keep as internal)

**File:** `src/lib/geometry/extended/types.ts`

```typescript
interface BlackHoleConfig {
  // KEEP: Primary parameters
  horizonRadius: number  // Schwarzschild radius rs = 2M (scale)
  spin: number           // χ = a/M

  // REMOVE from interface (internal only):
  // diskInnerRadiusMul - derived from spin
  // photonShellRadiusMul - derived from spin

  // KEEP: Artistic overrides (but move to Advanced)
  diskOuterRadiusMul: number  // Artistic choice for disk extent
}
```

---

## Part 2: Resolve UI Duplication

### Current State (Problematic)

| Parameter | Left (Geometry) | Right (Advanced) | Animation Drawer |
|-----------|-----------------|------------------|------------------|
| Scale | ✓ | - | - |
| Horizon Radius | ✓ | - | - |
| Spin | ✓ | - | - |
| Disk Thickness | ✓ | - | - |
| Inner Radius | ✓ (REMOVE) | - | - |
| Outer Radius | ✓ (REMOVE) | - | - |
| Gravity Strength | - | ✓ | - |
| Manifold Intensity | - | ✓ | - |
| Bloom Boost | - | ✓ | - |
| Temperature | - | ✓ | - |
| Swirl Amount | - | ✓ | ✓ (duplicate!) |
| All other params | - | ✓ | - |

### Proposed Structure

**Rule:** If it changes the **geometry/shape** of the object → Left panel (Geometry).
**Rule:** If it changes **appearance/rendering** → Right panel (Advanced/Visuals).

#### Left Panel: Geometry Section
```
Visual Preset: [Interstellar ▼]
├─ Geometry
│  ├─ Scale: 0.25 ──────────○
│  ├─ Schwarzschild Radius: 2.0 ──○  (renamed from "Horizon Radius")
│  ├─ Spin (Kerr): 0.9 ────────○
│  │  └─ Info: "ISCO: 2.3rs, Photon sphere: 1.3rs" (read-only derived)
│  └─ Disk Outer Radius: 8.0 ──○
│
├─ Cross Section (4D+ only)
│  ├─ Dim 4: 0.0 ──────────○
│  └─ ...
```

#### Right Panel: Advanced Rendering → Black Hole
```
├─ Accretion Disk
│  ├─ Intensity: 2.0 ───────○
│  ├─ Temperature: 6500K ───○
│  ├─ Thickness: 0.03 ──────○
│  └─ Turbulence
│     ├─ Noise: 0.15 ───────○
│     └─ Swirl: 0.6 ────────○  (SINGLE location, not duplicated)
│
├─ Lensing (consolidated)
│  ├─ Strength: 3.0 ────────○  (was: gravityStrength)
│  └─ Mode: [Orbital ▼]
│  └─ [Advanced ▼] (collapsed by default)
│     ├─ Bend Scale
│     ├─ Distance Falloff
│     └─ ...
│
├─ Photon Shell
│  ├─ Width: 0.05 ──────────○
│  ├─ Glow: 0.5 ────────────○
│  └─ Color: [picker]
│
├─ Event Horizon Glow [ON/OFF]
│  └─ ...
│
├─ Relativistic Effects [ON/OFF]
│  └─ Doppler...
│
├─ Polar Jets [ON/OFF]
│  └─ ...
│
├─ Rendering Quality
│  └─ ...
```

#### Animation Drawer (Timeline)
```
├─ Time Evolution
│  └─ Time Scale: 1.0 ──────○
│
├─ Manifold Swirl [ON/OFF]
│  ├─ Speed: 0.5 ───────────○
│  └─ (Amount controlled in Advanced panel)
│
├─ Intensity Pulse [ON/OFF]
│  └─ ...
│
├─ Dimensional Sweep (4D+) [ON/OFF]
│  └─ ...
```

---

## Part 3: Fix Presets

### Current Problems

1. **`densityFalloff: 200.0`** - Shader clamps to 10.0, value is meaningless
2. **Presets don't set `spin`** - Rely on defaults, creating inconsistent states
3. **Presets set derived values** - Should let spin determine ISCO/photon sphere

### Updated Presets

**File:** `src/lib/geometry/extended/types.ts`

```typescript
export const BLACK_HOLE_VISUAL_PRESETS: Record<BlackHoleVisualPreset, Partial<BlackHoleConfig>> = {
  interstellar: {
    // Physics
    spin: 0.9,                    // High spin for dramatic effect
    diskTemperature: 6500,        // Warm white

    // Appearance (NOT derived physics)
    manifoldThickness: 0.03,      // Very thin disk
    densityFalloff: 8.0,          // Within shader range (0.1-10)
    diskOuterRadiusMul: 8.0,      // Compact disk

    // Lensing
    gravityStrength: 3.0,         // Strong lensing for Einstein ring

    // Effects
    dopplerEnabled: true,
    dopplerStrength: 0.6,

    // Visuals
    manifoldIntensity: 2.0,
    shellGlowStrength: 0.5,
    noiseAmount: 0.1,
    swirlAmount: 0.3,

    // DO NOT SET: diskInnerRadiusMul, photonShellRadiusMul (derived from spin)
  },

  cosmic: {
    spin: 0.5,                    // Moderate spin
    manifoldThickness: 0.3,       // Thicker disk
    densityFalloff: 6.0,          // Softer falloff
    gravityStrength: 1.5,         // Moderate lensing
    diskOuterRadiusMul: 12.0,     // Larger disk
    dopplerEnabled: false,
    noiseAmount: 0.4,
    swirlAmount: 0.8,
    shellGlowStrength: 2.0,
  },

  ethereal: {
    spin: 0.3,                    // Low spin
    manifoldThickness: 0.8,       // Very thick/volumetric
    densityFalloff: 3.0,          // Very soft
    gravityStrength: 0.8,         // Weak lensing
    diskOuterRadiusMul: 15.0,     // Large diffuse disk
    dopplerEnabled: false,
    noiseAmount: 0.6,
    swirlAmount: 1.2,
    shellGlowStrength: 8.0,
    edgeGlowEnabled: true,
    edgeGlowIntensity: 2.0,
  },

  custom: {},
}
```

### Fix Shader Clamping Documentation

**File:** `src/rendering/shaders/blackhole/gravity/manifold.glsl.ts`

Add comment:
```glsl
// NOTE: densityFalloff is clamped to [0.1, 10.0] for numerical stability.
// Values outside this range in config will be clamped here.
float safeExponent = clamp(uDensityFalloff, 0.1, 10.0);
```

**File:** `src/stores/slices/geometry/blackholeSlice.ts`

Fix store clamping to match shader:
```typescript
setBlackHoleDensityFalloff: (falloff) => {
  // Match shader clamping range
  const clamped = Math.max(0.1, Math.min(10.0, falloff))
  // ...
}
```

---

## Part 4: Implementation Order

### Phase 1: Config & Store Cleanup
1. Update `BlackHoleConfig` interface - mark derived params as internal
2. Modify `setBlackHoleSpin` to compute all derived values
3. Add `_visualEventHorizon` to config (internal, not UI-exposed)
4. Fix `densityFalloff` clamping in store (0.1-10)

### Phase 2: Shader Updates
1. Add `uVisualEventHorizon` uniform
2. Update `isInsideHorizon()` to use visual horizon
3. Ensure photon shell uses derived radius

### Phase 3: UI Cleanup
1. Remove `diskInnerRadiusMul` and `diskOuterRadiusMul` from left panel
2. Add "Disk Outer Radius" to Advanced panel (artistic override)
3. Remove `swirlAmount` duplication from Animation drawer
4. Add read-only "Derived Values" info to Geometry panel

### Phase 4: Preset Updates
1. Update all presets with valid `densityFalloff` values
2. Add explicit `spin` to all presets
3. Remove derived values from presets
4. Test each preset visually

### Phase 5: Testing
1. Verify spin=0 produces Schwarzschild radii
2. Verify spin=0.9 produces correct Kerr radii
3. Verify all presets load without console warnings
4. Verify visual appearance matches Interstellar reference

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/geometry/extended/types.ts` | Update `BlackHoleConfig`, fix presets |
| `src/stores/slices/geometry/blackholeSlice.ts` | Auto-derive params, fix clamping |
| `src/components/sections/Geometry/BlackHoleControls.tsx` | Remove derived sliders |
| `src/components/sections/Advanced/AdvancedObjectControls.tsx` | Reorganize, add Disk Outer Radius |
| `src/components/layout/TimelineControls/BlackHoleAnimationDrawer.tsx` | Remove swirlAmount duplicate |
| `src/rendering/shaders/blackhole/gravity/horizon.glsl.ts` | Use visual event horizon |
| `src/rendering/shaders/blackhole/uniforms.glsl.ts` | Add uVisualEventHorizon |
| `src/rendering/renderers/BlackHole/useBlackHoleUniforms.ts` | Pass visual horizon |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing scenes | Presets will auto-fix on load |
| Visual regression | Test against reference screenshots |
| Physics accuracy debate | Document that this is "artistic physics" |

---

## Success Criteria

1. Changing `spin` automatically updates ISCO and photon sphere
2. Event horizon visually shrinks with increasing spin
3. No duplicate controls across panels
4. All preset values within valid shader ranges
5. Einstein ring visible with Interstellar preset
