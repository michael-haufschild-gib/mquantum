# WebGL to WebGPU Skybox Animation Integration Guide

**Date:** 2026-02-05  
**Status:** Complete Reference for Animation Integration  
**Target:** Implementing animation in WebGPUGPUSkyboxRenderer to match WebGL behavior

---

## SECTION 1: WebGL Animation Math (EXACT)

### Source File
`/Users/Spare/Documents/code/mdimension/src/rendering/environment/Skybox.tsx` - Lines 429-479

### Animation Time Accumulation
```typescript
// Line 438: Time only accumulates when isPlaying is true
if (isPlaying) {
  const speed = skyboxMode === 'classic' && skyboxAnimationMode !== 'none' 
    ? skyboxAnimationSpeed 
    : 1.0
  
  // delta is in SECONDS (confirmed line 436 comment)
  timeRef.current += delta * speed
}
const t = timeRef.current // Use accumulated time
```

**Key:** 
- `delta` is in seconds (not milliseconds)
- Time only accumulates when BOTH `isPlaying` AND `skyboxAnimationMode !== 'none'`
- Speed multiplier only applies for CLASSIC mode with animation
- For PROCEDURAL modes, animation uses `proceduralSettings.timeScale` instead

### Animation Mode Math (CLASSIC ONLY)

Only applies when:
- `skyboxMode === 'classic'`
- `isPlaying === true`
- `skyboxAnimationMode !== 'none'`

#### 1. CINEMATIC Mode (Lines 454-458)
```typescript
case 'cinematic':
  finalRotY += t * 0.1                    // Smooth Y rotation
  finalRotX += Math.sin(t * 0.5) * 0.005 // Gentle X wobble (amplitude 0.005)
  finalRotZ += Math.cos(t * 0.3) * 0.003 // Gentle Z wobble (amplitude 0.003)
  break
```

**Description:** Smooth orbital rotation with gentle sinusoidal wobbles on X/Z axes  
**Frequencies:** Y=0.1, X_wave=0.5, Z_wave=0.3 (in rad/s)  
**Wobble amplitudes:** X=0.005, Z=0.003 (radians)

#### 2. HEATWAVE Mode (Lines 459-462)
```typescript
case 'heatwave':
  finalDistortion = 1.0 + Math.sin(t * 0.5) * 0.5 // Distortion oscillates 0.5-1.5
  finalRotY += t * 0.02                            // Slow Y rotation
  break
```

**Description:** Oscillating distortion shader effect with slow rotation  
**Distortion range:** 0.5 to 1.5 (base 1.0 ± 0.5)  
**Frequency:** 0.5 rad/s  
**Rotation speed:** 0.02 rad/s

#### 3. TUMBLE Mode (Lines 463-467)
```typescript
case 'tumble':
  finalRotX += t * 0.05  // X rotation (fastest)
  finalRotY += t * 0.07  // Y rotation (medium)
  finalRotZ += t * 0.03  // Z rotation (slowest)
  break
```

**Description:** Multi-axis rotation with different speeds per axis  
**Speeds (rad/s):** X=0.05, Y=0.07, Z=0.03

#### 4. ETHEREAL Mode (Lines 468-472)
```typescript
case 'ethereal':
  finalRotY += t * 0.05                           // Slow Y rotation
  finalHue = Math.sin(t * 0.1) * 0.1             // Hue oscillation ±0.1
  finalIntensity = skyboxIntensity * 
    (1.0 + Math.sin(t * 10) * 0.02)              // Intensity pulsing ±2%
  break
```

**Description:** Rotation with color and brightness pulsing  
**Rotation speed:** 0.05 rad/s  
**Hue oscillation:** ±0.1 (frequency 0.1 rad/s, amplitude 0.1)  
**Intensity oscillation:** ±2% (frequency 10 rad/s, 2% amplitude)

#### 5. NEBULA Mode (Lines 473-477)
```typescript
case 'nebula':
  finalHue = (t * 0.05) % 1.0        // Continuous hue shift (0-1 loop)
  finalRotY += t * 0.03              // Slow Y rotation
  finalIntensity = skyboxIntensity * 1.1  // 10% brightness boost (constant)
  break
```

**Description:** Hue cycle with slow rotation and constant brightness boost  
**Hue speed:** 0.05 rad/s (completes cycle every ~125 seconds)  
**Rotation speed:** 0.03 rad/s  
**Intensity boost:** +10% (constant, not animated)

### Store Fields Read by WebGL Skybox

From `Skybox.tsx` lines 104-117 (useEnvironmentStore):
- `skyboxMode` (SkyboxMode)
- `skyboxIntensity` (number)
- `skyboxRotation` (number - degrees, converted to radians at line 120)
- `skyboxAnimationMode` (SkyboxAnimationMode - 'none' | 'cinematic' | 'heatwave' | 'tumble' | 'ethereal' | 'nebula')
- `skyboxAnimationSpeed` (number - 0 to 5)
- `proceduralSettings` (SkyboxProceduralSettings object with sub-fields)

From `Skybox.tsx` line 117 (useAnimationStore):
- `isPlaying` (boolean)

### Store Field Locations & Types

**File:** `/Users/Spare/Documents/code/mdimension/src/stores/slices/skyboxSlice.ts`

| Field | Type | Location | Default | Range |
|-------|------|----------|---------|-------|
| `skyboxAnimationMode` | SkyboxAnimationMode | skyboxSlice line 35 | 'none' | 'none' \| 'cinematic' \| 'heatwave' \| 'tumble' \| 'ethereal' \| 'nebula' |
| `skyboxAnimationSpeed` | number | skyboxSlice line 36 | DEFAULT (0.4) | 0-5 (clamped lines 159-160) |
| `skyboxMode` | SkyboxMode | skyboxSlice line 30 | 'classic' | 'classic' \| 'procedural_aurora' \| 'procedural_nebula' \| ... |
| `skyboxIntensity` | number | skyboxSlice line 33 | 1.0 | 0-10 (clamped line 152) |
| `skyboxRotation` | number | skyboxSlice line 34 | 0 | Any (normalized to [0, 2π] at line 155) |
| `proceduralSettings` | SkyboxProceduralSettings | skyboxSlice line 41 | DEFAULT_SKYBOX_PROCEDURAL_SETTINGS | Object with sub-fields |

**File:** `/Users/Spare/Documents/code/mdimension/src/stores/animationStore.ts`

| Field | Type | Location | Default |
|-------|------|----------|---------|
| `isPlaying` | boolean | animationStore line 23 | true |
| `accumulatedTime` | number | animationStore line 35 | 0 |
| `speed` | number | animationStore line 26 | DEFAULT_SPEED (0.4) |

---

## SECTION 2: WebGPU Frame Context Data Flow

### Source File
`/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/WebGPUScene.tsx`

### Store Getter Registration (Lines 810-872)

Store getters are registered in an effect (line 811-872) that runs once after component mounts:

```typescript
// Line 813
graph.setStoreGetter('environment', () => useEnvironmentStore.getState())

// Line 833
graph.setStoreGetter('animation', () => useAnimationStore.getState())
```

### Frame Context Creation (in WebGPURenderGraph.ts)

**File:** `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` lines 414-431

Each frame (executed in WebGPUScene.tsx line 928 via `graph.execute()`):
1. `captureFrameContext(delta)` is called
2. All registered store getters are invoked: `stores[key] = getter()`
3. Returns `WebGPUFrameContext` with `stores` property containing all store data
4. Context is passed to each renderer's `execute()` method via `ctx.frame`

### Accessing Store Data in Renderers

In any WebGPU renderer's `execute()` method:
```typescript
execute(ctx: WebGPURenderContext): void {
  // Access environment store
  const env = ctx.frame?.stores?.['environment'] as ReturnType<typeof useEnvironmentStore.getState>
  
  // Access animation store
  const anim = ctx.frame?.stores?.['animation'] as ReturnType<typeof useAnimationStore.getState>
  
  // Read fields
  const isPlaying = anim?.isPlaying ?? false
  const skyboxAnimationMode = env?.skyboxAnimationMode ?? 'none'
  const skyboxIntensity = env?.skyboxIntensity ?? 1.0
}
```

**Complete Environment Store Fields Available:**
- skyboxSelection
- skyboxEnabled
- skyboxMode
- skyboxTexture
- skyboxIntensity
- skyboxRotation (in radians internally, or degrees in config?)
- skyboxAnimationMode
- skyboxAnimationSpeed
- skyboxHighQuality
- skyboxLoading
- proceduralSettings (object with all sub-fields)
- classicCubeTexture
- backgroundColor
- backgroundBlendMode
- (+ version tracking fields)

**Complete Animation Store Fields Available:**
- isPlaying
- speed
- direction (1 or -1)
- animatingPlanes (Set<string>)
- accumulatedTime (already accumulated in animation store!)
- getRotationDelta() method
- updateAccumulatedTime() method

---

## SECTION 3: WebGPUSkyboxRenderer Current Implementation

### Source File
`/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/renderers/WebGPUSkyboxRenderer.ts`

### Key Methods for Animation Integration

#### updateUniforms() (Lines 324-435)
- Currently reads `ctx.frame?.stores?.['environment']`
- Extracts `skyboxMode`, `skyboxIntensity`, `skyboxRotation`, `proceduralSettings`
- Maps to `SkyboxUniforms` structure
- **MISSING:** Animation mode handling, time accumulation, animation-specific uniform modulation

#### execute() (Lines 549-554)
- Currently detects `pipelineNeedsRecreation` flag
- **BUG:** Flag is immediately cleared without executing recreation (line 554 comment)
- Does not update animation uniforms based on time/mode

### Required Changes for Animation Integration

1. **Pass animation store to updateUniforms()**
   - Read `ctx.frame?.stores?.['animation']`
   - Extract `isPlaying` and `accumulatedTime`

2. **Compute animation-driven modulations**
   - Only when `isPlaying === true`
   - Only when `skyboxAnimationMode !== 'none'`
   - Only for CLASSIC skybox mode
   - Apply mode-specific math (see Section 1)

3. **Update uniform packing**
   - `uTime` should use accumulated time (like WebGL)
   - `uIntensity` should include animation-driven modulation
   - `uHue` should include animation-driven modulation
   - `uDistortion` should include animation-driven modulation
   - `uRotationMatrix` should include animation-driven rotation matrices

4. **Handle rotation matrix composition**
   - Base rotation from `skyboxRotation` (stored as radians in store)
   - Add animation-driven rotations on X, Y, Z axes based on mode
   - Compose into 4x4 matrix for GPU

---

## SECTION 4: Exact Store Field Names for WebGPU Integration

### Environment Store (useEnvironmentStore.getState())

```typescript
{
  // Skybox configuration
  skyboxSelection: SkyboxSelection // 'none' | texture name | procedural mode
  skyboxEnabled: boolean           // Derived from selection
  skyboxMode: SkyboxMode           // 'classic' | 'procedural_*'
  skyboxTexture: SkyboxTexture     // 'none' | specific texture name
  skyboxIntensity: number          // 0-10, clamped
  skyboxRotation: number           // Radians (0 to 2π)
  skyboxAnimationMode: SkyboxAnimationMode // 'none' | 'cinematic' | 'heatwave' | 'tumble' | 'ethereal' | 'nebula'
  skyboxAnimationSpeed: number     // 0-5, clamped
  skyboxHighQuality: boolean       // Texture quality flag
  skyboxLoading: boolean           // Loading state
  
  // Procedural settings (complex object)
  proceduralSettings: {
    scale: number
    complexity: number
    timeScale: number
    hue: number
    saturation: number
    evolution: number
    turbulence: number
    dualToneContrast: number
    sunIntensity: number
    sunPosition: [number, number, number]
    cosineCoefficients: { a, b, c, d } // Each is [number, number, number]
    distribution: { power, cycles, offset }
    syncWithObject: boolean
    aurora: { curtainHeight, waveFrequency }
    horizonGradient: { gradientContrast, spotlightFocus }
    ocean: { causticIntensity, depthGradient, bubbleDensity, surfaceShimmer }
    // ... more fields
  }
  
  // Background
  backgroundColor: string          // Hex color
  backgroundBlendMode: BackgroundBlendMode
  
  // Environment maps
  classicCubeTexture: THREE.CubeTexture | null
  
  // Versions for dirty-flag optimization
  iblVersion: number
  groundVersion: number
  skyboxVersion: number
  
  // ... other environment fields (ground, ibl, etc)
}
```

### Animation Store (useAnimationStore.getState())

```typescript
{
  isPlaying: boolean               // Master animation play state
  speed: number                    // Multiplier (0.1-3.0)
  direction: 1 | -1               // Direction
  animatingPlanes: Set<string>     // Which rotation planes are active
  accumulatedTime: number          // Already accumulated! Use directly in skybox
  
  // Methods
  play: () => void
  pause: () => void
  toggle: () => void
  setSpeed: (speed: number) => void
  updateAccumulatedTime: (delta: number) => void
  getRotationDelta: (deltaTimeMs: number) => number
  // ... more methods
}
```

---

## SECTION 5: Implementation Checklist for WebGPUGPUSkyboxRenderer

### Animation Integration Tasks

```
[ ] 1. Modify updateUniforms() signature to accept animation store
      - Current: updateUniforms(ctx: WebGPURenderContext)
      - Changes needed:
        a) Extract animation store from ctx.frame?.stores?.['animation']
        b) Store isPlaying and accumulatedTime in member variables
        c) Compute animation-driven modulations BEFORE packing uniforms

[ ] 2. Compute animation modulations (only for classic mode + isPlaying + mode !== 'none')
      - Reuse the exact math from Skybox.tsx lines 454-477
      - Compute finalRotX, finalRotY, finalRotZ (radians)
      - Compute finalHue, finalSaturation, finalDistortion, finalIntensity (modulation factors)
      - Use accumulatedTime from animation store (no re-accumulation needed!)

[ ] 3. Compose rotation matrices
      - Start with baseRotY from skyboxRotation store value
      - Add animation-driven rotations (finalRotX, finalRotY, finalRotZ)
      - Convert Euler(finalRotX, finalRotY, finalRotZ) to rotation matrix (3x3)
      - Use in vertex shader uniform

[ ] 4. Pack modulated uniforms
      - uTime: set to accumulatedTime (not delta-based!)
      - uIntensity: multiply skyboxIntensity by finalIntensity factor
      - uHue: set to finalHue (from animation)
      - uSaturation: set to finalSaturation (from animation)
      - uDistortion: set to finalDistortion or proceduralSettings.turbulence
      - uRotation: set to composed rotation matrix (base + animation)

[ ] 5. Handle edge cases
      - When animation is paused: don't apply animation math, use stored settings
      - When skyboxAnimationMode === 'none': don't apply animation math
      - When skyboxMode !== 'classic': use proceduralSettings.timeScale instead of skyboxAnimationSpeed
      - When classicCubeTexture not loaded: use placeholder

[ ] 6. Performance optimization
      - Only recompute animation math if isPlaying or animationMode changed
      - Cache composed rotation matrices to avoid per-frame Euler conversion
      - Reuse matrix and vector objects like WebGL does (matrix3Ref, eulerRef)
```

---

## SECTION 6: Key Differences: WebGL vs WebGPU Animation

| Aspect | WebGL | WebGPU |
|--------|-------|--------|
| **Time accumulation** | In SkyboxMesh.tsx useFrame callback | Read from animation store (already accumulated) |
| **Play state check** | useAnimationStore hook in component | ctx.frame?.stores?.['animation'].isPlaying |
| **Animation math** | Computed in useFrame, applied to uniforms | Should be computed in updateUniforms() |
| **Store access** | React hooks, re-renders trigger updates | Store getter called once per frame, renderer reads |
| **Matrix composition** | Euler + Matrix3 reusable objects | Should use similar pattern to avoid allocations |
| **Speed multiplier** | Only applies to classic + animation mode | Same logic, read from store |
| **Time variable** | Accumulated in `timeRef.current` | From `ctx.frame?.stores?.['animation'].accumulatedTime` |

---

## SECTION 7: Complete WebGL useFrame Code (Reference)

**File:** `/Users/Spare/Documents/code/mdimension/src/rendering/environment/Skybox.tsx` lines 401-593

### Key sections:
- **Lines 401-410:** Fade-in animation
- **Lines 414-420:** Dirty-flag material change detection
- **Lines 422-427:** Version counter checks for store changes
- **Lines 429-479:** Animation logic (CRITICAL)
- **Lines 481-511:** Rotation matrix composition and mode mapping
- **Lines 514-592:** Uniform updates (per-frame and dirty-flag gated)

### Critical animation flow:
1. Get isPlaying from animation store (line 117)
2. Accumulate time ONLY if isPlaying (lines 431-439)
3. Check skyboxAnimationMode (only if classic + isPlaying + mode !== 'none')
4. Apply mode-specific math to finalRotX/Y/Z, finalHue, finalIntensity, finalDistortion
5. Compose rotation matrix from Euler angles
6. Pack all uniforms including animated values
7. Update uniforms each frame (some gated by dirty flag)

---

## SECTION 8: Procedural Animation Note

For PROCEDURAL modes (aurora, nebula, etc.):
- Animation is handled in the shader itself using `uTime`
- `skyboxAnimationSpeed` is NOT used
- Instead, `proceduralSettings.timeScale` controls animation speed
- WebGL passes `uTime = t` (accumulated time) to shader
- Shader computes animation internally based on mode-specific formulas
- No need for animation mode in proceduralSettings (it's baked into the shader)

---

**End of Integration Guide**
