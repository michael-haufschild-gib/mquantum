# Schrödinger Renderer - Feature & Uniform Reference Catalog

## Executive Summary
Complete feature and uniform inventory of the Schrödinger quantum wavefunction renderer. Originally documented from the WebGL implementation, this serves as the **canonical specification** for the WebGPU renderer to achieve feature parity. The WebGL code has been removed; this document describes what the renderer SHOULD implement.

**Status**: WebGPU is the only rendering backend. Use this as the target specification.

---

## Part 1: UNIFORMS MATRIX - Store to Shader Mapping

### 1.1 Geometry & Transform Uniforms
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uDimension` | int | `useGeometryStore.dimension` | N-dimensional space (3-11) | 3-11 |
| `uBasisX` | Float32Array[MAX_DIM] | `rotationUpdates.getBasisVectors()` | D-dim basis vector X | per-dim normalized |
| `uBasisY` | Float32Array[MAX_DIM] | `rotationUpdates.getBasisVectors()` | D-dim basis vector Y | per-dim normalized |
| `uBasisZ` | Float32Array[MAX_DIM] | `rotationUpdates.getBasisVectors()` | D-dim basis vector Z | per-dim normalized |
| `uOrigin` | Float32Array[MAX_DIM] | `rotationUpdates.getOrigin()` + slice animation | Slice plane position in D-space | computed per-frame |
| `uModelMatrix` | mat4 | `meshRef.matrixWorld` | Object-to-world transform | identity for mesh |
| `uInverseModelMatrix` | mat4 | `meshRef.matrixWorld.invert()` | World-to-object transform | computed |
| `uProjectionMatrix` | mat4 | `camera.projectionMatrix` | Projection matrix | camera-dependent |
| `uViewMatrix` | mat4 | `camera.matrixWorldInverse` | View matrix (world-to-camera) | camera-dependent |
| `uInverseViewProjectionMatrix` | mat4 | `projMatrixInv * matrixWorld` | Used for temporal accumulation ray reconstruction | computed |

### 1.2 Camera & Resolution Uniforms
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uResolution` | vec2 | `size.width, size.height` | Screen resolution | viewport size |
| `uCameraPosition` | vec3 | `camera.position` | Camera position in world space | camera-dependent |
| `uTime` | float | `useAnimationStore.accumulatedTime` | Global animation time | 0.0+ |

### 1.3 Quantum Mode & Configuration Uniforms
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uQuantumMode` | int | `schroedinger.quantumMode` mapped to enum | 0=HO, 1=H-orbital, 2=H-ND | 0-2 |

#### 1.3.1 Harmonic Oscillator (HO) State
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uTermCount` | int | `preset.termCount` | Number of superposition terms | 1-8 |
| `uOmega` | Float32Array[MAX_DIM] | `flattenPresetForUniforms().omega` | Per-dimension oscillator frequencies | ω > 0 |
| `uQuantum` | Int32Array[MAX_TERMS * MAX_DIM] | `flattenPresetForUniforms().quantum` | Quantum numbers n[k][j], flattened | integers ≥0 |
| `uCoeff` | Float32Array[MAX_TERMS * 2] | `flattenPresetForUniforms().coeff` | Complex coefficients (re, im) for each term | normalized |
| `uEnergy` | Float32Array[MAX_TERMS] | `flattenPresetForUniforms().energy` | Precomputed energies E_k | E > 0 |

**Quantum Preset Data Flow:**
- `generateQuantumPreset()` or `getNamedPreset()` → QuantumPreset object
- `flattenPresetForUniforms()` → flattened arrays
- Updated to `quantumArraysRef.current` → then to uniforms
- Update triggered when: presetName, seed, termCount, maxQuantumNumber, frequencySpread, or dimension changes

#### 1.3.2 Hydrogen Orbital (3D)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uPrincipalN` | int | `principalQuantumNumber` (constrained) | Principal quantum number n | 1-7 |
| `uAzimuthalL` | int | `azimuthalQuantumNumber` (constrained) | Azimuthal/angular momentum l | 0 to n-1 |
| `uMagneticM` | int | `magneticQuantumNumber` (constrained) | Magnetic quantum number m | -l to +l |
| `uBohrRadius` | float | `bohrRadiusScale` | Bohr radius scale factor | 0.5-3.0 |
| `uUseRealOrbitals` | bool | `useRealOrbitals` | Use px/py/pz vs complex orbitals | true/false |

**Hydrogen-specific Precomputed Values:**
| Uniform | Computation | Purpose |
|---------|-------------|---------|
| `uHydrogenBoost` | `50.0 * n² * 3^l` | Density scaling (avoids pow() per sample) |
| `uHydrogenNDBoost` | `hydrogenBoost * (1.0 + (dim-3)*0.3)` | ND density scaling |
| `uHydrogenRadialThreshold` | `25.0 * n * a0 * (1.0 + 0.1*l)` | Early exit threshold |

#### 1.3.3 Hydrogen N-Dimensional (ND)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uExtraDimN` | Int32Array[8] | `extraDimQuantumNumbers[0..7]` | Quantum numbers for dims 4-11 | 0-6 each |
| `uExtraDimOmega` | Float32Array[8] | `extraDimOmega[0..7]` with frequency spread applied | Frequencies for dims 4-11 | 0.1-2.0 each |
| `uPhaseAnimationEnabled` | bool | `phaseAnimationEnabled` | Time-dependent phase rotation | true/false |

### 1.4 Volume Rendering Parameters
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uTimeScale` | float | `schroedinger.timeScale` | Time evolution speed | 0.1-2.0 |
| `uFieldScale` | float | `schroedinger.fieldScale` | Coordinate scale into basis | 0.5-2.0 |
| `uDensityGain` | float | `schroedinger.densityGain` | Beer-Lambert absorption coefficient | 0.1-5.0 |
| `uPowderScale` | float | `schroedinger.powderScale` | Multiple scattering effect | 0.0-2.0 |
| `uSampleCount` | int | Fixed: 64 (HQ) or 32 (fast) | Raymarching sample count | 32 or 64 |
| `uScatteringAnisotropy` | float | `schroedinger.scatteringAnisotropy` | Henyey-Greenstein phase function g | -0.9 to 0.9 |

### 1.5 Emission & Rim Lighting
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uEmissionIntensity` | float | `appearanceState.faceEmission` | HDR emission strength | 0.0-5.0 |
| `uEmissionThreshold` | float | `appearanceState.faceEmissionThreshold` | Density threshold for emission | 0.0-1.0 |
| `uEmissionColorShift` | float | `appearanceState.faceEmissionColorShift` | Emission color temperature shift | -1.0 to 1.0 |
| `uEmissionPulsing` | bool | `appearanceState.faceEmissionPulsing` | Phase-based emission pulsing | true/false |
| `uRimExponent` | float | `appearanceState.faceRimFalloff` | Fresnel rim falloff exponent | 1.0-10.0 |
| `uFresnelEnabled` | bool | `appearanceState.edgesVisible` | Enable rim lighting | true/false |
| `uFresnelIntensity` | float | `appearanceState.fresnelIntensity` | Rim intensity | 0.0-2.0 |
| `uRimColor` | vec3 (linear) | `appearanceState.edgeColor` (converted to linear) | Rim color | sRGB→linear |

### 1.6 Subsurface Scattering (SSS)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uSssEnabled` | bool | `appearanceState.sssEnabled` | Enable SSS | true/false |
| `uSssIntensity` | float | `appearanceState.sssIntensity` | SSS intensity | 0.0-2.0 |
| `uSssColor` | vec3 (linear) | `appearanceState.sssColor` (converted to linear) | SSS tint color | sRGB→linear |
| `uSssThickness` | float | `appearanceState.sssThickness` | Thickness factor | 0.1-5.0 |
| `uSssJitter` | float | `appearanceState.sssJitter` | Jitter amount | 0.0-1.0 |

### 1.7 Erosion (Edge Erosion Effect)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uErosionStrength` | float | `schroedinger.erosionStrength` | Edge erosion strength | 0.0-1.0 |
| `uErosionScale` | float | `schroedinger.erosionScale` | Erosion pattern scale | 0.25-4.0 |
| `uErosionTurbulence` | float | `schroedinger.erosionTurbulence` | Erosion noise turbulence | 0.0-1.0 |
| `uErosionNoiseType` | int | `schroedinger.erosionNoiseType` | 0=Worley, 1=Perlin, 2=Hybrid | 0-2 |

**Compile-time control:** `erosionEnabled = erosionStrength > 0`, triggers `#define USE_EROSION`, includes `#define EROSION_NOISE_TYPE` if noiseType is known, includes `#define EROSION_HQ` if `erosionHQ` flag is set.

### 1.8 Curl Flow (Vector Field Distortion)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uCurlEnabled` | bool | `schroedinger.curlEnabled` | Enable curl distortion | true/false |
| `uCurlStrength` | float | `schroedinger.curlStrength` | Flow strength | 0.0-1.0 |
| `uCurlScale` | float | `schroedinger.curlScale` | Flow scale | 0.25-4.0 |
| `uCurlSpeed` | float | `schroedinger.curlSpeed` | Flow animation speed | 0.1-5.0 |
| `uCurlBias` | int | `schroedinger.curlBias` | 0=None, 1=Up, 2=Out, 3=In | 0-3 |

### 1.9 Chromatic Dispersion
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uDispersionEnabled` | bool | `schroedinger.dispersionEnabled` | Enable color separation | true/false |
| `uDispersionStrength` | float | `schroedinger.dispersionStrength` | Separation strength | 0.0-1.0 |
| `uDispersionDirection` | int | `schroedinger.dispersionDirection` | 0=Radial, 1=View-based | 0-1 |
| `uDispersionQuality` | int | `schroedinger.dispersionQuality` | 0=Fast, 1=High | 0-1 |

### 1.10 Volumetric Shadows
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uShadowsEnabled` | bool | `schroedinger.shadowsEnabled` | Enable self-shadowing | true/false |
| `uShadowStrength` | float | `schroedinger.shadowStrength` | Shadow intensity | 0.0-2.0 |
| `uShadowSteps` | int | `schroedinger.shadowSteps` | March steps for shadows | 1-8 |

### 1.11 Volumetric Ambient Occlusion
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uAoEnabled` | bool | `schroedinger.aoEnabled` | Enable volumetric AO | true/false |
| `uAoStrength` | float | `schroedinger.aoStrength` | AO intensity | 0.0-2.0 |
| `uAoSteps` | int | `schroedinger.aoQuality` | Cone samples/steps | 3-8 |
| `uAoRadius` | float | `schroedinger.aoRadius` | AO radius | 0.1-2.0 |
| `uAoColor` | vec3 (linear) | `schroedinger.aoColor` (converted to linear) | AO tint color | sRGB→linear |

### 1.12 Quantum Visual Effects
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uNodalEnabled` | bool | `schroedinger.nodalEnabled` | Highlight nodal surfaces | true/false |
| `uNodalColor` | vec3 (linear) | `schroedinger.nodalColor` (converted to linear) | Nodal surface color | sRGB→linear |
| `uNodalStrength` | float | `schroedinger.nodalStrength` | Nodal highlight strength | 0.0-2.0 |
| `uEnergyColorEnabled` | bool | `schroedinger.energyColorEnabled` | Energy level coloring | true/false |
| `uShimmerEnabled` | bool | `schroedinger.shimmerEnabled` | Uncertainty shimmer effect | true/false |
| `uShimmerStrength` | float | `schroedinger.shimmerStrength` | Shimmer amplitude | 0.0-1.0 |

### 1.13 Isosurface Mode
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uIsoEnabled` | bool | `schroedinger.isoEnabled` | Switch to isosurface rendering | true/false |
| `uIsoThreshold` | float | `schroedinger.isoThreshold` | Log-density threshold for surface | -5.0 to -1.0 |

### 1.14 Color System Uniforms
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uColor` | vec3 (linear) | `appearanceState.faceColor` (converted to linear) | Base color | sRGB→linear |
| `uColorAlgorithm` | int | Via UniformManager 'color' source | Color algorithm selection | 0-7 |
| `uCosineA`, `uCosineB`, `uCosineC`, `uCosineD` | vec3 | Via UniformManager 'color' source | Cosine palette coefficients | normalized |
| `uDistPower`, `uDistCycles`, `uDistOffset` | float | Via UniformManager 'color' source | Distribution function params | algorithm-dependent |
| `uLchLightness`, `uLchChroma` | float | Via UniformManager 'color' source | LCH color space params | 0.0-1.0 |
| `uMultiSourceWeights` | vec3 | Via UniformManager 'color' source | Weighting for multi-source color | sum to ~1.0 |

### 1.15 Lighting Uniforms (via UniformManager 'lighting' source)
**Ambient Lighting:**
| Uniform | Source | Purpose |
|---------|--------|---------|
| `uAmbientColor` | lightingStore | Ambient light color | 
| `uAmbientIntensity` | lightingStore | Ambient intensity |
| `uAmbientEnabled` | lightingStore | Enable ambient |

**Multi-Light System:**
| Uniform | Source | Purpose |
|---------|--------|---------|
| `uLightsEnabled[i]` | lightingStore | Light enable flags (MAX_LIGHTS) |
| `uLightPositions[i]` | lightingStore | Light positions |
| `uLightDirections[i]` | lightingStore | Light directions |
| `uLightColors[i]` | lightingStore | Light colors |
| `uLightIntensities[i]` | lightingStore | Light intensities |
| `uLightTypes[i]` | lightingStore | Light types (0=Dir, 1=Point, 2=Spot) |
| `uNumLights` | lightingStore | Active light count |
| `uLightRanges[i]` | lightingStore | Light ranges (point/spot) |
| `uLightAngles[i]` | lightingStore | Spot angles |
| `uSpecularColor` | lightingStore | Specular highlight color |
| `uSpecularIntensity` | lightingStore | Specular intensity |

### 1.16 PBR Uniforms (via UniformManager 'pbr-face' source)
| Uniform | Source | Purpose |
|---------|--------|---------|
| `uRoughness` | pbr store | GGX surface roughness | 
| `uMetallic` | pbr store | Metallicness |

### 1.17 Temporal Reprojection Uniforms (for isosurface mode with `USE_TEMPORAL`)
| Uniform | Type | Store Source | Purpose |
|---------|------|--------------|---------|
| `uTemporalEnabled` | bool | `performanceStore.temporalReprojectionEnabled` | Enable depth-skip optimization |
| `uPrevDepthTexture` | sampler2D | `getTemporalUniforms().uPrevDepthTexture` | Previous frame depth |
| `uPrevViewProjectionMatrix` | mat4 | Temporal system | Previous VP matrix |
| `uPrevInverseViewProjectionMatrix` | mat4 | Temporal system | Previous inverse VP |
| `uDepthBufferResolution` | vec2 | Temporal system | Depth buffer resolution |

### 1.18 Temporal Accumulation Uniforms (for volumetric mode with `USE_TEMPORAL_ACCUMULATION`)
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uBayerOffset` | vec2 | TemporalCloudPass | Sub-pixel Bayer dither offset | (0,0), (1,1), (1,0), (0,1) |
| `uFullResolution` | vec2 | TemporalCloudPass | Full screen resolution for jitter | viewport size |

### 1.19 IBL (Image-Based Lighting) Uniforms
| Uniform | Type | Store Source | Purpose | Range |
|---------|------|--------------|---------|-------|
| `uEnvMap` | sampler2D (PMREM) | `scene.environment` | Environment PMREM texture | texture or null |
| `uEnvMapSize` | float | `environmentState.iblQuality` dependent | PMREM map size | 256.0 |
| `uIBLIntensity` | float | `environmentState.iblIntensity` | IBL contribution strength | 0.0-2.0 |
| `uIBLQuality` | int | `environmentState.iblQuality` | 0=off, 1=low, 2=high | 0-2 |

---

## Part 2: VISUAL FEATURES & EFFECTS

### 2.1 Core Rendering Modes

#### Volumetric Mode (Default)
- **Activation:** `!isoEnabled`
- **Rendering:** Beer-Lambert volumetric raymarching
- **Entry Point:** `volumeRaymarch()` or `volumeRaymarchHQ()` based on `uFastMode`
- **Output:** Color + alpha with front-to-back compositing
- **Sample Count:** 64 (HQ) or 32 (fast) - fixed in shader
- **Integration:** Horizon-style accumulation with temporal accumulation option

#### Isosurface Mode
- **Activation:** `isoEnabled`
- **Rendering:** Density threshold crossing detection with binary search refinement
- **Entry Point:** Dedicated `mainBlockIsosurface`
- **Max Steps:** 128 (HQ) or 64 (fast)
- **Refinement:** 5-iteration binary search per hit
- **Output:** Opaque surface with full lighting

### 2.2 Quantum Wavefunctions

#### Harmonic Oscillator (HO) - 1D to 11D
- **Basis Functions:** Hermite polynomials × Gaussian envelope
- **Superposition:** Up to 8 terms with complex coefficients
- **Per-dimension:** Independent frequency ω[i]
- **Quantum Numbers:** n[k][j] specifies Hermite degree per dimension per term
- **Evaluation:** Unrolled (if `termCount` known at compile-time) or dynamic loop
- **Normalization:** Complex coefficients c_k pre-computed and stored

#### Hydrogen Orbital - 3D only
- **Basis Functions:** Laguerre polynomials × Spherical harmonics
- **Radial:** Hydrogen 1s/2s/3s/... with Bohr radius scaling
- **Angular:** Y_lm(θ,φ) - spherical harmonics for given l,m
- **Real Orbitals:** px/py/pz variants available
- **Quantum Constraints:** n ≥ 1, 0 ≤ l < n, -l ≤ m ≤ l
- **Precomputed Boost:** `50 * n² * 3^l` for density scaling

#### Hydrogen N-Dimensional (ND) - 4D to 11D
- **Radial (dims 1-3):** Standard hydrogen radial × coordinate
- **Extra Dimensions (4-11):** Independent harmonic oscillators
- **Per-Dimension Quantum Numbers:** `uExtraDimN[0..7]` for dims 4-11
- **Per-Dimension Frequencies:** `uExtraDimOmega[0..7]` with frequency spread applied
- **Phase Animation:** Optional time-dependent phase rotation (rotates complex plane)
- **ND Boost:** `hydrogenBoost * (1.0 + (dim-3)*0.3)`

### 2.3 Emission & Self-Illumination

#### Volumetric Emission
- **Intensity Control:** `uEmissionIntensity` (HDR, 0.0-5.0)
- **Threshold:** `uEmissionThreshold` - density threshold for emission kick-in
- **Color Shift:** `uEmissionColorShift` (-1.0 to 1.0) - temperature modulation
- **Pulsing:** Optional phase-based emission pulsing with `uEmissionPulsing`
- **Mechanism:** Applied per sample during raymarching integration

#### Rim/Fresnel Lighting
- **Enable:** `uFresnelEnabled` (tied to `edgesVisible`)
- **Intensity:** `uFresnelIntensity` (0.0-2.0)
- **Falloff:** `uRimExponent` (1.0-10.0) - controls Fresnel curve
- **Color:** `uRimColor` (linear RGB)
- **Formula:** `rim = (1 - NdotV)^3 * intensity * 2.0 * (0.3 + 0.7 * totalNdotL)`

### 2.4 Subsurface Scattering (SSS)
- **Enable:** `uSssEnabled` (compile-time flag `USE_SSS`)
- **Intensity:** `uSssIntensity` (0.0-2.0)
- **Color:** `uSssColor` (linear RGB, typically orange #ff8844)
- **Thickness:** `uSssThickness` (0.1-5.0) - light penetration distance
- **Jitter:** `uSssJitter` (0.0-1.0) - soft shadow variation
- **Mechanism:** Per-sample evaluation during volumetric integration

### 2.5 Volumetric Shadow Effects

#### Cone-Traced Self-Shadowing
- **Enable:** `uShadowsEnabled` (compile-time flag `USE_SHADOWS`)
- **Strength:** `uShadowStrength` (0.0-2.0) - shadow opacity
- **Steps:** `uShadowSteps` (1-8) - raymarching steps for shadow cone
- **Mechanism:** Secondary raymarching cone from sample point toward light(s)

#### Hemisphere-Sampled Ambient Occlusion
- **Enable:** `uAoEnabled` (compile-time flag `USE_AO`)
- **Strength:** `uAoStrength` (0.0-2.0) - occlusion opacity
- **Steps:** `uAoSteps` (3-8) - cone samples for hemisphere
- **Radius:** `uAoRadius` (0.1-2.0) - occlusion distance
- **Color:** `uAoColor` (linear RGB, typically black #000000)
- **Mechanism:** Hemisphere sampling around gradient normal

### 2.6 Erosion & Edge Dissolution

#### Edge Erosion Effect
- **Enable:** `uErosionStrength > 0` (compile-time flag `USE_EROSION`)
- **Strength:** `uErosionStrength` (0.0-1.0) - dissolution opacity
- **Scale:** `uErosionScale` (0.25-4.0) - pattern frequency
- **Turbulence:** `uErosionTurbulence` (0.0-1.0) - noise modulation
- **Noise Type:** `uErosionNoiseType` (0=Worley, 1=Perlin, 2=Hybrid) - compile-time selected
- **HQ Mode:** `#define EROSION_HQ` enables 3×3×3 Worley + 4-sample curl (slower)
- **Fast Mode:** 2×2×2 Worley + 2-sample pseudo-curl (default)
- **Mechanism:** Noise-based alpha modulation applied per sample

### 2.7 Curl Flow Distortion

#### Vector Field Distortion
- **Enable:** `uCurlEnabled` (compile-time flag `USE_CURL`)
- **Strength:** `uCurlStrength` (0.0-1.0) - distortion amplitude
- **Scale:** `uCurlScale` (0.25-4.0) - pattern frequency
- **Speed:** `uCurlSpeed` (0.1-5.0) - animation speed
- **Bias Direction:** `uCurlBias` (0=None, 1=Up, 2=Out, 3=In) - directional bias
- **Mechanism:** 3D curl noise applied to sample position during raymarching

### 2.8 Chromatic Dispersion

#### Per-Channel Color Separation
- **Enable:** `uDispersionEnabled` (compile-time flag `USE_DISPERSION`)
- **Strength:** `uDispersionStrength` (0.0-1.0) - separation amount
- **Direction:** `uDispersionDirection` (0=Radial, 1=View-based) - separation direction
- **Quality:** `uDispersionQuality` (0=Fast, 1=High) - sampling resolution
- **Fast Mode:** Gradient-based modulation
- **High Mode:** Per-channel density sampling
- **Mechanism:** RGB channels sampled at slightly different positions

### 2.9 Quantum Nodal Surfaces

#### Nodal Surface Highlighting
- **Enable:** `uNodalEnabled` (compile-time flag `USE_NODAL`)
- **Color:** `uNodalColor` (linear RGB, typically cyan #00ffff)
- **Strength:** `uNodalStrength` (0.0-2.0) - highlight intensity
- **Mechanism:** Detection and enhancement of zero-crossing surfaces (phase singularities)

### 2.10 Energy Level Coloring

#### Eigenstate-Based Coloring
- **Enable:** `uEnergyColorEnabled` (compile-time flag `USE_ENERGY_COLOR`)
- **Mechanism:** Color mapped to eigenstate energy levels
- **Application:** Per-term contribution coloring in superposition

### 2.11 Uncertainty Shimmer

#### Quantum Uncertainty Visualization
- **Enable:** `uShimmerEnabled` (compile-time flag `USE_SHIMMER`)
- **Strength:** `uShimmerStrength` (0.0-1.0) - shimmer amplitude
- **Mechanism:** Time-dependent phase-based intensity variation
- **Purpose:** Visual representation of quantum uncertainty

### 2.12 Slice Animation (Extra Dimensions)

#### Dynamic Slice Plane Movement
- **Condition:** `sliceAnimationEnabled && dimension > 3`
- **Animation Type:** Multi-frequency sinusoidal motion through extra dimensions
- **Frequencies:** 
  - `t1 = time * sliceSpeed * 2π + phase`
  - `t2 = time * sliceSpeed * 1.3 * 2π + phase * 1.5`
- **Offset:** `offset = 0.7 * sin(t1) + 0.3 * sin(t2)`
- **Phase Spacing:** Golden ratio (φ = 1.618...) for dimension spacing
- **Amplitude:** `uSliceAmplitude` controls total offset magnitude
- **Updates:** `originValuesRef` pre-allocated array, no per-frame allocation

---

## Part 3: CONDITIONAL COMPILATION FLAGS

### Core Mode Flags
| Define | Condition | Module Inclusion | Purpose |
|--------|-----------|------------------|---------|
| `ACTUAL_DIM {N}` | Always | Loop unrolling in hoND, density mapping | Compile-time dimension for GPU branching elimination |
| `USE_SHADOWS` | `enableShadows && !overrides` | shadows module | Volumetric self-shadowing |
| `USE_AO` | `enableAO && !overrides` | AO evaluation | Volumetric ambient occlusion |
| `USE_TEMPORAL_ACCUMULATION` | `temporalAccumulation && !isosurface` | temporal block | Horizon-style 1/4 res accumulation |
| `USE_TEMPORAL` | `enableTemporal && !useTemporalAccumulation` | temporal block | Depth-skip optimization (isosurface) |

### Quantum Mode Flags
| Define | Condition | Modules Included | Purpose |
|--------|-----------|------------------|---------|
| `HYDROGEN_MODE_ENABLED` | `quantumMode !== 'harmonicOscillator'` | laguerre, legendre, spherical harmonics, hydrogenRadial, hydrogenPsi | Include hydrogen orbital basis |
| `HYDROGEN_ND_MODE_ENABLED` | `quantumMode === 'hydrogenND'` | hydrogenNDCommon + dimension-specific block | Include hydrogen ND basis |
| `HYDROGEN_ND_DIMENSION {N}` | When HYDROGEN_ND enabled | Only the specific dimension block (3D-11D) | Eliminates runtime dispatch |
| `HO_UNROLLED` | `termCount !== undefined` | Unrolled superposition blocks | Replace dynamic loop with unrolled code |
| `HO_TERM_COUNT {N}` | When HO_UNROLLED | Specific unrolled variants (1-8 terms) | Compile-time term count |

### Visual Effect Flags
| Define | Condition | Module Inclusion | Purpose |
|--------|-----------|------------------|---------|
| `USE_SSS` | `enableSss && !overrides` | SSS evaluation in volume integration | Subsurface scattering |
| `USE_FRESNEL` | `enableFresnel && !overrides` | Fresnel calculation in main | Rim lighting |
| `USE_CURL` | `enableCurl && !overrides` | Curl flow evaluation | Vector field distortion |
| `USE_DISPERSION` | `enableDispersion && !overrides` | Dispersion per-channel sampling | Chromatic dispersion |
| `USE_NODAL` | `enableNodal && !overrides` | Nodal surface detection | Zero-crossing highlighting |
| `USE_ENERGY_COLOR` | `enableEnergyColor && !overrides` | Energy-based coloring | Eigenstate coloring |
| `USE_SHIMMER` | `enableShimmer && !overrides` | Shimmer effect | Uncertainty visualization |
| `USE_EROSION` | `enableErosion && !overrides` | Erosion noise evaluation | Edge dissolution |
| `EROSION_NOISE_TYPE {N}` | `erosionNoiseType !== undefined` | Specific noise function | Compile-time noise selection |
| `EROSION_HQ` | `erosionHQ === true` | 3×3×3 Worley, 4-sample curl | High-quality erosion |

### Precision & Format Flags
| Define | Type | Always Set | Purpose |
|--------|------|-----------|---------|
| `USE_TEMPORAL_ACCUMULATION` | Render target | Conditional | Triggers MRT output declaration in precision block |

---

## Part 4: DATA FLOW ARCHITECTURE

### 4.1 Quantum Preset Generation Flow

```
Store States:
  presetName, seed, termCount, maxQuantumNumber, frequencySpread, dimension
    ↓
Check Version (prevQuantumConfigRef):
  - Compare all values for changes (float tolerance 0.001 for spread)
    ↓
[IF CHANGED]
  generateQuantumPreset() or getNamedPreset()
    → QuantumPreset {
        termCount, 
        terms[]: { 
          n[], 
          coeff (complex), 
          energy 
        },
        omega[]
      }
    ↓
  flattenPresetForUniforms(preset)
    → {
        omega: Float32Array,
        quantum: Int32Array (flattened),
        coeff: Float32Array (flattened),
        energy: Float32Array
      }
    ↓
  quantumArraysRef.current.update(flattened)
    ↓
  Uniforms.set():
    - uTermCount ← preset.termCount
    - uOmega ← quantumArrays.omega
    - uQuantum ← quantumArrays.quantum
    - uCoeff ← quantumArrays.coeff
    - uEnergy ← quantumArrays.energy
```

### 4.2 Hydrogen Orbital Configuration Flow

```
Store States:
  principalQuantumNumber (n),
  azimuthalQuantumNumber (l),
  magneticQuantumNumber (m),
  bohrRadiusScale,
  useRealOrbitals
    ↓
Validation:
  validN = max(1, n)
  validL = max(0, min(l, n-1))
  validM = max(-L, min(m, L))
    ↓
Precomputation:
  hydrogenBoost = 50.0 * n² * 3^l
  hydrogenNDBoost = hydrogenBoost * (1.0 + (dim-3)*0.3)
  hydrogenRadialThreshold = 25.0 * n * a0 * (1.0 + 0.1*l)
    ↓
Uniforms.set():
  - uPrincipalN ← validN
  - uAzimuthalL ← validL
  - uMagneticM ← validM
  - uBohrRadius ← bohrRadiusScale
  - uUseRealOrbitals ← boolean
  - uHydrogenBoost ← precomputed
  - uHydrogenNDBoost ← precomputed
  - uHydrogenRadialThreshold ← precomputed
```

### 4.3 Basis Vector & Origin Flow

```
Store State: parameterValues, rotationsChanged

[EVERY FRAME]
  rotationUpdates.getBasisVectors(rotationsChanged)
    → Cached computation:
      - uBasisX, uBasisY, uBasisZ (normalized D-dimensional vectors)
      - basisChanged flag
    ↓
[IF BASIS CHANGED or SLICE ANIMATION]
  Build originValues array (pre-allocated):
    - [0..2] = 0 (3D slice plane center)
    - [3..D-1] = either:
      a) sliceAnimationEnabled:
         parameterValue[i-3] + offset(time, speed, amplitude)
      b) else:
         parameterValue[i-3] (static)
    ↓
  rotationUpdates.getOrigin(originValues)
    → Rotate origin by cached rotation matrix
    ↓
  Uniforms.set():
    - uBasisX ← computed
    - uBasisY ← computed
    - uBasisZ ← computed
    - uOrigin ← rotated origin
```

### 4.4 Color System Flow

```
Store States:
  faceColor (sRGB), colorAlgorithm, cosineA/B/C/D, 
  distPower/Cycles/Offset, lchLightness/Chroma, multiSourceWeights
    ↓
[IF APPEARANCE CHANGED]
  updateLinearColorUniform(cache, uColor.value, faceColor)
    → Convert sRGB → Linear for GPU
    ↓
  UniformManager.applyToMaterial(..., 'color')
    → Centralized color uniform application:
      - uColorAlgorithm
      - uCosineA/B/C/D
      - uDistPower/Cycles/Offset
      - uLchLightness/Chroma
      - uMultiSourceWeights
```

### 4.5 Lighting System Flow

```
Store State: lightingStore (ambient, lights array)

[EVERY FRAME]
  UniformManager.applyToMaterial(..., 'lighting')
    → Centralized lighting uniform application:
      - Ambient: color, intensity, enabled
      - Lights (MAX_LIGHTS=32):
        - positions[i], directions[i], colors[i], intensities[i]
        - types[i] (0=Dir, 1=Point, 2=Spot)
        - ranges[i], angles[i] (point/spot specific)
        - enabled[i]
      - Multi-light: count, specular color, intensity
```

### 4.6 PBR System Flow

```
Store State: pbr stores (roughness, metallic)

[EVERY FRAME]
  UniformManager.applyToMaterial(..., 'pbr-face')
    → Centralized PBR uniform application:
      - uRoughness
      - uMetallic
      (Note: Other PBR like specularColor/Intensity from lighting)
```

### 4.7 Appearance Settings Flow

```
Store State: appearanceState (sss, emission, rim, etc.)

[IF APPEARANCE VERSION CHANGED - dirty flag]
  Updates (via updateLinearColorUniform for colors):
    - uSssEnabled, uSssIntensity, uSssColor, uSssThickness, uSssJitter
    - uEmissionIntensity, uEmissionThreshold, uEmissionColorShift, uEmissionPulsing
    - uRimExponent
    - uFresnelEnabled, uFresnelIntensity, uRimColor
    - uColor
```

### 4.8 Temporal System Flow

```
[IF TEMPORAL REPROJECTION ENABLED for isosurface]
  getTemporalUniforms()
    → Provides:
      - uPrevDepthTexture (sampler2D from previous frame)
      - uPrevViewProjectionMatrix
      - uDepthBufferResolution
    ↓
  In shader (mainBlock with USE_TEMPORAL):
    - getTemporalDepth(ro, rd, worldRayDir)
      → Project into previous frame, sample depth
      → Perform conservative margin adjustment (50%)
      → Apply min/max skip fraction safety checks
    ↓
    - Adjust tNear if temporal gives meaningful skip

[IF TEMPORAL ACCUMULATION ENABLED for volumetric]
  TemporalCloudPass updates per frame:
    - uBayerOffset (sub-pixel jitter pattern)
    - uFullResolution (for quarter-res detection)
    ↓
  In shader (mainBlock with USE_TEMPORAL_ACCUMULATION):
    - Detect if rendering at quarter-res or full-res
    - Apply Bayer offset to screenCoord
    - Compute ray direction from screen coordinates (not vPosition)
    - Output weighted center to gPosition.w (for reconstruction)
```

### 4.9 IBL (Image-Based Lighting) Flow

```
[IF IBL VERSION CHANGED - dirty flag]
  Check scene.environment:
    isPMREM = (mapping === CubeUVReflectionMapping)
    ↓
  Uniforms.set():
    - uIBLQuality ← isPMREM ? qualityMap[iblQuality] : 0
    - uIBLIntensity ← iblIntensity
    - uEnvMap ← isPMREM ? env : null
```

### 4.10 Schroedinger-Specific Settings Flow

```
[IF SCHROEDINGER VERSION CHANGED - dirty flag]
  Updates all non-quantum uniforms:
    - Volume: timeScale, fieldScale, densityGain, powderScale, scatteringAnisotropy
    - Erosion: strength, scale, turbulence, noiseType
    - Curl: enabled, strength, scale, speed, bias
    - Dispersion: enabled, strength, direction, quality
    - Shadows: enabled, strength, steps
    - AO: enabled, strength, quality, radius, color
    - Quantum Effects: nodalEnabled, nodalColor, nodalStrength,
                      energyColorEnabled, shimmerEnabled, shimmerStrength
    - Isosurface: isoEnabled, isoThreshold
```

### 4.11 Material Lifecycle

```
[MATERIAL CHANGE DETECTION]
  material !== prevMaterialRef.current
    ↓
  Force full sync:
    lastSchroedingerVersionRef.current = -1
    lastAppearanceVersionRef.current = -1
    lastIblVersionRef.current = -1
    prevMaterialRef.current = material
    ↓
  All dirty flags trigger full uniform update on next frame
```

---

## Part 5: SHADER COMPOSITION STRATEGY

### 5.1 Module Inclusion Logic

**Always Included:**
- Precision + MRT output declaration (changes with `USE_TEMPORAL_ACCUMULATION`)
- Constants
- Shared uniforms (camera, resolution, etc.)
- Schrödinger uniforms
- Complex math
- Hermite polynomials
- HO 1D basis
- HO ND (exact dimension block matching `ACTUAL_DIM`)
- Density mapping (dimension-specific)
- Beer-Lambert absorption
- Volume emission
- Volume integration
- Sphere intersection
- Main shader block

**Conditionally Included (Quantum Mode):**
- If `!quantumMode || 'hydrogenOrbital' || 'hydrogenND'`:
  - Laguerre, Legendre, Spherical Harmonics
  - Hydrogen Radial, Hydrogen Psi
- If `!quantumMode || 'hydrogenND'`:
  - Hydrogen ND Common
  - Specific dimension block (3D-11D)
  - Hydrogen ND Dispatch

**Conditionally Included (Color):**
- HSL color (if needed by colorAlgorithm)
- Cosine palette (if needed by colorAlgorithm)
- Oklab (if needed by colorAlgorithm)
- Color selector (full or optimized by colorAlgorithm)

**Conditionally Included (Lighting):**
- GGX PBR (if lightingMode includes PBR)
- Multi-Light (if lightingMode includes PBR)
- IBL uniforms + PMREM sampling + IBL functions (if lightingMode === 'full')

**Conditionally Included (Effects):**
- Temporal block (if `USE_TEMPORAL` but not `USE_TEMPORAL_ACCUMULATION`)
- (Erosion, Curl, Dispersion, SSS, Fresnel, etc. are runtime toggles in main, not separate modules)

**Conditionally Included (HO Optimization):**
- If `termCount` specified and `quantumMode !== 'hydrogenOrbital'`:
  - Unrolled superposition blocks (1 block for specified termCount)
  - Unrolled spatial blocks
  - Unrolled combined blocks
  - HO Dispatch (unrolled)
- Else:
  - Unified psi block (dynamic with runtime termCount loop)

### 5.2 Vertex Shader Variants

**Standard Mode (no temporal accumulation):**
```glsl
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
```

**Temporal Accumulation Mode:**
```glsl
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  // No vPosition output - fragment computes ray from uInverseViewProjectionMatrix
}
```

---

## Part 6: MEMORY LAYOUT & CONSTANTS

### 6.1 Canonical Constants
```typescript
export const MAX_DIM = 11         // Maximum dimensions (3-11)
export const MAX_TERMS = 8        // Maximum superposition terms
export const MAX_EXTRA_DIM = 8    // Hydrogen ND extra dims (4-11)
export const MAX_LIGHTS = 32      // Maximum light count
export const BOUND_R = sqrt(3)    // Bounding sphere radius
```

### 6.2 Array Flattening Scheme

**uQuantum[MAX_TERMS * MAX_DIM]:** Flattened as `n[term][dim]`
```
Index = term * MAX_DIM + dim
Value = quantum number for term k, dimension j
```

**uCoeff[MAX_TERMS * 2]:** Flattened as `{re_k, im_k}`
```
Index = term * 2 + 0 = real part
Index = term * 2 + 1 = imaginary part
```

### 6.3 Pre-allocated Arrays in Component

```typescript
quantumArraysRef.current = {
  omega: Float32Array(MAX_DIM),           // Reused every preset change
  quantum: Int32Array(MAX_TERMS * MAX_DIM),  // Reused every preset change
  coeff: Float32Array(MAX_TERMS * 2),     // Reused every preset change
  energy: Float32Array(MAX_TERMS)         // Reused every preset change
}

originValuesRef.current = new Array(MAX_DIMENSION).fill(0)  // Reused every frame
colorCacheRef.current = createColorCache()  // Linear color conversion cache
```

---

## Part 7: PERFORMANCE OPTIMIZATIONS

### 7.1 Dirty Flag Tracking
- `lastSchroedingerVersionRef` - Skip non-quantum uniform updates if unchanged
- `lastAppearanceVersionRef` - Skip appearance uniform updates if unchanged
- `lastIblVersionRef` - Skip IBL uniform updates if unchanged
- `prevMaterialRef` - Detect material changes and force sync

### 7.2 Pre-allocation & Reuse
- Quantum arrays pre-allocated, reused on preset regeneration
- Origin values array pre-allocated, cleared/reused every frame
- Color cache for linear conversion, reused across frames
- Rotation updates cached with `rotationUpdates.rotationMatrix`

### 7.3 Compile-time Optimizations
- `ACTUAL_DIM {N}` - Eliminates runtime dimension branching
- `HO_UNROLLED` - Eliminates runtime term loop
- `HYDROGEN_ND_DIMENSION {N}` - Single dimension block, no dispatch
- `EROSION_NOISE_TYPE {N}` - Single noise function, no branching
- Color module inclusion - Only include needed color algorithms
- Lighting module inclusion - Only include needed lighting effects

### 7.4 Precomputed Values
- Hydrogen boost factors computed once per uniform change (not per sample)
- Hydrogen radial threshold precomputed (not per sample)
- Eigenstate energies precomputed in preset (not per sample)

### 7.5 Sample Count Optimization
- Sample count fixed in shader, not via uniform (eliminates branching)
- Fast mode: 32 samples fixed
- HQ mode: 64 samples fixed
- Quality multiplier applied globally (via `uFastMode` not loop count)

---

## Part 8: CRITICAL IMPLEMENTATION NOTES

### 8.1 Slice Animation Details
```typescript
const PHI = 1.618033988749895
const timeInSeconds = accumulatedTime
for (let i = 3; i < D; i++) {
  const extraDimIndex = i - 3
  const phase = extraDimIndex * PHI      // Golden ratio spacing
  const t1 = timeInSeconds * sliceSpeed * 2 * Math.PI + phase
  const t2 = timeInSeconds * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
  const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
  originValues[i] = parameterValues[extraDimIndex] + offset
}
```

### 8.2 Spread Animation Details (Hydrogen ND)
```typescript
if (spreadAnimationEnabled) {
  const t = accumulatedTime * (spreadAnimationSpeed ?? 0.5)
  const phase = (Math.sin(t) + 1.0) * 0.5  // 0 to 1 oscillation
  effectiveSpread = 0.01 + phase * 0.44    // Range: 0.01 (tight) to 0.45 (diffuse)
}
```

### 8.3 Temporal Accumulation Detection
```glsl
bool isQuarterRes = uResolution.x < uFullResolution.x * 0.75
if (isQuarterRes) {
  screenCoord = floor(gl_FragCoord.xy) * 2.0 + uBayerOffset + 0.5
}
```

### 8.4 Frequency Spread Application (Hydrogen ND)
```typescript
for (let i = 0; i < 8; i++) {
  const baseOmega = extraDimOmega[i] ?? 1.0
  const spread = 1.0 + (i - 3.5) * (extraDimFrequencySpread ?? 0)
  arr[i] = baseOmega * spread
}
```

### 8.5 Transparency Handling
```typescript
const isTransparent = useTemporalAccumulation
if (material.transparent !== isTransparent) {
  material.transparent = isTransparent
  material.depthWrite = !isTransparent
  material.needsUpdate = true
}
```

### 8.6 Render Layer Assignment
- Temporal accumulation: `RENDER_LAYERS.VOLUMETRIC` (1/4 res separate pass)
- Default: `RENDER_LAYERS.MAIN_OBJECT` (main scene)
- Assignment via `useLayoutEffect` to ensure before first render

### 8.7 Frame Priority
- `FRAME_PRIORITY.RENDERER_UNIFORMS` (-10) - CRITICAL priority
- Ensures uniforms update BEFORE PostProcessing volumetric render pass
- Without this, volumetric pass sees stale uniforms and renders black

---

## Part 9: SUMMARY TABLE - All Uniforms at a Glance

**Total Uniforms: ~120+ (varies by feature compilation)**

### By Category
- **Transform:** 10 (basis, origin, model, matrices)
- **Camera:** 3 (position, resolution, time)
- **Quantum Config:** 15 (mode, HO params, H-orbital, H-ND)
- **Volume Rendering:** 10 (density, emission, scales)
- **Lighting:** 40+ (ambient, multi-light, PBR, IBL)
- **Effects:** 30+ (SSS, erosion, curl, dispersion, shadows, AO, nodal, shimmer)
- **Color:** 10 (algorithm, cosine, distribution, LCH)
- **Temporal:** 6 (reprojection, accumulation, matrices)

### By Update Frequency
- **Every Frame:** Time, Camera, Matrices, Basis Vectors, Origin
- **On Quantum Change:** Term count, Omega, Quantum, Coeff, Energy
- **On Hydrogen Change:** Quantum numbers, Boost factors, Radial threshold
- **On Appearance Change:** Colors, SSS, Emission, Rim
- **On Schroedinger Change:** Volume params, Effects toggles
- **On IBL Change:** Environment map, IBL quality
- **On Material Change:** Force full sync

