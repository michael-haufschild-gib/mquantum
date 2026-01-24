# WebGL Feature Checklist for WebGPU Port - Phase 1

This document catalogs every feature and user-configurable option in the WebGL implementation.
Created for 1:1 WebGPU port reference.

---

## 1. OBJECT TYPES (src/rendering/renderers/)

### 1.1 Mandelbulb (3D-11D Fractal)
- **Dimensions**: 3D, 4D, 5D, 6D, 7D, 8D, 9D, 10D, 11D
- **SDF files**: sdf3d, sdf4d, sdf5d, sdf6d, sdf7d, sdf8d, sdf9d, sdf10d, sdf11d
- **Parameters**:
  - maxIterations (10-500)
  - escapeRadius (2.0-16.0)
  - mandelbulbPower (2-16)
  - scale (0.1-10.0)
  - extent (0.001-10.0)
  - center (N-dimensional array)
  - visualizationAxes [3 indices]
  - parameterValues (extra dimension slice positions, -2 to +2)
  - qualityPreset
  - resolution (16, 24, 32, 48, 64, 96, 128)
  - colorMode (boundaryOnly, etc.)
  - palette, customPalette
  - invertColors
  - interiorColor
  - paletteCycles (1-20)
  - renderStyle
  - pointSize (1-20)
  - boundaryThreshold [min, max]
- **Animation**:
  - powerAnimationEnabled
  - powerMin (2.0-16.0), powerMax (3.0-24.0), powerSpeed (0.01-0.2)
  - alternatePowerEnabled, alternatePowerValue, alternatePowerBlend
  - sliceAnimationEnabled, sliceSpeed (0.01-0.1), sliceAmplitude (0.1-1.0)
  - phaseShiftEnabled, phaseSpeed (0.01-0.2), phaseAmplitude (0-PI/4)
- **Rendering**:
  - roughness (0.0-1.0)
  - sssEnabled, sssIntensity (0-2), sssColor, sssThickness (0.1-5.0)
  - sdfMaxIterations (5-100)
  - sdfSurfaceDistance (0.00005-0.01)

### 1.2 Quaternion Julia (3D-11D Fractal)
- **Dimensions**: 3D-11D
- **SDF files**: sdf3d, sdf4d, sdf5d, sdf6d, sdf7d, sdf8d, sdf9d, sdf10d, sdf11d
- **Core Parameters**:
  - juliaConstant [4 components, -2 to +2 each]
  - power (2-8)
  - maxIterations (8-512)
  - bailoutRadius (2.0-16.0)
  - scale (0.5-5.0)
  - surfaceThreshold (0.0001-0.01)
  - maxRaymarchSteps (32-1024)
  - qualityMultiplier (0.25-1.0)
  - parameterValues (extra dimensions)
- **Color**:
  - colorMode (0-7)
  - baseColor
  - cosineCoefficients {a, b, c, d}
  - colorPower (0.25-4.0)
  - colorCycles (0.5-5.0)
  - colorOffset (0.0-1.0)
  - lchLightness (0.1-1.0)
  - lchChroma (0.0-0.4)
- **Shadows**:
  - shadowEnabled
  - shadowQuality (0-3)
  - shadowSoftness (0.0-2.0)
  - shadowAnimationMode (0-2)
- **Rendering**:
  - roughness (0.0-1.0)
  - sssEnabled, sssIntensity, sssColor, sssThickness
  - fogEnabled, fogContribution (0-2), internalFogDensity (0-1)
  - sdfMaxIterations, sdfSurfaceDistance

### 1.3 Schrödinger (Quantum Wavefunction, 3D-11D)
- **Quantum Modes**: harmonicOscillator, hydrogen, hydrogenND
- **SDF files**: sdf3d, sdf4d, sdf5d, sdf6d, sdf7d, sdf8d, sdf9d, sdf10d, sdf11d
- **Quantum Parameters**:
  - presetName (named presets or 'custom')
  - seed, termCount (1-8), maxQuantumNumber (2-6), frequencySpread (0-0.5)
  - quantumMode
- **Hydrogen Orbital**:
  - hydrogenPreset
  - principalQuantumNumber n (1-7)
  - azimuthalQuantumNumber l (0 to n-1)
  - magneticQuantumNumber m (-l to +l)
  - useRealOrbitals
  - bohrRadiusScale (0.5-3.0)
- **Hydrogen ND** (4D+):
  - hydrogenNDPreset
  - extraDimQuantumNumbers [8 values, 0-6]
  - extraDimOmega [8 values, 0.1-2.0]
  - extraDimFrequencySpread (0-0.5)
- **Volume Rendering**:
  - scale (0.1-2.0)
  - timeScale (0.1-2.0)
  - fieldScale (0.5-2.0)
  - densityGain (0.1-5.0)
  - powderScale (0.0-2.0)
  - sampleCount (16-128)
  - raymarchQuality
  - emissionIntensity (0-5), emissionThreshold (0-1), emissionColorShift (-1 to +1), emissionPulsing
  - rimExponent (1-10)
  - scatteringAnisotropy (-0.9 to +0.9)
  - roughness (0-1)
- **Fog**:
  - fogIntegrationEnabled
  - fogContribution (0-2)
  - internalFogDensity (0-1)
- **SSS**:
  - sssEnabled, sssIntensity (0-2), sssColor, sssThickness (0.1-5), sssJitter (0-1)
- **Erosion**:
  - erosionStrength (0-1), erosionScale (0.25-4), erosionTurbulence (0-1)
  - erosionNoiseType, erosionHQ
- **Curl Noise Animation**:
  - curlEnabled, curlStrength (0-1), curlScale (0.25-4), curlSpeed (0.1-5), curlBias
- **Dispersion**:
  - dispersionEnabled, dispersionStrength (0-1), dispersionDirection, dispersionQuality
- **Shadows**:
  - shadowsEnabled, shadowStrength (0-2), shadowSteps (1-8)
- **Ambient Occlusion**:
  - aoEnabled, aoStrength (0-2), aoQuality (3-8), aoRadius (0.1-2), aoColor
- **Nodal Surfaces**:
  - nodalEnabled, nodalColor, nodalStrength (0-2)
- **Visual Effects**:
  - energyColorEnabled, shimmerEnabled, shimmerStrength (0-1)
  - isoEnabled, isoThreshold (-6 to 0)
- **Animation**:
  - sliceAnimationEnabled, sliceSpeed, sliceAmplitude
  - spreadAnimationEnabled, spreadAnimationSpeed (0.1-2)
  - phaseAnimationEnabled

### 1.4 Black Hole (3D-11D, Kerr Metric)
- **Physics-Based Parameters**:
  - horizonRadius (0.05-20) - Schwarzschild radius
  - spin (0-0.998) - Kerr spin parameter
  - diskTemperature (1000-40000 K) - auto-computes baseColor
  - gravityStrength (0-10)
  - manifoldIntensity (0-20), manifoldThickness (0-2)
  - photonShellWidth (0-0.3)
  - timeScale (0-5)
  - baseColor, paletteMode
  - bloomBoost (0-5)
- **Lensing**:
  - dimensionEmphasis (0-2)
  - distanceFalloff (0.5-4)
  - epsilonMul (1e-5 to 0.5)
  - bendScale (0-5), bendMaxPerStep (0-0.8)
  - lensingClamp (0-100)
  - rayBendingMode
  - lensingFalloff (0.5-4)
- **Photon Shell**:
  - photonShellRadiusMul (1.0-2.0)
  - photonShellRadiusDimBias (0-0.5)
  - shellGlowStrength (0-20), shellGlowColor
  - shellStepMul (0.05-1), shellContrastBoost (0-3)
- **Manifold/Disk**:
  - manifoldType
  - diskInnerRadiusMul (0-10), diskOuterRadiusMul (0.1-200)
  - radialSoftnessMul (0-2)
  - thicknessPerDimMax (1-10)
  - highDimWScale (1-10)
  - swirlAmount (0-2)
  - noiseScale (0.1-10), noiseAmount (0-1)
  - multiIntersectionGain (0-3)
  - keplerianDifferential (0-1)
- **Rendering Quality**:
  - raymarchQuality (presets)
  - maxSteps (16-512), stepBase (0.001-1), stepMin (0.0001-0.5), stepMax (0.001-5)
  - stepAdaptG (0-5), stepAdaptR (0-2)
  - enableAbsorption, absorption (0-10), transmittanceCutoff (0-0.2)
  - farRadius (1-100)
- **Lighting**:
  - lightingMode
  - roughness (0-1), specular (0-1), ambientTint (0-1)
  - shadowEnabled, shadowSteps (4-64), shadowDensity (0-10)
- **Effects**:
  - dopplerEnabled, dopplerStrength (0-2)
  - temporalAccumulationEnabled
  - motionBlurEnabled, motionBlurStrength (0-2), motionBlurSamples (1-8), motionBlurRadialFalloff (0-5)
  - deferredLensingEnabled, deferredLensingStrength (0-2), deferredLensingRadius (0-10), deferredLensingChromaticAberration (0-1)
  - sceneObjectLensingEnabled, sceneObjectLensingStrength (0-2)
- **Polar Jets**:
  - jetsEnabled
  - jetsHeight (10-50), jetsWidth (0.1-0.5), jetsIntensity (0-10)
  - jetsColor, jetsFalloff (1-5), jetsNoiseAmount (0-1), jetsPulsation (0-2)
  - jetsGodRaysEnabled, jetsGodRaysIntensity (0-2), jetsGodRaysSamples (16-128), jetsGodRaysDecay (0.9-1)
- **Animation**:
  - pulseEnabled, pulseSpeed (0-2), pulseAmount (0-1)
  - sliceAnimationEnabled, sliceSpeed (0.01-0.1), sliceAmplitude (0.1-1)
- **Cross-Section (4D+)**:
  - parameterValues (extra dimension slice positions)
- **Environment**:
  - skyCubemapResolution (256, 512, 1024)

### 1.5 Polytope (Hypercube, Simplex, Cross-Polytope, Wythoff)
- **Types**: hypercube, simplex, cross-polytope, wythoff
- **Parameters**:
  - scale (0.5-8.0)
- **Per-Type Default Scales**

### 1.6 TubeWireframe
- **Renders edges as 3D tubes**
- **Parameters via material slice**:
  - edgeThickness (0-5)
  - tubeCaps (boolean)

---

## 2. COLOR ALGORITHMS (14 total)

1. **monochromatic** - Same hue, varying lightness
2. **analogous** - Hue varies ±30° from base
3. **cosine** - Inigo Quilez smooth gradient
4. **normal** - Based on surface normal direction
5. **distance** - Based on orbit trap/distance field
6. **lch** - Perceptually uniform Oklab/LCH
7. **multiSource** - Blend depth + orbitTrap + normal
8. **radial** - 3D distance from origin
9. **phase** - Angular (XZ rotation)
10. **mixed** - Angular + depth
11. **blackbody** - Heat-based (Schroedinger/BlackHole)
12. **accretionGradient** - BlackHole only
13. **gravitationalRedshift** - BlackHole only
14. **dimension** - Polytope N-D axis coloring

### Color Parameters:
- **CosineCoefficients**: a, b, c, d (each [R,G,B])
- **DistributionSettings**: power (0.25-4), cycles (0.5-5), offset (0-1)
- **MultiSourceWeights**: depth, orbitTrap, normal (each 0-1)
- **LCH**: lightness (0.1-1), chroma (0-0.4)

---

## 3. LIGHTING SYSTEM

### 3.1 Basic Lighting
- lightEnabled, lightColor, lightHorizontalAngle, lightVerticalAngle
- ambientEnabled, ambientIntensity (0-1), ambientColor
- showLightIndicator
- lightStrength (0-3)

### 3.2 Multi-Light System (up to 4 lights)
- **Light Types**: point, directional, spot
- **Per-Light Properties**:
  - id, name, type, enabled
  - position [x,y,z], rotation [x,y,z]
  - color, intensity (0.1-3)
  - coneAngle (1-120°) - spot only
  - penumbra (0-1) - spot only
  - range (0-100), decay (0.1-3)
- **Transform Modes**: translate, rotate
- showLightGizmos, selectedLightId, isDraggingLight

### 3.3 Tone Mapping
- toneMappingEnabled
- toneMappingAlgorithm: linear, reinhard, aces, filmic
- exposure (0.1-3)

### 3.4 Shadow System
- shadowEnabled
- shadowQuality: low, medium, high, ultra
- shadowSoftness (range defined in constants)
- shadowAnimationMode: pause, low, full
- shadowMapBias (0-0.01), shadowMapBlur (0-10)

---

## 4. PBR MATERIAL SYSTEM (3 targets)

### Targets: face, edge, ground
Each has:
- roughness (0.04-1.0)
- metallic (0.0-1.0)
- specularIntensity (0.0-2.0)
- specularColor (hex)

---

## 5. POST-PROCESSING EFFECTS

### 5.1 Bloom
- bloomEnabled
- bloomIntensity (0-2)
- bloomThreshold (0-1)
- bloomRadius (0-1)
- bloomSmoothing (0-1)
- bloomLevels (1-5)

### 5.2 Bokeh (Depth of Field)
- bokehEnabled
- bokehFocusMode, bokehBlurMethod
- bokehWorldFocusDistance (1-50)
- bokehWorldFocusRange (1-100)
- bokehScale (0-3)
- bokehFocalLength (0.01-1)
- bokehSmoothTime (0-2)
- bokehShowDebug

### 5.3 SSR (Screen-Space Reflections)
- ssrEnabled
- ssrIntensity (0-1)
- ssrMaxDistance (1-50)
- ssrThickness (0.01-2)
- ssrFadeStart (0-1), ssrFadeEnd (0-1)
- ssrQuality

### 5.4 Refraction
- refractionEnabled
- refractionIOR (1.0-2.5)
- refractionStrength (0-1)
- refractionChromaticAberration (0-1)

### 5.5 Anti-Aliasing
- antiAliasingMethod: none, fxaa, smaa

### 5.6 Cinematic
- cinematicEnabled
- cinematicAberration (0-0.1)
- cinematicVignette (0-3)
- cinematicGrain (0-0.2)

### 5.7 SSAO (Screen-Space AO)
- ssaoEnabled
- ssaoIntensity (0-2)

### 5.8 Gravitational Lensing (Environment)
- gravityEnabled
- gravityStrength (0.1-10)
- gravityDistortionScale (0.1-5)
- gravityFalloff (0.5-4)
- gravityChromaticAberration (0-1)

### 5.9 Paper Texture Effect
- paperEnabled
- paperContrast, paperRoughness, paperFiber, paperFiberSize
- paperCrumples, paperCrumpleSize
- paperFolds, paperFoldCount (1-15)
- paperDrops, paperFade
- paperSeed (0-1000)
- paperColorFront, paperColorBack
- paperQuality, paperIntensity (0-1)

### 5.10 Frame Blending
- frameBlendingEnabled
- frameBlendingFactor (0-1)

### 5.11 Depth Buffer
- objectOnlyDepth (exclude walls from depth effects)

---

## 6. RENDER GRAPH PASSES (src/rendering/graph/passes/)

### Core Passes:
- CopyPass, FullscreenPass, ScenePass, ToScreenPass

### G-Buffer Passes:
- DepthPass, NormalPass
- MainObjectMRTPass
- TemporalCloudPass, TemporalCloudDepthPass
- TemporalDepthCapturePass

### Effect Passes:
- BloomPass, BokehPass
- CinematicPass, PaperTexturePass
- CompositePass (with blend modes)
- FXAAPass, SMAAPass
- GravitationalLensingPass
- RefractionPass
- ScreenSpaceLensingPass
- SSRPass
- FrameBlendingPass

### AO Passes:
- GTAOPass (Ground Truth AO)

### Tone Mapping:
- ToneMappingPass
- ToneMappingCinematicPass

### Debug Passes:
- BufferPreviewPass (depth, normal, color modes)
- DebugOverlayPass

### Environment Passes:
- CubemapCapturePass
- EnvironmentCompositePass (with ShellGlowConfig)

### Black Hole Jet Passes:
- JetsRenderPass
- JetsCompositePass
- GodRaysPass

---

## 7. SKYBOX/ENVIRONMENT

### Skybox Selection Types:
- 'none' - disabled
- Classic textures: space_blue, etc.
- Procedural modes: procedural_aurora, procedural_nebula, procedural_crystalline, procedural_horizon, procedural_ocean, procedural_twilight

### Skybox Parameters:
- skyboxEnabled, skyboxMode, skyboxTexture
- skyboxIntensity (0-10)
- skyboxRotation (0 to 2π)
- skyboxAnimationMode, skyboxAnimationSpeed (0-5)
- skyboxHighQuality
- proceduralSettings (mode-specific)
- backgroundColor, backgroundBlendMode

---

## 8. GROUND/ENVIRONMENT

### Ground Plane:
- activeWalls: floor, back, left, right, top
- groundPlaneOffset (0-10)
- groundPlaneColor
- groundPlaneType
- groundPlaneSizeScale (1-10)

### Ground Grid:
- showGroundGrid
- groundGridColor
- groundGridSpacing (0.5-5)

### IBL (Image-Based Lighting):
- iblQuality
- iblIntensity (0-2)

---

## 9. VISUAL/RENDER SETTINGS

### Display:
- edgesVisible, facesVisible
- shaderType: surface, wireframe
- fresnelEnabled, fresnelIntensity (0-1)

### Material:
- edgeThickness (0-5)
- faceOpacity (0-1)
- tubeCaps
- faceEmission (0-5), faceEmissionThreshold (0-1)
- faceEmissionColorShift (-1 to +1)
- faceEmissionPulsing
- faceRimFalloff (0-10)

### Advanced Rendering (Global SSS):
- sssEnabled, sssIntensity (1.0)
- sssColor, sssThickness (1.0)
- sssJitter (0.2)

---

## 10. GEOMETRY SYSTEM

### Dimensions: 3 to 11 (MIN_DIMENSION=3, MAX_DIMENSION=11)

### Object Types:
- hypercube, simplex, cross-polytope, wythoff (polytopes)
- mandelbulb, quaternion-julia, schroedinger (fractals/quantum)
- blackhole (gravitational)
- tubewireframe, clifford-torus, nested-torus, root-system

---

---

## 11. SHADER BLOCKS INVENTORY (PHASE 2)

### 11.1 Shared Core (src/rendering/shaders/shared/core/)

#### precision.glsl.ts
- `#version 300 es` header
- `precision highp float;`
- `precision highp sampler2D;`

#### constants.glsl.ts
**Performance Constants:**
- MAX_MARCH_STEPS_HQ: 128 (high quality)
- MAX_MARCH_STEPS_LQ: 64 (low quality during animation)
- MAX_ITER_HQ: 256 / MAX_ITER_LQ: 30
- SURF_DIST_HQ: 0.002 / SURF_DIST_LQ: 0.002
- BOUND_R: 2.0

**Numerical Stability Epsilons:**
- EPS: 1e-6 (general)
- EPS_POSITION: 1e-6 (position/direction)
- EPS_DIVISION: 0.0001 (division guards)
- EPS_UV: 0.001 (UV/radius)
- EPS_WEIGHT: 0.001 (blend weights)

**Math Constants:**
- PI, HALF_PI, TAU

**Multi-Light Constants:**
- MAX_LIGHTS: 4
- LIGHT_TYPE_POINT: 0, LIGHT_TYPE_DIRECTIONAL: 1, LIGHT_TYPE_SPOT: 2

**Palette Modes:**
- PAL_MONO, PAL_ANALOG, PAL_COMP, PAL_TRIAD, PAL_SPLIT

#### uniforms.glsl.ts
**Core Uniforms:**
- uResolution (vec2)
- uCameraPosition (vec3)
- uPower, uIterations, uEscapeRadius (float)
- uColor (vec3)
- uModelMatrix, uInverseModelMatrix, uProjectionMatrix, uViewMatrix (mat4)
- uDimension (int)

**N-Dimensional Basis Vectors:**
- uBasisX[11], uBasisY[11], uBasisZ[11], uOrigin[11] (float arrays)

**Multi-Light System:**
- uNumLights (int)
- uLightsEnabled[MAX_LIGHTS] (bool[])
- uLightTypes[MAX_LIGHTS] (int[])
- uLightPositions[MAX_LIGHTS] (vec3[])
- uLightDirections[MAX_LIGHTS] (vec3[])
- uLightColors[MAX_LIGHTS] (vec3[])
- uLightIntensities[MAX_LIGHTS] (float[])
- uSpotAngles[MAX_LIGHTS], uSpotPenumbras[MAX_LIGHTS] (float[])
- uSpotCosInner[MAX_LIGHTS], uSpotCosOuter[MAX_LIGHTS] (float[])
- uLightRanges[MAX_LIGHTS], uLightDecays[MAX_LIGHTS] (float[])

**Global Lighting:**
- uAmbientEnabled, uAmbientIntensity (float)
- uAmbientColor (vec3)
- uSpecularIntensity, uSpecularPower (float)
- uSpecularColor (vec3)
- uMetallic (float)

**Fresnel Rim:**
- uFresnelEnabled (bool)
- uFresnelIntensity (float)
- uRimColor (vec3)

**Advanced Color System:**
- uColorAlgorithm (int, 0-13)
- uCosineA, uCosineB, uCosineC, uCosineD (vec3)
- uDistPower, uDistCycles, uDistOffset (float)
- uLchLightness, uLchChroma (float)
- uMultiSourceWeights (vec3)

**Performance:**
- uFastMode (bool)
- uQualityMultiplier (float, 0.25-1.0)

**View Projection:**
- uViewProjectionMatrix, uInverseViewProjectionMatrix (mat4)

**Temporal Reprojection:**
- uPrevDepthTexture (sampler2D, legacy)
- uPrevPositionTexture (sampler2D, xyz=world pos, w=ray distance)
- uPrevViewProjectionMatrix, uPrevInverseViewProjectionMatrix (mat4)
- uTemporalEnabled (bool)
- uDepthBufferResolution (vec2)
- uTemporalSafetyMargin (float, 0.5-0.95)

**Shadow System:**
- uShadowEnabled (bool)
- uShadowQuality (int, 0-3: low/medium/high/ultra)
- uShadowSoftness (float)

**AO:**
- uAoEnabled (bool)

**Debug/Profile:**
- uProfileMode (int, 0-4)
- uDebugMode (int, 0-3: off/iteration heatmap/depth/normals)
- uSampleQuality (int)

---

### 11.2 Shared Lighting (src/rendering/shaders/shared/lighting/)

#### multi-light.glsl.ts
**Functions:**
- `fastNormalize(vec3 v)` - inversesqrt optimization
- `fastNormalizeWithLength(vec3 v, out float len)`
- `getLightDirection(int lightIndex, vec3 fragPos)` - handles point/directional/spot
- `getSpotAttenuation(int lightIndex, vec3 lightToFrag)` - cone falloff with penumbra
- `getDistanceAttenuation(int lightIndex, float distance)` - Three.js formula
- `getBasisRotation()` - 3x3 rotation from N-D basis vectors

#### ggx.glsl.ts
**GGX PBR Specular Functions:**
- `distributionGGX(vec3 N, vec3 H, float roughness)` - Trowbridge-Reitz NDF
- `geometrySchlickGGX(float NdotV, float roughness)` - Smith masking
- `geometrySmith(vec3 N, vec3 V, vec3 L, float roughness)` - Combined GGX geometry
- `fresnelSchlick(float cosTheta, vec3 F0)` - Fresnel with x^5 optimization
- `computePBRSpecular(vec3 N, vec3 V, vec3 L, float roughness, vec3 F0)` - Cook-Torrance BRDF

#### sss.glsl.ts
**Subsurface Scattering Functions:**
- `sssHash(vec2 p)` - Fast hash for screen-space noise
- `computeSSS(lightDir, viewDir, normal, distortion, power, thickness, jitter, fragCoord)`
  - Wrap lighting SSS approximation
  - Jitter parameter for soft edges
  - Screen-space noise integration

#### ibl.glsl.ts
**IBL Uniforms:**
- uEnvMap (sampler2D, PMREM texture)
- uEnvMapSize (float)
- uIBLIntensity (float)
- uIBLQuality (int, 0-2: off/low/high)

**PMREM CubeUV Sampling Functions:**
- `getCubeUVMaxMip()` - Dynamic from uEnvMapSize
- `getCubeUVTexelSize()` - 3 faces wide, 4 heights
- `getFace(vec3 direction)` - Face selection with epsilon
- `getUV(vec3 direction, float face)`
- `bilinearCubeUV(sampler2D envMap, vec3 direction, float mipInt)`
- `roughnessToMip(float roughness)` - PMREMGenerator mapping
- `textureCubeUV(sampler2D envMap, vec3 sampleDir, float roughness)`

**IBL Computation:**
- `fresnelSchlickRoughness(cosTheta, F0, roughness)`
- `computeIBL(N, V, F0, roughness, metallic, albedo)`
  - Specular IBL: PMREM sample at roughness level
  - Diffuse IBL: Sample at max roughness, energy-conserved
  - Returns (specularIBL + diffuseIBL) * uIBLIntensity

---

### 11.3 Shared Features (src/rendering/shaders/shared/features/)

#### ao.glsl.ts
**Ambient Occlusion Functions:**
- `calcAOFast(vec3 p, vec3 n)` - 1 SDF eval, mid-range sample
- `calcAO(vec3 p, vec3 n)` - 3 SDF evals, multi-distance sampling

#### shadows.glsl.ts
**Soft Shadow Function:**
- `calcSoftShadowQuality(ro, rd, mint, maxt, softness, quality)`
  - Quality levels: 0=8 samples, 1=16, 2=24, 3=32 (ultra)
  - Softness: 0.0=hard (k=64), 2.0=very soft (k=4)
  - Inigo Quilez improved soft shadow technique
  - Penumbra calculation with perpendicular distance

#### temporal.glsl.ts
**Temporal Reprojection System:**
- Position-based (not just depth-based)
- Handles camera rotation correctly
- `getTemporalDepth(vec3 ro, vec3 rd, vec3 worldRayDir)`
  - Uses gl_FragCoord for screen-space sampling
  - Samples uPrevPositionTexture (xyz=model pos, w=ray dist)
  - Projects previous hit onto current ray
  - Validates with perpendicular distance threshold
  - Disocclusion detection: 2 diagonal samples (TL, BR)
  - Returns model-space ray distance or -1.0 if invalid

---

### 11.4 Shared Raymarch (src/rendering/shaders/shared/raymarch/)

#### core.glsl.ts
**Raymarch Core:**
- Global counters: `g_raymarchIterations`, `g_raymarchMaxIterations`
- `RayMarchCore(ro, rd, startDist, maxT, maxDist, out trap)`
  - Relaxed sphere tracing with overrelaxation
  - FastMode: LQ settings, omega=1.0
  - Normal mode: interpolate LQ↔HQ by uQualityMultiplier
  - Omega: 1.0 (fast) to 1.2 (HQ) for overrelaxation
  - Safety fallback when overstep detected

- `RayMarch(ro, rd, worldRayDir, out trap, out usedTemporal)`
  - Sphere intersection first
  - Optional temporal reprojection start
  - Safety margin via uTemporalSafetyMargin

- `RayMarchNoTemporal(ro, rd, out trap)` - Fallback when temporal skip misses

#### normal.glsl.ts
**Normal Calculation Methods:**
- `GetNormal(vec3 p)` - Central differences (6 SDF evals), most accurate
- `GetNormalTetra(vec3 p)` - Tetrahedron (4 SDF evals), 33% faster
- `GetNormalFast(vec3 p)` - Forward differences (4 SDF evals), fastest

#### sphere-intersect.glsl.ts
- `intersectSphere(ro, rd, radius)` - Returns vec2(near, far) hit distances

---

### 11.5 Shared Color (src/rendering/shaders/shared/color/)

#### cosine-palette.glsl.ts
- `cosinePalette(t, a, b, c, d)` - Inigo Quilez formula
- `applyDistribution(t, power, cycles, offset)` - Power/cycle modulation
- `getCosinePaletteColor(t, a, b, c, d, power, cycles, offset)`

#### hsl.glsl.ts
- `hsl2rgb(vec3 hsl)` - HSL to RGB conversion
- `rgb2hsl(vec3 rgb)` - RGB to HSL conversion

#### oklab.glsl.ts
- `linear_srgb_to_oklab(vec3 c)`
- `oklab_to_linear_srgb(vec3 c)`
- `lchColor(t, lightness, chroma)` - Perceptually uniform LCH

#### selector.glsl.ts
**Color Algorithm Implementation (0-13):**
- 0: Monochromatic (same hue, varying lightness)
- 1: Analogous (hue ±30° from base)
- 2: Cosine gradient palette
- 3: Normal-based
- 4: Distance-field
- 5: LCH/Oklab perceptual
- 6: Multi-source (depth + orbitTrap + normal blend)
- 7: Radial (3D distance from origin)
- 8: Phase/Angular (XZ azimuth)
- 9: Mixed (phase + distance)
- 10: Blackbody (heat gradient)
- 13: Dimension-based (polytope axis coloring)

---

## 12. PER-OBJECT SHADER UNIFORMS (PHASE 2)

### 12.1 Mandelbulb Uniforms
- uPowerAnimationEnabled (bool), uAnimatedPower (float)
- uAlternatePowerEnabled, uAlternatePowerValue, uAlternatePowerBlend
- uDimensionMixEnabled, uMixIntensity, uMixTime
- uPhaseEnabled, uPhaseTheta, uPhasePhi
- uRoughness, uSssEnabled, uSssIntensity, uSssColor, uSssThickness, uSssJitter
- uSdfMaxIterations (10-200), uSdfSurfaceDistance (0.0005-0.01)
- uEffectivePower, uEffectiveBailout (precomputed)

### 12.2 Quaternion Julia Uniforms
- uJuliaConstant (vec4)
- uPowerAnimationEnabled, uAnimatedPower
- uDimensionMixEnabled, uMixIntensity, uMixTime
- uRoughness, uSssEnabled, uSssIntensity, uSssColor, uSssThickness, uSssJitter
- uLodEnabled, uLodDetail
- uSdfMaxIterations, uSdfSurfaceDistance

### 12.3 Schrödinger Uniforms
**Array Sizes:** MAX_DIM=11, MAX_TERMS=8

**Quantum Configuration:**
- uQuantumMode (0=harmonic oscillator, 1=hydrogen)
- uTermCount (1-8), uOmega[11], uQuantum[88] (flattened n[k][j])
- uCoeff[8] (vec2 complex), uEnergy[8]

**Hydrogen Orbital:**
- uPrincipalN (1-7), uAzimuthalL (0 to n-1), uMagneticM (-l to +l)
- uBohrRadius (0.5-3.0), uUseRealOrbitals
- uHydrogenBoost, uHydrogenNDBoost, uHydrogenRadialThreshold (precomputed)

**Hydrogen ND (4D+):**
- uExtraDimN[8] (quantum numbers 0-6)
- uExtraDimOmega[8] (frequencies 0.1-2.0)
- uPhaseAnimationEnabled

**Volume Rendering:**
- uTimeScale, uFieldScale, uDensityGain, uPowderScale
- uEmissionIntensity, uEmissionThreshold, uEmissionColorShift, uEmissionPulsing
- uRimExponent, uScatteringAnisotropy
- uRoughness, uSssEnabled/Intensity/Color/Thickness/Jitter

**Erosion/Curl Noise:**
- uErosionStrength/Scale/Turbulence, uErosionNoiseType (0=Worley, 1=Perlin, 2=Hybrid)
- uCurlEnabled/Strength/Scale/Speed/Bias (0=None, 1=Up, 2=Out, 3=In)

**Dispersion/Shadows/AO:**
- uDispersionEnabled/Strength/Direction/Quality
- uShadowsEnabled/Strength/Steps
- uAoStrength/Steps/Radius/Color

**Visual Effects:**
- uNodalEnabled/Color/Strength
- uEnergyColorEnabled, uShimmerEnabled/Strength
- uIsoEnabled, uIsoThreshold
- uSampleCount (16-128)

### 12.4 Black Hole Uniforms (80+ parameters)
**Physics (Kerr):**
- uTime, uHorizonRadius, uVisualEventHorizon, uSpin (0-0.998)
- uDiskTemperature, uGravityStrength, uManifoldIntensity/Thickness
- uPhotonShellWidth, uTimeScale, uBaseColor, uPaletteMode, uBloomBoost

**Lensing:**
- uDimensionEmphasis, uDistanceFalloff, uEpsilonMul
- uBendScale, uBendMaxPerStep, uLensingClamp
- uRayBendingMode (0=spiral, 1=orbital)
- uDimPower, uOriginOffsetLengthSq (precomputed)
- uLensingFalloffStart/End, uHorizonRadiusInv (precomputed)

**Photon Shell:**
- uPhotonShellRadiusMul, uPhotonShellRadiusDimBias
- uShellGlowStrength/Color, uShellStepMul, uShellContrastBoost
- uShellRpPrecomputed, uShellDeltaPrecomputed

**Manifold/Disk:**
- uManifoldType (0-4: auto/disk/sheet/slab/field)
- uDensityFalloff, uDiskInnerRadiusMul, uDiskOuterRadiusMul
- uDiskInnerR, uDiskOuterR, uEffectiveThickness (precomputed)
- uRadialSoftnessMul, uThicknessPerDimMax, uHighDimWScale
- uSwirlAmount, uNoiseScale, uNoiseAmount, uMultiIntersectionGain

**Rendering Quality:**
- uMaxSteps, uStepBase/Min/Max, uStepAdaptG/R
- uEnableAbsorption, uAbsorption, uTransmittanceCutoff
- uFarRadius, uUltraFastMode (camera velocity skip)

**Lighting:**
- uLightingMode, uRoughness, uSpecular, uAmbientTint
- uShadowEnabled, uShadowSteps, uShadowDensity

**Effects:**
- uDopplerEnabled/Strength
- uMotionBlurEnabled/Strength/Samples/RadialFalloff
- uSssEnabled/Intensity/Color/Thickness/Jitter

**Animation:**
- uPulseEnabled/Speed/Amount
- uDiskRotationAngle, uKeplerianDifferential (0=uniform, 1=full Keplerian)

**Temporal:**
- uBayerOffset, uFullResolution

---

## 13. ANIMATION SYSTEM

### 13.1 Animation Store (animationStore.ts)
**Constants:**
- MIN_SPEED: 0.1, MAX_SPEED: 3.0, DEFAULT_SPEED: 0.4
- BASE_ROTATION_RATE: 2π/10 (full rotation in 10s)

**State:**
- isPlaying (bool)
- speed (0.1-3.0 multiplier)
- direction (1=CW, -1=CCW)
- animatingPlanes (Set<string>)
- accumulatedTime (seconds, synced globally)

**Actions:**
- play, pause, toggle
- setSpeed, toggleDirection
- togglePlane, setPlaneAnimating
- animateAll, randomizePlanes, resetToFirstPlane, clearAllPlanes, stopAll
- setDimension (filters invalid planes)
- updateAccumulatedTime, reset
- getRotationDelta(deltaTimeMs)

### 13.2 Rotation Store (rotationStore.ts)
**Constants:**
- MIN_ROTATION: 0, MAX_ROTATION: 2π
- LAZY_NORMALIZE_THRESHOLD: 10000 radians (normalizes only when large)

**State:**
- rotations (Map<string, number>) - plane name → angle in radians
- dimension (int)
- version (counter for change detection)

**Actions:**
- setRotation(plane, angle) - validates plane for dimension
- updateRotations(Map) - batch update with change detection
- resetAllRotations, reset
- setDimension (resets on change)
- bumpVersion

**Planes Generated By Dimension:**
- 3D: XY, XZ, YZ (3 planes)
- 4D: + XW, YW, ZW (6 planes)
- 5D: + XV, YV, ZV, WV (10 planes)
- N-D: n*(n-1)/2 planes total

---

## 14. TRANSFORM SYSTEM

### Transform Store (transformStore.ts)
**Constants:**
- MIN_SCALE: 0.1, MAX_SCALE: 3.0, DEFAULT_SCALE: 1.0
- SCALE_WARNING_LOW: 0.2, SCALE_WARNING_HIGH: 2.5

**State:**
- uniformScale (float)
- perAxisScale (number[dimension])
- scaleLocked (bool)
- dimension (int)

**Actions:**
- setUniformScale (syncs all axes when locked)
- setAxisScale (axis, value)
- setScaleLocked
- resetScale
- getScaleMatrix() → MatrixND
- isScaleExtreme() → boolean
- setDimension (resets on change)
- resetAll, reset

---

## 15. CAMERA SYSTEM

### Camera Store (cameraStore.ts)
**State:**
- controls (OrbitControlsImpl | null)
- savedState (position[3], target[3] | null)
- pendingState (for race condition handling)

**Actions:**
- registerControls - applies pending state when controls become available
- captureState() → {position, target}
- applyState(state) - stores as pending if controls unavailable
- reset()

---

## 16. EXPORT/VIDEO SYSTEM

### Export Store (exportStore.ts)
**Formats:** mp4, webm
**Codecs:** avc (H.264), hevc (H.265), vp9, av1
**Resolutions:** 720p, 1080p, 4k, custom
**Export Modes:** auto, in-memory, stream, segmented

**Settings:**
- format, codec, resolution
- customWidth, customHeight
- fps (24-60), duration (seconds)
- bitrate (Mbps), bitrateMode (constant/variable)
- hardwareAcceleration (no-preference/prefer-hardware/prefer-software)
- warmupFrames, rotation (0/90/180/270)

**Text Overlay:**
- enabled, text, fontFamily, fontSize, fontWeight
- letterSpacing, color, opacity
- shadowColor, shadowBlur
- verticalPlacement, horizontalPlacement, padding

**Crop:**
- enabled, x, y, width, height (0-1 normalized)

**Presets:**
- landscape-1080p, landscape-720p
- instagram (1:1), tiktok (9:16), youtube-shorts (9:16)
- twitter-video, cinematic (21:9), square-60fps, high-q

**Compression Factors by Codec:**
- avc: 0.55, hevc: 0.42, vp9: 0.42, av1: 0.32
- VBR: additional 0.8× factor

---

## 17. PERFORMANCE/PROGRESSIVE REFINEMENT SYSTEM

### Performance Store (performanceStore.ts)
**Device Capabilities:**
- gpuTier (0-3: fallback/low/medium/high)
- isMobileGPU, gpuName
- deviceCapabilitiesDetected

**Interaction State:**
- isInteracting, sceneTransitioning, isLoadingScene
- presetLoadVersion (counter for material recreation)

**Progressive Refinement:**
- progressiveRefinementEnabled (bool)
- refinementStage: 'low' | 'medium' | 'high' | 'final'
- refinementProgress (0-100)
- qualityMultiplier (0.25-1.0)

**Stage Timing (ms after interaction):**
- low: 0, medium: 100, high: 300, final: 500

**Quality Multiplier by Stage:**
- low: 0.25, medium: 0.5, high: 0.75, final: 1.0

**Temporal Reprojection:**
- temporalReprojectionEnabled (bool)
- cameraTeleported (disables for 1 frame)

**Fractal Animation:**
- fractalAnimationLowQuality (bool)

**Resolution/FPS:**
- renderResolutionScale (0.1-1.0, persisted)
- maxFps (15-165, persisted)

**Shader Debug:**
- shaderDebugInfos, shaderOverrides
- compilingShaders (Set<string>), isShaderCompiling, shaderCompilationMessage

**Debug Mode:**
- debugMode (0-3: off/iteration heatmap/depth/normals)

**Quality Interpolation Functions:**
- getEffectiveSSRQuality(target, multiplier) → 'low'|'medium'|'high'
- getEffectiveShadowQuality(target, multiplier) → 'low'|'medium'|'high'|'ultra'
- getEffectiveSampleQuality(target, multiplier) → 'low'|'medium'|'high'

---

## 18. RENDER GRAPH PASSES (Complete List)

### Core:
- CopyPass, FullscreenPass, ScenePass, ToScreenPass

### G-Buffer:
- DepthPass, NormalPass, MainObjectMRTPass
- TemporalCloudPass, TemporalCloudDepthPass
- TemporalDepthCapturePass (invalidateAllTemporalDepth helper)

### Post-Processing:
- BloomPass, BokehPass, CinematicPass
- FrameBlendingPass, PaperTexturePass
- CompositePass (with BlendMode options)
- FXAAPass, SMAAPass
- GravitationalLensingPass, ScreenSpaceLensingPass
- RefractionPass, SSRPass

### Ambient Occlusion:
- GTAOPass

### Tone Mapping:
- ToneMappingPass, ToneMappingCinematicPass

### Debug:
- BufferPreviewPass (depth/normal/color modes, DepthMode options)
- DebugOverlayPass

### Environment:
- CubemapCapturePass
- EnvironmentCompositePass (ShellGlowConfig)

### Black Hole Jets:
- JetsRenderPass, JetsCompositePass, GodRaysPass

---

## 19. SCREENSHOT SYSTEM

### Screenshot Store (screenshotStore.ts + screenshotCaptureStore.ts)
- Capture current canvas state
- Format options (PNG, JPEG, WebP)
- Resolution override
- Watermark/overlay options

---

---

## 20. PRESET/SCENE MANAGER SYSTEM

### Preset Manager Store (presetManagerStore.ts)
**Saved Styles (visual settings only):**
- appearance, lighting, postProcessing, environment, pbr

**Saved Scenes (full state):**
- Style components: appearance, lighting, postProcessing, environment, pbr
- Scene components: geometry, extended (object-specific config), transform, rotation, animation, camera, ui

**Actions:**
- saveStyle/loadStyle/deleteStyle/renameStyle
- importStyles/exportStyles (JSON)
- saveScene/loadScene/deleteScene/renameScene
- importScenes/exportScenes (JSON)

**Load Behavior:**
- Strips transient fields (version counters)
- Bumps all version counters after load
- Triggers material recreation via presetLoadVersion
- Handles legacy data migration
- Camera state applied with race condition handling

---

## 21. GEOMETRY-BASED RENDERERS (Non-SDF)

### 21.1 Polytope Renderer
**Rendering Type:** Geometry-based (vertices, edges, faces)
**Shaders:** src/rendering/shaders/polytope/
- transform-nd.glsl.ts - Full N-D transformation
- transform-nd-simple.glsl.ts - Simplified version
- compose.ts - Shader composition

**Geometry Generation:**
- Hypercube: 2^n vertices
- Simplex: n+1 vertices
- Cross-polytope: 2n vertices
- Wythoff: Coxeter group generated

### 21.2 TubeWireframe Renderer
**Rendering Type:** Procedural tube geometry from edges
**Shaders:** src/rendering/shaders/tubewireframe/
- vertex.glsl.ts, main.glsl.ts, uniforms.glsl.ts, compose.ts

**Parameters:**
- edgeThickness (tube radius)
- tubeCaps (end caps on/off)
- Uses instanced rendering for edges

---

## 22. BASE RENDERER HOOKS (src/rendering/renderers/base/)

### useLayerAssignment
- Assigns objects to render layers for selective rendering
- Supports main layer, effects layer, UI layer

### useQualityTracking
- Tracks current quality level
- Responds to progressive refinement stage changes

### useRotationUpdates
- Syncs N-D rotation matrices to shader uniforms
- Responds to rotationStore changes

### useFramePriority
- Controls render order between objects
- Ensures correct depth sorting

### useNDTransformUpdates
- Updates basis vectors (uBasisX, uBasisY, uBasisZ, uOrigin)
- Handles dimension changes

### useShadowPatching
- Patches Three.js shadow system for custom shaders
- Ensures shadow map compatibility

### projectionUtils.ts
- N-D to 3D projection calculations
- Perspective/orthographic projection support

---

## 23. ADDITIONAL OBJECT TYPES (Reference)

### Clifford Torus (cliffordTorusSlice.ts)
- 4D torus visualization
- Major/minor radius parameters

### Nested Torus (nestedTorusSlice.ts)
- Multiple nested tori
- Count, spacing parameters

### Root System (rootSystemSlice.ts)
- Lie algebra root systems
- Type selection (A, B, C, D, E, F, G series)

### Wythoff Polytope (wythoffPolytopeSlice.ts)
- Coxeter group parameters
- Mirror system configuration

---

## WEBGPU PORT STATUS

### Completed (January 2026)

**Object Renderers (6/6 - 100%):**
- ✅ WebGPUMandelbulbRenderer
- ✅ WebGPUQuaternionJuliaRenderer
- ✅ WebGPUSchrodingerRenderer
- ✅ WebGPUBlackHoleRenderer
- ✅ WebGPUPolytopeRenderer
- ✅ WebGPUTubeWireframeRenderer

**Post-Processing Passes (32/32 - 100%):**
- ✅ BloomPass, BokehPass, BufferPreviewPass
- ✅ CinematicPass, CompositePass, CopyPass
- ✅ CubemapCapturePass, DebugOverlayPass, DepthPass
- ✅ EnvironmentCompositePass, FXAAPass, FrameBlendingPass
- ✅ FullscreenPass, GTAOPass, GodRaysPass
- ✅ GravitationalLensingPass, JetsCompositePass, JetsRenderPass
- ✅ MainObjectMRTPass, NormalPass, PaperTexturePass
- ✅ RefractionPass, SMAAPass, SSRPass, ScenePass
- ✅ ScreenSpaceLensingPass, TemporalCloudDepthPass
- ✅ TemporalCloudPass, TemporalDepthCapturePass
- ✅ ToScreenPass, ToneMappingCinematicPass, TonemappingPass

---

## VERIFIED COMPLETE CHECKLIST

✅ All 6+ object types with ALL parameters
✅ All 14 color algorithms  
✅ Multi-light system (4 lights, 3 types)
✅ PBR materials (3 targets)
✅ 11+ post-processing effects
✅ 28+ render graph passes
✅ Skybox (6 procedural + classic)
✅ Ground/environment/IBL
✅ Animation/rotation/transform systems
✅ Camera system
✅ Export/video system
✅ Performance/progressive refinement
✅ Temporal reprojection
✅ All shader blocks (lighting, PBR, SSS, IBL, shadows, AO, raymarch)
✅ All per-object shader uniforms
✅ Preset/scene save/load system
✅ Geometry-based renderers (Polytope, TubeWireframe)
✅ Base renderer hooks

---

## PHASE 3 TODO (if needed):
- URL serialization format (for sharing)
- Theme system details
- Keyboard shortcuts
- Touch/mobile interactions
