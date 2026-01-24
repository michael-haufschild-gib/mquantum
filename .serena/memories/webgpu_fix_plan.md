# WebGPU Fix Plan - Prioritized TODOs

_Last updated: 2026-01-24_

## P0 - CRITICAL (Blocks Basic Usage)

### P0.1 Connect extendedObjectStore to Renderers
**Files to modify:**
- `src/rendering/webgpu/renderers/WebGPUMandelbulbRenderer.ts`
- `src/rendering/webgpu/renderers/WebGPUQuaternionJuliaRenderer.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/renderers/WebGPUBlackHoleRenderer.ts`

**Tasks:**
- [ ] Add `graph.setStoreGetter('extended', ...)` in WebGPUScene.tsx
- [ ] In each renderer's `execute()`:
  - [ ] Call `this.graph.getStoreGetter('extended')()`
  - [ ] Extract object-specific params (e.g., `state.mandelbulb.power`)
  - [ ] Write to uniform buffer before draw

**Mandelbulb uniforms needed:**
- power, iterations, escapeRadius, resolution
- powerAnimationEnabled, animatedPower
- alternatePowerEnabled, alternatePowerValue, alternatePowerBlend
- sdfMaxIterations, sdfSurfaceDistance
- parameterValues (dimension slicing)

**Julia uniforms needed:**
- juliaConstant[4], power, bailoutRadius
- surfaceThreshold, maxRaymarchSteps, qualityMultiplier
- colorMode, colorPower, colorCycles, colorOffset

**Schrödinger uniforms needed:**
- quantumMode, termCount, maxQuantumNumber
- timeScale, fieldScale, densityGain, powderScale
- emission*, erosion*, curl*, dispersion*
- shadowsEnabled, aoEnabled/Strength/Steps

**BlackHole uniforms needed:**
- horizonRadius, spin, diskTemperature
- gravityStrength, manifoldIntensity, manifoldThickness
- lensing params (20+)
- photon shell params (8+)
- disk/manifold params (15+)
- effects (doppler, motion blur, SSS)

---

### P0.2 Connect rotationStore to Renderers
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- All 6 renderers

**Tasks:**
- [ ] Add `graph.setStoreGetter('rotation', ...)` in WebGPUScene.tsx
- [ ] Create `updateBasisVectors()` utility for WebGPU
- [ ] In each renderer's `execute()`:
  - [ ] Call rotation store getter
  - [ ] Compute N-D rotation matrices
  - [ ] Update uBasisX[], uBasisY[], uBasisZ[], uOrigin[] uniforms

---

### P0.3 Connect transformStore to Renderers
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- All 6 renderers

**Tasks:**
- [ ] Add `graph.setStoreGetter('transform', ...)` in WebGPUScene.tsx
- [ ] In each renderer's `execute()`:
  - [ ] Get uniformScale, perAxisScale
  - [ ] Apply to model matrix or scale uniforms

---

### P0.4 Connect pbrStore to Renderers
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- All renderers that use PBR

**Tasks:**
- [ ] Add `graph.setStoreGetter('pbr', ...)` in WebGPUScene.tsx
- [ ] In renderers' `execute()`:
  - [ ] Get face/edge/ground material properties
  - [ ] Update roughness, metallic, specularIntensity, specularColor uniforms

---

## P1 - HIGH (Core Features)

### P1.1 Connect lightingStore to All Passes
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- All object renderers
- ScenePass, EnvironmentCompositePass

**Tasks:**
- [ ] Verify `graph.setStoreGetter('lighting', ...)` exists
- [ ] In renderers' `execute()`:
  - [ ] Read uNumLights, uLightTypes[], uLightPositions[], etc.
  - [ ] Read shadow settings (enabled, quality, softness)
  - [ ] Read ambient (enabled, intensity, color)
  - [ ] Read tone mapping (algorithm, exposure)
  - [ ] Bind to lighting uniform buffer

**Light uniforms (per light, up to 8):**
- type, enabled, position, direction
- color, intensity, range, decay
- spotAngle, spotPenumbra, spotCosInner, spotCosOuter

---

### P1.2 Complete appearanceStore Connection
**Files to modify:**
- All object renderers

**Tasks:**
- [ ] In renderers' `execute()`:
  - [ ] Read facesVisible, edgesVisible
  - [ ] Read faceColor, edgeColor
  - [ ] Read fresnelEnabled, fresnelIntensity
  - [ ] Read sssEnabled, sssIntensity, sssColor, sssThickness, sssJitter
  - [ ] Read shaderType (surface/wireframe)

---

### P1.3 Integrate CinematicPass
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- `src/rendering/webgpu/passes/CinematicPass.ts`

**Tasks:**
- [ ] Add CinematicPass to setupRenderPasses()
- [ ] Position after TonemappingPass, before ToScreenPass
- [ ] Read from postProcessingStore:
  - [ ] cinematicEnabled, cinematicAberration
  - [ ] cinematicVignette, cinematicGrain

---

### P1.4 Integrate BokehPass
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- `src/rendering/webgpu/passes/BokehPass.ts`

**Tasks:**
- [ ] Add BokehPass to setupRenderPasses()
- [ ] Position after MainObjectMRTPass
- [ ] Read from postProcessingStore:
  - [ ] bokehEnabled, bokehFocusMode, bokehBlurMethod
  - [ ] bokehWorldFocusDistance, bokehWorldFocusRange
  - [ ] bokehScale, bokehFocalLength

---

### P1.5 Integrate RefractionPass
**Files to modify:**
- `src/rendering/webgpu/WebGPUScene.tsx`
- `src/rendering/webgpu/passes/RefractionPass.ts`

**Tasks:**
- [ ] Add RefractionPass to setupRenderPasses()
- [ ] Read from postProcessingStore:
  - [ ] refractionEnabled, refractionIOR
  - [ ] refractionStrength, refractionChromaticAberration

---

## P2 - MEDIUM (Full Feature Parity)

### P2.1 Complete postProcessingStore Connections

**BloomPass params:**
- [ ] bloomThreshold, bloomRadius, bloomSmoothing, bloomLevels

**GTAOPass params:**
- [ ] ssaoIntensity (rename from aoIntensity)

**SSRPass params:**
- [ ] ssrIntensity, ssrMaxDistance, ssrThickness
- [ ] ssrFadeStart, ssrFadeEnd, ssrQuality

---

### P2.2 Integrate SMAAPass
**Tasks:**
- [ ] Add SMAAPass to setupRenderPasses()
- [ ] Add 'smaa' option to antialiasing selector
- [ ] Position as alternative to FXAAPass

---

### P2.3 Integrate PaperTexturePass
**Tasks:**
- [ ] Add PaperTexturePass to setupRenderPasses()
- [ ] Read all paper* params from postProcessingStore

---

### P2.4 Integrate FrameBlendingPass
**Tasks:**
- [ ] Add FrameBlendingPass to setupRenderPasses()
- [ ] Read frameBlendingEnabled, frameBlendingFactor

---

### P2.5 Integrate GravitationalLensingPass
**Tasks:**
- [ ] Add GravitationalLensingPass to setupRenderPasses()
- [ ] Read gravity* params from postProcessingStore

---

### P2.6 Integrate ScreenSpaceLensingPass
**Tasks:**
- [ ] Add ScreenSpaceLensingPass to setupRenderPasses()
- [ ] Connect to BlackHole renderer output

---

### P2.7 Complete environmentStore Connection
**Tasks:**
- [ ] Read IBL quality, intensity
- [ ] Read ground grid color, spacing
- [ ] Read active walls configuration
- [ ] Read ground offset, size scale
- [ ] Read procedural skybox settings per mode

---

### P2.8 Complete performanceStore Connection
**Tasks:**
- [ ] Read temporalReprojectionEnabled
- [ ] Read qualityMultiplier
- [ ] Read debugMode (0-3)
- [ ] Read shaderOverrides

---

## P3 - POLISH (Optimization & Edge Cases)

### P3.1 Port Black Hole Optimizations
**28 optimizations to port:**
- [ ] OPT-BH-1 through OPT-BH-28
- Location: WebGL blackhole shader files
- Target: WebGPU blackhole WGSL

---

### P3.2 Complete Color Algorithm Parity
**Tasks:**
- [ ] Algorithm 11 (accretion gradient) - full implementation
- [ ] Algorithm 12 (gravitational redshift) - full implementation

---

### P3.3 Add Missing Schrödinger Coloring Modes
**Tasks:**
- [ ] Phase coloring mode
- [ ] Mixed coloring mode
- [ ] Blackbody coloring mode

---

### P3.4 Complete Uniform Parity

**Mandelbulb (~15 missing):**
- [ ] phaseShiftEnabled, phaseSpeed, phaseAmplitude
- [ ] sliceAnimationEnabled, sliceSpeed, sliceAmplitude
- [ ] dimensionMixEnabled, mixIntensity, mixTime

**Julia (~15 missing):**
- [ ] lchLightness, lchChroma
- [ ] shadowEnabled, shadowQuality, shadowSoftness
- [ ] fogEnabled, fogContribution, internalFogDensity

**Schrödinger (~20 missing):**
- [ ] hydrogen orbital params (n, l, m, bohrRadius)
- [ ] hydrogenND params (extraDimN[], extraDimOmega[])
- [ ] erosionNoiseType, erosionHQ
- [ ] curlBias values

**BlackHole (~55 missing):**
- [ ] All lensing params (15+)
- [ ] All photon shell params (8+)
- [ ] All disk/manifold params (15+)
- [ ] Jets params (if jets enabled)
- [ ] God rays params

---

## Verification Checklist

After each fix:
- [ ] Toggle UI control → verify visual change
- [ ] Slide parameter → verify smooth transition
- [ ] Compare WebGL vs WebGPU output
- [ ] Check console for WebGPU errors
- [ ] Verify no performance regression

---

## Estimated Effort

| Priority | Tasks | Est. Effort |
|----------|-------|-------------|
| P0 | 4 major | Large (store plumbing) |
| P1 | 5 major | Medium (pass integration) |
| P2 | 8 medium | Medium (params + passes) |
| P3 | 4 polish | Small-Medium |

Total: ~21 task groups
