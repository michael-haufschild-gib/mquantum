import {
    flattenPresetForUniforms,
    generateQuantumPreset,
    getNamedPreset,
    type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets';
// Note: Schrödinger uses fixed sample counts (64 HQ, 32 fast) directly in shader
import { createColorCache, updateLinearColorUniform } from '@/rendering/colors/linearCache';
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { needsVolumetricSeparation, RENDER_LAYERS } from '@/rendering/core/layers';
import { useTemporalDepthUniforms } from '@/rendering/core/useTemporalDepthUniforms';
import { TrackedShaderMaterial } from '@/rendering/materials/TrackedShaderMaterial';
import {
    MAX_DIMENSION,
    useQualityTracking,
    useRotationUpdates,
} from '@/rendering/renderers/base';
import { composeSchroedingerShader } from '@/rendering/shaders/schroedinger/compose';
import { MAX_DIM, MAX_TERMS } from '@/rendering/shaders/schroedinger/uniforms.glsl';
import { UniformManager } from '@/rendering/uniforms/UniformManager';
// Sample count is fixed in shader: 64 (HQ) or 32 (fast mode)
import { useAnimationStore } from '@/stores/animationStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useWebGLContextStore } from '@/stores/webglContextStore';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from './schroedinger.vert?raw';

/**
 * Pre-allocated quantum uniform arrays
 */
interface QuantumArrays {
  omega: Float32Array;
  quantum: Int32Array;
  coeff: Float32Array;
  energy: Float32Array;
}

function createQuantumArrays(): QuantumArrays {
  return {
    omega: new Float32Array(MAX_DIM),
    quantum: new Int32Array(MAX_TERMS * MAX_DIM),
    coeff: new Float32Array(MAX_TERMS * 2),
    energy: new Float32Array(MAX_TERMS),
  };
}

/**
 * SchroedingerMesh - Renders N-dimensional quantum wavefunction volumes
 *
 * Visualizes superposition of harmonic oscillator eigenstates using
 * Beer-Lambert volumetric raymarching. The 3D slice plane is rotated
 * through D-dimensional space using rotated basis vectors.
 * @returns The Schroedinger wavefunction mesh component
 */
const SchroedingerMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, camera } = useThree();

  // Get temporal depth uniforms getter from render graph store
  const getTemporalUniforms = useTemporalDepthUniforms();

  // Use shared quality tracking hook
  const { rotationsChanged } = useQualityTracking();

  // Pre-allocated quantum arrays
  const quantumArraysRef = useRef<QuantumArrays>(createQuantumArrays());

  // Note: Lighting version tracking and color caching now handled by LightingSource via UniformManager

  // Track quantum config changes to regenerate preset
  const prevQuantumConfigRef = useRef<{
    presetName: string;
    seed: number;
    termCount: number;
    maxQuantumNumber: number;
    frequencySpread: number;
    dimension: number;
  } | null>(null);
  const currentPresetRef = useRef<QuantumPreset | null>(null);

  // Cached linear colors for non-lighting uniforms
  const colorCacheRef = useRef(createColorCache());

  // PERF: Pre-allocated array for origin values to avoid allocation every frame
  const originValuesRef = useRef(new Array(MAX_DIMENSION).fill(0) as number[]);

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastSchroedingerVersionRef = useRef(-1); // -1 forces full sync on first frame
  const lastAppearanceVersionRef = useRef(-1);
  const lastIblVersionRef = useRef(-1);
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // ============================================
  // PERFORMANCE OPTIMIZATION: Only subscribe to values that affect shader compilation
  // All other values are read via getState() in useFrame to avoid unnecessary re-renders
  // ============================================

  // Values that affect shader compilation (require re-subscription)
  const dimension = useGeometryStore((state) => state.dimension);
  const isoEnabled = useExtendedObjectStore((state) => state.schroedinger.isoEnabled);
  const quantumMode = useExtendedObjectStore((state) => state.schroedinger.quantumMode);

  // ParameterValues subscription for rotation hook (also read via getState in useFrame for other uses)
  const parameterValues = useExtendedObjectStore((state) => state.schroedinger.parameterValues);

  // Use shared rotation hook for basis vector computation with caching
  const rotationUpdates = useRotationUpdates({ dimension, parameterValues });

  // Context restore counter - forces material recreation when context is restored
  const restoreCount = useWebGLContextStore((state) => state.restoreCount);

  const uniforms = useMemo(
    () => ({
      // Time and resolution
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uCameraPosition: { value: new THREE.Vector3() },

      // Dimension
      uDimension: { value: 4 },

      // D-dimensional rotated coordinate system
      uBasisX: { value: new Float32Array(MAX_DIM) },
      uBasisY: { value: new Float32Array(MAX_DIM) },
      uBasisZ: { value: new Float32Array(MAX_DIM) },
      uOrigin: { value: new Float32Array(MAX_DIM) },

      // Quantum mode selection (0 = harmonic oscillator, 1 = hydrogen orbital)
      uQuantumMode: { value: 0 },

      // Harmonic oscillator state configuration
      uTermCount: { value: 6 },
      uOmega: { value: new Float32Array(MAX_DIM) },
      uQuantum: { value: new Int32Array(MAX_TERMS * MAX_DIM) },
      uCoeff: { value: new Float32Array(MAX_TERMS * 2) },
      uEnergy: { value: new Float32Array(MAX_TERMS) },

      // Hydrogen orbital configuration
      uPrincipalN: { value: 2 },
      uAzimuthalL: { value: 1 },
      uMagneticM: { value: 0 },
      uBohrRadius: { value: 1.0 },
      uUseRealOrbitals: { value: true },

      // PERF: Precomputed hydrogen density boost factors (avoid pow() per sample)
      uHydrogenBoost: { value: 200.0 }, // 50 * n² * 3^l (default: n=2, l=1 -> 50*4*3=600)
      uHydrogenNDBoost: { value: 200.0 }, // uHydrogenBoost * dimFactor
      uHydrogenRadialThreshold: { value: 50.0 }, // 25 * n * a0 * (1 + 0.1*l)

      // Hydrogen ND configuration (extra dimensions 4-11)
      uExtraDimN: { value: new Int32Array(8) },
      uExtraDimOmega: { value: new Float32Array(8) },

      // Phase animation (Hydrogen ND only)
      uPhaseAnimationEnabled: { value: false },

      // Volume rendering parameters
      uSampleCount: { value: 32 }, // Raymarching sample count (from quality preset)
      uTimeScale: { value: 0.5 },
      uFieldScale: { value: 1.0 },
      uDensityGain: { value: 2.0 },
      uPowderScale: { value: 1.0 },
      uEmissionIntensity: { value: 0.0 },
      uEmissionThreshold: { value: 0.3 },
      uEmissionColorShift: { value: 0.0 },
      uEmissionPulsing: { value: false },
      uRimExponent: { value: 3.0 },
      uScatteringAnisotropy: { value: 0.0 },
      // uRoughness, uMetallic, etc. provided by 'pbr-face' via UniformManager.getCombinedUniforms below
      uSssEnabled: { value: false },
      uSssIntensity: { value: 1.0 },
      uSssColor: { value: new THREE.Color('#ff8844') },
      uSssThickness: { value: 1.0 },
      uSssJitter: { value: 0.2 },
      uErosionStrength: { value: 0.0 },
      uErosionScale: { value: 1.0 },
      uErosionTurbulence: { value: 0.5 },
      uErosionNoiseType: { value: 0 },
      uCurlEnabled: { value: false },
      uCurlStrength: { value: 0.3 },
      uCurlScale: { value: 1.0 },
      uCurlSpeed: { value: 1.0 },
      uCurlBias: { value: 0 },
      uDispersionEnabled: { value: false },
      uDispersionStrength: { value: 0.2 },
      uDispersionDirection: { value: 0 },
      uDispersionQuality: { value: 0 },
      uShadowsEnabled: { value: false },
      uShadowStrength: { value: 1.0 },
      uShadowSteps: { value: 4 },
      uAoEnabled: { value: false },
      uAoStrength: { value: 1.0 },
      uAoSteps: { value: 4 },
      uAoRadius: { value: 0.5 },
      uAoColor: { value: new THREE.Color('#000000') },
      uNodalEnabled: { value: false },
      uNodalColor: { value: new THREE.Color('#00ffff') },
      uNodalStrength: { value: 1.0 },
      uEnergyColorEnabled: { value: false },
      uShimmerEnabled: { value: false },
      uShimmerStrength: { value: 0.5 },

      // Isosurface mode
      uIsoEnabled: { value: false },
      uIsoThreshold: { value: -3.0 },

      // Color and palette
      uColor: { value: new THREE.Color().convertSRGBToLinear() },

      // 3D transformation matrices
      uModelMatrix: { value: new THREE.Matrix4() },
      uInverseModelMatrix: { value: new THREE.Matrix4() },
      uProjectionMatrix: { value: new THREE.Matrix4() },
      uViewMatrix: { value: new THREE.Matrix4() },

      // Centralized Uniform Sources:
      // - Lighting: Ambient, Diffuse, Multi-lights
      // - PBR: Roughness, Metallic, Specular (via 'pbr-face')
      // - Temporal: Matrices, Enabled state (matrices updated via source)
      // - Quality: FastMode, QualityMultiplier
      // - Color: Algorithm, Cosine coeffs, Distribution, LCH
      ...UniformManager.getCombinedUniforms(['lighting', 'temporal', 'quality', 'color', 'pbr-face']),

      // Fresnel rim lighting
      uFresnelEnabled: { value: true },
      uFresnelIntensity: { value: 0.5 },
      uRimColor: { value: new THREE.Color('#FFFFFF').convertSRGBToLinear() },

      // Advanced Color System uniforms
      uColorAlgorithm: { value: 1 },
      uCosineA: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uCosineB: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
      uCosineC: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
      uCosineD: { value: new THREE.Vector3(0.0, 0.33, 0.67) },
      uDistPower: { value: 1.0 },
      uDistCycles: { value: 1.0 },
      uDistOffset: { value: 0.0 },
      uLchLightness: { value: 0.7 },
      uLchChroma: { value: 0.15 },
      uMultiSourceWeights: { value: new THREE.Vector3(0.5, 0.3, 0.2) },

      // Temporal Reprojection uniforms (depth-skip for isosurface)
      uPrevDepthTexture: { value: null },
      uPrevViewProjectionMatrix: { value: new THREE.Matrix4() },
      uPrevInverseViewProjectionMatrix: { value: new THREE.Matrix4() },
      uTemporalEnabled: { value: false },
      uDepthBufferResolution: { value: new THREE.Vector2(1, 1) },

      // Temporal Accumulation uniforms (Horizon-style for volumetric)
      uBayerOffset: { value: new THREE.Vector2(0, 0) },
      uFullResolution: { value: new THREE.Vector2(1, 1) },

      // Inverse view projection matrix (needed for temporal accumulation ray direction computation)
      uInverseViewProjectionMatrix: { value: new THREE.Matrix4() },

      // IBL (Image-Based Lighting) uniforms - PMREM texture (sampler2D)
      uEnvMap: { value: null },
      uEnvMapSize: { value: 256.0 },
      uIBLIntensity: { value: 1.0 },
      uIBLQuality: { value: 0 }, // 0=off, 1=low, 2=high
    }),
    []
  );

  // Get temporal settings (subscribed because it affects shader compilation)
  const temporalEnabled = usePerformanceStore((state) => state.temporalReprojectionEnabled);
  const shaderOverrides = usePerformanceStore((state) => state.shaderOverrides);
  const resetShaderOverrides = usePerformanceStore((state) => state.resetShaderOverrides);

  // Conditionally compiled feature toggles (affect shader compilation)
  const sssEnabled = useAppearanceStore((state) => state.sssEnabled);
  const edgesVisible = useAppearanceStore((state) => state.edgesVisible);

  // Quantum volume effects (compile-time optimization)
  const curlEnabled = useExtendedObjectStore((state) => state.schroedinger.curlEnabled);
  const dispersionEnabled = useExtendedObjectStore((state) => state.schroedinger.dispersionEnabled);
  const nodalEnabled = useExtendedObjectStore((state) => state.schroedinger.nodalEnabled);
  const energyColorEnabled = useExtendedObjectStore((state) => state.schroedinger.energyColorEnabled);
  const shimmerEnabled = useExtendedObjectStore((state) => state.schroedinger.shimmerEnabled);
  const erosionStrength = useExtendedObjectStore((state) => state.schroedinger.erosionStrength);
  const erosionHQ = useExtendedObjectStore((state) => state.schroedinger.erosionHQ);
  const erosionEnabled = erosionStrength > 0;

  // Reset overrides when configuration changes
  useEffect(() => {
    resetShaderOverrides();
  }, [dimension, temporalEnabled, isoEnabled, sssEnabled, edgesVisible, curlEnabled, dispersionEnabled, nodalEnabled, energyColorEnabled, shimmerEnabled, erosionEnabled, erosionHQ, resetShaderOverrides]);

  // Compile shader
  // For volumetric mode with temporal enabled, use temporal ACCUMULATION (Horizon-style)
  // For isosurface mode with temporal enabled, use temporal REPROJECTION (depth-skip)
  const useTemporalAccumulation = temporalEnabled && !isoEnabled;

  const { glsl: shaderString, modules, features } = useMemo(() => {
    const result = composeSchroedingerShader({
      dimension,
      shadows: true, // Enable volumetric self-shadowing (runtime toggle via uShadowsEnabled)
      temporal: temporalEnabled && isoEnabled, // Depth-skip only for isosurface
      temporalAccumulation: useTemporalAccumulation,
      ambientOcclusion: true, // Enable volumetric AO (runtime toggle via uAoEnabled)
      overrides: shaderOverrides,
      isosurface: isoEnabled,
      quantumMode: quantumMode, // Modular compilation: only include required quantum modules
      sss: sssEnabled,
      fresnel: edgesVisible,
      // Quantum volume effects (compile-time optimization)
      curl: curlEnabled,
      dispersion: dispersionEnabled,
      nodal: nodalEnabled,
      energyColor: energyColorEnabled,
      shimmer: shimmerEnabled,
      erosion: erosionEnabled,
      erosionHQ: erosionHQ,
    });
    return result;
  }, [dimension, temporalEnabled, shaderOverrides, isoEnabled, useTemporalAccumulation, quantumMode, sssEnabled, edgesVisible, curlEnabled, dispersionEnabled, nodalEnabled, energyColorEnabled, shimmerEnabled, erosionEnabled, erosionHQ]);

  // Update debug info
  useEffect(() => {
    const { setShaderDebugInfo } = usePerformanceStore.getState();
    setShaderDebugInfo('object', {
      name: 'Schrödinger Quantum Volume',
      vertexShaderLength: vertexShader.length,
      fragmentShaderLength: shaderString.length,
      activeModules: modules,
      features: features,
    });
    return () => {
      const { setShaderDebugInfo: clearDebugInfo } = usePerformanceStore.getState();
      clearDebugInfo('object', null);
    };
  }, [shaderString, modules, features]);

  // Assign layer based on temporal accumulation mode
  // When temporal cloud accumulation is active, use VOLUMETRIC layer for separate rendering
  // CRITICAL: Use useLayoutEffect to ensure layer is set BEFORE first render
  // useEffect runs after render, causing the mesh to be on wrong layer for first frames
  useLayoutEffect(() => {
    if (meshRef.current?.layers) {
      const useVolumetricLayer = needsVolumetricSeparation({
        temporalCloudAccumulation: useTemporalAccumulation,
        objectType: 'schroedinger',
      });

      if (useVolumetricLayer) {
        // Use VOLUMETRIC layer for temporal accumulation (rendered separately at 1/4 res)
        meshRef.current.layers.set(RENDER_LAYERS.VOLUMETRIC);
      } else {
        // Standard main object layer (rendered as part of main scene)
        meshRef.current.layers.set(RENDER_LAYERS.MAIN_OBJECT);
      }
    }
  }, [useTemporalAccumulation]);

  // CRITICAL: Use negative priority (-10) to ensure uniforms are updated BEFORE
  // PostProcessing's useFrame runs the volumetric render pass.
  // Without this, the volumetric render uses stale uniforms and appears black.
  useFrame((state) => {
    // Update animation time
    const accumulatedTime = useAnimationStore.getState().accumulatedTime;

    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;

      // Guard: Skip uniform updates if material is a placeholder (during shader compilation)
      // TrackedShaderMaterial returns meshBasicMaterial while compiling, which has no uniforms
      if (!material.uniforms) return;

      // ============================================
      // DIRTY-FLAG: Detect material change and reset version refs
      // ============================================
      const materialChanged = material !== prevMaterialRef.current;
      if (materialChanged) {
        prevMaterialRef.current = material;
        lastSchroedingerVersionRef.current = -1; // Force full sync on material change
        lastAppearanceVersionRef.current = -1;
        lastIblVersionRef.current = -1;
      }

      // ============================================
      // PERFORMANCE: Read all state via getState() to avoid re-render subscriptions
      // ============================================
      const extendedState = useExtendedObjectStore.getState();
      const schroedinger = extendedState.schroedinger;
      const schroedingerVersion = extendedState.schroedingerVersion;
      const appearanceState = useAppearanceStore.getState();
      const appearanceVersion = appearanceState.appearanceVersion;
      const environmentState = useEnvironmentStore.getState();
      const iblVersion = environmentState.iblVersion;
      // Note: Lighting state available via useLightingStore.getState() when needed

      // ============================================
      // DIRTY-FLAG: Check which categories need updating
      // ============================================
      const schroedingerChanged = schroedingerVersion !== lastSchroedingerVersionRef.current;
      const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current;
      const iblChanged = iblVersion !== lastIblVersionRef.current;

      // Apply scale to mesh
      const scale = schroedinger.scale;
      meshRef.current.scale.set(scale, scale, scale);

      // Cache for colors
      const cache = colorCacheRef.current;

      // Sample count is now fixed in shader (64 HQ / 32 fast mode)
      // No uniform update needed - shader handles fast mode automatically

      // Time and resolution
      // Use accumulatedTime which respects pause state and is synced globally
      if (material.uniforms.uTime) material.uniforms.uTime.value = accumulatedTime;
      if (material.uniforms.uResolution) material.uniforms.uResolution.value.set(size.width, size.height);
      if (material.uniforms.uCameraPosition) material.uniforms.uCameraPosition.value.copy(camera.position);

      // Model matrices (for ray transformation from world to local space)
      if (meshRef.current) {
        meshRef.current.updateMatrixWorld();
        if (material.uniforms.uModelMatrix) {
          material.uniforms.uModelMatrix.value.copy(meshRef.current.matrixWorld);
        }
        if (material.uniforms.uInverseModelMatrix) {
          material.uniforms.uInverseModelMatrix.value.copy(meshRef.current.matrixWorld).invert();
        }
      }

      // Dimension
      if (material.uniforms.uDimension) material.uniforms.uDimension.value = dimension;

      // ============================================
      // Quantum Preset Generation
      // Check if we need to regenerate the preset
      // ============================================
      const { presetName, seed, termCount, maxQuantumNumber, frequencySpread, spreadAnimationEnabled, spreadAnimationSpeed, quantumMode, principalQuantumNumber, azimuthalQuantumNumber, magneticQuantumNumber, bohrRadiusScale, useRealOrbitals } = schroedinger;

      // Update quantum mode uniform (0 = harmonic oscillator, 1 = hydrogen orbital, 2 = hydrogen ND)
      if (material.uniforms.uQuantumMode) {
        const modeMap: Record<string, number> = {
          'harmonicOscillator': 0,
          'hydrogenOrbital': 1,
          'hydrogenND': 2,
        };
        material.uniforms.uQuantumMode.value = modeMap[quantumMode] ?? 0;
      }

      // Update hydrogen orbital uniforms with validation
      // Quantum number constraints:
      //   n >= 1 (principal quantum number)
      //   0 <= l < n (azimuthal/angular momentum)
      //   -l <= m <= l (magnetic quantum number)
      const validN = Math.max(1, principalQuantumNumber);
      const validL = Math.max(0, Math.min(azimuthalQuantumNumber, validN - 1));
      const validM = Math.max(-validL, Math.min(magneticQuantumNumber, validL));

      if (material.uniforms.uPrincipalN) material.uniforms.uPrincipalN.value = validN;
      if (material.uniforms.uAzimuthalL) material.uniforms.uAzimuthalL.value = validL;
      if (material.uniforms.uMagneticM) material.uniforms.uMagneticM.value = validM;
      if (material.uniforms.uBohrRadius) material.uniforms.uBohrRadius.value = bohrRadiusScale;
      if (material.uniforms.uUseRealOrbitals) material.uniforms.uUseRealOrbitals.value = useRealOrbitals;

      // PERF: Precompute hydrogen density boost factors (avoid pow() per sample)
      // hydrogenBoost = 50 * n² * 3^l
      const lBoost = Math.pow(3.0, validL);
      const hydrogenBoost = 50.0 * validN * validN * lBoost;
      if (material.uniforms.uHydrogenBoost) material.uniforms.uHydrogenBoost.value = hydrogenBoost;

      // hydrogenNDBoost = hydrogenBoost * (1 + (dim - 3) * 0.3)
      const dimFactor = 1.0 + (dimension - 3) * 0.3;
      const hydrogenNDBoost = hydrogenBoost * dimFactor;
      if (material.uniforms.uHydrogenNDBoost) material.uniforms.uHydrogenNDBoost.value = hydrogenNDBoost;

      // PERF: Precompute early exit threshold = 25 * n * a0 * (1 + 0.1*l)
      const hydrogenRadialThreshold = 25.0 * validN * bohrRadiusScale * (1.0 + 0.1 * validL);
      if (material.uniforms.uHydrogenRadialThreshold) material.uniforms.uHydrogenRadialThreshold.value = hydrogenRadialThreshold;

      // Update Hydrogen ND uniforms (extra dimensions 4-11)
      const { extraDimQuantumNumbers, extraDimOmega, extraDimFrequencySpread } = schroedinger;
      if (material.uniforms.uExtraDimN && extraDimQuantumNumbers) {
        const arr = material.uniforms.uExtraDimN.value as Int32Array;
        for (let i = 0; i < 8; i++) {
          arr[i] = extraDimQuantumNumbers[i] ?? 0;
        }
      }
      if (material.uniforms.uExtraDimOmega && extraDimOmega) {
        const arr = material.uniforms.uExtraDimOmega.value as Float32Array;
        // Apply frequency spread to omega values (like HO mode)
        for (let i = 0; i < 8; i++) {
          const baseOmega = extraDimOmega[i] ?? 1.0;
          const spread = 1.0 + (i - 3.5) * (extraDimFrequencySpread ?? 0);
          arr[i] = baseOmega * spread;
        }
      }

      // Phase animation (Hydrogen ND only)
      if (material.uniforms.uPhaseAnimationEnabled) {
        material.uniforms.uPhaseAnimationEnabled.value = schroedinger.phaseAnimationEnabled;
      }

      let effectiveSpread = frequencySpread;
      if (spreadAnimationEnabled) {
         // Wavepacket Dispersion Animation
         // Oscillate spread to show "breathing" between localized (low spread) and delocalized (high spread)
         // Range: 0.01 (tight) to 0.45 (messy fog)
         const t = accumulatedTime * (spreadAnimationSpeed ?? 0.5);
         const phase = (Math.sin(t) + 1.0) * 0.5; // 0 to 1
         effectiveSpread = 0.01 + phase * 0.44;
      }

      const currentConfig = {
        presetName,
        seed,
        termCount,
        maxQuantumNumber,
        frequencySpread: effectiveSpread,
        dimension,
      };

      const needsPresetRegen =
        !prevQuantumConfigRef.current ||
        prevQuantumConfigRef.current.presetName !== currentConfig.presetName ||
        prevQuantumConfigRef.current.seed !== currentConfig.seed ||
        prevQuantumConfigRef.current.termCount !== currentConfig.termCount ||
        prevQuantumConfigRef.current.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
        Math.abs(prevQuantumConfigRef.current.frequencySpread - currentConfig.frequencySpread) > 0.001 || // Float compare
        prevQuantumConfigRef.current.dimension !== currentConfig.dimension;

      if (needsPresetRegen) {
        // Generate or get preset
        let preset: QuantumPreset;
        if (presetName === 'custom') {
          preset = generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread);
        } else {
          preset = getNamedPreset(presetName, dimension) ??
            generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread);
        }

        currentPresetRef.current = preset;
        prevQuantumConfigRef.current = { ...currentConfig };

        // Flatten and update uniform arrays
        const flatData = flattenPresetForUniforms(preset);
        quantumArraysRef.current.omega.set(flatData.omega);
        quantumArraysRef.current.quantum.set(flatData.quantum);
        quantumArraysRef.current.coeff.set(flatData.coeff);
        quantumArraysRef.current.energy.set(flatData.energy);

        // Update uniforms
        if (material.uniforms.uTermCount) material.uniforms.uTermCount.value = preset.termCount;
        if (material.uniforms.uOmega) {
          (material.uniforms.uOmega.value as Float32Array).set(quantumArraysRef.current.omega);
        }
        if (material.uniforms.uQuantum) {
          (material.uniforms.uQuantum.value as Int32Array).set(quantumArraysRef.current.quantum);
        }
        if (material.uniforms.uCoeff) {
          (material.uniforms.uCoeff.value as Float32Array).set(quantumArraysRef.current.coeff);
        }
        if (material.uniforms.uEnergy) {
          (material.uniforms.uEnergy.value as Float32Array).set(quantumArraysRef.current.energy);
        }
      }

      // Global visuals from appearance store (version-tracked via appearanceChanged)
      const { sssEnabled, sssIntensity, sssColor, sssThickness, sssJitter, faceEmission, faceEmissionThreshold, faceEmissionColorShift, faceEmissionPulsing, faceRimFalloff, faceColor, edgesVisible, fresnelIntensity, edgeColor } = appearanceState;

      // ============================================
      // DIRTY-FLAG: Only update schroedinger uniforms when settings change
      // ============================================
      if (schroedingerChanged) {
        // Volume rendering parameters
        const { timeScale, fieldScale, densityGain, powderScale, erosionStrength, erosionScale, erosionTurbulence, erosionNoiseType, curlEnabled, curlStrength, curlScale, curlSpeed, curlBias, dispersionEnabled, dispersionStrength, dispersionDirection, dispersionQuality, shadowsEnabled, shadowStrength, shadowSteps, aoEnabled, aoStrength, aoQuality, aoRadius, aoColor, nodalEnabled, nodalColor, nodalStrength, energyColorEnabled, shimmerEnabled, shimmerStrength, isoThreshold, scatteringAnisotropy } = schroedinger;

        if (material.uniforms.uTimeScale) material.uniforms.uTimeScale.value = timeScale;
        if (material.uniforms.uFieldScale) material.uniforms.uFieldScale.value = fieldScale;
        if (material.uniforms.uDensityGain) material.uniforms.uDensityGain.value = densityGain;
        if (material.uniforms.uPowderScale) material.uniforms.uPowderScale.value = powderScale;
        if (material.uniforms.uScatteringAnisotropy) material.uniforms.uScatteringAnisotropy.value = scatteringAnisotropy;

        // Erosion
        if (material.uniforms.uErosionStrength) material.uniforms.uErosionStrength.value = erosionStrength;
        if (material.uniforms.uErosionScale) material.uniforms.uErosionScale.value = erosionScale;
        if (material.uniforms.uErosionTurbulence) material.uniforms.uErosionTurbulence.value = erosionTurbulence;
        if (material.uniforms.uErosionNoiseType) material.uniforms.uErosionNoiseType.value = erosionNoiseType;

        // Curl
        if (material.uniforms.uCurlEnabled) material.uniforms.uCurlEnabled.value = curlEnabled;
        if (material.uniforms.uCurlStrength) material.uniforms.uCurlStrength.value = curlStrength;
        if (material.uniforms.uCurlScale) material.uniforms.uCurlScale.value = curlScale;
        if (material.uniforms.uCurlSpeed) material.uniforms.uCurlSpeed.value = curlSpeed;
        if (material.uniforms.uCurlBias) material.uniforms.uCurlBias.value = curlBias;

        // Dispersion
        if (material.uniforms.uDispersionEnabled) material.uniforms.uDispersionEnabled.value = dispersionEnabled;
        if (material.uniforms.uDispersionStrength) material.uniforms.uDispersionStrength.value = dispersionStrength;
        if (material.uniforms.uDispersionDirection) material.uniforms.uDispersionDirection.value = dispersionDirection;
        if (material.uniforms.uDispersionQuality) material.uniforms.uDispersionQuality.value = dispersionQuality;

        // Shadows
        if (material.uniforms.uShadowsEnabled) material.uniforms.uShadowsEnabled.value = shadowsEnabled;
        if (material.uniforms.uShadowStrength) material.uniforms.uShadowStrength.value = shadowStrength;
        if (material.uniforms.uShadowSteps) material.uniforms.uShadowSteps.value = shadowSteps;

        // Schrödinger uses its own AO toggle (unified UI sets aoEnabled directly)
        if (material.uniforms.uAoEnabled) material.uniforms.uAoEnabled.value = aoEnabled;
        if (material.uniforms.uAoStrength) material.uniforms.uAoStrength.value = aoStrength;
        if (material.uniforms.uAoSteps) material.uniforms.uAoSteps.value = aoQuality;
        if (material.uniforms.uAoRadius) material.uniforms.uAoRadius.value = aoRadius;
        if (material.uniforms.uAoColor) {
          updateLinearColorUniform(cache.faceColor /* reuse helper */, material.uniforms.uAoColor.value as THREE.Color, aoColor || '#000000');
        }

        // Quantum effects
        if (material.uniforms.uNodalEnabled) material.uniforms.uNodalEnabled.value = nodalEnabled;
        if (material.uniforms.uNodalStrength) material.uniforms.uNodalStrength.value = nodalStrength;
        if (material.uniforms.uNodalColor) {
          updateLinearColorUniform(cache.faceColor /* reuse helper */, material.uniforms.uNodalColor.value as THREE.Color, nodalColor || '#00ffff');
        }
        if (material.uniforms.uEnergyColorEnabled) material.uniforms.uEnergyColorEnabled.value = energyColorEnabled;
        if (material.uniforms.uShimmerEnabled) material.uniforms.uShimmerEnabled.value = shimmerEnabled;
        if (material.uniforms.uShimmerStrength) material.uniforms.uShimmerStrength.value = shimmerStrength;

        // Isosurface mode
        if (material.uniforms.uIsoEnabled) material.uniforms.uIsoEnabled.value = isoEnabled;
        if (material.uniforms.uIsoThreshold) material.uniforms.uIsoThreshold.value = isoThreshold;

        // Update version ref
        lastSchroedingerVersionRef.current = schroedingerVersion;
      }

      // ============================================
      // DIRTY-FLAG: Only update appearance uniforms when settings change
      // ============================================
      if (appearanceChanged) {
        // Emission & Rim (from appearance store)
        if (material.uniforms.uEmissionIntensity) material.uniforms.uEmissionIntensity.value = faceEmission;
        if (material.uniforms.uEmissionThreshold) material.uniforms.uEmissionThreshold.value = faceEmissionThreshold;
        if (material.uniforms.uEmissionColorShift) material.uniforms.uEmissionColorShift.value = faceEmissionColorShift;
        if (material.uniforms.uEmissionPulsing) material.uniforms.uEmissionPulsing.value = faceEmissionPulsing;
        if (material.uniforms.uRimExponent) material.uniforms.uRimExponent.value = faceRimFalloff;

        // SSS (from appearance store)
        // Note: PBR uniforms (uRoughness, uMetallic, uSpecularIntensity, uSpecularColor)
        // are now applied via UniformManager using 'pbr-face' source
        if (material.uniforms.uSssEnabled) material.uniforms.uSssEnabled.value = sssEnabled;
        if (material.uniforms.uSssIntensity) material.uniforms.uSssIntensity.value = sssIntensity;
        if (material.uniforms.uSssColor) {
          updateLinearColorUniform(cache.faceColor /* reuse helper */, material.uniforms.uSssColor.value as THREE.Color, sssColor || '#ff8844');
        }
        if (material.uniforms.uSssThickness) material.uniforms.uSssThickness.value = sssThickness;
        if (material.uniforms.uSssJitter) material.uniforms.uSssJitter.value = sssJitter;

        // Color (cached linear conversion)
        if (material.uniforms.uColor) {
          updateLinearColorUniform(cache.faceColor, material.uniforms.uColor.value as THREE.Color, faceColor);
        }

        // Fresnel
        if (material.uniforms.uFresnelEnabled) material.uniforms.uFresnelEnabled.value = edgesVisible;
        if (material.uniforms.uFresnelIntensity) material.uniforms.uFresnelIntensity.value = fresnelIntensity;
        if (material.uniforms.uRimColor) {
          updateLinearColorUniform(cache.rimColor, material.uniforms.uRimColor.value as THREE.Color, edgeColor);
        }

        // Update version ref
        lastAppearanceVersionRef.current = appearanceVersion;
      }

      // Camera matrices
      if (material.uniforms.uProjectionMatrix) material.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
      if (material.uniforms.uViewMatrix) material.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);

      // Inverse view projection matrix (needed for temporal accumulation ray direction computation)
      if (material.uniforms.uInverseViewProjectionMatrix) {
        const invVP = material.uniforms.uInverseViewProjectionMatrix.value as THREE.Matrix4;
        invVP.copy(camera.projectionMatrixInverse).premultiply(camera.matrixWorld);
      }

      // Temporal reprojection (depth-skip for isosurface mode)
      const temporalUniforms = getTemporalUniforms();
      if (temporalUniforms && material.uniforms.uPrevDepthTexture) {
        material.uniforms.uPrevDepthTexture.value = temporalUniforms.uPrevDepthTexture;
      }

      // Note: Temporal accumulation uniforms (uBayerOffset, uFullResolution) are now
      // managed by TemporalCloudPass in the render graph. The pass directly updates
      // these uniforms on volumetric meshes during scene traversal.

      // Apply centralized uniform sources (including PBR via 'pbr-face')
      UniformManager.applyToMaterial(material, ['lighting', 'temporal', 'quality', 'color', 'pbr-face']);

      // ============================================
      // DIRTY-FLAG: Only update IBL uniforms when settings change
      // ============================================
      if (iblChanged) {
        // IBL (Image-Based Lighting) uniforms
        // Compute isPMREM first to gate quality (prevents null texture sampling)
        const env = state.scene.environment;
        const isPMREM = env && env.mapping === THREE.CubeUVReflectionMapping;
        if (material.uniforms.uIBLQuality) {
          const qualityMap = { off: 0, low: 1, high: 2 } as const;
          // Force IBL off when no valid PMREM texture
          material.uniforms.uIBLQuality.value = isPMREM ? qualityMap[environmentState.iblQuality] : 0;
        }
        if (material.uniforms.uIBLIntensity) {
          material.uniforms.uIBLIntensity.value = environmentState.iblIntensity;
        }
        if (material.uniforms.uEnvMap) {
          material.uniforms.uEnvMap.value = isPMREM ? env : null;
        }

        // Update version ref
        lastIblVersionRef.current = iblVersion;
      }

      // Configure transparency
      // Schrödinger is always fully opaque (solid mode) unless temporal accumulation requires transparency
      // When temporal accumulation is active, we MUST treat the material as transparent
      // to ensure correct alpha behavior and rendering order
      const isTransparent = useTemporalAccumulation;
      if (material.transparent !== isTransparent) {
        material.transparent = isTransparent;
        material.depthWrite = !isTransparent;
        material.needsUpdate = true;
      }

      // ============================================
      // D-dimensional Rotation & Basis Vectors (via shared hook)
      // Only recomputes when rotations, dimension, or params change
      // ============================================
      const D = dimension;
      const { basisX, basisY, basisZ, changed: basisChanged } = rotationUpdates.getBasisVectors(rotationsChanged);

      if (basisChanged) {
        if (material.uniforms.uBasisX) {
          (material.uniforms.uBasisX.value as Float32Array).set(basisX);
        }
        if (material.uniforms.uBasisY) {
          (material.uniforms.uBasisY.value as Float32Array).set(basisY);
        }
        if (material.uniforms.uBasisZ) {
          (material.uniforms.uBasisZ.value as Float32Array).set(basisZ);
        }
      }

      // Get slice animation settings from schroedinger store (already retrieved)
      const { parameterValues: schroedingerParamValues,
              sliceAnimationEnabled, sliceSpeed, sliceAmplitude } = schroedinger;

      // ============================================
      // Origin Update (separate from basis vectors)
      // Must update every frame when slice animation is enabled
      // ============================================
      const needsOriginUpdate = basisChanged || sliceAnimationEnabled;
      const { rotationMatrix: cachedRotationMatrix } = rotationUpdates;

      if (needsOriginUpdate && cachedRotationMatrix) {
        // Build origin values array for rotation (using pre-allocated array)
        const originValues = originValuesRef.current;
        // Clear the array before reuse
        originValues.fill(0);

        if (sliceAnimationEnabled && D > 3) {
          const PHI = 1.618033988749895;
          // Use tracked animation time for proper pause support
          const timeInSeconds = accumulatedTime;

          for (let i = 3; i < D; i++) {
            const extraDimIndex = i - 3;
            const phase = extraDimIndex * PHI;
            const t1 = timeInSeconds * sliceSpeed * 2 * Math.PI + phase;
            const t2 = timeInSeconds * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5;
            const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2));
            originValues[i] = (schroedingerParamValues[extraDimIndex] ?? 0) + offset;
          }
        } else {
          // No slice animation - use static parameter values
          for (let i = 3; i < D; i++) {
            originValues[i] = schroedingerParamValues[i - 3] ?? 0;
          }
        }

        // Get rotated origin from hook
        const { origin } = rotationUpdates.getOrigin(originValues);

        if (material.uniforms.uOrigin) {
          (material.uniforms.uOrigin.value as Float32Array).set(origin);
        }
      }
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS);

  // Generate unique key to force material recreation when shader changes or context is restored
  const materialKey = `schroedinger-material-${shaderString.length}-${features.join(',')}-${restoreCount}`

  return (
    <mesh ref={meshRef} frustumCulled={true}>
      <boxGeometry args={[4, 4, 4]} />
      <TrackedShaderMaterial
        shaderName="Schroedinger Wavefunction"
        materialKey={materialKey}
        glslVersion={THREE.GLSL3}
        vertexShader={vertexShader}
        fragmentShader={shaderString}
        uniforms={uniforms}
        side={THREE.BackSide}
      />
    </mesh>
  );
};

export default SchroedingerMesh;
