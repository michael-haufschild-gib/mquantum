# WebGL Black Hole Renderer - Complete Technical Reference

## Session: 2026-02-05
## Comprehensive catalog of WebGL black hole rendering system

---

## OVERVIEW

The WebGL black hole renderer is a sophisticated raymarching system that simulates gravitational lensing of an n-dimensional black hole with an accretion disk. It renders using a volumetric density-based approach combined with surface intersection detection (Einstein rings).

**Key Architecture:**
- **Main Shader**: `src/rendering/shaders/blackhole/main.glsl.ts` (715 lines)
- **Supporting Modules**: 13 shader files in `src/rendering/shaders/blackhole/`
- **State Management**: `extendedObjectStore.ts` + `blackholeSlice.ts` (Zustand)
- **Renderer**: Handled by general shader material system (no separate BlackHoleRenderer file for WebGL)

---

## CORE SHADER ARCHITECTURE

### Shader Composition System
File: `compose.ts` - Assembles shader blocks conditionally

**Feature Flags (Defines):**
```glsl
#define DIMENSION N                    // Set at compile time
#define USE_VOLUMETRIC_DISK            // Always enabled for black hole
#define USE_TEMPORAL_ACCUMULATION      // Optional: 1/4 res reconstruction
#define USE_DOPPLER                    // Relativistic Doppler shift
#define USE_ENVMAP                     // Environment map sampling
#define USE_MOTION_BLUR                // Optional effect
#define USE_SLICE_ANIMATION            // For 4D+ dimensions
#define USE_NOISE_TEXTURE              // Perf: pre-baked noise LUT
#define USE_BLACKBODY_LUT              // Perf: pre-baked blackbody colors
#define USE_SSS                        // Subsurface scattering
#define USE_FRESNEL                    // Fresnel rim lighting
#define USE_AO                         // Ambient occlusion (volumetric)
```

**Shader Modules Included (in order):**
1. **Precision/Constants**: `precision.glsl.ts`, `constants.glsl.ts`
2. **Shared Uniforms**: `shared/core/uniforms.glsl.ts`
3. **Black Hole Uniforms**: `uniforms.glsl.ts` (specific to black hole)
4. **Textures**: Optional `sampler3D tDiskNoise`, `sampler2D tBlackbodyLUT`, `samplerCube envMap`
5. **Libraries**: Palette functions, shared SSS/temporal modules
6. **Gravity Modules**: Lensing, horizon, shell, manifold, Doppler, colors
7. **Disk Implementations**: Volumetric + SDF (plane crossing)
8. **Effects**: Optional motion blur
9. **Main Raymarching**: `main.glsl.ts`

---

## UNIFORM PARAMETERS

### Physics (Kerr Black Hole)
```glsl
uniform float uHorizonRadius;          // Schwarzschild radius rs = 2M (0.05-20)
uniform float uVisualEventHorizon;     // Kerr event horizon r+ (shrinks with spin)
uniform float uSpin;                   // Dimensionless spin chi = a/M (0-0.998)
uniform float uDiskTemperature;        // Inner disk temperature (Kelvin)
uniform float uGravityStrength;        // Lensing intensity k (artistic multiplier)
```

### Disk Geometry (Accretion Manifold)
```glsl
uniform float uManifoldIntensity;      // Disk emission intensity
uniform float uManifoldThickness;      // Disk thickness (fraction of rs)
uniform int uManifoldType;             // 0=auto, 1=disk, 2=sheet, 3=slab, 4=field

// Pre-computed (CPU optimization)
uniform float uDiskInnerR;             // Pre-computed: rs * uDiskInnerRadiusMul
uniform float uDiskOuterR;             // Pre-computed: rs * uDiskOuterRadiusMul
uniform float uEffectiveThickness;     // Pre-computed: thickness * rs * thicknessScale
```

### Lensing Parameters
```glsl
uniform float uDimensionEmphasis;      // alpha: dimension blend factor
uniform float uDistanceFalloff;        // beta: distance falloff exponent (default 2.0)
uniform float uEpsilonMul;             // Numerical stability epsilon
uniform float uBendScale;              // Ray bend scale (multiplier)
uniform float uBendMaxPerStep;         // Max bend angle per step
uniform float uLensingClamp;           // Maximum lensing effect (clamping)

// Pre-computed (CPU optimization)
uniform float uDimPower;               // Pre-calculated pow(DIMENSION, emphasis)
uniform float uOriginOffsetLengthSq;   // Length squared of N-D origin offset
uniform float uLensingFalloffStart;    // rs * 3.5 (where lensing starts reducing)
uniform float uLensingFalloffEnd;      // rs * 8.0 (where lensing reaches minimum)
uniform float uHorizonRadiusInv;       // 1.0 / rs (avoid per-pixel division)
```

### Photon Shell
```glsl
uniform float uPhotonShellRadiusMul;   // R_p multiplier (default 1.3)
uniform float uPhotonShellRadiusDimBias; // Dimension bias for R_p
uniform float uShellGlowStrength;      // Shell emission intensity
uniform vec3 uShellGlowColor;          // Shell color
uniform float uShellStepMul;           // Step size reduction near shell
uniform float uShellContrastBoost;     // Shell sharpness

// Pre-computed
uniform float uShellRpPrecomputed;     // Pre-calculated photon shell radius
uniform float uShellDeltaPrecomputed;  // Pre-calculated shell width delta
```

### Raymarching Quality
```glsl
uniform int uMaxSteps;                 // Max raymarch iterations (32-512)
uniform float uStepBase;               // Base step size
uniform float uStepMin;                // Minimum step size
uniform float uStepMax;                // Maximum step size (clamped dynamically)
uniform float uStepAdaptG;             // Gravity adaptation factor
uniform float uStepAdaptR;             // Radius adaptation factor
uniform bool uEnableAbsorption;        // Enable volumetric absorption
uniform float uAbsorption;             // Absorption coefficient
uniform float uTransmittanceCutoff;    // Early exit threshold
uniform float uFarRadius;              // Far clipping (multiplier on rs)
uniform float uQualityMultiplier;      // (From shared uniforms) - dynamic quality
```

### Effects & Animation
```glsl
uniform float uTime;                   // Global time
uniform float uTimeScale;              // Animation time scale
uniform vec3 uBaseColor;               // Base accretion color
uniform int uPaletteMode;              // 0=diskGradient, 1=normal, 2=shell, 3=heatmap
uniform float uBloomBoost;             // HDR bloom multiplier
uniform int uDebugMode;                // Debug visualization (0=off, 1=heatmap)

// Doppler
uniform bool uDopplerEnabled;          // Enable Doppler shift
uniform float uDopplerStrength;        // Doppler intensity

// SSS / Fresnel / AO
uniform bool uSssEnabled;              // Enable subsurface scattering
uniform float uSssIntensity;           // SSS intensity (0.0-2.0)
uniform vec3 uSssColor;                // SSS tint color
uniform float uSssThickness;           // SSS thickness factor
uniform float uSssJitter;              // SSS jitter amount

// Disk Animation
uniform float uDiskRotationAngle;      // Accumulated rotation angle (radians)
uniform float uKeplerianDifferential;  // 0=uniform, 1=full Keplerian rotation
uniform float uSwirlAmount;            // Spiral/swirl intensity
uniform float uNoiseScale;             // Turbulence noise scale
uniform float uNoiseAmount;            // Turbulence noise amount
uniform float uMultiIntersectionGain;  // Einstein ring enhancement

// Performance Modes
uniform bool uFastMode;                // Skip 2nd octave noise
uniform bool uUltraFastMode;           // Skip ALL noise

// Temporal Sampling
uniform vec2 uBayerOffset;             // Bayer pattern offset for temporal sampling
uniform vec2 uFullResolution;          // Full resolution before downscale

// Shared uniforms (from shared/core/uniforms.glsl.ts)
uniform mat4 uModelMatrix;             // Model-to-world transform
uniform mat4 uInverseModelMatrix;      // World-to-model transform
uniform mat4 uViewMatrix;              // View matrix
uniform mat4 uProjectionMatrix;        // Projection matrix
uniform mat4 uInverseViewProjectionMatrix; // For ray reconstruction
uniform vec3 uCameraPosition;          // Camera position (world space)
```

---

## EVENT HORIZON RENDERING

**File**: `gravity/horizon.glsl.ts`

### How the Horizon Appears BLACK

The horizon is BLACK because it's handled via **transmittance absorption**, not color mapping:

```glsl
bool isInsideHorizon(float ndRadius) {
  return ndRadius < uVisualEventHorizon;
}

// In raymarch loop (main.glsl.ts, line 367-371):
if (isInsideHorizon(ndRadius)) {
  accum.transmittance = 0.0;  // ← Sets to fully opaque/black
  hitHorizon = true;
  break;
}
```

**Key Points:**
- Uses `uVisualEventHorizon` (shrinks with spin) not `uHorizonRadius`
- When ray crosses: `transmittance = 0.0` (no light escapes)
- Final alpha = `1.0 - transmittance` → **opaque black**
- Prevents "black sticker" artifact by breaking loop after setting transmittance
- No background sampling after horizon hit (line 579-596 handles this)

---

## GRAVITATIONAL LENSING (Ray Bending)

**File**: `gravity/lensing.glsl.ts`

### Core Formula

Uses "Magic Potential" approach from Starless raytracer:

```glsl
vec3 bendRay(vec3 rayDir, vec3 pos3d, float stepSize, float ndRadius) {
  // N-dimensional lensing: G(r,N) = k * N^α / (r + ε)^β
  float forceMagnitude = 1.5 * h² / r⁵
                       * N^α * r^(2-β)  // N-D scaling
                       * k               // Gravity strength
                       * proximityFactor // Drops far from horizon
                       * bendScale
  
  // Schwarzschild component (radial acceleration toward center)
  vec3 acceleration = -(forceMagnitude / |pos3d|) * pos3d
  
  // Kerr frame dragging component (if spin > 0.001)
  // Frame dragging: a = chi * rs/2
  // Azimuthal acceleration: ~2*a/r³ in direction perpendicular to radius
  if (spin > 0.001) {
    vec3 azimuthalDir = (-pos.z, 0, pos.x)  // Perpendicular to radius
    acceleration += (frameDragMag / |azimuthalDir|) * azimuthalDir
  }
  
  // Velocity Verlet integration
  vec3 newDir = rayDir + acceleration * stepSize
  return normalize(newDir)
}
```

### Proximity Factor (Falloff)

```glsl
// Smooth falloff from horizon to far space
float proximityT = 1.0 - smoothstep(uLensingFalloffStart, uLensingFalloffEnd, r)
                 // uLensingFalloffStart = rs * 3.5
                 // uLensingFalloffEnd = rs * 8.0
float proximityFactor = mix(0.1, 1.0, proximityT)  // 1.0 near, 0.1 far
```

### N-Dimensional Scaling

The formula adapts to different dimensions:
- `N^α`: Dimension power (pre-computed as `uDimPower`)
- `r^(2-β)`: Distance falloff correction
- Combined: scales gravity strength appropriately for N-D spaces

### Critical Optimization (OPT-BH-9, OPT-BH-28, OPT-BH-29)
- Pre-compute `pos3dLenSq` from `ndRadius` to avoid redundant sqrt
- Use `inversesqrt()` for normalization instead of `sqrt()` + division
- Simplified proximity falloff to single `smoothstep` instead of 2

---

## ACCRETION DISK RENDERING

### Disk Geometry Modes

**File**: `gravity/manifold.glsl.ts`

```glsl
int getManifoldType() {
  if (DIMENSION <= 3) return 1;    // disk (thin 2D)
  if (DIMENSION == 4) return 2;    // sheet (disk + thickness in W)
  if (DIMENSION <= 6) return 3;    // slab (volumetric)
  return 4;                         // field (full volume)
}

float getManifoldThicknessScale() {
  if (type == 1) return 1.0;       // Disk: very thin
  if (type == 2) return 2.0;       // Sheet: moderate
  if (type == 3) return min(D-2, max);  // Slab: DIMENSION - 2
  return min(D, max);              // Field: full DIMENSION
}
```

**Disk Location**: XZ plane is disk plane (y=0), Y is vertical

### Volumetric Density Calculation

**File**: `gravity/disk-volumetric.glsl.ts`

```glsl
float getDiskDensity(vec3 pos, float time, float r) {
  // 1. Radial bounds check
  if (r < innerR * 0.9 || r > outerR * 1.2) return 0.0

  // 2. Vertical profile (Gaussian with flaring)
  // Disk flares at edges (thicker far from center)
  float flare = 1.0 + (r/outerR)^2.5 * 1.5
  float thickness = uManifoldThickness * rs * 0.5 * flare
  
  // 3. Kerr disk warp (Bardeen-Petterson effect)
  float warpOffset = getDiskWarp(pos, r, innerR, thickness)
  float h = abs(pos.y - warpOffset)
  
  // 4. Vertical falloff (sharp for "thin disk" look)
  float hDensity = exp(-(h*h) / (thickness*thickness))
  if (hDensity < 0.001) return 0.0
  
  // 5. Fast mode: skip noise, return smooth profile
  if (uUltraFastMode) {
    // Simple radial gradient without noise
    float rDensity = smoothstep(innerR*0.9, innerR, r)
                   * (1.0 - smoothstep(outerR*0.9, outerR*1.2, r))
    rDensity *= 2.0 / (rOverInner² + 0.1)
    return hDensity * rDensity * intensity * 20.0
  }
  
  // 6. Radial profile with soft edges
  float rDensity = smoothstep(innerR*0.9, innerR, r)
                 * (1.0 - smoothstep(outerR*0.9, outerR*1.2, r))
  rDensity *= 2.0 / (rOverInner² + 0.1)
  
  // 7. Noise/Turbulence (volumetric detail)
  if (uNoiseAmount > 0.01) {
    // Compute angle for seamless noise coordinates
    float angle = atan(pos.z, pos.x)
    // Apply disk rotation via angle addition formulas (avoids expensive atan)
    // Keplerian differential: inner disk rotates faster
    
    // SEAM-FREE noise coordinates using rotated sin/cos
    float radialCoord = r * 6.0 + dither
    vec3 noiseCoord = vec3(
      radialCoord,
      (rotCos + rotSin*0.5) * 0.5,
      h * 2.0 + rotSin*0.3*0.5
    )
    
    float ridged = ridgedMF(noiseCoord * scale + time*0.02)
    ridged = smoothstep(0.15, 0.85, ridged)
    ridged = ridged² * sqrt(max(ridged, 0.001))
    
    rDensity *= mix(0.3, 1.0, ridged) * mix(1.0, 2.0, noiseAmount)
    
    // Dust lanes (radial banding)
    float dustLanes = 0.5 + 0.5 * sin((r + dither) * 15.0 / rs)
    dustLanes = sqrt(dustLanes)
    rDensity *= mix(1.0, dustLanes, 0.3 * noiseAmount)
  }
  
  return hDensity * rDensity * intensity * 20.0
}
```

### Disk Warp (Bardeen-Petterson Effect)

For Kerr (spinning) black holes, the inner disk aligns with black hole's equatorial plane:

```glsl
float getDiskWarp(vec3 pos, float r, float innerR, float thickness) {
  if (abs(uSpin) < 0.01) return 0.0  // No warp for non-spinning
  
  float angle = atan(pos.z, pos.x)
  float rRatio = r / max(innerR, 0.001)
  
  // Warp decays as 1/r² from inner edge
  float warpDecay = 1.0 / (1.0 + (rRatio - 1.0)²)
  
  // Smooth transition: no warp very close to ISCO, peaks, then decays
  float transitionIn = smoothstep(1.0, 1.5, rRatio)
  float transitionOut = 1.0 - smoothstep(1.5, 4.0, rRatio)
  float warpStrength = transitionIn * transitionOut * warpDecay
  
  // Primary: Bardeen-Petterson tilt (tilted vinyl record look)
  float tiltWarp = cos(angle) * warpStrength
  
  // Secondary: frame-drag induced twist
  float twistWarp = sin(2.0*angle) * warpStrength * 0.3
  
  // Tertiary: precession ripple
  float precessionPhase = angle + uDiskRotationAngle * 0.5
  float precessionRipple = sin(3.0*precessionPhase) * warpStrength * 0.15
  
  float totalWarp = tiltWarp + twistWarp + precessionRipple
  float warpAmplitude = abs(uSpin) * thickness * 0.4
  
  return totalWarp * warpAmplitude
}
```

---

## DISK COLOR & EMISSION

**File**: `gravity/disk-volumetric.glsl.ts` + `gravity/colors.glsl.ts`

### Color Calculation

```glsl
vec3 getDiskEmission(vec3 pos, float density, float time, vec3 rayDir, 
                     vec3 normal, float r, float innerR) {
  // 1. Temperature gradient (Shakura-Sunyaev thin disk)
  // T(r) = T_max * (r/r_ISCO)^(-3/4)
  float tempRatio = pow(innerR / max(r, innerR), 0.75)
  
  // 2. Get base color based on algorithm
  float normalizedR = clamp((r - innerR) / (outerR - innerR), 0.0, 1.0)
  
  vec3 color;
  if (uColorAlgorithm == ALGO_BLACKBODY) {
    float temp = uDiskTemperature * tempRatio
    color = blackbodyColor(temp)  // Lookup or analytical
    color *= 2.0  // Boost for core look
  } else {
    float t = pow(normalizedR, 0.7)
    color = getAlgorithmColor(t, pos, normal)
    
    // Add thermal core (lighter/whiter inner edge)
    vec3 coreColor = vec3(1.0, 0.98, 0.9)
    float coreMix = smoothstep(0.3, 0.0, normalizedR)
    color = mix(color, coreColor * 3.0, coreMix * 0.5)
    
    // Brightness varies with radius
    float brightnessFactor = mix(1.5, 0.8, normalizedR)
    color *= brightnessFactor
  }
  
  // 3. Gravitational redshift
  float gRedshift = gravitationalRedshift(r)
  color *= gRedshift
  
  // 4. Doppler shift (relativistic beaming)
  float dopplerFac = dopplerFactor(pos, rayDir)
  color = applyDopplerShift(color, dopplerFac)
  
  // 5. Limb darkening (edges appear darker)
  float cosTheta = abs(rayDir.y)
  float limbDarkening = 1.0 - 0.4 * (1.0 - cosTheta)
  color *= limbDarkening
  
  // 6. Density modulation
  color *= (density * 0.2 + 0.1)
  
  return color * density
}
```

### Color Algorithms

**File**: `gravity/colors.glsl.ts`

```glsl
// Mode constants:
#define ALGO_MONOCHROMATIC 0        // Direct RGB lightness variation
#define ALGO_ANALOGOUS 1            // RGB hue shift approximation
#define ALGO_COSINE 2               // Cosine palette gradient
#define ALGO_NORMAL 3               // Normal-based coloring
#define ALGO_DISTANCE 4             // Distance-based
#define ALGO_LCH 5                  // LCH color space
#define ALGO_MULTISOURCE 6          // Multi-source
#define ALGO_RADIAL 7               // Radial gradient
#define ALGO_PHASE 8                // Angular (azimuthal)
#define ALGO_MIXED 9                // Mixed modes
#define ALGO_BLACKBODY 10           // Blackbody radiation
#define ALGO_ACCRETION_GRADIENT 11  // Interstellar-style: white→orange→red
#define ALGO_GRAVITATIONAL_REDSHIFT 12  // Redshift visualization

// Key optimization (OPT-BH-20): Avoid rgb2hsl()/hsl2rgb() round-trips
// Use direct RGB mixing instead for ~3x speedup
```

---

## DOPPLER EFFECT

**File**: `gravity/doppler.glsl.ts`

### Keplerian Orbital Velocity

```glsl
vec3 orbitalVelocity(vec3 pos3d, float r) {
  // Tangent to circle in XZ plane (counter-clockwise from +Y)
  // For counter-clockwise rotation, left side approaches camera at +Z
  float safeLen = max(length(pos3d.xz), 0.0001)
  vec3 tangent = vec3(pos3d.z, 0.0, -pos3d.x) / safeLen
  return tangent
}

float dopplerFactor(vec3 pos3d, vec3 viewDir) {
  if (!uDopplerEnabled) return 1.0
  
  float r = length(pos3d.xz)
  if (r < 0.001) return 1.0
  
  vec3 velocity = orbitalVelocity(pos3d, r)
  
  // Dot with view direction
  // Positive = moving away (receding), negative = moving toward (approaching)
  float approaching = -dot(velocity, viewDir)
  
  // Keplerian speed: v ∝ 1/√r
  // Normalized so innerR gives speed ≈ 1.0
  float orbitSpeed = sqrt(uDiskInnerR / max(r, uDiskInnerR))
  
  float dopplerShift = approaching * orbitSpeed * uDopplerStrength
  
  return 1.0 + dopplerShift
}

// Brightness change via relativistic beaming
// I' = I * D³ (where D = dopplerFactor)
float brightness = dopplerFac * dopplerFac * dopplerFac
```

### Gravitational Redshift

```glsl
float gravitationalRedshift(float r) {
  // Schwarzschild: sqrt(1 - rs/r)
  float rsOverR = uHorizonRadius / max(r, uHorizonRadius * 1.01)
  float redshiftFactor = sqrt(max(1.0 - rsOverR, 0.01))
  return redshiftFactor
}
```

### Blackbody Color

**Optimization (OPT-BH-17)**: Uses pre-baked LUT when `USE_BLACKBODY_LUT` enabled

```glsl
vec3 blackbodyColor(float temperature) {
#ifdef USE_BLACKBODY_LUT
  // Map temperature [1000K, 40000K] to UV [0, 1]
  float t = clamp((temperature - 1000.0) / 39000.0, 0.0, 1.0)
  return texture(tBlackbodyLUT, vec2(t, 0.5)).rgb
#else
  // Fallback: Tanner Helland analytical algorithm
  // Uses piecewise pow/log for RGB channels
#endif
}
```

---

## ENVIRONMENT MAP SAMPLING

**File**: `main.glsl.ts`, line 112-127

```glsl
vec3 sampleBackground(vec3 bentDir) {
  #ifdef USE_ENVMAP
    if (uEnvMapReady > 0.5) {
      // Transform bent ray from LOCAL SPACE to WORLD SPACE
      // Black hole simulation runs in local space (scale/rotation via model matrix)
      // Environment map (skybox) is in world space
      vec3 worldBentDir = normalize(mat3(uModelMatrix) * bentDir)
      return texture(envMap, worldBentDir).rgb
    }
  #endif
  
  return vec3(0.0)  // No envMap = black background
}
```

**Key Points:**
- Uses general skybox system (no built-in procedural fallback)
- Coordinate transformation: local → world via `mat3(uModelMatrix)`
- Only samples if `uEnvMapReady > 0.5` (validity check)
- Returns black if envMap disabled or not ready

---

## CAMERA & RAY SETUP

**File**: `main.glsl.ts`, line 617-653

### Ray Origin

```glsl
// Transform ray origin to LOCAL SPACE using inverse model matrix
vec3 rayOrigin = (uInverseModelMatrix * vec4(uCameraPosition, 1.0)).xyz
```

### Ray Direction

**Without Temporal Accumulation:**
```glsl
vec3 worldRayDir = normalize(vPosition - uCameraPosition)
vec3 rayDir = normalize((uInverseModelMatrix * vec4(worldRayDir, 0.0)).xyz)
```

**With Temporal Accumulation (1/4 res reconstruction):**
```glsl
vec2 screenCoord = gl_FragCoord.xy

// Detect quarter-res mode
bool isQuarterRes = uResolution.x < uFullResolution.x * 0.75

if (isQuarterRes) {
  // Each pixel represents 2x2 block in full res
  // Apply Bayer offset to sample different sub-pixels each frame
  screenCoord = floor(gl_FragCoord.xy) * 2.0 + uBayerOffset + 0.5
}

// Compute ray direction from screen coordinate
vec2 screenUV = screenCoord / uFullResolution
vec2 ndc = screenUV * 2.0 - 1.0
vec4 farPointClip = vec4(ndc, 1.0, 1.0)
vec4 farPointWorld = uInverseViewProjectionMatrix * farPointClip
// Guard against division by zero while preserving sign
float farW = abs(farPointWorld.w) < 0.0001
  ? (farPointWorld.w >= 0.0 ? 0.0001 : -0.0001)
  : farPointWorld.w
farPointWorld /= farW
worldRayDir = normalize(farPointWorld.xyz - uCameraPosition)
```

---

## QUALITY SETTINGS & THEIR EFFECTS

### Step Size Adaptation

**File**: `main.glsl.ts`, line 71-95

```glsl
float adaptiveStepSizeWithMask(float ndRadius, out float outShellMask) {
  // Base step: scale with distance for efficient far travel
  float step = uStepBase * (1.0 + ndRadius * 0.5)
  
  // Reduce near horizon (gravity adaption)
  float gravityFactor = 1.0 / (1.0 + uStepAdaptG * uGravityStrength / max(ndRadius, uEpsilonMul))
  step *= gravityFactor
  
  // Reduce near photon shell
  float shellMod = shellStepModifierWithMask(ndRadius, outShellMask)
  step *= shellMod
  
  // Reduce when close to horizon
  float horizonDist = max(ndRadius - uHorizonRadius, 0.0)
  float horizonFactor = smoothstep(0.0, uHorizonRadius * uStepAdaptR, horizonDist)
  step *= mix(0.1, 1.0, horizonFactor)
  
  // Dynamic max: allow step size to grow with distance
  // Standard uStepMax is too restrictive at far distances
  float dynamicMax = uStepMax * (1.0 + ndRadius * 0.5)
  
  return clamp(step, uStepMin, dynamicMax)
}
```

### Quality Multiplier

From shared uniforms, applied in raymarch loop:
```glsl
int effectiveMaxSteps = max(int(float(uMaxSteps) * uQualityMultiplier), MIN_EFFECTIVE_STEPS)
// When zoomed in close: uQualityMultiplier decreases to maintain FPS
// Caps at MIN_EFFECTIVE_STEPS = 32 minimum
```

### Fast Mode Optimizations

```glsl
// Ultra-fast mode (uUltraFastMode = true):
// - Skip ALL noise computation
// - Return smooth radial density gradient only
// - Saves ~20% GPU time during rapid camera movement

// Fast mode (uFastMode = true):
// - Use single octave noise instead of 2 octaves
// - Skip domain warping in flowNoise
// - Skip Einstein ring crossings in some configurations
// - PERF (OPT-BH-27): ~5-10% savings
```

### Importance Sampling (Near Disk Plane)

**File**: `main.glsl.ts`, line 386-397

```glsl
#ifdef USE_VOLUMETRIC_DISK
if (diskR > uDiskInnerR * 0.5 && diskR < uDiskOuterR * 1.5) {
  float diskThickness = uManifoldThickness * uHorizonRadius
  // Boost sampling density by up to 2.5x when inside disk vertical bounds
  float importance = 1.0 + 1.5 * smoothstep(2.0, 0.0, diskH / max(diskThickness, 0.001))
  stepSize /= importance
}
#endif
```

---

## RAYMARCHING LOOP STRUCTURE

**File**: `main.glsl.ts`, line 262-576

### Main Loop Overview

```glsl
RaymarchResult raymarchBlackHole(vec3 rayOrigin, vec3 rayDir, float time) {
  AccumulationState accum = initAccumulation()
  
  // 1. BOUNDING VOLUME SKIP
  float farRadius = uFarRadius * uHorizonRadius
  float dynamicFlatten = mix(0.5, 1.0, smoothstep(0.3, 0.8, cameraElevation))
  vec2 intersect = intersectSpheroid(rayOrigin, rayDir, farRadius, dynamicFlatten)
  if (intersect.y < 0.0) return earlyExit()  // Sphere behind camera
  
  float tNear = max(0.0, intersect.x)
  float tFar = intersect.y
  
  // 2. DITHERING (banding reduction)
  float dither = interleavedGradientNoise(gl_FragCoord.xy + fract(time))
  float startOffset = dither * 0.1
  vec3 pos = rayOrigin + rayDir * (tNear + startOffset)
  
  // 3. INITIAL STATE
  float ndRadius = ndDistance(pos)
  dir = bendRay(dir, pos, 0.1, ndRadius)  // Pre-bend
  float absorptionFactor = uEnableAbsorption ? exp(-uAbsorption * 0.5) : 0.0
  int effectiveMaxSteps = max(int(float(uMaxSteps) * uQualityMultiplier), 32)
  
  // 4. MAIN RAYMARCHING LOOP
  for (int i = 0; i < RAYMARCH_MAX_LOOP; i++) {
    // Loop conditions (multiple exit paths)
    if (i >= effectiveMaxSteps) break
    if (totalDist > maxDist) break
    if (accum.transmittance < uTransmittanceCutoff) break
    
    // Early ray termination (improved, line 341-357)
    // Path 1: Ray mostly opaque and near photon sphere
    if (accum.transmittance < 0.1 && ndRadius < uVisualEventHorizon * 1.5) break
    // Path 2: Ray escaped disk without hitting anything
    if (wasInsideDiskRegion && ndRadius > uDiskOuterR*1.5 && 
        accum.totalDensity < 0.01 && !hitHorizon) break
    
    // HORIZON CHECK (immediate post-step, line 367-372)
    if (isInsideHorizon(ndRadius)) {
      accum.transmittance = 0.0
      hitHorizon = true
      break
    }
    
    // ADAPTIVE STEP SIZE
    float shellMask
    float stepSize = adaptiveStepSizeWithMask(ndRadius, shellMask)
    
    // Cache diskR and diskH for iteration (PERF optimization)
    float diskR = length(pos.xz)
    float diskH = abs(pos.y)
    
    // IMPORTANCE SAMPLING (near disk plane)
    if (diskR > uDiskInnerR*0.5 && diskR < uDiskOuterR*1.5) {
      float importance = 1.0 + 1.5 * smoothstep(2.0, 0.0, diskH / thickness)
      stepSize /= importance
    }
    
    // PER-STEP JITTER (golden ratio, low-discrepancy)
    stepJitter = fract(stepJitter + 0.618033988749)
    float jitterScale = (stepJitter - 0.5) * 0.4  // [-0.2, +0.2]
    stepSize *= (1.0 + jitterScale)
    
    // APPLY LENSING
    dir = bendRay(dir, pos, stepSize, ndRadius)
    
    // STEP
    prevPos = pos
    pos += dir * stepSize
    totalDist += stepSize
    ndRadius = ndDistance(pos)
    
    // IMMEDIATE HORIZON CHECK (critical, line 417-432)
    if (isInsideHorizon(ndRadius)) {
      accum.transmittance = 0.0
      hitHorizon = true
      break
    }
    
    // ACCRETION DISK VOLUMETRIC SAMPLING
    #ifdef USE_VOLUMETRIC_DISK
    float density = getDiskDensity(pos, time, diskR)
    if (density > 0.001) {
      // Compute emission with Doppler/Fresnel/SSS/AO
      vec3 emission = getDiskEmission(pos, density, time, dir, stepNormal, diskR, uDiskInnerR)
      
      // Beer-Lambert integration
      float absorption = density * uAbsorption * 2.0
      float stepTransmittance = exp(-absorption * stepSize)
      vec3 stepEmission = emission * stepSize * accum.transmittance
      accum.color += stepEmission
      accum.transmittance *= stepTransmittance
      
      // Update depth/normal on first significant hit
      if (accum.hasFirstHit < 0.5 && density > 0.05) {
        accum.firstHitPos = pos
        accum.hasFirstHit = 1.0
      }
    }
    
    // DISK PLANE CROSSING DETECTION (Einstein rings)
    // Even in volumetric mode, detect plane crossings for Einstein ring effect
    if (!uFastMode && !uUltraFastMode && diskCrossings < 8) {
      if (detectDiskCrossing(prevPos, pos, crossingPos)) {
        vec3 hitColor = shadeDiskHit(crossingPos, dir, diskCrossings, time)
        // Accumulate with absorption
        accumulateDiskHit(accum, hitColor, crossingPos, diskNormal, absorptionFactor)
        diskCrossings++
      }
    }
    #endif
  }
  
  // 5. BACKGROUND HANDLING
  if (hitHorizon) {
    accum.transmittance = 0.0
  } else if (accum.transmittance > 0.01) {
    // Ray escaped: sample background (keep transmittance high for proper alpha)
    vec3 bgColor = sampleBackground(bentDirection)
    accum.color += bgColor * accum.transmittance
  }
  
  // 6. DEBUG VISUALIZATION
  if (uDebugMode == 1) {
    float t = float(iterationsUsed) / float(effectiveMaxSteps)
    accum.color = vec3(
      smoothstep(0.0, 0.5, t),           // Green → Yellow → Red heatmap
      1.0 - smoothstep(0.5, 1.0, t),
      0.0
    )
    accum.transmittance = 0.0
  }
  
  return finalizeAccumulation(accum, pos, rayDir)
}
```

### Step Logic Summary

1. **Before Step**: Compute `ndRadius` at current position
2. **Calculate Step Size**: Adaptive based on location + optional jitter
3. **Apply Lensing**: Bend ray toward black hole
4. **Move Ray**: `pos += dir * stepSize`
5. **After Step**: 
   - Immediately check horizon (critical for transparency)
   - Sample disk density/emission
   - Detect disk plane crossings

---

## MULTIPLE RENDER TARGET (MRT) OUTPUTS

**File**: `main.glsl.ts`, line 661-714

### Output Declaration

Implicit MRT declaration (uses `layout(location = N)` from precision.glsl.ts):

```glsl
// gColor (location 0) - Color output
layout(location = 0) out vec4 gColor
// gNormal (location 1) - View-space normal
layout(location = 1) out vec4 gNormal
// gPosition (location 2) - World position (optional, temporal only)
#ifdef USE_TEMPORAL_ACCUMULATION
  layout(location = 2) out vec4 gPosition
#endif
```

### Color Output

```glsl
gColor = result.color  // RGBA where A = 1.0 - transmittance
```

### Normal Output

```glsl
if (result.hasHit > 0.5) {
  // Transform local normal to world, then to view space
  vec3 worldNormal = normalize(mat3(uModelMatrix) * result.averageNormal)
  vec3 viewNormal = mat3(uViewMatrix) * worldNormal
  // Encode to [0,1] range
  gNormal = vec4(viewNormal * 0.5 + 0.5, 1.0)  // alpha=1 indicates valid
} else {
  // No hit: zero normal so normalComposite uses environment normal
  gNormal = vec4(0.0, 0.0, 0.0, 0.0)
}
```

### Position Output (Temporal Only)

```glsl
#ifdef USE_TEMPORAL_ACCUMULATION
  vec4 worldWeightedPos = uModelMatrix * vec4(result.weightedCenter, 1.0)
  gPosition = vec4(worldWeightedPos.xyz, result.color.a)
#else
  gPosition = vec4(0.0)  // Dummy when temporal disabled
#endif
```

**Key Points:**
- Position uses **density-weighted center** for stable temporal reprojection
- Normal only valid if `alpha > 0` (hit geometry)
- Depth calculated separately via `gl_FragDepth`

---

## DEPTH BUFFER OUTPUT

**File**: `main.glsl.ts`, line 685-700

```glsl
if (result.hasHit > 0.5) {
  // Transform local hit position back to world space
  vec4 worldHitPos = uModelMatrix * vec4(result.firstHitPos, 1.0)
  
  // Project to clip space
  vec4 clipPos = uProjectionMatrix * uViewMatrix * worldHitPos
  
  // Guard against division by zero while preserving sign
  float clipW = abs(clipPos.w) < 0.0001
    ? (clipPos.w >= 0.0 ? 0.0001 : -0.0001)
    : clipPos.w
  
  // Normalize to NDC, then to [0, 1] depth
  gl_FragDepth = clamp((clipPos.z / clipW) * 0.5 + 0.5, 0.0, 1.0)
} else {
  // No hit: use far plane depth (1.0)
  gl_FragDepth = 1.0
}
```

**Note**: Horizon writes depth = 1.0 to distinguish from disk (depth < 1.0)

---

## PERFORMANCE OPTIMIZATIONS (Detailed List)

### OPT-BH-1: Single ndDistance Call Per Iteration
- **Issue**: Was called 3 times per iteration (pre, start, post)
- **Fix**: Carry forward from previous iteration as next iteration's start
- **Savings**: ~30% reduction in expensive sqrt calls

### OPT-BH-2: Cache Photon Shell Mask
- **Issue**: `photonShellMask()` called twice (step size + emission)
- **Fix**: Compute once, pass via `out` parameter
- **Savings**: Eliminates redundant `smoothstep()` call

### OPT-BH-3: Ultra-Fast Mode Skips Noise
- **Issue**: During rapid camera movement, noise detail imperceptible
- **Fix**: Return smooth radial density gradient only
- **Savings**: ~20% GPU time during fast pans

### OPT-BH-6: Pre-Computed Disk Radii
- **Issue**: `uDiskInnerRadiusMul * uHorizonRadius` computed per-pixel
- **Fix**: Pre-compute on CPU as `uDiskInnerR`, `uDiskOuterR`
- **Savings**: Eliminates ~10 multiplications per-pixel

### OPT-BH-7: Pre-Computed Absorption Factor
- **Issue**: `exp(-uAbsorption * 0.5)` called per disk hit
- **Fix**: Compute once before loop
- **Savings**: Eliminates expensive `exp()` per crossing

### OPT-BH-9: Derive pos3dLenSq from ndRadius
- **Issue**: Computing `|pos3d|` required extra sqrt
- **Fix**: Use `ndRadius² - uOriginOffsetLengthSq`
- **Savings**: Eliminates one sqrt in `bendRay()`

### OPT-BH-13: Pre-Computed Effective Thickness
- **Issue**: `getManifoldThicknessScale()` computed per-pixel
- **Fix**: Pre-compute on CPU as `uEffectiveThickness`
- **Savings**: ~5-10 ALU ops

### OPT-BH-14: Compute Angle Once
- **Issue**: `atan()` called separately for swirl and noise
- **Fix**: Compute once, reuse
- **Savings**: ~8 GPU cycles per pixel

### OPT-BH-15: Reduced Domain Warping
- **Issue**: 3-axis warping indistinguishable from 1-axis at 60fps
- **Fix**: Single-axis warping in `flowNoise()`
- **Savings**: Eliminates 2 snoise calls (~100+ ALU ops)

### OPT-BH-16: Cache diskR Across Iteration
- **Issue**: `length(pos.xz)` computed 3 times per step
- **Fix**: Compute once, update after step
- **Savings**: ~20% reduction in disk-related overhead

### OPT-BH-17: Blackbody LUT Texture
- **Issue**: Blackbody computation uses pow/log (~40+ cycles)
- **Fix**: Pre-baked 2D LUT texture lookup (~4 cycles)
- **Savings**: ~10x speedup on temperature coloring

### OPT-BH-18: Analytical Disk Normal
- **Issue**: Numerical gradient requires 4× `getDiskDensity()` calls
- **Fix**: Analytical approximation (Gaussian + radial)
- **Savings**: ~10x faster, negligible visual difference

### OPT-BH-20: Avoid HSL Round-Trips
- **Issue**: `rgb2hsl()` + `hsl2rgb()` for color algorithms (~40 ALU ops)
- **Fix**: Direct RGB mixing/interpolation
- **Savings**: ~3x speedup on monochromatic/analogous modes

### OPT-BH-22: Dimension-Aware LOD
- **Issue**: High dimensions (6D+) have inherent visual complexity
- **Fix**: Use single octave noise for 6D+, 2 octaves for <6D
- **Savings**: ~40% speedup in volumetric disk for high dimensions

### OPT-BH-23: Removed Shell Emission
- **Issue**: `photonShellEmissionWithMask()` always returned vec3(0.0)
- **Fix**: Shell visual comes from adaptive step sizing instead
- **Savings**: Eliminates dead code

### OPT-BH-25: Unified Texture-Based Noise
- **Issue**: Old `noise3D()` used 8 sin calls (~80 ALU ops)
- **Fix**: Single `snoise()` texture fetch (~4 cycles)
- **Savings**: ~20x faster noise, unified across modules

### OPT-BH-26: Pre-Computed Lensing Falloff
- **Issue**: `min/max` operations computed every bend
- **Fix**: Pre-compute `uLensingFalloffStart`, `uLensingFalloffEnd` on CPU
- **Savings**: Simplifies proximity factor computation

### OPT-BH-27: Skip Einstein Rings in Fast Mode
- **Issue**: Einstein ring detection adds overhead
- **Fix**: Skip in `uFastMode` / `uUltraFastMode`
- **Savings**: ~5-10% in fast quality modes

### OPT-BH-28: Simplified Proximity Falloff
- **Issue**: 2 smoothsteps + mix for proximity factor
- **Fix**: Single smoothstep + linear mix
- **Savings**: Replaces 2 smoothsteps with 1

### OPT-BH-29: Strict Check for Distance Falloff = 2.0
- **Issue**: `pow(r, 2.0 - 2.0)` = `pow(r, 0.0)` = 1.0 (always)
- **Fix**: Special case `if (abs(beta - 2.0) < 0.01)` skip pow
- **Savings**: Avoids expensive pow() for standard 1/r² case

### OPT-BH-30: Early Exit for Near-Zero Spin
- **Issue**: Frame dragging computation runs even for tiny spin values
- **Fix**: `if (abs(uSpin) > 0.001)` early exit
- **Savings**: Skips frame dragging math for non-spinning black holes

### OPT-BH-31: Replace pow(x, 2.5) with x*x*sqrt(x)
- **Issue**: `pow()` is expensive operation
- **Fix**: `x * x * sqrt(x)` equivalent using cheaper operations
- **Savings**: Faster disk flare calculation

### OPT-BH-32: Conditional Noise Setup
- **Issue**: Noise computation even when `uNoiseAmount = 0.0`
- **Fix**: `if (uNoiseAmount > 0.01)` guards noise block
- **Savings**: Skips ~100+ ALU ops when noise disabled

---

## STORE/STATE MANAGEMENT

**Files**: `extendedObjectStore.ts` + `blackholeSlice.ts`

### BlackHoleConfig Structure

From `lib/geometry/extended/types.ts`:

```typescript
interface BlackHoleConfig {
  // Physics
  horizonRadius: number;           // Schwarzschild radius rs = 2M (0.05-20)
  spin: number;                    // Dimensionless spin chi = a/M (0-0.998)
  diskTemperature: number;         // Inner disk temperature (Kelvin)
  gravityStrength: number;         // Lensing intensity multiplier
  
  // Disk geometry
  manifestIntensity: number;       // Disk emission intensity
  manifestThickness: number;       // Disk thickness (fraction of rs)
  diskInnerRadiusMul: number;      // Inner radius multiplier (ISCO)
  diskOuterRadiusMul: number;      // Outer radius multiplier
  
  // Lensing
  dimensionEmphasis: number;       // alpha parameter for N-D scaling
  distanceFalloff: number;         // beta parameter (default 2.0)
  epsilonMul: number;              // Numerical stability epsilon
  bendScale: number;               // Ray bending scale
  bendMaxPerStep: number;          // Max bend angle per step
  lensingClamp: number;            // Maximum lensing clamping
  
  // Photon shell
  photonShellRadiusMul: number;    // R_p multiplier
  shellGlowStrength: number;       // Shell emission intensity
  
  // Quality/Raymarching
  maxSteps: number;                // Max iterations (32-512)
  stepBase: number;                // Base step size
  stepMin: number;                 // Minimum step size
  stepMax: number;                 // Maximum step size
  
  // Animation
  dopplerEnabled: boolean;         // Enable Doppler shift
  dopplerStrength: number;         // Doppler intensity
  diskRotationAngle: number;       // Rotation angle (radians)
  keplerianDifferential: number;   // 0=uniform, 1=full Keplerian
  
  // Effects
  colorAlgorithm: number;          // Color mode selector
  bloomBoost: number;              // HDR bloom multiplier
  
  // Performance
  qualityPreset: 'ultraFast' | 'fast' | 'normal' | 'high' | 'ultra'
}
```

### Store Slice Methods

```typescript
setBlackHoleHorizonRadius(radius)  // Recomputes derived values (ISCO, photon shell)
setBlackHoleSpin(spin)             // Updates Kerr radii
setBlackHoleDiskTemperature(temp)
setBlackHoleGravityStrength(k)
setBlackHoleDiskEmission(intensity)
setBlackHoleDiskThickness(thickness)
// ... 80+ individual setters

// Preset loading
setBlackHoleQualityPreset(preset)  // Applies predefined step/quality settings
applyBlackHolePreset(config)       // Loads entire config from preset

// Utilities
resetBlackHole()                   // Reset to defaults
```

### Data Flow to Shader

```
Zustand Store (extendedObjectStore)
  blackhole: BlackHoleConfig
    ↓
useBlackHoleUniformUpdates hook
  (Pre-computes derived values)
    ↓
Uniform Buffer Object (UBO)
  All uniforms: uHorizonRadius, uDiskInnerR, etc.
    ↓
Fragment Shader (main.glsl.ts)
  Uses uniforms throughout raymarch loop
```

---

## COMMON BUGS & FIXES

### Bug: Missing Early Horizon Check Post-Step
- **Symptom**: Ray steps from outside horizon to inside, exits via `maxDist` check before horizon check
- **Fix**: Add immediate `isInsideHorizon()` check right after stepping (line 428-432)

### Bug: Background Shows Through Horizon
- **Symptom**: Transparent black sticker artifact instead of opaque black
- **Fix**: Set `transmittance = 0.0` and `break` to prevent background sampling

### Bug: Disk Disappears at High Zoom
- **Symptom**: When zoomed out, entire black hole disappears
- **Fix**: Only apply "ray escaped disk" termination after ray has previously been inside disk region (`wasInsideDiskRegion` flag)

### Bug: Banding Artifacts in Disk
- **Symptom**: Visible ring patterns from discrete sampling
- **Fix**: Apply dithering via `interleavedGradientNoise()` + per-step jitter with golden ratio

### Bug: Einstein Ring Alignment With Disk
- **Symptom**: Crossing detection gives slightly different position than volumetric sampling
- **Fix**: Both use same plane y=0 (with optional warp offset)

---

## MISSING FEATURES (As of 2026-02-05)

1. **Shadows** - No shader code exists for volumetric shadow raymarching
2. **Noise Texture Fallback** - Has analytical hash fallback but suboptimal quality
3. **Blackbody LUT Generation** - Requires pre-baked texture in asset pipeline
4. **IBL Support** - `envMap: true` requires bind group 3, currently disabled
5. **Motion Blur Enhancement** - Basic implementation, not advanced per-pixel

---

## SHADER DEBUGGING TOOLS

### Debug Mode 1: Iteration Heatmap
```glsl
if (uDebugMode == 1) {
  float t = float(iterationsUsed) / float(effectiveMaxSteps)
  // Green (few iterations) → Yellow → Red (many iterations)
  accum.color = vec3(
    smoothstep(0.0, 0.5, t),           // R
    1.0 - smoothstep(0.5, 1.0, t),     // G
    0.0                                 // B
  )
}
```

Shows which pixels require more raymarching (hot spots near horizon).

---

## KEY TAKEAWAYS FOR WEBGPU PORT

1. **Coordinate Spaces**: Always transform to local space for raymarching, world for background
2. **Transmittance-Based Rendering**: Horizon = transmittance 0.0, not color mapping
3. **Pre-Compute Everything**: CPU-side pre-calculations of derived values are critical
4. **Adaptive Stepping**: Distance-scaled base steps are essential for efficiency
5. **Multiple Exit Conditions**: Raymarch loop has 5+ termination conditions (steps, distance, transmittance, horizon, escaped disk)
6. **Cache Aggressively**: Re-use computed values (diskR, diskH, ndRadius, angle) across loop iterations
7. **Texture LUTs for Performance**: Blackbody, noise, and other expensive functions use pre-baked textures
8. **Conditional Rendering**: Use preprocessor defines extensively to reduce per-pixel branching
9. **Importance Sampling**: Bias steps toward disk plane for efficient volumetric capture
10. **Bounding Volume**: Use spheroid (flattened sphere) to skip raymarching empty space above/below disk
