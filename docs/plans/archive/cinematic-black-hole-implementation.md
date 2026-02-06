# Cinematic Black Hole Implementation Plan

Implement an N-dimensional black hole visualization with gravitational lensing, photon shell ring, and luminous accretion manifold. Based on the Schrödinger volumetric rendering architecture.

**Reference Spec:** `docs/cinematic_black_hole_visualization_spec.md`

## Overview

The black hole is a **volumetric raymarcher** (like Schrödinger), NOT an SDF-based raymarcher (like Mandelbulb). Key differences from existing objects:

| Feature | Mandelbulb | Schrödinger | Black Hole |
|---------|------------|-------------|------------|
| Ray type | Straight | Straight | **Bent** |
| Output | Surface hit | Emission integral | Emission integral |
| Core math | SDF iteration | Quantum psi | Gravity lensing |
| Termination | Distance < epsilon | Far boundary | Horizon capture |

**Base Template:** Copy Schrödinger infrastructure, replace quantum math with gravity physics.

---

## Phase 1: Core Type Definitions

### 1.1 Add `blackhole` to ObjectType union

**File:** `src/lib/geometry/types.ts`

Add `'blackhole'` to the `ExtendedObjectType` union:

```typescript
export type ExtendedObjectType =
  | 'root-system'
  | 'clifford-torus'
  | 'nested-torus'
  | 'mandelbulb'
  | 'quaternion-julia'
  | 'schroedinger'
  | 'blackhole'  // ADD THIS
```

Update `isExtendedObjectType()` type guard to include `'blackhole'`.

### 1.2 Add BlackHoleConfig to extended types

**File:** `src/lib/geometry/extended/types.ts`

Create comprehensive configuration interface:

```typescript
// ============================================
// BLACK HOLE CONFIGURATION
// ============================================

/** Quality presets for black hole rendering */
export type BlackHoleQuality = 'fast' | 'balanced' | 'quality' | 'ultra'

/** Palette modes for black hole coloring */
export type BlackHolePaletteMode =
  | 'diskGradient'    // Color by disk radius
  | 'normalBased'     // Color by pseudo-normal
  | 'shellOnly'       // Ring dominant
  | 'heatmap'         // Color by lensing intensity

/** Lighting mode for accretion material */
export type BlackHoleLightingMode = 'emissiveOnly' | 'fakeLit'

/** Manifold type override */
export type BlackHoleManifoldType = 'autoByN' | 'disk' | 'sheet' | 'slab' | 'field'

/** Background sampling mode */
export type BlackHoleBackgroundMode = 'environment' | 'proceduralStars' | 'solid'

/** Visual presets - parameter configurations for different looks */
export type BlackHoleVisualPreset = 'interstellar' | 'cosmic' | 'ethereal' | 'custom'

export interface BlackHoleConfig {
  // === BASIC (Artist-facing) ===
  horizonRadius: number              // R_h: 0.05-20, default 1.0
  gravityStrength: number            // k: 0-10, default 1.0
  manifoldIntensity: number          // 0-20, default 1.0
  manifoldThickness: number          // 0-2, default 0.15
  photonShellWidth: number           // 0-0.3, default 0.05
  timeScale: number                  // 0-5, default 1.0
  baseColor: string                  // hex color, default warm white
  paletteMode: BlackHolePaletteMode
  bloomBoost: number                 // 0-5, default 1.0

  // === LENSING (Advanced) ===
  dimensionEmphasis: number          // alpha: 0-2, default 0.8
  distanceFalloff: number            // beta: 0.5-4, default 1.6
  epsilonMul: number                 // 1e-5-0.5, default 0.01
  bendScale: number                  // 0-5, default 1.0
  bendMaxPerStep: number             // radians: 0-0.8, default 0.25
  lensingClamp: number               // 0-100, default 10

  // === PHOTON SHELL (Advanced) ===
  photonShellRadiusMul: number       // 1.0-2.0, default 1.3
  photonShellRadiusDimBias: number   // 0-0.5, default 0.1
  shellGlowStrength: number          // 0-20, default 3.0
  shellGlowColor: string             // hex color, default white
  shellStepMul: number               // 0.05-1, default 0.35
  shellContrastBoost: number         // 0-3, default 1.0

  // === MANIFOLD / ACCRETION (Advanced) ===
  manifoldType: BlackHoleManifoldType
  densityFalloff: number             // 0-40, default 6.0
  diskInnerRadiusMul: number         // 0-10, default 1.2
  diskOuterRadiusMul: number         // 0.1-200, default 8.0
  radialSoftnessMul: number          // 0-2, default 0.2
  thicknessPerDimMax: number         // 1-10, default 4.0
  highDimWScale: number              // 1-10, default 2.0
  swirlAmount: number                // 0-2, default 0.6
  noiseScale: number                 // 0.1-10, default 1.0
  noiseAmount: number                // 0-1, default 0.25
  multiIntersectionGain: number      // 0-3, default 1.0

  // === ROTATION PLANES ===
  // Managed by existing rotation store, but add damping params
  dampInnerMul: number               // 1-2, default 1.2
  dampOuterMul: number               // 1.2-8, default 3.0

  // === RENDERING QUALITY ===
  raymarchQuality: BlackHoleQuality
  maxSteps: number                   // 16-512, default 128
  stepBase: number                   // 0.001-1, default 0.08
  stepMin: number                    // 0.0001-0.5, default 0.01
  stepMax: number                    // 0.001-5, default 0.2
  stepAdaptG: number                 // 0-5, default 1.0
  stepAdaptR: number                 // 0-2, default 0.2
  enableAbsorption: boolean          // default false
  absorption: number                 // 0-10, default 1.0
  transmittanceCutoff: number        // 0-0.2, default 0.01
  farRadius: number                  // R_far multiplier, default 20.0

  // === LIGHTING (Optional) ===
  lightingMode: BlackHoleLightingMode
  roughness: number                  // 0-1, default 0.6
  specular: number                   // 0-1, default 0.2
  ambientTint: number                // 0-1, default 0.1
  shadowEnabled: boolean             // default false
  shadowSteps: number                // 4-64, default 16
  shadowDensity: number              // 0-10, default 2.0

  // === HORIZON ===
  edgeGlowEnabled: boolean           // default true
  edgeGlowWidth: number              // 0-1, default 0.1
  edgeGlowColor: string              // hex color
  edgeGlowIntensity: number          // 0-5, default 1.0

  // === BACKGROUND ===
  backgroundMode: BlackHoleBackgroundMode
  starfieldDensity: number           // for procedural stars
  starfieldBrightness: number

  // === TEMPORAL ===
  temporalAccumulationEnabled: boolean  // Horizon-style 1/4 res, default true

  // === DOPPLER EFFECT ===
  // Relativistic beaming - one side brighter/bluer, other dimmer/redder
  dopplerEnabled: boolean            // default: false
  dopplerStrength: number            // 0-2, default 0.6
  dopplerHueShift: number            // 0-0.3, default 0.1 (hue rotation amount)

  // === VISUAL PRESET ===
  // Convenience presets - sets multiple parameters at once
  // Setting to 'custom' preserves current values
  visualPreset: BlackHoleVisualPreset  // default: 'custom'

  // === CROSS-SECTION (4D+) ===
  parameterValues: number[]          // Extra dimension slice positions

  // === POLAR JETS ===
  // Conical emission along rotation axis for dramatic effect
  jetsEnabled: boolean               // default: false
  jetsHeight: number                 // 0-50, default 10.0 (in horizon radii)
  jetsWidth: number                  // 0-5, default 0.5 (opening angle factor)
  jetsIntensity: number              // 0-10, default 2.0
  jetsColor: string                  // hex color, default '#88ccff'
  jetsFalloff: number                // 0-10, default 3.0 (how quickly jets fade)
  jetsNoiseAmount: number            // 0-1, default 0.3 (turbulence)
  jetsPulsation: number              // 0-2, default 0.5 (breathing effect speed)

  // === MOTION BLUR ===
  // Radial streaks in disk plane for sense of rotation speed
  motionBlurEnabled: boolean         // default: false
  motionBlurStrength: number         // 0-2, default 0.5
  motionBlurSamples: number          // 1-8, default 4
  motionBlurRadialFalloff: number    // 0-5, default 2.0

  // === DEFERRED LENSING ===
  // Fast-path screen-space distortion for performance
  deferredLensingEnabled: boolean    // default: false (full volumetric by default)
  deferredLensingStrength: number    // 0-2, default 1.0
  deferredLensingRadius: number      // 0-10, default 5.0 (effect radius in horizon units)

  // === SCENE OBJECT LENSING ===
  // Lens other 3D objects, not just background/environment
  sceneObjectLensingEnabled: boolean // default: true
  sceneObjectLensingStrength: number // 0-2, default 1.0
}

export const BLACK_HOLE_QUALITY_PRESETS: Record<BlackHoleQuality, Partial<BlackHoleConfig>> = {
  fast: {
    maxSteps: 48,
    stepBase: 0.12,
    stepMin: 0.02,
    shadowEnabled: false,
    enableAbsorption: false,
    temporalAccumulationEnabled: true,
  },
  balanced: {
    maxSteps: 96,
    stepBase: 0.08,
    stepMin: 0.015,
    shadowEnabled: false,
    enableAbsorption: false,
    temporalAccumulationEnabled: true,
  },
  quality: {
    maxSteps: 192,
    stepBase: 0.05,
    stepMin: 0.01,
    shadowEnabled: true,
    enableAbsorption: true,
    temporalAccumulationEnabled: false,
  },
  ultra: {
    maxSteps: 256,
    stepBase: 0.03,
    stepMin: 0.005,
    shadowEnabled: true,
    enableAbsorption: true,
    temporalAccumulationEnabled: false,
  },
}

/**
 * VISUAL PRESETS
 *
 * These are convenience configurations for different aesthetic looks.
 * Users can start from a preset and tweak, or build from scratch.
 * All parameters remain freely adjustable in any dimension.
 */
export const BLACK_HOLE_VISUAL_PRESETS: Record<BlackHoleVisualPreset, Partial<BlackHoleConfig>> = {
  /**
   * INTERSTELLAR PRESET
   * Thin disk, strong lensing, Doppler effect - movie-accurate look.
   * Works in any dimension but optimized for 3D appearance.
   */
  interstellar: {
    manifoldThickness: 0.02,         // Nearly 2D thin disk
    densityFalloff: 50.0,            // Sharp disk edges
    gravityStrength: 1.5,            // Strong lensing for dramatic bending
    bendScale: 1.2,                  // Enhanced ray curvature
    manifoldIntensity: 3.0,          // Bright disk
    shellGlowStrength: 5.0,          // Prominent photon ring
    dopplerEnabled: true,            // One-side-brighter effect
    dopplerStrength: 0.6,
    dopplerHueShift: 0.1,
    noiseAmount: 0.15,               // Subtle disk texture
    swirlAmount: 0.4,                // Visible rotation
  },

  /**
   * COSMIC PRESET
   * Thicker volumetric manifold, softer glow, more ethereal.
   * Good starting point for higher dimensions.
   */
  cosmic: {
    manifoldThickness: 0.3,          // Volumetric cloud-like
    densityFalloff: 6.0,             // Soft falloff
    gravityStrength: 1.0,            // Moderate lensing
    bendScale: 1.0,
    manifoldIntensity: 1.5,
    shellGlowStrength: 2.0,          // Subtle ring
    dopplerEnabled: false,           // Symmetric look
    noiseAmount: 0.4,                // More turbulent
    swirlAmount: 0.8,                // Strong swirl
    enableAbsorption: true,          // Volumetric depth
    absorption: 0.5,
  },

  /**
   * ETHEREAL PRESET
   * Very thick field, strong glow, dreamlike quality.
   * Emphasizes the alien nature of higher dimensions.
   */
  ethereal: {
    manifoldThickness: 0.8,          // Thick field
    densityFalloff: 3.0,             // Very soft
    gravityStrength: 0.8,            // Gentle lensing
    bendScale: 0.8,
    manifoldIntensity: 2.0,
    shellGlowStrength: 8.0,          // Strong ethereal glow
    shellGlowColor: '#aaccff',       // Blue-tinted
    dopplerEnabled: false,
    noiseAmount: 0.6,                // High turbulence
    swirlAmount: 1.2,                // Very swirly
    edgeGlowEnabled: true,
    edgeGlowIntensity: 2.0,
    edgeGlowColor: '#ff88ff',        // Purple edge
  },

  /**
   * CUSTOM PRESET
   * No changes applied - user's current settings preserved.
   */
  custom: {},
}

export const DEFAULT_BLACK_HOLE_CONFIG: BlackHoleConfig = {
  // Basic
  horizonRadius: 1.0,
  gravityStrength: 1.0,
  manifoldIntensity: 1.0,
  manifoldThickness: 0.15,
  photonShellWidth: 0.05,
  timeScale: 1.0,
  baseColor: '#fff5e6',  // warm white
  paletteMode: 'diskGradient',
  bloomBoost: 1.5,

  // Lensing
  dimensionEmphasis: 0.8,
  distanceFalloff: 1.6,
  epsilonMul: 0.01,
  bendScale: 1.0,
  bendMaxPerStep: 0.25,
  lensingClamp: 10.0,

  // Photon shell
  photonShellRadiusMul: 1.3,
  photonShellRadiusDimBias: 0.1,
  shellGlowStrength: 3.0,
  shellGlowColor: '#ffffff',
  shellStepMul: 0.35,
  shellContrastBoost: 1.0,

  // Manifold
  manifoldType: 'autoByN',
  densityFalloff: 6.0,
  diskInnerRadiusMul: 1.2,
  diskOuterRadiusMul: 8.0,
  radialSoftnessMul: 0.2,
  thicknessPerDimMax: 4.0,
  highDimWScale: 2.0,
  swirlAmount: 0.6,
  noiseScale: 1.0,
  noiseAmount: 0.25,
  multiIntersectionGain: 1.0,

  // Rotation damping
  dampInnerMul: 1.2,
  dampOuterMul: 3.0,

  // Quality
  raymarchQuality: 'balanced',
  maxSteps: 96,
  stepBase: 0.08,
  stepMin: 0.01,
  stepMax: 0.2,
  stepAdaptG: 1.0,
  stepAdaptR: 0.2,
  enableAbsorption: false,
  absorption: 1.0,
  transmittanceCutoff: 0.01,
  farRadius: 20.0,

  // Lighting
  lightingMode: 'emissiveOnly',
  roughness: 0.6,
  specular: 0.2,
  ambientTint: 0.1,
  shadowEnabled: false,
  shadowSteps: 16,
  shadowDensity: 2.0,

  // Horizon
  edgeGlowEnabled: true,
  edgeGlowWidth: 0.1,
  edgeGlowColor: '#ff6600',
  edgeGlowIntensity: 1.0,

  // Background
  backgroundMode: 'environment',
  starfieldDensity: 1.0,
  starfieldBrightness: 1.0,

  // Temporal
  temporalAccumulationEnabled: true,

  // Doppler
  dopplerEnabled: false,
  dopplerStrength: 0.6,
  dopplerHueShift: 0.1,

  // Visual preset
  visualPreset: 'custom',

  // Cross-section
  parameterValues: [0, 0, 0, 0, 0, 0, 0, 0],

  // Polar jets
  jetsEnabled: false,
  jetsHeight: 10.0,
  jetsWidth: 0.5,
  jetsIntensity: 2.0,
  jetsColor: '#88ccff',
  jetsFalloff: 3.0,
  jetsNoiseAmount: 0.3,
  jetsPulsation: 0.5,

  // Motion blur
  motionBlurEnabled: false,
  motionBlurStrength: 0.5,
  motionBlurSamples: 4,
  motionBlurRadialFalloff: 2.0,

  // Deferred lensing
  deferredLensingEnabled: false,
  deferredLensingStrength: 1.0,
  deferredLensingRadius: 5.0,

  // Scene object lensing
  sceneObjectLensingEnabled: true,
  sceneObjectLensingStrength: 1.0,
}
```

Add to `ExtendedObjectParams` interface and `DEFAULT_EXTENDED_OBJECT_PARAMS`.

### 1.3 Add Black Hole Color Algorithms

**File:** `src/rendering/shaders/palette/types.ts`

Add black-hole-specific color algorithms that only appear when black hole is selected:

```typescript
/**
 * Color algorithm selection.
 * Determines how the color palette is generated.
 *
 * EXISTING + BLACK HOLE ADDITIONS:
 * - accretionGradient: Color by radial position in accretion disk
 * - gravitationalRedshift: Color by gravitational potential (bluer near horizon)
 * - lensingIntensity: Color by how much lensing distortion occurred
 * - jetsEmission: Color by position in polar jets
 */
export type ColorAlgorithm =
  | 'monochromatic'
  | 'analogous'
  | 'cosine'
  | 'normal'
  | 'distance'
  | 'lch'
  | 'multiSource'
  | 'radial'
  | 'phase'
  | 'mixed'
  | 'blackbody'
  // BLACK HOLE ADDITIONS
  | 'accretionGradient'      // Color by disk radial position
  | 'gravitationalRedshift'   // Gravitational redshift effect
  | 'lensingIntensity'        // Color by ray bend amount
  | 'jetsEmission'            // Color for polar jets

// Update COLOR_ALGORITHM_OPTIONS to include black hole algorithms
export const COLOR_ALGORITHM_OPTIONS = [
  // ... existing options ...
  { value: 'accretionGradient' as const, label: 'Accretion Gradient' },
  { value: 'gravitationalRedshift' as const, label: 'Gravitational Redshift' },
  { value: 'lensingIntensity' as const, label: 'Lensing Intensity' },
  { value: 'jetsEmission' as const, label: 'Jets Emission' },
] as const

// Update COLOR_ALGORITHM_TO_INT
export const COLOR_ALGORITHM_TO_INT: Record<ColorAlgorithm, number> = {
  // ... existing mappings (0-10) ...
  accretionGradient: 11,
  gravitationalRedshift: 12,
  lensingIntensity: 13,
  jetsEmission: 14,
}

/**
 * Color algorithms that are only meaningful for Black Hole objects.
 * These use gravitational/accretion-specific data.
 * For non-black-hole objects, these should be hidden from the UI.
 */
export const BLACKHOLE_ONLY_ALGORITHMS: readonly ColorAlgorithm[] = [
  'accretionGradient',
  'gravitationalRedshift',
  'lensingIntensity',
  'jetsEmission',
] as const

/**
 * Check if a color algorithm is black-hole-specific.
 * @param algorithm - The color algorithm to check
 * @returns True if the algorithm is black-hole-only
 */
export function isBlackHoleOnlyAlgorithm(algorithm: ColorAlgorithm): boolean {
  return BLACKHOLE_ONLY_ALGORITHMS.includes(algorithm)
}
```

**File:** `src/components/sections/Faces/ColorAlgorithmSelector.tsx`

Update the algorithm filtering logic to include black hole algorithms:

```typescript
const availableOptions = useMemo(() => {
  const isSchroedinger = objectType === 'schroedinger'
  const isBlackHole = objectType === 'blackhole'

  return COLOR_ALGORITHM_OPTIONS.filter((opt) => {
    // Schroedinger-only algorithms
    if (isQuantumOnlyAlgorithm(opt.value)) {
      return isSchroedinger
    }
    // Black hole-only algorithms
    if (isBlackHoleOnlyAlgorithm(opt.value)) {
      return isBlackHole
    }
    // Universal algorithms available to all
    return true
  })
}, [objectType])
```

### 1.4 Add BlackHoleSlice types

**File:** `src/stores/slices/geometry/types.ts`

```typescript
export interface BlackHoleSliceState {
  blackhole: BlackHoleConfig
}

export interface BlackHoleSliceActions {
  // Basic
  setBlackHoleHorizonRadius: (value: number) => void
  setBlackHoleGravityStrength: (value: number) => void
  setBlackHoleManifoldIntensity: (value: number) => void
  setBlackHoleManifoldThickness: (value: number) => void
  setBlackHolePhotonShellWidth: (value: number) => void
  setBlackHoleTimeScale: (value: number) => void
  setBlackHoleBaseColor: (value: string) => void
  setBlackHolePaletteMode: (value: BlackHolePaletteMode) => void
  setBlackHoleBloomBoost: (value: number) => void

  // Lensing
  setBlackHoleDimensionEmphasis: (value: number) => void
  setBlackHoleDistanceFalloff: (value: number) => void
  setBlackHoleBendScale: (value: number) => void
  setBlackHoleBendMaxPerStep: (value: number) => void
  setBlackHoleLensingClamp: (value: number) => void

  // Shell
  setBlackHolePhotonShellRadiusMul: (value: number) => void
  setBlackHoleShellGlowStrength: (value: number) => void
  setBlackHoleShellGlowColor: (value: string) => void
  setBlackHoleShellStepMul: (value: number) => void

  // Manifold
  setBlackHoleManifoldType: (value: BlackHoleManifoldType) => void
  setBlackHoleDensityFalloff: (value: number) => void
  setBlackHoleDiskInnerRadiusMul: (value: number) => void
  setBlackHoleDiskOuterRadiusMul: (value: number) => void
  setBlackHoleSwirlAmount: (value: number) => void
  setBlackHoleNoiseScale: (value: number) => void
  setBlackHoleNoiseAmount: (value: number) => void

  // Quality
  setBlackHoleRaymarchQuality: (value: BlackHoleQuality) => void
  setBlackHoleMaxSteps: (value: number) => void
  setBlackHoleEnableAbsorption: (value: boolean) => void

  // Lighting
  setBlackHoleLightingMode: (value: BlackHoleLightingMode) => void
  setBlackHoleShadowEnabled: (value: boolean) => void

  // Horizon
  setBlackHoleEdgeGlowEnabled: (value: boolean) => void
  setBlackHoleEdgeGlowWidth: (value: number) => void
  setBlackHoleEdgeGlowColor: (value: string) => void
  setBlackHoleEdgeGlowIntensity: (value: number) => void

  // Background
  setBlackHoleBackgroundMode: (value: BlackHoleBackgroundMode) => void

  // Temporal
  setBlackHoleTemporalAccumulationEnabled: (value: boolean) => void

  // Doppler
  setBlackHoleDopplerEnabled: (value: boolean) => void
  setBlackHoleDopplerStrength: (value: number) => void
  setBlackHoleDopplerHueShift: (value: number) => void

  // Cross-section
  setBlackHoleParameterValue: (dimIndex: number, value: number) => void

  // Batch / Presets
  setBlackHoleConfig: (config: Partial<BlackHoleConfig>) => void
  applyBlackHoleQualityPreset: (preset: BlackHoleQuality) => void
  applyBlackHoleVisualPreset: (preset: BlackHoleVisualPreset) => void
}

export type BlackHoleSlice = BlackHoleSliceState & BlackHoleSliceActions
```

---

## Phase 2: Shader Architecture

The black hole shader is volumetric like Schrödinger but with unique physics modules.

**Create folder:** `src/rendering/shaders/blackhole/`

### 2.1 Shader Block Structure

```
src/rendering/shaders/blackhole/
├── compose.ts              # Main shader composition
├── uniforms.glsl.ts        # Black hole specific uniforms
├── main.glsl.ts            # Main fragment shader with bent ray loop
├── gravity/
│   ├── lensing.glsl.ts     # G(r,N) and ray bending functions
│   ├── horizon.glsl.ts     # Horizon capture and edge glow
│   ├── shell.glsl.ts       # Photon shell mask and emission
│   ├── manifold.glsl.ts    # Luminous manifold density function
│   └── doppler.glsl.ts     # Relativistic Doppler effect
├── effects/
│   ├── jets.glsl.ts        # Polar jets emission
│   ├── motion-blur.glsl.ts # Radial motion blur in disk
│   └── deferred-lensing.glsl.ts  # Screen-space lensing pass
├── background/
│   └── starfield.glsl.ts   # Procedural starfield (optional)
└── color/
    └── blackhole-palettes.glsl.ts  # Black hole color algorithms
```

### 2.2 Create uniforms.glsl.ts

```glsl
// Black Hole Uniforms
uniform float uHorizonRadius;        // R_h
uniform float uGravityStrength;      // k
uniform float uDimensionEmphasis;    // alpha
uniform float uDistanceFalloff;      // beta
uniform float uEpsilon;              // epsilon (precomputed: epsilonMul * R_h)
uniform float uBendScale;
uniform float uBendMaxPerStep;
uniform float uLensingClamp;

// Photon Shell
uniform float uPhotonShellRadius;    // R_p (precomputed)
uniform float uPhotonShellWidth;     // Delta
uniform float uShellGlowStrength;
uniform vec3 uShellGlowColor;
uniform float uShellStepMul;

// Manifold
uniform float uManifoldIntensity;
uniform float uManifoldThickness;
uniform float uDensityFalloff;
uniform float uDiskInnerRadius;      // precomputed: mul * R_h
uniform float uDiskOuterRadius;      // precomputed: mul * R_h
uniform float uRadialSoftness;       // precomputed: mul * R_h
uniform float uThicknessScale;       // precomputed based on dimension
uniform float uHighDimWScale;
uniform float uSwirlAmount;
uniform float uNoiseScale;
uniform float uNoiseAmount;

// Manifold orientation (N-D vectors stored as arrays)
uniform float uManifoldAxisU[11];    // u vector (up to 11D)
uniform float uManifoldAxisV[11];    // v vector (up to 11D)

// Horizon edge glow
uniform float uEdgeGlowWidth;
uniform vec3 uEdgeGlowColor;
uniform float uEdgeGlowIntensity;

// Raymarch quality
uniform int uMaxSteps;
uniform float uStepBase;
uniform float uStepMin;
uniform float uStepMax;
uniform float uStepAdaptG;
uniform float uStepAdaptR;
uniform float uTransmittanceCutoff;
uniform float uFarRadius;

// Absorption
uniform bool uEnableAbsorption;
uniform float uAbsorption;

// Background
uniform int uBackgroundMode;         // 0=environment, 1=procedural, 2=solid
uniform float uStarfieldDensity;
uniform float uStarfieldBrightness;

// Rotation damping
uniform float uDampInnerMul;
uniform float uDampOuterMul;

// Doppler effect
uniform bool uDopplerEnabled;
uniform float uDopplerStrength;
uniform float uDopplerHueShift;

// Polar jets
uniform bool uJetsEnabled;
uniform float uJetsHeight;
uniform float uJetsWidth;
uniform float uJetsIntensity;
uniform vec3 uJetsColor;
uniform float uJetsFalloff;
uniform float uJetsNoiseAmount;
uniform float uJetsPulsation;

// Motion blur
uniform bool uMotionBlurEnabled;
uniform float uMotionBlurStrength;
uniform int uMotionBlurSamples;
uniform float uMotionBlurRadialFalloff;

// Deferred lensing (screen-space pass)
uniform bool uDeferredLensingEnabled;
uniform float uDeferredLensingStrength;
uniform float uDeferredLensingRadius;

// Scene object lensing
uniform bool uSceneObjectLensingEnabled;
uniform float uSceneObjectLensingStrength;

// FastMode & Progressive Refinement
uniform bool uFastMode;                  // True during N-D rotation (from fractalAnimLowQuality setting)
uniform float uQualityMultiplier;        // 0.25-1.0 from progressive refinement system
uniform int uShadowAnimationMode;        // 0=skip shadows, 1=lowest quality, 2=use selected quality
```

### 2.3 Create gravity/lensing.glsl.ts

```glsl
/**
 * Compute gravity strength G(r,N) for ray bending
 * G(r,N) = k * N^alpha / (r + epsilon)^beta
 */
float computeGravity(float r, int N) {
  float nPow = pow(float(N), uDimensionEmphasis);
  float denom = pow(r + uEpsilon, uDistanceFalloff);
  float g = uGravityStrength * nPow / denom;
  return clamp(g, 0.0, uLensingClamp);
}

/**
 * Bend ray direction toward center (tangential deflection)
 * Uses rotation-based bending for stability across step sizes
 *
 * @param dir Current ray direction (N-D, normalized)
 * @param pos Current position (N-D)
 * @param g Gravity strength at this position
 * @param dt Current step size
 * @param dimension Current dimension N
 * @return New ray direction (normalized)
 */
void bendRayND(inout float dir[11], float pos[11], float g, float dt, int dimension) {
  // Compute distance to center
  float r = 0.0;
  for (int i = 0; i < dimension; i++) {
    r += pos[i] * pos[i];
  }
  r = sqrt(r);

  if (r < 0.0001) return;  // Too close to center, skip bending

  // Compute toCenter direction
  float toCenter[11];
  for (int i = 0; i < dimension; i++) {
    toCenter[i] = -pos[i] / r;
  }

  // Compute radial component of direction
  float radialComp = 0.0;
  for (int i = 0; i < dimension; i++) {
    radialComp += dir[i] * toCenter[i];
  }

  // Compute tangent = dir - radial component (perpendicular to radius)
  float tangent[11];
  float tangentLen = 0.0;
  for (int i = 0; i < dimension; i++) {
    tangent[i] = dir[i] - radialComp * toCenter[i];
    tangentLen += tangent[i] * tangent[i];
  }
  tangentLen = sqrt(tangentLen);

  if (tangentLen < 1e-6) return;  // Ray pointing directly at/away from center

  // Normalize tangent
  for (int i = 0; i < dimension; i++) {
    tangent[i] /= tangentLen;
  }

  // Compute rotation angle (scaled by step size for stability)
  float theta = clamp(g * dt * uBendScale, 0.0, uBendMaxPerStep);

  // Rotate direction: newDir = cos(theta)*dir + sin(theta)*tangent
  float cosT = cos(theta);
  float sinT = sin(theta);

  for (int i = 0; i < dimension; i++) {
    dir[i] = cosT * dir[i] + sinT * tangent[i];
  }

  // Re-normalize
  float dirLen = 0.0;
  for (int i = 0; i < dimension; i++) {
    dirLen += dir[i] * dir[i];
  }
  dirLen = sqrt(dirLen);
  for (int i = 0; i < dimension; i++) {
    dir[i] /= dirLen;
  }
}
```

### 2.4 Create gravity/horizon.glsl.ts

```glsl
/**
 * Check if ray has been captured by horizon
 * Returns true if r < R_h
 */
bool isHorizonCaptured(float r) {
  return r < uHorizonRadius;
}

/**
 * Compute horizon edge glow contribution
 * Applied just outside the horizon for dramatic effect
 */
vec3 computeHorizonEdgeGlow(float r) {
  if (!uEdgeGlowEnabled) return vec3(0.0);

  float glowStart = uHorizonRadius;
  float glowEnd = uHorizonRadius + uEdgeGlowWidth * uHorizonRadius;

  float proximity = 1.0 - smoothstep(glowStart, glowEnd, r);
  return proximity * uEdgeGlowColor * uEdgeGlowIntensity;
}

/**
 * Compute soft horizon edge for anti-aliasing
 * Returns blend factor (0 = inside horizon, 1 = outside)
 */
float computeHorizonSoftEdge(float r, float edgeSoftness) {
  return smoothstep(uHorizonRadius, uHorizonRadius + edgeSoftness, r);
}
```

### 2.5 Create gravity/shell.glsl.ts

```glsl
/**
 * Compute photon shell radius based on dimension
 * R_p = R_h * (radiusMul + radiusDimBias * log(N))
 */
float computePhotonShellRadius(int N) {
  return uHorizonRadius * (uPhotonShellRadiusMul + uPhotonShellRadiusDimBias * log(float(N)));
}

/**
 * Compute photon shell mask (1 = on shell, 0 = away from shell)
 * CORRECTED FORMULA from spec review
 */
float computeShellMask(float r, int N) {
  float Rp = computePhotonShellRadius(N);
  float delta = uPhotonShellWidth * uHorizonRadius;

  // Correct formula: 1 at shell, 0 away
  return 1.0 - smoothstep(0.0, delta, abs(r - Rp));
}

/**
 * Compute shell glow emission
 */
vec3 computeShellGlow(float shellMask) {
  return shellMask * uShellGlowColor * uShellGlowStrength;
}

/**
 * Adjust step size for shell detail
 * Smaller steps near the shell for sharpness
 */
float adjustStepForShell(float dt, float shellMask) {
  return dt * mix(1.0, uShellStepMul, shellMask);
}
```

### 2.6 Create gravity/manifold.glsl.ts

```glsl
/**
 * Simple 3D noise for manifold detail
 */
float noise3D(vec3 p) {
  // Implement or use existing noise function
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

/**
 * Compute manifold (accretion) density at position
 * Works in N-D, produces disk (3D) → sheet (4-6D) → field (7D+)
 */
float computeManifoldDensity(float pos[11], int dimension, float time) {
  // Project position onto manifold plane (u-v plane)
  float pu = 0.0;
  float pv = 0.0;
  for (int i = 0; i < dimension; i++) {
    pu += pos[i] * uManifoldAxisU[i];
    pv += pos[i] * uManifoldAxisV[i];
  }

  // Compute distance from u-v plane (includes higher dimensions)
  float pPlane[11];
  float wDist = 0.0;
  for (int i = 0; i < dimension; i++) {
    pPlane[i] = pu * uManifoldAxisU[i] + pv * uManifoldAxisV[i];
    float diff = pos[i] - pPlane[i];
    wDist += diff * diff;
  }
  wDist = sqrt(wDist);

  // Radial distance in disk plane
  float rDisk = sqrt(pu * pu + pv * pv);

  // Radial mask (inner/outer boundaries)
  float radialMask = smoothstep(uDiskInnerRadius, uDiskInnerRadius + uRadialSoftness, rDisk)
                   * (1.0 - smoothstep(uDiskOuterRadius - uRadialSoftness, uDiskOuterRadius, rDisk));

  // Dimension-based thickness scaling (disk → sheet → slab → field)
  float dimT = clamp(float(dimension - 3) / 8.0, 0.0, 1.0);
  float thickness = uManifoldThickness * mix(1.0, uThicknessPerDimMax, dimT);
  float wScale = mix(1.0, uHighDimWScale, smoothstep(0.25, 0.75, dimT));

  float scaledDist = wDist * wScale;

  // Base density (exponential falloff from plane)
  float rho = exp(-abs(scaledDist) / thickness * uDensityFalloff) * radialMask;

  // Optional swirl modulation
  if (uSwirlAmount > 0.0) {
    float angle = atan(pv, pu);
    float swirl = sin(angle * 3.0 + rDisk * 2.0 - time * uTimeScale);
    rho *= 1.0 + uSwirlAmount * swirl * 0.3;
  }

  // Optional noise breakup
  if (uNoiseAmount > 0.0) {
    vec3 noisePos = vec3(pu * uNoiseScale, pv * uNoiseScale, time * uTimeScale * 0.5);
    float n = noise3D(noisePos) * 2.0 - 1.0;
    rho *= 1.0 + uNoiseAmount * n;
  }

  return max(rho, 0.0);
}
```

### 2.7 Create gravity/doppler.glsl.ts

```glsl
/**
 * Doppler Effect for Accretion Disk
 *
 * Simulates relativistic beaming where material moving toward
 * the observer appears brighter and blue-shifted, while material
 * moving away appears dimmer and red-shifted.
 *
 * This is a stylized approximation for visual effect, not
 * physically accurate relativistic Doppler.
 */

/**
 * Compute orbital velocity direction at disk position
 * Assumes counter-clockwise rotation around the manifold normal
 *
 * @param diskPos Position projected onto disk plane (pu, pv)
 * @param diskNormal Normal to the disk plane (typically Y-up in 3D)
 * @return Normalized orbital velocity direction
 */
vec3 computeOrbitalVelocity(vec2 diskPos, vec3 diskNormal) {
  // Radial direction in disk plane
  vec3 radial = normalize(vec3(diskPos.x, 0.0, diskPos.y));

  // Orbital velocity is perpendicular to radial (counter-clockwise)
  return normalize(cross(diskNormal, radial));
}

/**
 * Apply Doppler shift to emission color and brightness
 *
 * @param emission Current emission color
 * @param diskPos Position in disk plane (pu, pv)
 * @param viewDir View direction (from sample point toward camera)
 * @return Modified emission with Doppler effect
 */
vec3 applyDopplerEffect(vec3 emission, vec2 diskPos, vec3 viewDir) {
  if (!uDopplerEnabled) return emission;

  // Disk normal (Y-up for standard orientation)
  vec3 diskNormal = vec3(0.0, 1.0, 0.0);

  // Orbital velocity direction
  vec3 orbitalVel = computeOrbitalVelocity(diskPos, diskNormal);

  // Doppler factor: positive = approaching (blue), negative = receding (red)
  float doppler = dot(orbitalVel, viewDir);

  // Brightness modulation (approaching = brighter)
  float brightnessMod = 1.0 + uDopplerStrength * doppler;
  brightnessMod = max(brightnessMod, 0.1);  // Prevent complete darkness

  // Hue shift (approaching = blue shift, receding = red shift)
  // Convert to HSL, shift hue, convert back
  vec3 hsl = rgbToHsl(emission);
  hsl.x += doppler * uDopplerHueShift;  // Shift hue
  hsl.x = fract(hsl.x);                  // Wrap hue to [0,1]
  vec3 shiftedColor = hslToRgb(hsl);

  return shiftedColor * brightnessMod;
}
```

### 2.8 Create effects/jets.glsl.ts

```glsl
/**
 * Polar Jets Emission
 *
 * Creates dramatic conical emission along the rotation axis.
 * Jets extend above and below the accretion disk plane.
 */

/**
 * Compute polar jet emission at position
 *
 * @param pos Position in N-D space (as array)
 * @param axisDir Rotation axis direction (typically Y in 3D)
 * @param dimension Current dimension N
 * @param time Animation time
 * @return Jet emission color contribution
 */
vec3 computeJetEmission(float pos[11], vec3 axisDir, int dimension, float time) {
  if (!uJetsEnabled) return vec3(0.0);

  // Project position onto axis and compute distances
  float axisProj = 0.0;
  float radialDist = 0.0;

  // For 3D+, axis is typically the Y direction
  // axisDir provides the current rotation-adjusted axis
  for (int i = 0; i < min(dimension, 3); i++) {
    axisProj += pos[i] * axisDir[i];
  }

  // Radial distance from axis
  float pos3D[3];
  for (int i = 0; i < 3; i++) {
    pos3D[i] = i < dimension ? pos[i] : 0.0;
  }
  vec3 posVec = vec3(pos3D[0], pos3D[1], pos3D[2]);
  vec3 onAxis = axisDir * axisProj;
  vec3 radialVec = posVec - onAxis;
  radialDist = length(radialVec);

  // Height along axis (absolute value for both poles)
  float height = abs(axisProj);

  // Cone angle check - jet widens with height
  float coneRadius = height * uJetsWidth;
  if (radialDist > coneRadius) return vec3(0.0);

  // Only emit above/below the disk (not in disk plane)
  float minHeight = uHorizonRadius * 1.5;
  if (height < minHeight) return vec3(0.0);

  // Height falloff
  float maxHeight = uHorizonRadius * uJetsHeight;
  float heightFactor = 1.0 - smoothstep(minHeight, maxHeight, height);
  heightFactor = pow(heightFactor, uJetsFalloff);

  // Radial falloff (brighter in center of cone)
  float radialFactor = 1.0 - (radialDist / coneRadius);
  radialFactor = radialFactor * radialFactor;

  // Pulsation animation
  float pulse = 1.0 + sin(time * uJetsPulsation * 3.14159) * 0.2;

  // Noise for turbulence
  float noiseVal = 1.0;
  if (uJetsNoiseAmount > 0.0) {
    vec3 noisePos = posVec * 2.0 + vec3(0.0, time * 0.5, 0.0);
    noiseVal = 1.0 + (noise3D(noisePos) * 2.0 - 1.0) * uJetsNoiseAmount;
  }

  float intensity = heightFactor * radialFactor * pulse * noiseVal;

  return uJetsColor * intensity * uJetsIntensity;
}
```

### 2.9 Create effects/motion-blur.glsl.ts

```glsl
/**
 * Radial Motion Blur
 *
 * Creates radial streaks in the accretion disk to convey rapid rotation.
 * Applied as a post-raymarch modulation of disk emission.
 */

/**
 * Compute motion blur factor for disk emission
 *
 * @param diskPos Position in disk plane (u, v coordinates)
 * @param rho Base density at this position
 * @param time Animation time
 * @return Modified density with motion blur streaks
 */
float applyMotionBlur(vec2 diskPos, float rho, float time) {
  if (!uMotionBlurEnabled || rho < 0.001) return rho;

  float r = length(diskPos);
  if (r < 0.001) return rho;

  // Radial falloff (stronger blur near horizon, weaker at outer edge)
  float blurFalloff = exp(-r * uMotionBlurRadialFalloff / uDiskOuterRadius);

  // Multi-sample along angular direction
  float accum = 0.0;
  float angle = atan(diskPos.y, diskPos.x);

  for (int i = 0; i < uMotionBlurSamples; i++) {
    float offset = (float(i) / float(uMotionBlurSamples) - 0.5) * uMotionBlurStrength;
    float sampleAngle = angle + offset * blurFalloff;

    vec2 samplePos = vec2(cos(sampleAngle), sin(sampleAngle)) * r;

    // Sample density at offset position (simplified - recompute radial factor only)
    float radialMask = smoothstep(uDiskInnerRadius, uDiskInnerRadius + uRadialSoftness, r)
                     * (1.0 - smoothstep(uDiskOuterRadius - uRadialSoftness, uDiskOuterRadius, r));
    accum += radialMask;
  }

  float blurredRho = rho * (accum / float(uMotionBlurSamples));

  return mix(rho, blurredRho, blurFalloff);
}

/**
 * Apply motion blur to final emission color
 * Creates the visual effect of radial streaking
 */
vec3 applyMotionBlurColor(vec3 emission, vec2 diskPos, float time) {
  if (!uMotionBlurEnabled) return emission;

  float r = length(diskPos);
  float blurFalloff = exp(-r * uMotionBlurRadialFalloff / uDiskOuterRadius);

  // Slight color desaturation in blurred regions
  vec3 desaturated = vec3(dot(emission, vec3(0.299, 0.587, 0.114)));
  return mix(emission, desaturated, blurFalloff * 0.3);
}
```

### 2.10 Create effects/deferred-lensing.glsl.ts

```glsl
/**
 * Deferred Lensing Pass (Screen-Space)
 *
 * Fast approximation of gravitational lensing as a post-process.
 * Used when deferredLensingEnabled is true for better performance.
 *
 * This runs as a separate pass AFTER the main black hole render,
 * distorting the scene texture around the black hole position.
 */

uniform sampler2D uSceneTexture;         // Full scene render
uniform sampler2D uBlackHoleDepth;       // Black hole depth buffer
uniform vec2 uBlackHoleScreenPos;        // Black hole center in UV coords
uniform float uBlackHoleScreenRadius;    // Horizon radius in screen space

/**
 * Compute UV distortion for gravitational lensing
 */
vec2 computeLensingDistortion(vec2 uv) {
  vec2 toCenter = uBlackHoleScreenPos - uv;
  float dist = length(toCenter);

  if (dist < 0.001) return uv;  // Avoid division by zero

  // Lensing strength falls off with distance
  float effectRadius = uBlackHoleScreenRadius * uDeferredLensingRadius;
  if (dist > effectRadius) return uv;

  // Bend UV toward black hole center
  float strength = (1.0 - dist / effectRadius);
  strength = pow(strength, 2.0) * uDeferredLensingStrength;

  vec2 displacement = normalize(toCenter) * strength * 0.1;

  return uv + displacement;
}

/**
 * Main deferred lensing fragment shader
 */
void deferredLensingMain() {
  vec2 distortedUV = computeLensingDistortion(vUv);

  // Sample scene with distorted UVs
  vec3 sceneColor = texture(uSceneTexture, distortedUV).rgb;

  // Blend with black hole render
  vec4 blackHoleColor = texture(uBlackHoleDepth, vUv);

  // Composite: black hole in front, lensed scene behind
  vec3 finalColor = mix(sceneColor, blackHoleColor.rgb, blackHoleColor.a);

  outColor = vec4(finalColor, 1.0);
}
```

### 2.11 Create color/blackhole-palettes.glsl.ts

```glsl
/**
 * Black Hole Color Algorithms
 *
 * Object-specific color palettes for gravitational visualization.
 * These algorithms are added to the existing color selector.
 */

// Algorithm indices (continue from existing 0-10)
#define COLOR_ALGO_ACCRETION_GRADIENT 11
#define COLOR_ALGO_GRAVITATIONAL_REDSHIFT 12
#define COLOR_ALGO_LENSING_INTENSITY 13
#define COLOR_ALGO_JETS_EMISSION 14

/**
 * Accretion Gradient - color by radial position in disk
 *
 * @param rDisk Radial distance in disk plane
 * @return t value for palette lookup (0=inner, 1=outer)
 */
float getAccretionGradientT(float rDisk) {
  float normalized = (rDisk - uDiskInnerRadius) / (uDiskOuterRadius - uDiskInnerRadius);
  return clamp(normalized, 0.0, 1.0);
}

/**
 * Gravitational Redshift - color by gravitational potential
 * Bluer near horizon, redder far away (inverse of actual physics
 * for better visual effect - we want the dangerous area to look hot)
 *
 * @param r Distance from center
 * @return t value (0=far/cold, 1=near horizon/hot)
 */
float getGravitationalRedshiftT(float r) {
  float normalized = 1.0 - (r - uHorizonRadius) / (uDiskOuterRadius - uHorizonRadius);
  return clamp(normalized, 0.0, 1.0);
}

/**
 * Lensing Intensity - color by accumulated ray bend amount
 *
 * @param accumulatedBend Total bending angle accumulated during raymarch
 * @return t value (0=no bend, 1=max bend)
 */
float getLensingIntensityT(float accumulatedBend) {
  // Normalize by max expected bend (roughly PI for light orbiting once)
  float normalized = accumulatedBend / 3.14159;
  return clamp(normalized, 0.0, 1.0);
}

/**
 * Jets Emission - color by position within polar jets
 *
 * @param height Distance along jet axis
 * @param radialDist Distance from jet axis
 * @return t value (0=base, 1=tip)
 */
float getJetsEmissionT(float height, float radialDist) {
  float maxHeight = uHorizonRadius * uJetsHeight;
  return clamp(height / maxHeight, 0.0, 1.0);
}

/**
 * Get palette t-value for black hole color algorithms
 */
float getBlackHolePaletteT(int algorithm, float rDisk, float r, float accumulatedBend, float jetHeight, float jetRadial) {
  if (algorithm == COLOR_ALGO_ACCRETION_GRADIENT) {
    return getAccretionGradientT(rDisk);
  } else if (algorithm == COLOR_ALGO_GRAVITATIONAL_REDSHIFT) {
    return getGravitationalRedshiftT(r);
  } else if (algorithm == COLOR_ALGO_LENSING_INTENSITY) {
    return getLensingIntensityT(accumulatedBend);
  } else if (algorithm == COLOR_ALGO_JETS_EMISSION) {
    return getJetsEmissionT(jetHeight, jetRadial);
  }
  return 0.5;  // Default
}
```

### 2.12 Create main.glsl.ts

The main raymarch loop with bent rays:

```glsl
void main() {
  // Setup ray from camera (3D)
  vec3 rayOrigin3 = vPosition;
  vec3 rayDir3 = normalize(vPosition - uCameraPosition);

  // Embed 3D ray into N-D space using basis matrix
  float posN[11];
  float dirN[11];
  embedRay3DtoND(rayOrigin3, rayDir3, posN, dirN, uDimension);

  // Initialize accumulation
  vec3 accumulatedColor = vec3(0.0);
  float transmittance = 1.0;
  float lensingMax = 0.0;
  float shellMax = 0.0;
  float t = 0.0;

  // Raymarch with bent rays
  float dt = uStepBase;

  for (int i = 0; i < uMaxSteps; i++) {
    // Compute distance to center in N-D
    float r = lengthND(posN, uDimension);

    // Check far boundary escape
    if (r > uFarRadius * uHorizonRadius) break;

    // Check horizon capture
    if (r < uHorizonRadius) {
      // Ray captured by black hole - return black with edge glow already accumulated
      outColor = vec4(accumulatedColor, 1.0);
      return;
    }

    // Compute gravity strength
    float g = computeGravity(r, uDimension);
    lensingMax = max(lensingMax, g);

    // Compute photon shell mask
    float shell = computeShellMask(r, uDimension);
    shellMax = max(shellMax, shell);

    // Adaptive step size
    float dtAdaptive = dt;
    dtAdaptive *= 1.0 / (1.0 + uStepAdaptG * g);  // Smaller near strong gravity
    dtAdaptive *= (1.0 + uStepAdaptR * r);         // Larger far from center
    dtAdaptive = clamp(dtAdaptive, uStepMin, uStepMax);
    dtAdaptive = adjustStepForShell(dtAdaptive, shell);  // Smaller near shell

    // Sample manifold density
    float rho = computeManifoldDensity(posN, uDimension, uTime);

    // Compute emission
    vec3 emission = rho * uBaseColor * uManifoldIntensity;

    // Add photon shell glow
    emission += computeShellGlow(shell);

    // Add horizon edge glow
    emission += computeHorizonEdgeGlow(r);

    // Optional absorption (Beer-Lambert)
    if (uEnableAbsorption) {
      transmittance *= exp(-rho * uAbsorption * dtAdaptive);
    }

    // Accumulate color
    accumulatedColor += transmittance * emission * dtAdaptive;

    // Bend ray direction
    bendRayND(dirN, posN, g, dtAdaptive, uDimension);

    // Advance position
    for (int d = 0; d < uDimension; d++) {
      posN[d] += dirN[d] * dtAdaptive;
    }
    t += dtAdaptive;

    // Early out if opaque
    if (transmittance < uTransmittanceCutoff) break;
  }

  // Sample background using final bent direction
  vec3 finalDir3 = projectNDto3D(dirN, uDimension);
  vec3 backgroundColor = sampleBackground(finalDir3);

  // Composite
  vec3 finalColor = accumulatedColor + transmittance * backgroundColor;

  // Apply bloom boost
  finalColor *= uBloomBoost;

  // Output
  outColor = vec4(finalColor, 1.0 - transmittance);
}
```

### 2.13 MRT Buffer Outputs (Depth, Normal, Temporal Position)

The black hole shader must output to Multiple Render Targets (MRT) for proper integration with temporal reprojection and post-processing:

**MRT Layout Pattern** (from shared precision block):

```glsl
// WebGL2 GLSL ES 3.00 required outputs
layout(location = 0) out vec4 gColor;      // RGB color + alpha
layout(location = 1) out vec4 gNormal;     // View-space normal * 0.5 + 0.5, metallic in alpha
#ifdef USE_TEMPORAL_ACCUMULATION
layout(location = 2) out vec4 gPosition;   // World position for temporal reprojection
#endif
```

**Black Hole Normal Calculation:**

Unlike SDF-based objects (Mandelbulb), the black hole uses pseudo-normals derived from:
1. **Horizon edge** - Normal points away from center at horizon boundary
2. **Accretion disk** - Normal perpendicular to disk plane
3. **Photon shell** - Tangent to shell sphere
4. **Jets** - Along jet axis direction

```glsl
/**
 * Compute pseudo-normal for black hole features
 * @param pos Current position (3D projected)
 * @param r Distance from center
 * @param shellMask Photon shell proximity (0-1)
 * @param diskDensity Accretion disk density at position
 * @param jetContribution Polar jet emission at position
 */
vec3 computeBlackHoleNormal(vec3 pos, float r, float shellMask, float diskDensity, vec3 jetDir) {
  vec3 radialNormal = normalize(pos);

  // Blend based on which feature dominates
  vec3 diskNormal = vec3(0.0, 1.0, 0.0);  // Disk plane normal (manifold orientation)
  vec3 shellNormal = radialNormal;         // Shell points outward

  // Weight by contribution
  float diskWeight = diskDensity;
  float shellWeight = shellMask * 2.0;
  float totalWeight = diskWeight + shellWeight + 0.001;

  vec3 blendedNormal = (diskNormal * diskWeight + shellNormal * shellWeight) / totalWeight;

  return normalize(blendedNormal);
}
```

**Temporal Position Output:**

For temporal reprojection, output the density-weighted center position (not ray entry point):

```glsl
#ifdef USE_TEMPORAL_ACCUMULATION
// Density-weighted center position (prevents smearing during rotation)
vec3 weightedCenter = accumulatedPosition / max(totalDensity, 0.001);
gPosition = vec4(weightedCenter, transmittance);
#endif
```

**Temporal Depth Buffer Integration:**

The black hole uses `TemporalCloudManager` (like Schrödinger) for Horizon-style temporal accumulation:

| Buffer | Resolution | Purpose |
|--------|------------|---------|
| Cloud Render Target | 1/4 screen | Quarter-res black hole render |
| Accumulation Buffer | Full screen | 4-frame accumulated color + positions |
| Reprojection Buffer | Full screen | Reprojected + validity mask |

**Bayer Pattern (4-frame cycle):**
```
Frame 0: (0,0) - Top-left pixel
Frame 1: (1,1) - Bottom-right pixel
Frame 2: (1,0) - Top-right pixel
Frame 3: (0,1) - Bottom-left pixel
```

**Key Uniforms from TemporalCloudManager:**
```typescript
interface TemporalCloudUniforms {
  uPrevAccumulation: THREE.Texture | null      // Previous accumulated color
  uPrevPositionBuffer: THREE.Texture | null    // Previous world positions
  uCloudPositionTexture: THREE.Texture | null  // Current quarter-res positions
  uPrevViewProjectionMatrix: THREE.Matrix4
  uBayerOffset: THREE.Vector2                  // Current frame's offset
  uFrameIndex: number                          // 0-3
  uTemporalCloudEnabled: boolean
  uCloudResolution: THREE.Vector2
  uAccumulationResolution: THREE.Vector2
}
```

### 2.14 Create compose.ts

**File:** `src/rendering/shaders/blackhole/compose.ts`

Shader composition with all advanced features and existing feature integration:

```typescript
import { cosinePaletteBlock } from '../shared/color/cosine-palette.glsl'
import { hslBlock } from '../shared/color/hsl.glsl'
import { oklabBlock } from '../shared/color/oklab.glsl'
import { selectorBlock } from '../shared/color/selector.glsl'
import { constantsBlock } from '../shared/core/constants.glsl'
import { precisionBlock } from '../shared/core/precision.glsl'
import { uniformsBlock } from '../shared/core/uniforms.glsl'
import { fogFunctionsBlock, fogUniformsBlock } from '../shared/features/fog.glsl'
import { opacityBlock } from '../shared/features/opacity.glsl'
import { temporalBlock } from '../shared/features/temporal.glsl'
import { ggxBlock } from '../shared/lighting/ggx.glsl'
import { multiLightBlock } from '../shared/lighting/multi-light.glsl'
import { sphereIntersectBlock } from '../shared/raymarch/sphere-intersect.glsl'
// Existing feature blocks
import { sssBlock } from '../shared/lighting/sss.glsl'
import { fresnelBlock } from '../shared/lighting/fresnel.glsl'
import { aoBlock } from '../shared/lighting/ao.glsl'

import { ShaderConfig } from '../shared/types'
import { blackholeUniformsBlock } from './uniforms.glsl'
import { lensingBlock } from './gravity/lensing.glsl'
import { horizonBlock } from './gravity/horizon.glsl'
import { shellBlock } from './gravity/shell.glsl'
import { manifoldBlock } from './gravity/manifold.glsl'
import { dopplerBlock } from './gravity/doppler.glsl'
// Advanced effect blocks
import { jetsBlock } from './effects/jets.glsl'
import { motionBlurBlock } from './effects/motion-blur.glsl'
import { deferredLensingBlock } from './effects/deferred-lensing.glsl'
// Black hole color algorithms
import { blackholePalettesBlock } from './color/blackhole-palettes.glsl'
import { nDimensionalBlock } from './nd/embedding.glsl'
import { mainBlock } from './main.glsl'

export interface BlackHoleShaderConfig extends ShaderConfig {
  temporalAccumulation?: boolean
  // Advanced effects
  jets?: boolean
  motionBlur?: boolean
  deferredLensing?: boolean
  sceneObjectLensing?: boolean
  // Existing feature integration
  sss?: boolean
  fresnel?: boolean
  ao?: boolean
}

export function composeBlackHoleShader(config: BlackHoleShaderConfig) {
  const {
    dimension,
    shadows: enableShadows,
    temporal: enableTemporal,
    fog: enableFog,
    overrides = [],
    temporalAccumulation = false,
    // Advanced effects
    jets: enableJets = false,
    motionBlur: enableMotionBlur = false,
    deferredLensing: enableDeferredLensing = false,
    sceneObjectLensing: enableSceneObjectLensing = true,
    // Existing features
    sss: enableSSS = false,
    fresnel: enableFresnel = false,
    ao: enableAO = false,
  } = config

  const defines: string[] = []
  const features: string[] = ['Cinematic Black Hole', 'Ray Bending']

  if (enableShadows) {
    defines.push('#define USE_SHADOWS')
    features.push('Volumetric Shadows')
  }

  if (temporalAccumulation) {
    defines.push('#define USE_TEMPORAL_ACCUMULATION')
    features.push('Temporal Accumulation (1/4 res)')
  } else if (enableTemporal) {
    defines.push('#define USE_TEMPORAL')
    features.push('Temporal Reprojection')
  }

  if (enableFog) {
    defines.push('#define USE_FOG')
    features.push('Fog')
  }

  // Advanced effects
  if (enableJets) {
    defines.push('#define USE_JETS')
    features.push('Polar Jets')
  }

  if (enableMotionBlur) {
    defines.push('#define USE_MOTION_BLUR')
    features.push('Motion Blur')
  }

  if (enableDeferredLensing) {
    defines.push('#define USE_DEFERRED_LENSING')
    features.push('Deferred Lensing')
  }

  if (enableSceneObjectLensing) {
    defines.push('#define USE_SCENE_OBJECT_LENSING')
    features.push('Scene Object Lensing')
  }

  // Existing feature integration
  if (enableSSS) {
    defines.push('#define USE_SSS')
    features.push('Subsurface Scattering')
  }

  if (enableFresnel) {
    defines.push('#define USE_FRESNEL')
    features.push('Fresnel Rim')
  }

  if (enableAO) {
    defines.push('#define USE_AO')
    features.push('Ambient Occlusion')
  }

  const blocks = [
    { name: 'Defines', content: defines.join('\n') },
    { name: 'Precision', content: precisionBlock },
    { name: 'Vertex Inputs', content: `\nin vec3 vPosition;\nin vec2 vUv;\n` },
    { name: 'Constants', content: constantsBlock },
    { name: 'Shared Uniforms', content: uniformsBlock },
    { name: 'Black Hole Uniforms', content: blackholeUniformsBlock },

    // N-D math
    { name: 'N-Dimensional Embedding', content: nDimensionalBlock },

    // Gravity physics
    { name: 'Lensing', content: lensingBlock },
    { name: 'Horizon', content: horizonBlock },
    { name: 'Photon Shell', content: shellBlock },
    { name: 'Luminous Manifold', content: manifoldBlock },
    { name: 'Doppler Effect', content: dopplerBlock },

    // Advanced effects (conditional)
    { name: 'Polar Jets', content: jetsBlock, condition: enableJets },
    { name: 'Motion Blur', content: motionBlurBlock, condition: enableMotionBlur },
    { name: 'Deferred Lensing', content: deferredLensingBlock, condition: enableDeferredLensing },

    // Color system (reuse existing + black hole specific)
    { name: 'Color (HSL)', content: hslBlock },
    { name: 'Color (Cosine)', content: cosinePaletteBlock },
    { name: 'Color (Oklab)', content: oklabBlock },
    { name: 'Color Selector', content: selectorBlock },
    { name: 'Black Hole Palettes', content: blackholePalettesBlock },

    // Lighting (existing features)
    { name: 'GGX PBR', content: ggxBlock },
    { name: 'Multi-Light System', content: multiLightBlock },
    { name: 'SSS', content: sssBlock, condition: enableSSS },
    { name: 'Fresnel', content: fresnelBlock, condition: enableFresnel },
    { name: 'AO', content: aoBlock, condition: enableAO },

    // Geometry
    { name: 'Sphere Intersection', content: sphereIntersectBlock },

    // Features
    { name: 'Temporal Features', content: temporalBlock, condition: enableTemporal },
    { name: 'Fog Uniforms', content: fogUniformsBlock, condition: enableFog },
    { name: 'Fog Functions', content: fogFunctionsBlock, condition: enableFog },

    // Opacity and main
    { name: 'Opacity System', content: opacityBlock },
    { name: 'Main', content: mainBlock },
  ]

  const modules: string[] = []
  const glslParts: string[] = []

  blocks.forEach((b) => {
    if (b.condition === false) return
    modules.push(b.name)
    if (!overrides.includes(b.name)) {
      glslParts.push(b.content)
    }
  })

  return { glsl: glslParts.join('\n'), modules, features }
}
```

---

## Phase 3: Store Slice

### 3.1 Create blackholeSlice.ts

**File:** `src/stores/slices/geometry/blackholeSlice.ts`

Copy pattern from `schroedingerSlice.ts`, implementing all setters defined in Phase 1.3.

Key functions:
- Individual setters with validation/clamping
- `applyBlackHoleQualityPreset()` - applies preset values
- `setBlackHoleConfig()` - batch update for URL deserialization

### 3.2 Update extendedObjectStore.ts

**File:** `src/stores/extendedObjectStore.ts`

1. Import `createBlackHoleSlice`
2. Import `DEFAULT_BLACK_HOLE_CONFIG`
3. Add `...createBlackHoleSlice(...a)` to store creation
4. Add `blackhole: { ...DEFAULT_BLACK_HOLE_CONFIG }` to reset action

---

## Phase 4: Registry Configuration

### 4.1 Add to OBJECT_TYPE_REGISTRY

**File:** `src/lib/geometry/registry/registry.ts`

```typescript
[
  'blackhole',
  {
    type: 'blackhole',
    name: 'Cinematic Black Hole',
    description: 'N-dimensional black hole with gravitational lensing and accretion disk',
    category: 'extended',
    dimensions: { min: 3, max: 11, recommended: 3 },
    rendering: {
      supportsFaces: true,
      supportsEdges: false,        // No wireframe - pure volumetric
      supportsPoints: false,
      renderMethod: 'raymarch',
      faceDetection: 'none',
      requiresRaymarching: true,
      edgesAreFresnelRim: false,   // Horizon silhouette instead
      supportsEmission: true,      // Volumetric emission
    },
    animation: {
      hasTypeSpecificAnimations: true,
      systems: {
        'accretionSwirl': {
          name: 'Accretion Swirl',
          enabledKey: 'swirlAnimationEnabled',
          params: {
            'swirlSpeed': { min: 0, max: 2, default: 0.5 },
          }
        },
        'manifoldPulse': {
          name: 'Manifold Pulse',
          enabledKey: 'pulseEnabled',
          params: {
            'pulseSpeed': { min: 0, max: 2, default: 0.3 },
            'pulseAmount': { min: 0, max: 1, default: 0.2 },
          }
        },
      }
    },
    urlSerialization: {
      typeKey: 'blackhole',
      serializableParams: [
        'horizonRadius',
        'gravityStrength',
        'manifoldIntensity',
        'photonShellWidth',
        'raymarchQuality',
      ],
    },
    ui: {
      controlsComponentKey: 'BlackHoleControls',
      hasTimelineControls: true,
      qualityPresets: ['fast', 'balanced', 'quality', 'ultra'],
    },
    configStoreKey: 'blackhole',
  },
],
```

### 4.2 Add to component loaders

**File:** `src/lib/geometry/registry/components.ts`

```typescript
BlackHoleControls: () =>
  import('@/components/sections/Geometry/BlackHoleControls').then((m) => ({
    default: m.BlackHoleControls as ComponentType<unknown>,
  })),
```

### 4.3 Update determineRenderMode

**File:** `src/lib/geometry/registry/helpers.ts`

```typescript
if (type === 'blackhole') return 'raymarch-blackhole'
```

---

## Phase 5: Renderer Implementation

**Create folder:** `src/rendering/renderers/BlackHole/`

### 5.1 Create BlackHoleMesh.tsx

Copy from `SchroedingerMesh.tsx` as base, with these modifications:

1. **Replace quantum uniforms with gravity uniforms:**
   - Remove: psi, hermite, energy level uniforms
   - Add: horizonRadius, gravityStrength, bendScale, shell params, manifold params

2. **Add manifold axis computation:**
   ```typescript
   // Compute manifold orientation axes (u, v) in N-D
   // Default: u = rotated X axis, v = rotated Y axis
   const manifoldU = new Float32Array(11)
   const manifoldV = new Float32Array(11)
   // Apply rotation matrix to get current orientation
   ```

3. **Add precomputed uniforms:**
   ```typescript
   // Precompute derived values
   const epsilon = config.epsilonMul * config.horizonRadius
   const photonShellRadius = config.horizonRadius * (
     config.photonShellRadiusMul +
     config.photonShellRadiusDimBias * Math.log(dimension)
   )
   const diskInnerRadius = config.diskInnerRadiusMul * config.horizonRadius
   const diskOuterRadius = config.diskOuterRadiusMul * config.horizonRadius
   ```

4. **Keep from Schrödinger:**
   - N-D basis embedding (uBasisX/Y/Z)
   - Temporal accumulation system
   - Color cache optimization
   - Rotation quality adaptation
   - Screen coverage adaptation

### 5.2 Create blackhole.vert

Copy from `schroedinger.vert` (standard passthrough vertex shader).

### 5.3 Create index.ts

```typescript
export { BlackHoleMesh } from './BlackHoleMesh'
```

### 5.4 FastMode Support (Rotation Quality Adaptation)

The black hole must support the global `fastMode` feature for smooth interaction during N-D rotation:

**Trigger Mechanism:**
- `fastModeRef` becomes `true` when `rotationVersion` changes (from rotationStore)
- Quality restores after `QUALITY_RESTORE_DELAY_MS` (150ms) of no rotation

**Implementation in BlackHoleMesh.tsx:**

```typescript
// Refs for fast mode management
const fastModeRef = useRef(false)
const restoreQualityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const prevRotationVersionRef = useRef(-1)

// Fast mode detection
const rotationVersion = useRotationStore((s) => s.version)
const fractalAnimLowQuality = usePerformanceStore((s) => s.fractalAnimationLowQuality)

useFrame(() => {
  const rotationsChanged = rotationVersion !== prevRotationVersionRef.current

  if (rotationsChanged) {
    fastModeRef.current = true
    prevRotationVersionRef.current = rotationVersion

    // Clear pending restore
    if (restoreQualityTimeoutRef.current) {
      clearTimeout(restoreQualityTimeoutRef.current)
      restoreQualityTimeoutRef.current = null
    }
  }

  // Schedule quality restore after rotation stops
  if (fastModeRef.current && !restoreQualityTimeoutRef.current) {
    restoreQualityTimeoutRef.current = setTimeout(() => {
      fastModeRef.current = false
      restoreQualityTimeoutRef.current = null
    }, QUALITY_RESTORE_DELAY_MS) // 150ms
  }

  // Apply to shader uniform
  material.uniforms.uFastMode.value = fractalAnimLowQuality && fastModeRef.current
})
```

**Shader Fast Mode Optimizations:**

Add to `main.glsl.ts` - quality reductions when `uFastMode` is true:

```glsl
uniform bool uFastMode;

// Priority order: highest performance impact → lowest visual impact

// 1. HALVE RAYMARCH STEPS (HIGH impact, moderate visual)
int effectiveMaxSteps = uFastMode ? uMaxSteps / 2 : uMaxSteps;

// 2. DISABLE AO (HIGH impact, low visual during motion)
float aoFactor = uFastMode ? 1.0 : computeAO(pos, normal);

// 3. INCREASE STEP SIZE (HIGH impact, minor visual)
float effectiveStepBase = uFastMode ? uStepBase * 1.5 : uStepBase;
float effectiveStepMin = uFastMode ? uStepMin * 2.0 : uStepMin;

// 4. SKIP MOTION BLUR (MEDIUM impact, invisible during fast rotation)
bool applyMotionBlur = uMotionBlurEnabled && !uFastMode;

// 5. REDUCE SHELL DETAIL (MEDIUM impact, low visual)
float effectiveShellStepMul = uFastMode ? 0.5 : uShellStepMul;

// 6. FASTER NORMAL CALCULATION (MEDIUM impact, subtle visual)
vec3 normal = uFastMode ? GetNormalFast(pos) : GetNormal(pos);

// 7. SKIP SHADOW RAYS (conditional on uShadowAnimationMode)
bool computeShadows = uShadowEnabled && (uShadowAnimationMode == 2 ||
  (uShadowAnimationMode == 1 && !uFastMode));

// 8. REDUCE JET NOISE SAMPLES (LOW impact, subtle visual)
float jetNoiseAmount = uFastMode ? uJetsNoiseAmount * 0.5 : uJetsNoiseAmount;
```

**Fast Mode Quality Reduction Summary:**

| Optimization | Performance Impact | Visual Impact | When Applied |
|--------------|-------------------|---------------|--------------|
| Halve max steps | ~40-50% faster | Moderate (stepping) | Always in fast mode |
| Disable AO | ~15-20% faster | Low during motion | Always in fast mode |
| Increase step size | ~20-30% faster | Minor (less detail) | Always in fast mode |
| Skip motion blur | ~5-10% faster | None (invisible during rotation) | Always in fast mode |
| Reduce shell detail | ~5-10% faster | Low | Always in fast mode |
| Fast normals | ~10% faster | Subtle shading diff | Always in fast mode |
| Skip shadows | ~10-20% faster | Noticeable | Based on uShadowAnimationMode |

### 5.5 Progressive Refinement Support

The black hole must integrate with the global progressive refinement system for smooth quality restoration after interactions:

**Quality Stages:**
```
Stage     | Multiplier | Delay after interaction stops
----------|------------|------------------------------
low       | 0.25       | 0ms (immediate)
medium    | 0.50       | 100ms
high      | 0.75       | 300ms
final     | 1.00       | 500ms
```

**Implementation in BlackHoleMesh.tsx:**

```typescript
// Get quality multiplier from performance store
const qualityMultiplier = usePerformanceStore((s) => s.qualityMultiplier)

useFrame(({ camera }) => {
  // 1. RAYMARCHING QUALITY - Scale max steps and precision
  const baseQuality = BLACK_HOLE_QUALITY_TO_MULTIPLIER[config.raymarchQuality]
  const effectiveQuality = getEffectiveBlackHoleQuality(baseQuality, camera, qualityMultiplier)
  material.uniforms.uQualityMultiplier.value = effectiveQuality

  // 2. SHADOW QUALITY - Use interpolated quality level
  const effectiveShadowQuality = getEffectiveShadowQuality(
    shadowSettings.quality,
    qualityMultiplier
  )
  material.uniforms.uShadowQuality.value = SHADOW_QUALITY_TO_INT[effectiveShadowQuality]

  // 3. SAMPLE QUALITY (for volumetric effects)
  const effectiveSampleQuality = getEffectiveSampleQuality(
    config.volumeSampleQuality,
    qualityMultiplier
  )
  material.uniforms.uSampleQuality.value = SAMPLE_QUALITY_TO_INT[effectiveSampleQuality]
})
```

**Quality Interpolation Helper:**

```typescript
/**
 * Compute effective quality level based on multiplier.
 * Maps 0.25-1.0 multiplier to discrete quality levels.
 */
function getEffectiveBlackHoleQuality(
  targetQuality: number,
  camera: THREE.Camera,
  multiplier: number
): number {
  // Normalize multiplier from [0.25, 1.0] to [0.0, 1.0]
  const normalized = (multiplier - 0.25) / 0.75

  // Also factor in screen coverage (smaller objects need less quality)
  const screenCoverage = computeScreenCoverage(camera)
  const coverageFactor = Math.max(0.5, Math.min(1.0, screenCoverage * 2.0))

  return targetQuality * normalized * coverageFactor
}
```

**Shader Quality Multiplier Usage:**

```glsl
uniform float uQualityMultiplier;  // 0.0 to 1.0

void main() {
  // Scale raymarch parameters by quality
  int effectiveMaxSteps = int(float(uMaxSteps) * uQualityMultiplier);
  effectiveMaxSteps = max(effectiveMaxSteps, 16);  // Minimum steps

  float effectiveStepBase = uStepBase / max(uQualityMultiplier, 0.25);  // Larger steps at low quality
  float effectiveStepMin = uStepMin / max(uQualityMultiplier, 0.25);

  // ... use effective values in raymarch loop
}
```

**Refinement-Affected Parameters:**

| Parameter | Low (0.25) | Medium (0.5) | High (0.75) | Final (1.0) |
|-----------|------------|--------------|-------------|-------------|
| Max steps | 25% of max | 50% of max | 75% of max | 100% |
| Step precision | 4x coarser | 2x coarser | 1.33x coarser | Full |
| Shadow quality | Skip or lowest | Low | Medium | User setting |
| Shell detail | Minimum | Reduced | Near-full | Full |
| Jet noise | Off | Half | 75% | Full |
| Motion blur | Off | Off | Half samples | Full |

**Integration with Interaction Detection:**

The `useInteractionState` hook detects:
- Camera position change > 0.005 units
- Camera rotation change > 0.002 radians
- Canvas resize events
- Pointer drag events
- Scene transitions (preset changes, cinematic toggle)

When any interaction is detected, quality drops to 0.25 immediately, then progressively restores over 500ms after interaction stops.

### 5.6 Update UnifiedRenderer.tsx

```typescript
import { BlackHoleMesh } from './BlackHole'

// In render mode type
type RenderMode = '...' | 'raymarch-blackhole'

// In render logic
{renderMode === 'raymarch-blackhole' && <BlackHoleMesh />}
```

---

## Phase 6: UI Components

The Black Hole UI is split between two locations following the existing pattern:

1. **Left Editor "Geometry" Section** → `BlackHoleControls.tsx`
   - Parameters that affect the geometry/shape of the object
   - Horizon radius, manifold shape, disk radii, etc.

2. **Right Editor "Advanced" Section** → `BlackHoleAdvanced.tsx`
   - Visual parameters not covered by existing features (Faces, Material, etc.)
   - Jets, motion blur, deferred lensing, advanced effects

3. **Existing Sections (Faces, Material, etc.)**
   - Color algorithms (including black-hole-specific ones)
   - SSS, Fresnel, AO, shadows → all work via existing controls

### 6.1 Create BlackHoleControls.tsx (Left Editor - Geometry)

**File:** `src/components/sections/Geometry/BlackHoleControls.tsx`

Contains only **geometry-affecting** parameters:

```typescript
/**
 * Black Hole Geometry Controls
 *
 * Located in LEFT EDITOR "Geometry" section.
 * Contains only parameters that affect the shape/structure of the object.
 *
 * Visual parameters go in BlackHoleAdvanced (right editor).
 * Color goes in FacesSection via existing ColorAlgorithmSelector.
 */
export const BlackHoleControls: React.FC<ControlProps> = React.memo(({ className }) => {
  const config = useExtendedObjectStore(useShallow((s) => s.blackhole))
  const dimension = useGeometryStore((s) => s.dimension)

  return (
    <div className={className}>
      {/* Visual Preset Section - Quick starting points */}
      <Section title="Visual Preset" defaultOpen={true}>
        <ToggleGroup
          label="Style"
          options={['interstellar', 'cosmic', 'ethereal', 'custom']}
          value={config.visualPreset}
          onChange={applyBlackHoleVisualPreset}
        />
        <p className="text-xs text-muted">
          Presets configure multiple parameters. Choose 'custom' to keep current settings.
        </p>
      </Section>

      {/* Core Geometry - affects shape/structure */}
      <Section title="Black Hole" defaultOpen={true}>
        <Slider
          label="Horizon Radius"
          value={config.horizonRadius}
          onChange={setBlackHoleHorizonRadius}
          min={0.05} max={20} step={0.05}
        />
        <Slider
          label="Gravity Strength"
          value={config.gravityStrength}
          onChange={setBlackHoleGravityStrength}
          min={0} max={10} step={0.1}
          tooltip="Controls ray bending intensity"
        />
      </Section>

      {/* Photon Shell Geometry */}
      <Section title="Photon Shell">
        <Slider
          label="Shell Radius"
          value={config.photonShellRadiusMul}
          onChange={setBlackHolePhotonShellRadiusMul}
          min={1.0} max={2.0} step={0.01}
        />
        <Slider
          label="Shell Width"
          value={config.photonShellWidth}
          onChange={setBlackHolePhotonShellWidth}
          min={0} max={0.3} step={0.01}
        />
      </Section>

      {/* Accretion Manifold Geometry */}
      <Section title="Accretion Manifold">
        <Select
          label="Manifold Type"
          options={[
            { value: 'autoByN', label: 'Auto (by dimension)' },
            { value: 'disk', label: 'Thin Disk' },
            { value: 'sheet', label: 'Sheet' },
            { value: 'slab', label: 'Slab' },
            { value: 'field', label: 'Field' },
          ]}
          value={config.manifoldType}
          onChange={setBlackHoleManifoldType}
        />
        <Slider
          label="Inner Radius"
          value={config.diskInnerRadiusMul}
          onChange={setBlackHoleDiskInnerRadiusMul}
          min={0} max={10} step={0.1}
        />
        <Slider
          label="Outer Radius"
          value={config.diskOuterRadiusMul}
          onChange={setBlackHoleDiskOuterRadiusMul}
          min={0.1} max={200} step={0.5}
        />
        <Slider
          label="Thickness"
          value={config.manifoldThickness}
          onChange={setBlackHoleManifoldThickness}
          min={0} max={2} step={0.01}
        />
        <Slider
          label="Swirl Amount"
          value={config.swirlAmount}
          onChange={setBlackHoleSwirlAmount}
          min={0} max={2} step={0.05}
        />
        <Slider
          label="Noise Amount"
          value={config.noiseAmount}
          onChange={setBlackHoleNoiseAmount}
          min={0} max={1} step={0.05}
        />
      </Section>

      {/* Polar Jets Geometry */}
      <Section title="Polar Jets" defaultOpen={false}>
        <Switch
          label="Enable Jets"
          checked={config.jetsEnabled}
          onChange={setBlackHoleJetsEnabled}
        />
        {config.jetsEnabled && (
          <>
            <Slider
              label="Jet Height"
              value={config.jetsHeight}
              onChange={setBlackHoleJetsHeight}
              min={0} max={50} step={0.5}
            />
            <Slider
              label="Jet Width"
              value={config.jetsWidth}
              onChange={setBlackHoleJetsWidth}
              min={0} max={5} step={0.1}
            />
          </>
        )}
      </Section>

      {/* Lensing Physics */}
      <Section title="Lensing" defaultOpen={false}>
        <Slider
          label="Bend Scale"
          value={config.bendScale}
          onChange={setBlackHoleBendScale}
          min={0} max={5} step={0.1}
        />
        <Slider
          label="Dimension Emphasis"
          value={config.dimensionEmphasis}
          onChange={setBlackHoleDimensionEmphasis}
          min={0} max={2} step={0.05}
          tooltip="How much dimension affects gravity"
        />
        <Slider
          label="Distance Falloff"
          value={config.distanceFalloff}
          onChange={setBlackHoleDistanceFalloff}
          min={0.5} max={4} step={0.1}
        />
      </Section>

      {/* Cross-Section (4D+) */}
      {dimension >= 4 && (
        <Section title={`Cross Section (${dimension - 3} extra dims)`}>
          {Array.from({ length: dimension - 3 }, (_, i) => (
            <Slider
              key={i}
              label={`W${i + 1} Position`}
              value={config.parameterValues[i] || 0}
              onChange={(v) => setBlackHoleParameterValue(i, v)}
              min={-5} max={5} step={0.1}
            />
          ))}
        </Section>
      )}
    </div>
  )
})
```

### 6.2 Create BlackHoleAdvanced.tsx (Right Editor - Advanced Section)

**File:** `src/components/sections/Advanced/BlackHoleAdvanced.tsx`

Contains **visual parameters** not covered by existing sections:

```typescript
/**
 * Black Hole Advanced Visual Controls
 *
 * Located in RIGHT EDITOR "Advanced" section (alongside SSS, Fresnel, etc.)
 * Contains visual parameters that don't fit in Geometry or existing Faces/Material.
 *
 * Following pattern of SchroedingerAdvanced.tsx
 */
export const BlackHoleAdvanced: React.FC = React.memo(() => {
  const config = useExtendedObjectStore(useShallow((s) => s.blackhole))

  return (
    <>
      {/* Manifold Visual (not geometry) */}
      <Section title="Manifold Visuals">
        <Slider
          label="Intensity"
          value={config.manifoldIntensity}
          onChange={setBlackHoleManifoldIntensity}
          min={0} max={20} step={0.1}
        />
        <Slider
          label="Density Falloff"
          value={config.densityFalloff}
          onChange={setBlackHoleDensityFalloff}
          min={0} max={40} step={0.5}
        />
        <Slider
          label="Bloom Boost"
          value={config.bloomBoost}
          onChange={setBlackHoleBloomBoost}
          min={0} max={5} step={0.1}
        />
      </Section>

      {/* Photon Shell Visuals */}
      <Section title="Photon Shell Visuals">
        <Slider
          label="Glow Strength"
          value={config.shellGlowStrength}
          onChange={setBlackHoleShellGlowStrength}
          min={0} max={20} step={0.5}
        />
        <ColorPicker
          label="Glow Color"
          value={config.shellGlowColor}
          onChange={setBlackHoleShellGlowColor}
        />
        <Slider
          label="Contrast Boost"
          value={config.shellContrastBoost}
          onChange={setBlackHoleShellContrastBoost}
          min={0} max={3} step={0.1}
        />
      </Section>

      {/* Doppler Effect */}
      <Section title="Doppler Effect">
        <Switch
          label="Enable Doppler"
          checked={config.dopplerEnabled}
          onChange={setBlackHoleDopplerEnabled}
        />
        {config.dopplerEnabled && (
          <>
            <Slider
              label="Brightness Shift"
              value={config.dopplerStrength}
              onChange={setBlackHoleDopplerStrength}
              min={0} max={2} step={0.1}
            />
            <Slider
              label="Color Shift"
              value={config.dopplerHueShift}
              onChange={setBlackHoleDopplerHueShift}
              min={0} max={0.3} step={0.01}
            />
          </>
        )}
        <p className="text-xs text-muted">
          Approaching side brighter/bluer, receding side dimmer/redder.
        </p>
      </Section>

      {/* Polar Jets Visuals (if enabled in Geometry) */}
      {config.jetsEnabled && (
        <Section title="Jet Visuals">
          <Slider
            label="Intensity"
            value={config.jetsIntensity}
            onChange={setBlackHoleJetsIntensity}
            min={0} max={10} step={0.1}
          />
          <ColorPicker
            label="Jet Color"
            value={config.jetsColor}
            onChange={setBlackHoleJetsColor}
          />
          <Slider
            label="Falloff"
            value={config.jetsFalloff}
            onChange={setBlackHoleJetsFalloff}
            min={0} max={10} step={0.1}
          />
          <Slider
            label="Turbulence"
            value={config.jetsNoiseAmount}
            onChange={setBlackHoleJetsNoiseAmount}
            min={0} max={1} step={0.05}
          />
          <Slider
            label="Pulsation Speed"
            value={config.jetsPulsation}
            onChange={setBlackHoleJetsPulsation}
            min={0} max={2} step={0.1}
          />
        </Section>
      )}

      {/* Horizon Edge Glow */}
      <Section title="Horizon Edge">
        <Switch
          label="Edge Glow"
          checked={config.edgeGlowEnabled}
          onChange={setBlackHoleEdgeGlowEnabled}
        />
        {config.edgeGlowEnabled && (
          <>
            <Slider
              label="Glow Width"
              value={config.edgeGlowWidth}
              onChange={setBlackHoleEdgeGlowWidth}
              min={0} max={1} step={0.01}
            />
            <ColorPicker
              label="Glow Color"
              value={config.edgeGlowColor}
              onChange={setBlackHoleEdgeGlowColor}
            />
            <Slider
              label="Intensity"
              value={config.edgeGlowIntensity}
              onChange={setBlackHoleEdgeGlowIntensity}
              min={0} max={5} step={0.1}
            />
          </>
        )}
      </Section>

      {/* Motion Blur */}
      <Section title="Motion Blur" defaultOpen={false}>
        <Switch
          label="Enable Motion Blur"
          checked={config.motionBlurEnabled}
          onChange={setBlackHoleMotionBlurEnabled}
        />
        {config.motionBlurEnabled && (
          <>
            <Slider
              label="Strength"
              value={config.motionBlurStrength}
              onChange={setBlackHoleMotionBlurStrength}
              min={0} max={2} step={0.1}
            />
            <Slider
              label="Samples"
              value={config.motionBlurSamples}
              onChange={setBlackHoleMotionBlurSamples}
              min={1} max={8} step={1}
            />
          </>
        )}
      </Section>

      {/* Scene Lensing */}
      <Section title="Scene Lensing" defaultOpen={false}>
        <Switch
          label="Lens Scene Objects"
          checked={config.sceneObjectLensingEnabled}
          onChange={setBlackHoleSceneObjectLensingEnabled}
        />
        {config.sceneObjectLensingEnabled && (
          <Slider
            label="Strength"
            value={config.sceneObjectLensingStrength}
            onChange={setBlackHoleSceneObjectLensingStrength}
            min={0} max={2} step={0.1}
          />
        )}
        <Switch
          label="Deferred Lensing (Fast)"
          checked={config.deferredLensingEnabled}
          onChange={setBlackHoleDeferredLensingEnabled}
        />
        {config.deferredLensingEnabled && (
          <>
            <Slider
              label="Strength"
              value={config.deferredLensingStrength}
              onChange={setBlackHoleDeferredLensingStrength}
              min={0} max={2} step={0.1}
            />
            <Slider
              label="Radius"
              value={config.deferredLensingRadius}
              onChange={setBlackHoleDeferredLensingRadius}
              min={0} max={10} step={0.5}
            />
          </>
        )}
        <p className="text-xs text-muted">
          Deferred lensing is faster but less accurate.
        </p>
      </Section>

      {/* Quality */}
      <Section title="Quality">
        <ToggleGroup
          label="Preset"
          options={['fast', 'balanced', 'quality', 'ultra']}
          value={config.raymarchQuality}
          onChange={applyBlackHoleQualityPreset}
        />
        <Switch
          label="Temporal Accumulation"
          checked={config.temporalAccumulationEnabled}
          onChange={setBlackHoleTemporalAccumulationEnabled}
        />
        <Switch
          label="Absorption"
          checked={config.enableAbsorption}
          onChange={setBlackHoleEnableAbsorption}
        />
        {config.enableAbsorption && (
          <Slider
            label="Absorption"
            value={config.absorption}
            onChange={setBlackHoleAbsorption}
            min={0} max={10} step={0.1}
          />
        )}
      </Section>

      {/* Background */}
      <Section title="Background" defaultOpen={false}>
        <Select
          label="Mode"
          options={[
            { value: 'environment', label: 'Environment Map' },
            { value: 'proceduralStars', label: 'Procedural Stars' },
            { value: 'solid', label: 'Solid Color' },
          ]}
          value={config.backgroundMode}
          onChange={setBlackHoleBackgroundMode}
        />
        {config.backgroundMode === 'proceduralStars' && (
          <>
            <Slider
              label="Star Density"
              value={config.starfieldDensity}
              onChange={setBlackHoleStarfieldDensity}
              min={0} max={5} step={0.1}
            />
            <Slider
              label="Star Brightness"
              value={config.starfieldBrightness}
              onChange={setBlackHoleStarfieldBrightness}
              min={0} max={3} step={0.1}
            />
          </>
        )}
      </Section>
    </>
  )
})
```

### 6.3 Update AdvancedObjectControls.tsx

**File:** `src/components/sections/Advanced/AdvancedObjectControls.tsx`

Add black hole to the object-specific advanced controls switch:

```typescript
// In the component, add case for black hole
{objectType === 'blackhole' && <BlackHoleAdvanced />}
```

### 6.4 Existing Features Support

The black hole automatically inherits these existing features via their respective UI sections:

| Feature | UI Section | How It Works |
|---------|------------|--------------|
| **Color Algorithms** | Faces → Color Algorithm | `ColorAlgorithmSelector` shows black-hole-specific options when `objectType === 'blackhole'` |
| **Base Color** | Faces → Color | Existing color picker, passed to shader as `uBaseColor` |
| **Cosine Palette** | Faces → Palette | Full palette editor, integrates with any color algorithm |
| **Self-Shadow** | Advanced → Shadows | `shadowEnabled` and `shadowDensity` in config |
| **Ambient Occlusion** | Advanced → AO | Uses existing AO system via uniform |
| **SSS (Subsurface)** | Advanced → SSS | Apply to accretion material via existing SSS uniforms |
| **Fresnel Rim** | Advanced → Fresnel | Edge highlight using existing Fresnel system |
| **Emission** | Faces → Emission | Accretion disk uses emission system |
| **Opacity** | Faces → Opacity | Volumetric opacity via transmittance |

**Color Algorithm Integration:**

The `FacesSection` component's `ColorAlgorithmSelector` automatically shows the correct algorithms:

```typescript
// In ColorAlgorithmSelector.tsx - the filtering already works
const availableOptions = useMemo(() => {
  const isSchroedinger = objectType === 'schroedinger'
  const isBlackHole = objectType === 'blackhole'

  return COLOR_ALGORITHM_OPTIONS.filter((opt) => {
    if (isQuantumOnlyAlgorithm(opt.value)) return isSchroedinger
    if (isBlackHoleOnlyAlgorithm(opt.value)) return isBlackHole
    return true  // Universal algorithms always shown
  })
}, [objectType])
```

When the user selects "Black Hole" as object type, these algorithms appear in the dropdown:
- All universal algorithms (Monochromatic, Analogous, Cosine, Normal, Distance, LCH, etc.)
- **Plus** black-hole-specific: Accretion Gradient, Gravitational Redshift, Lensing Intensity, Jets Emission

### 6.5 Create BlackHoleAnimationDrawer.tsx

**File:** `src/components/layout/TimelineControls/BlackHoleAnimationDrawer.tsx`

```typescript
export const BlackHoleAnimationDrawer: React.FC = () => {
  return (
    <DrawerSection title="Black Hole Animations">
      {/* Time Scale */}
      <AnimationControl
        label="Time Scale"
        value={config.timeScale}
        onChange={setBlackHoleTimeScale}
        range={[0, 5]}
      />

      {/* Accretion Swirl Animation */}
      <AnimationToggleGroup
        label="Accretion Swirl"
        enabled={config.swirlAnimationEnabled}
        onEnabledChange={setBlackHoleSwirlAnimationEnabled}
      >
        <Slider label="Speed" ... />
      </AnimationToggleGroup>

      {/* Manifold Pulse Animation */}
      <AnimationToggleGroup
        label="Manifold Pulse"
        enabled={config.pulseEnabled}
        onEnabledChange={setBlackHolePulseEnabled}
      >
        <Slider label="Speed" ... />
        <Slider label="Amount" ... />
      </AnimationToggleGroup>

      {/* Rotation Planes */}
      <RotationPlanesControl />
    </DrawerSection>
  )
}
```

### 6.3 Update TimelineControls index

```typescript
export { BlackHoleAnimationDrawer } from './BlackHoleAnimationDrawer'
```

---

## Phase 7: Extended Object Integration

### 7.1 Update extended/index.ts

**File:** `src/lib/geometry/extended/index.ts`

```typescript
// Add blackhole case to generateExtendedObject
case 'blackhole':
  return {
    dimension,
    type: 'blackhole',
    vertices: [],
    edges: [],
    metadata: {
      name: 'Cinematic Black Hole',
      properties: { renderMode: 'raymarching' },
    },
  }
```

---

## Phase 8: Tests

### 8.1 Unit Tests

Create test files:

| Test File | Coverage |
|-----------|----------|
| `src/tests/stores/slices/geometry/blackholeSlice.test.ts` | Store actions, validation |
| `src/tests/components/canvas/BlackHoleMesh.test.tsx` | Renderer mounting, uniforms |
| `src/tests/components/sections/BlackHoleControls.test.tsx` | UI controls |
| `src/tests/components/layout/BlackHoleAnimationDrawer.test.tsx` | Animation UI |

### 8.2 Visual Tests (Playwright)

**File:** `scripts/playwright/blackhole-visual.spec.ts`

```typescript
test('Black hole renders with visible lensing', async ({ page }) => {
  await page.goto('/?type=blackhole')
  await page.waitForSelector('[data-testid="canvas"]')

  // Verify black hole silhouette is visible (dark center)
  // Verify photon ring is visible (bright ring)
  // Verify background lensing (distorted stars)

  await expect(page).toHaveScreenshot('blackhole-default.png')
})

test('Black hole responds to dimension change', async ({ page }) => {
  await page.goto('/?type=blackhole&dim=5')
  await page.waitForTimeout(1000)

  // Verify thicker manifold in 5D
  await expect(page).toHaveScreenshot('blackhole-5d.png')
})
```

### 8.3 Run All Tests

```bash
npm test
npm run test:e2e
```

---

## Phase 9: Performance Optimization

### 9.1 Temporal Accumulation

Reuse Schrödinger's Horizon-style temporal accumulation:
- Render at 1/4 resolution with Bayer dithering
- Reconstruct at full resolution
- Essential for acceptable frame rates with bent rays

### 9.2 Quality Adaptation

Implement same patterns as Mandelbulb/Schrödinger:
- Drop to 'fast' quality during rotation
- Screen coverage adaptation
- Restore quality 150ms after interaction stops

### 9.3 Shader Compilation

- Compile-time feature flags (#define)
- Dimension-specific optimizations (unrolled loops for 3D-5D)

---

## File Summary

### New Files (30+ total)

| Category | File |
|----------|------|
| **Shaders - Core** | `src/rendering/shaders/blackhole/compose.ts` |
| **Shaders - Core** | `src/rendering/shaders/blackhole/uniforms.glsl.ts` |
| **Shaders - Core** | `src/rendering/shaders/blackhole/main.glsl.ts` |
| **Shaders - Gravity** | `src/rendering/shaders/blackhole/gravity/lensing.glsl.ts` |
| **Shaders - Gravity** | `src/rendering/shaders/blackhole/gravity/horizon.glsl.ts` |
| **Shaders - Gravity** | `src/rendering/shaders/blackhole/gravity/shell.glsl.ts` |
| **Shaders - Gravity** | `src/rendering/shaders/blackhole/gravity/manifold.glsl.ts` |
| **Shaders - Gravity** | `src/rendering/shaders/blackhole/gravity/doppler.glsl.ts` |
| **Shaders - Effects** | `src/rendering/shaders/blackhole/effects/jets.glsl.ts` |
| **Shaders - Effects** | `src/rendering/shaders/blackhole/effects/motion-blur.glsl.ts` |
| **Shaders - Effects** | `src/rendering/shaders/blackhole/effects/deferred-lensing.glsl.ts` |
| **Shaders - Color** | `src/rendering/shaders/blackhole/color/blackhole-palettes.glsl.ts` |
| **Shaders - Other** | `src/rendering/shaders/blackhole/nd/embedding.glsl.ts` |
| **Shaders - Other** | `src/rendering/shaders/blackhole/background/starfield.glsl.ts` |
| **Renderer** | `src/rendering/renderers/BlackHole/index.ts` |
| **Renderer** | `src/rendering/renderers/BlackHole/BlackHoleMesh.tsx` |
| **Renderer** | `src/rendering/renderers/BlackHole/blackhole.vert` |
| **Store** | `src/stores/slices/geometry/blackholeSlice.ts` |
| **UI - Geometry** | `src/components/sections/Geometry/BlackHoleControls.tsx` |
| **UI - Advanced** | `src/components/sections/Advanced/BlackHoleAdvanced.tsx` |
| **UI - Animation** | `src/components/layout/TimelineControls/BlackHoleAnimationDrawer.tsx` |
| **Tests** | `src/tests/stores/slices/geometry/blackholeSlice.test.ts` |
| **Tests** | `src/tests/components/canvas/BlackHoleMesh.test.tsx` |
| **Tests** | `src/tests/components/sections/BlackHoleControls.test.tsx` |
| **Tests** | `src/tests/components/sections/BlackHoleAdvanced.test.tsx` |
| **Tests** | `src/tests/components/layout/BlackHoleAnimationDrawer.test.tsx` |
| **E2E** | `scripts/playwright/blackhole-visual.spec.ts` |

### Modified Files (12 total)

| File | Changes |
|------|---------|
| `src/lib/geometry/types.ts` | Add 'blackhole' to ExtendedObjectType |
| `src/lib/geometry/extended/types.ts` | Add BlackHoleConfig, quality presets, visual presets, defaults |
| `src/stores/slices/geometry/types.ts` | Add BlackHoleSlice types |
| `src/stores/extendedObjectStore.ts` | Add blackhole slice |
| `src/lib/geometry/registry/registry.ts` | Add blackhole registry entry |
| `src/lib/geometry/registry/components.ts` | Add BlackHoleControls loader |
| `src/lib/geometry/registry/helpers.ts` | Add blackhole to determineRenderMode |
| `src/lib/geometry/extended/index.ts` | Add blackhole to generateExtendedObject |
| `src/components/layout/TimelineControls/index.ts` | Export BlackHoleAnimationDrawer |
| `src/rendering/renderers/UnifiedRenderer.tsx` | Add raymarch-blackhole mode |
| `src/rendering/shaders/palette/types.ts` | Add BLACKHOLE_ONLY_ALGORITHMS and new color algorithms |
| `src/components/sections/Advanced/AdvancedObjectControls.tsx` | Add BlackHoleAdvanced case |

---

## Implementation Order

Execute phases sequentially to satisfy dependencies:

1. **Phase 1** - Types (foundation for everything)
2. **Phase 2** - Shaders (core rendering logic)
3. **Phase 3** - Store slice (state management)
4. **Phase 4** - Registry (object type integration)
5. **Phase 5** - Renderer (mesh component)
6. **Phase 6** - UI (controls and animation drawer)
7. **Phase 7** - Extended object integration
8. **Phase 8** - Tests
9. **Phase 9** - Performance optimization

---

## Verification Checklist

After implementation, verify:

**Core Rendering:**
- [ ] Black hole appears in object type selector dropdown
- [ ] Selecting Black Hole renders with visible horizon silhouette
- [ ] Gravitational lensing distorts background/starfield
- [ ] Photon shell ring is visible and crisp
- [ ] Luminous manifold (accretion) is visible

**Visual Presets:**
- [ ] "Interstellar" preset produces thin disk with strong lensing
- [ ] "Cosmic" preset produces thicker volumetric look
- [ ] "Ethereal" preset produces dreamlike glow effect
- [ ] "Custom" preset preserves current user settings
- [ ] Presets work in all dimensions (3D-11D)

**Doppler Effect:**
- [ ] Doppler toggle enables/disables the effect
- [ ] When enabled, one side of disk appears brighter
- [ ] When enabled, approaching side is blue-shifted
- [ ] When enabled, receding side is red-shifted
- [ ] Doppler strength slider adjusts intensity

**Polar Jets:**
- [ ] Jets toggle enables/disables conical emission
- [ ] Jets extend above and below the accretion disk
- [ ] Jet height and width sliders work correctly
- [ ] Jet color, intensity, and falloff are adjustable
- [ ] Turbulence and pulsation animations work

**Motion Blur:**
- [ ] Motion blur toggle creates radial streaks in disk
- [ ] Blur strength is adjustable
- [ ] Effect is stronger near horizon, weaker at outer edge

**Scene Lensing:**
- [ ] Scene object lensing distorts other 3D objects
- [ ] Deferred lensing provides fast-path alternative
- [ ] Both can work together or independently

**Dimension Behavior:**
- [ ] 3D with Interstellar preset matches movie aesthetic
- [ ] Higher dimensions naturally produce thicker manifolds
- [ ] All parameters remain adjustable in all dimensions
- [ ] Manifold transitions from disk (3D) to field (11D)

**Color Algorithm Integration:**
- [ ] Black hole color algorithms appear in Faces → Color Algorithm dropdown
- [ ] Accretion Gradient colors by radial disk position
- [ ] Gravitational Redshift colors by proximity to horizon
- [ ] Lensing Intensity colors by ray bending amount
- [ ] Jets Emission colors jet material appropriately
- [ ] Universal algorithms (Cosine, LCH, etc.) also work

**Existing Feature Support:**
- [ ] SSS applies to accretion material
- [ ] Fresnel rim highlights horizon edge
- [ ] AO provides depth to manifold
- [ ] Self-shadows work for volumetric shadowing
- [ ] Base color and cosine palette integrate properly
- [ ] Emission/opacity work via Faces section

**UI Organization:**
- [ ] Geometry controls appear in LEFT editor under "Geometry" section
- [ ] Visual controls appear in RIGHT editor under "Advanced" section
- [ ] Color algorithms in Faces section show black-hole-specific options
- [ ] Existing SSS/Fresnel/AO controls work for black hole

**Temporal & Buffer Handling:**
- [ ] MRT outputs work correctly (gColor, gNormal, gPosition)
- [ ] Normal buffer provides correct view-space normals
- [ ] Temporal position buffer outputs density-weighted center
- [ ] Temporal reprojection works without smearing during rotation
- [ ] 4-frame Bayer pattern accumulation produces smooth results
- [ ] Temporal accumulation toggle works in Advanced section
- [ ] Quarter-res rendering + reconstruction produces acceptable quality

**FastMode (Rotation Quality):**
- [ ] Quality drops when N-D rotation starts
- [ ] Quality restores 150ms after rotation stops
- [ ] "Lower quality for fractal animation" toggle works
- [ ] No visible lag/stutter during rotation with fast mode
- [ ] Fast mode halves raymarch steps correctly
- [ ] AO is disabled during fast mode
- [ ] Shadows respect uShadowAnimationMode setting

**Progressive Refinement:**
- [ ] Quality drops to 25% during camera interaction
- [ ] Quality progressively restores (100ms → 300ms → 500ms)
- [ ] Refinement indicator shows progress correctly
- [ ] All quality stages are visually distinct
- [ ] Raymarching quality scales with multiplier
- [ ] Shadow quality interpolates correctly
- [ ] No jarring transitions between quality stages

**Quality & Performance:**
- [ ] All quality presets work (fast → ultra)
- [ ] Animation controls work (swirl, pulse, time scale)
- [ ] Rotation planes work with damping near horizon
- [ ] No NaNs or numerical instability at any parameter combination
- [ ] All tests pass with coverage
- [ ] Performance is acceptable at each quality level
- [ ] Combined fastMode + progressive refinement works correctly

---

## Spec Corrections Applied

This plan incorporates corrections from the spec review:

1. **Shell mask formula corrected:**
   - Was: `1 - smoothstep(Δ, 0, abs(r - R_p))`
   - Now: `1.0 - smoothstep(0.0, Δ, abs(r - R_p))`

2. **Quality presets defined** with specific values

3. **Temporal accumulation** explicitly included (Horizon-style)

4. **Background mode** added for environment/procedural/solid options

5. **Edge glow** clarified as accumulation-time effect, not post-process

---

## Design Philosophy: Flexibility Over Locking

**Important:** This implementation provides full parameter freedom across all dimensions.

- **No dimension-locked modes** - Users can achieve any visual style in any dimension
- **Presets are shortcuts, not restrictions** - "Interstellar" preset works in 5D just as well as 3D
- **All parameters are sliders/toggles** - Users have complete control
- **Dimension just changes defaults** - Higher dimensions naturally produce thicker manifolds, but this can be overridden

The Interstellar movie look is achieved by:
1. Selecting the "Interstellar" visual preset, OR
2. Manually setting: thin disk (thickness ~0.02), strong lensing (gravity ~1.5), Doppler enabled

Users can mix and match - a thin disk with no Doppler, or a thick manifold with Doppler - whatever looks best for their use case.
