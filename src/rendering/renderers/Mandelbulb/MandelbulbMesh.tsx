import { computeDriftedOrigin, type OriginDriftConfig } from '@/lib/animation/originDrift';
import { createColorCache, updateLinearColorUniform } from '@/rendering/colors/linearCache';
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { useTemporalDepthUniforms } from '@/rendering/core/useTemporalDepthUniforms';
import { TrackedShaderMaterial } from '@/rendering/materials/TrackedShaderMaterial';
import {
  MAX_DIMENSION,
  useLayerAssignment,
  useQualityTracking,
  useRotationUpdates,
} from '@/rendering/renderers/base';
import { composeMandelbulbShader } from '@/rendering/shaders/mandelbulb/compose';
import { SHADOW_QUALITY_TO_INT } from '@/rendering/shadows/types';
import { UniformManager } from '@/rendering/uniforms/UniformManager';
import { useAnimationStore } from '@/stores/animationStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useLightingStore } from '@/stores/lightingStore';
import { useMsgBoxStore } from '@/stores/msgBoxStore';
import {
  getEffectiveShadowQuality,
  usePerformanceStore,
} from '@/stores/performanceStore';
import { usePostProcessingStore } from '@/stores/postProcessingStore';
import { useUIStore } from '@/stores/uiStore';
import { useWebGLContextStore } from '@/stores/webglContextStore';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from './mandelbulb.vert?raw';

/**
 * MandelbulbMesh - Renders 4D-11D Mandelbulb fractals using GPU raymarching
 *
 * Supports full D-dimensional rotation through all rotation planes (XY, XZ, YZ, XW, YW, ZW, etc.)
 * The 3D slice plane is rotated through D-dimensional space using rotated basis vectors.
 * @returns Three.js mesh with raymarching shader
 */
const MandelbulbMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, camera, viewport } = useThree();

  // Get temporal depth uniforms getter from render graph store
  const getTemporalUniforms = useTemporalDepthUniforms();

  // Use shared quality tracking hook (replaces manual fast mode management)
  const { qualityMultiplier, rotationsChanged } = useQualityTracking();

  // Cached linear colors - avoid per-frame sRGB->linear conversion
  // Note: Light color caching now handled by LightingSource via UniformManager
  const colorCacheRef = useRef(createColorCache());

  // PERF: Pre-allocated array for origin values to avoid allocation every frame
  const originValuesRef = useRef(new Array(MAX_DIMENSION).fill(0) as number[]);

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastMandelbulbVersionRef = useRef(-1); // -1 forces full sync on first frame
  const lastAppearanceVersionRef = useRef(-1);
  const lastIblVersionRef = useRef(-1);
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Assign main object layer for depth-based effects (SSR, refraction, bokeh)
  useLayerAssignment(meshRef);

  // Get dimension from geometry store
  const dimension = useGeometryStore((state) => state.dimension);

  // Context restore counter - forces material recreation when context is restored
  const restoreCount = useWebGLContextStore((state) => state.restoreCount);

  // Get Mandelbulb/Mandelbulb config from store
  // Note: mandelbulbPower, maxIterations, escapeRadius are read fresh via getState() in useFrame
  // to avoid stale closure issues with dirty-flag optimization
  const scale = useExtendedObjectStore((state) => state.mandelbulb.scale);
  const parameterValues = useExtendedObjectStore((state) => state.mandelbulb.parameterValues);

  // Use shared rotation hook for basis vector computation with caching
  const rotationUpdates = useRotationUpdates({ dimension, parameterValues });

  // Power animation parameters (organic multi-frequency motion)
  const powerAnimationEnabled = useExtendedObjectStore((state) => state.mandelbulb.powerAnimationEnabled);
  const powerMin = useExtendedObjectStore((state) => state.mandelbulb.powerMin);
  const powerMax = useExtendedObjectStore((state) => state.mandelbulb.powerMax);
  const powerSpeed = useExtendedObjectStore((state) => state.mandelbulb.powerSpeed);

  // Note: Alternate power parameters (alternatePowerEnabled, alternatePowerValue, alternatePowerBlend)
  // are read fresh via getState() in useFrame to avoid stale closure issues

  // Origin drift parameters (Technique C - animate slice origin in extra dims)
  const originDriftEnabled = useExtendedObjectStore((state) => state.mandelbulb.originDriftEnabled);
  const driftAmplitude = useExtendedObjectStore((state) => state.mandelbulb.driftAmplitude);
  const driftBaseFrequency = useExtendedObjectStore((state) => state.mandelbulb.driftBaseFrequency);
  const driftFrequencySpread = useExtendedObjectStore((state) => state.mandelbulb.driftFrequencySpread);

  // Dimension mixing parameters (Technique A - shear matrix inside iteration)
  // Note: mixIntensity is read fresh via getState() in useFrame
  const dimensionMixEnabled = useExtendedObjectStore((state) => state.mandelbulb.dimensionMixEnabled);
  const mixFrequency = useExtendedObjectStore((state) => state.mandelbulb.mixFrequency);

  // Slice Animation parameters (4D+ only - fly through higher-dimensional cross-sections)
  const sliceAnimationEnabled = useExtendedObjectStore((state) => state.mandelbulb.sliceAnimationEnabled);
  const sliceSpeed = useExtendedObjectStore((state) => state.mandelbulb.sliceSpeed);
  const sliceAmplitude = useExtendedObjectStore((state) => state.mandelbulb.sliceAmplitude);

  // Phase Shift parameters (angular twisting)
  const phaseShiftEnabled = useExtendedObjectStore((state) => state.mandelbulb.phaseShiftEnabled);
  const phaseSpeed = useExtendedObjectStore((state) => state.mandelbulb.phaseSpeed);
  const phaseAmplitude = useExtendedObjectStore((state) => state.mandelbulb.phaseAmplitude);

  // Animation bias for per-dimension variation
  const animationBias = useUIStore((state) => state.animationBias);

  // Get color state from visual store
  const faceColor = useAppearanceStore((state) => state.faceColor);

  // NOTE: Multi-light system and global lighting settings are now managed by
  // LightingSource via UniformManager. The following selectors were removed:
  // - lights, ambientIntensity, ambientColor, specularIntensity, shininess
  // - specularColor, diffuseIntensity
  // LightingSource accesses useLightingStore.getState() directly with version tracking.

  // Edges render mode controls fresnel rim lighting for Mandelbulb
  const edgesVisible = useAppearanceStore((state) => state.edgesVisible);
  const fresnelIntensity = useAppearanceStore((state) => state.fresnelIntensity);
  const edgeColor = useAppearanceStore((state) => state.edgeColor);

  // Shadow settings
  const shadowEnabled = useLightingStore((state) => state.shadowEnabled);
  const shadowQuality = useLightingStore((state) => state.shadowQuality);
  const shadowSoftness = useLightingStore((state) => state.shadowSoftness);

  const uniforms = useMemo(
    () => ({
      // Time and resolution
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2() },
      uCameraPosition: { value: new THREE.Vector3() },

      // Mandelbulb parameters
      uDimension: { value: 4 },
      uPower: { value: 8.0 },
      uIterations: { value: 48.0 },
      uEscapeRadius: { value: 8.0 },

      // Power Animation uniforms (Technique B - power oscillation)
      uPowerAnimationEnabled: { value: false },
      uAnimatedPower: { value: 8.0 },  // Computed power = center + amplitude * sin(time * speed)

      // Alternate Power uniforms (Technique B variant - blend two powers)
      uAlternatePowerEnabled: { value: false },
      uAlternatePowerValue: { value: 4.0 },
      uAlternatePowerBlend: { value: 0.5 },

      // Dimension Mixing uniforms (Technique A - shear matrix)
      uDimensionMixEnabled: { value: false },
      uMixIntensity: { value: 0.1 },
      uMixTime: { value: 0 },  // Animated mix time = animTime * mixFrequency

      // Phase Shift uniforms (angular twisting)
      uPhaseEnabled: { value: false },
      uPhaseTheta: { value: 0.0 },  // Phase offset for theta angle
      uPhasePhi: { value: 0.0 },    // Phase offset for phi angle

      // D-dimensional rotated coordinate system
      // c = uOrigin + pos.x * uBasisX + pos.y * uBasisY + pos.z * uBasisZ
      uBasisX: { value: new Float32Array(11) },
      uBasisY: { value: new Float32Array(11) },
      uBasisZ: { value: new Float32Array(11) },
      uOrigin: { value: new Float32Array(11) },

      // Color and palette (converted to linear for physically correct lighting)
      uColor: { value: new THREE.Color().convertSRGBToLinear() },

      // 3D transformation matrices (for camera/view only)
      uModelMatrix: { value: new THREE.Matrix4() },
      uInverseModelMatrix: { value: new THREE.Matrix4() },
      uProjectionMatrix: { value: new THREE.Matrix4() },
      uViewMatrix: { value: new THREE.Matrix4() },

      // Centralized Uniform Sources:
      // - Lighting: Ambient, Diffuse, Specular, Multi-lights
      // - Temporal: Matrices, Enabled state (matrices updated via source)
      // - Quality: FastMode, QualityMultiplier
      // - Color: Algorithm, Cosine coeffs, Distribution, LCH
      ...UniformManager.getCombinedUniforms(['lighting', 'temporal', 'quality', 'color']),

      // Material property for G-buffer (reflectivity for SSR)
      uMetallic: { value: 0.0 },

      // Advanced Rendering
      uRoughness: { value: 0.3 },
      uSssEnabled: { value: false },
      uSssIntensity: { value: 1.0 },
      uSssColor: { value: new THREE.Color('#ff8844') },
      uSssThickness: { value: 1.0 },
      uSssJitter: { value: 0.2 },

      // Fresnel rim lighting uniforms (color converted to linear)
      uFresnelEnabled: { value: true },
      uFresnelIntensity: { value: 0.5 },
      uRimColor: { value: new THREE.Color('#FFFFFF').convertSRGBToLinear() },

      // Shadow System uniforms
      uShadowEnabled: { value: false },
      uShadowQuality: { value: 1 },
      uShadowSoftness: { value: 1.0 },

      // Ambient Occlusion uniforms
      uAoEnabled: { value: true },

      // GPU Profiling mode (0=normal, 1=raymarch only, 2=raymarch+normal, 3=no AO, 4=no shadows)
      uProfileMode: { value: 0 },

      // Temporal Reprojection - Textures must be manually handled as they come from context
      uPrevDepthTexture: { value: null },      // Legacy: kept for compatibility
      uPrevPositionTexture: { value: null },   // Position buffer: xyz=world pos, w=model-space ray distance

      // IBL (Image-Based Lighting) uniforms - PMREM texture (sampler2D)
      uEnvMap: { value: null },
      uEnvMapSize: { value: 256.0 },
      uIBLIntensity: { value: 1.0 },
      uIBLQuality: { value: 0 }, // 0=off, 1=low, 2=high
    }),
    []
  );

  // Get temporal settings
  const temporalEnabled = usePerformanceStore((state) => state.temporalReprojectionEnabled);
  const setShaderDebugInfo = usePerformanceStore((state) => state.setShaderDebugInfo);
  const shaderOverrides = usePerformanceStore((state) => state.shaderOverrides);
  const resetShaderOverrides = usePerformanceStore((state) => state.resetShaderOverrides);

  // Conditionally compiled feature toggles (affect shader compilation)
  const sssEnabled = useAppearanceStore((state) => state.sssEnabled);
  // Note: edgesVisible (line 268) controls fresnel and is already subscribed

  // Reset overrides when base configuration changes
  useEffect(() => {
    resetShaderOverrides();
  }, [dimension, shadowEnabled, temporalEnabled, sssEnabled, edgesVisible, resetShaderOverrides]);

  // Error tracking to prevent loop spam
  const hasErroredRef = useRef(false);

  // Compile shader only when configuration changes
  const { glsl: shaderString, modules, features } = useMemo(() => {
    return composeMandelbulbShader({
      dimension,
      shadows: shadowEnabled,
      temporal: temporalEnabled,
      ambientOcclusion: true, // Always included unless explicit toggle added
      overrides: shaderOverrides,
      sss: sssEnabled,
      fresnel: edgesVisible,
    });
  }, [dimension, shadowEnabled, temporalEnabled, shaderOverrides, sssEnabled, edgesVisible]);

  // Update debug info store
  useEffect(() => {
    setShaderDebugInfo('object', {
      name: 'Mandelbulb Raymarcher',
      vertexShaderLength: vertexShader.length,
      fragmentShaderLength: shaderString.length,
      activeModules: modules,
      features: features,
    });
    return () => setShaderDebugInfo('object', null);
  }, [shaderString, modules, features, setShaderDebugInfo]);

  // GPU Profiling: Expose profile mode setter on window for performance analysis
  // Mode 0: Normal rendering
  // Mode 1: Raymarch only (SDF iteration cost)
  // Mode 2: Raymarch + normals (SDF + normal cost)
  // Mode 3: Raymarch + normals + AO (before lighting)
  useEffect(() => {
    const win = window as unknown as { setProfileMode?: (mode: number) => void };
    win.setProfileMode = (mode: number) => {
      if (meshRef.current) {
        const material = meshRef.current.material as THREE.ShaderMaterial;
        if (material.uniforms?.uProfileMode) {
          material.uniforms.uProfileMode.value = mode;
          console.log(`Profile mode set to ${mode}: ${['Normal', 'Raymarch only', 'Raymarch+Normal', 'Raymarch+Normal+AO'][mode] || 'Unknown'}`);
        }
      }
    };
    return () => { delete win.setProfileMode; };
  }, []);

  useFrame((state) => {
    if (hasErroredRef.current) return;

    try {
    const accumulatedTime = useAnimationStore.getState().accumulatedTime;

    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;

      // Skip uniform updates if material has no uniforms (placeholder material during shader compilation)
      if (!material.uniforms) return;

      // ============================================
      // DIRTY-FLAG: Detect material change and reset version refs
      // ============================================
      const materialChanged = material !== prevMaterialRef.current;
      if (materialChanged) {
        prevMaterialRef.current = material;
        lastMandelbulbVersionRef.current = -1; // Force full sync on material change
        lastAppearanceVersionRef.current = -1;
        lastIblVersionRef.current = -1;
      }

      // ============================================
      // PERFORMANCE: Read versions via getState() to avoid re-render subscriptions
      // ============================================
      const extendedState = useExtendedObjectStore.getState();
      const mandelbulbVersion = extendedState.mandelbulbVersion;
      const appearanceState = useAppearanceStore.getState();
      const appearanceVersion = appearanceState.appearanceVersion;
      const environmentState = useEnvironmentStore.getState();
      const iblVersion = environmentState.iblVersion;

      // ============================================
      // DIRTY-FLAG: Check which categories need updating
      // ============================================
      const mandelbulbChanged = mandelbulbVersion !== lastMandelbulbVersionRef.current;
      const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current;
      const iblChanged = iblVersion !== lastIblVersionRef.current;

      // Update time and resolution
      // Use accumulatedTime which respects pause state and is synced globally
      if (material.uniforms.uTime) material.uniforms.uTime.value = accumulatedTime;
      // CRITICAL: Use DPR-scaled resolution for raymarching
      // The MRT targets are at native resolution (CSS × DPR), so the shader's
      // gl_FragCoord.xy / uResolution.xy calculation must match.
      // Without DPR scaling, fragments beyond CSS resolution get UV > 1.0 and miss the object.
      const dpr = viewport.dpr;
      if (material.uniforms.uResolution) material.uniforms.uResolution.value.set(
        Math.floor(size.width * dpr),
        Math.floor(size.height * dpr)
      );
      if (material.uniforms.uCameraPosition) material.uniforms.uCameraPosition.value.copy(camera.position);

      // Update dimension
      if (material.uniforms.uDimension) material.uniforms.uDimension.value = dimension;

      // Cache for colors
      const cache = colorCacheRef.current;

      // ============================================
      // DIRTY-FLAG: Only update mandelbulb uniforms when settings change
      // CRITICAL: Read values from extendedState (fresh) NOT from closure captures (stale)
      // ============================================
      if (mandelbulbChanged) {
        const mbConfig = extendedState.mandelbulb;

        // Update Mandelbulb parameters
        if (material.uniforms.uIterations) {
          material.uniforms.uIterations.value = mbConfig.maxIterations;
        }
        if (material.uniforms.uEscapeRadius) {
          material.uniforms.uEscapeRadius.value = mbConfig.escapeRadius;
        }

        // Power (static value - animation is handled separately)
        if (!mbConfig.powerAnimationEnabled && material.uniforms.uPower) {
          material.uniforms.uPower.value = mbConfig.mandelbulbPower;
        }

        // Disable the separate animation uniform system (not needed anymore)
        if (material.uniforms.uPowerAnimationEnabled) {
          material.uniforms.uPowerAnimationEnabled.value = false;
        }

        // Alternate Power (Technique B): blend between primary and alternate powers
        if (material.uniforms.uAlternatePowerEnabled) {
          material.uniforms.uAlternatePowerEnabled.value = mbConfig.alternatePowerEnabled;
        }
        if (material.uniforms.uAlternatePowerValue) {
          material.uniforms.uAlternatePowerValue.value = mbConfig.alternatePowerValue;
        }
        if (material.uniforms.uAlternatePowerBlend) {
          material.uniforms.uAlternatePowerBlend.value = mbConfig.alternatePowerBlend;
        }

        // Dimension Mixing (Technique A): update uniforms for shader-side mixing matrix
        if (material.uniforms.uDimensionMixEnabled) {
          material.uniforms.uDimensionMixEnabled.value = mbConfig.dimensionMixEnabled;
        }
        if (material.uniforms.uMixIntensity) {
          material.uniforms.uMixIntensity.value = mbConfig.mixIntensity;
        }

        // Update version ref
        lastMandelbulbVersionRef.current = mandelbulbVersion;
      }

      // ============================================
      // TIME-DEPENDENT ANIMATIONS (run every frame when enabled)
      // ============================================
      // Power animation: compute power from time when animation is enabled
      if (powerAnimationEnabled && material.uniforms.uPower) {
        const t = accumulatedTime * powerSpeed * 2 * Math.PI;
        const normalized = (Math.sin(t) + 1) / 2; // Maps [-1, 1] to [0, 1]
        const targetPower = powerMin + normalized * (powerMax - powerMin);
        material.uniforms.uPower.value = targetPower;
      }

      // Dimension mixing time (always update when mixing is enabled)
      if (dimensionMixEnabled && material.uniforms.uMixTime) {
        material.uniforms.uMixTime.value = accumulatedTime * mixFrequency * 2 * Math.PI;
      }

      // Update camera matrices
      if (material.uniforms.uModelMatrix) material.uniforms.uModelMatrix.value.copy(meshRef.current.matrixWorld);
      if (material.uniforms.uInverseModelMatrix) material.uniforms.uInverseModelMatrix.value.copy(meshRef.current.matrixWorld).invert();
      if (material.uniforms.uProjectionMatrix) material.uniforms.uProjectionMatrix.value.copy(camera.projectionMatrix);
      if (material.uniforms.uViewMatrix) material.uniforms.uViewMatrix.value.copy(camera.matrixWorldInverse);

      // Update temporal reprojection uniforms from TemporalDepthCapturePass
      // CRITICAL: Apply ALL temporal uniforms from the pass to ensure consistency.
      // The pass tracks hasValidHistory and synchronizes matrices with the depth texture.
      // Using TemporalSource (UniformManager) would provide unsynchronized matrices.
      const temporalUniforms = getTemporalUniforms();
      if (temporalUniforms) {
        // Legacy depth texture (for compatibility)
        if (material.uniforms.uPrevDepthTexture) {
          material.uniforms.uPrevDepthTexture.value = temporalUniforms.uPrevDepthTexture;
        }
        // Position texture (xyz=world pos, w=model-space ray distance)
        if (material.uniforms.uPrevPositionTexture) {
          material.uniforms.uPrevPositionTexture.value = temporalUniforms.uPrevPositionTexture;
        }
        if (material.uniforms.uTemporalEnabled) {
          material.uniforms.uTemporalEnabled.value = temporalUniforms.uTemporalEnabled;
        }
        if (material.uniforms.uPrevViewProjectionMatrix) {
          material.uniforms.uPrevViewProjectionMatrix.value.copy(temporalUniforms.uPrevViewProjectionMatrix);
        }
        if (material.uniforms.uPrevInverseViewProjectionMatrix) {
          material.uniforms.uPrevInverseViewProjectionMatrix.value.copy(temporalUniforms.uPrevInverseViewProjectionMatrix);
        }
        if (material.uniforms.uDepthBufferResolution) {
          material.uniforms.uDepthBufferResolution.value.copy(temporalUniforms.uDepthBufferResolution);
        }
      }

      // Apply centralized uniform sources (Lighting, Quality, Color, PBR)
      // NOTE: 'temporal' removed - temporal uniforms come from TemporalDepthCapturePass
      // to ensure matrix/texture/enabled state are synchronized from the same source.
      // uTemporalSafetyMargin uses the default value (0.95) from getCombinedUniforms(['temporal']).
      UniformManager.applyToMaterial(material, ['lighting', 'quality', 'color', 'pbr-face']);

      // ============================================
      // DIRTY-FLAG: Only update appearance uniforms when settings change
      // ============================================
      if (appearanceChanged) {
        // SSS (Subsurface Scattering) properties
        if (material.uniforms.uSssEnabled) material.uniforms.uSssEnabled.value = appearanceState.sssEnabled;
        if (material.uniforms.uSssIntensity) material.uniforms.uSssIntensity.value = appearanceState.sssIntensity;
        if (material.uniforms.uSssColor) {
          updateLinearColorUniform(cache.faceColor /* reuse helper */, material.uniforms.uSssColor.value as THREE.Color, appearanceState.sssColor || '#ff8844');
        }
        if (material.uniforms.uSssThickness) material.uniforms.uSssThickness.value = appearanceState.sssThickness;
        if (material.uniforms.uSssJitter) material.uniforms.uSssJitter.value = appearanceState.sssJitter;

        // Fresnel rim lighting (controlled by Edges render mode, cached linear conversion)
        if (material.uniforms.uFresnelEnabled) material.uniforms.uFresnelEnabled.value = edgesVisible;
        if (material.uniforms.uFresnelIntensity) material.uniforms.uFresnelIntensity.value = fresnelIntensity;
        if (material.uniforms.uRimColor) {
          updateLinearColorUniform(cache.rimColor, material.uniforms.uRimColor.value as THREE.Color, edgeColor);
        }

        // Color (from appearance)
        if (material.uniforms.uColor) {
          updateLinearColorUniform(cache.faceColor, material.uniforms.uColor.value as THREE.Color, faceColor);
        }

        // Update version ref
        lastAppearanceVersionRef.current = appearanceVersion;
      }

      // Shadow System uniforms
      if (material.uniforms.uShadowEnabled) {
        material.uniforms.uShadowEnabled.value = shadowEnabled;
      }
      if (material.uniforms.uShadowQuality) {
        // Progressive refinement: scale shadow quality from low → user's target
        const effectiveShadowQuality = getEffectiveShadowQuality(
          shadowQuality,
          qualityMultiplier
        );
        material.uniforms.uShadowQuality.value = SHADOW_QUALITY_TO_INT[effectiveShadowQuality];
      }
      if (material.uniforms.uShadowSoftness) {
        material.uniforms.uShadowSoftness.value = shadowSoftness;
      }

      // Ambient Occlusion uniform (controlled by global SSAO toggle)
      if (material.uniforms.uAoEnabled) {
        const ssaoEnabled = usePostProcessingStore.getState().ssaoEnabled;
        material.uniforms.uAoEnabled.value = ssaoEnabled;
      }

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

      // Mandelbulb is always fully opaque (solid mode)
      if (material.transparent !== false) {
        material.transparent = false;
        material.depthWrite = true;
        material.needsUpdate = true;
      }


      // ============================================
      // D-dimensional Rotation & Basis Vectors (via shared hook)
      // Only recomputes when rotations, dimension, or params change
      // ============================================
      const D = dimension;
      const { basisX, basisY, basisZ, changed: basisChanged } = rotationUpdates.getBasisVectors(rotationsChanged);

      if (basisChanged) {
        // Update basis vector uniforms
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

      // ============================================
      // Origin Update (separate from basis vectors)
      // Must update every frame when origin drift or slice animation is enabled
      // ============================================
      const needsOriginUpdate = basisChanged || originDriftEnabled || sliceAnimationEnabled;
      const { rotationMatrix: cachedRotationMatrix } = rotationUpdates;

      if (needsOriginUpdate && cachedRotationMatrix) {
        // Build origin values array for rotation (using pre-allocated array)
        const originValues = originValuesRef.current;
        // Clear the array before reuse
        originValues.fill(0);

        // Apply origin drift if enabled (Technique C)
        if (originDriftEnabled && D > 3) {
          const driftConfig: OriginDriftConfig = {
            enabled: true,
            amplitude: driftAmplitude,
            baseFrequency: driftBaseFrequency,
            frequencySpread: driftFrequencySpread,
          };
          // Get animation speed from store for consistent drift timing
          const animationSpeed = useAnimationStore.getState().speed;
          const driftedOrigin = computeDriftedOrigin(
            parameterValues,
            accumulatedTime,
            driftConfig,
            animationSpeed,
            animationBias
          );
          // Set drifted values for extra dimensions
          for (let i = 3; i < D; i++) {
            originValues[i] = driftedOrigin[i - 3] ?? 0;
          }
        } else if (sliceAnimationEnabled && D > 3) {
          // Slice Animation: animate through higher-dimensional cross-sections
          // Use sine waves with golden ratio phase offsets for organic motion
          const PHI = 1.618033988749895; // Golden ratio

          for (let i = 3; i < D; i++) {
            const extraDimIndex = i - 3;
            // Each dimension gets a unique phase offset based on golden ratio
            const phase = extraDimIndex * PHI;
            // Multi-frequency sine for more interesting motion
            const t1 = accumulatedTime * sliceSpeed * 2 * Math.PI + phase;
            const t2 = accumulatedTime * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5;
            // Blend two frequencies for non-repetitive motion
            const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2));
            originValues[i] = (parameterValues[extraDimIndex] ?? 0) + offset;
          }
        } else {
          // No drift or slice animation - use static parameter values
          for (let i = 3; i < D; i++) {
            originValues[i] = parameterValues[i - 3] ?? 0;
          }
        }

        // Get rotated origin from hook
        const { origin } = rotationUpdates.getOrigin(originValues);

        // Update origin uniform
        if (material.uniforms.uOrigin) {
          (material.uniforms.uOrigin.value as Float32Array).set(origin);
        }
      }

      // ============================================
      // Phase Shift Animation
      // Add time-varying phase offsets to spherical angles
      // ============================================
      if (material.uniforms.uPhaseEnabled) {
        material.uniforms.uPhaseEnabled.value = phaseShiftEnabled;
      }
      if (phaseShiftEnabled) {
        const t = accumulatedTime * phaseSpeed * 2 * Math.PI;
        // Theta and phi use different frequencies for more organic twisting
        if (material.uniforms.uPhaseTheta) {
          material.uniforms.uPhaseTheta.value = phaseAmplitude * Math.sin(t);
        }
        if (material.uniforms.uPhasePhi) {
          material.uniforms.uPhasePhi.value = phaseAmplitude * Math.sin(t * 1.618); // Golden ratio frequency offset
        }
      } else {
        if (material.uniforms.uPhaseTheta) material.uniforms.uPhaseTheta.value = 0;
        if (material.uniforms.uPhasePhi) material.uniforms.uPhasePhi.value = 0;
      }

      // Model matrices are always identity for Mandelbulb - no need to set every frame
      // (they are already identity from useMemo initialization)
    }
    } catch (error) {
        if (hasErroredRef.current) return;
        hasErroredRef.current = true;

        console.error('Mandelbulb Render Loop Error:', error)

        // Use getState to avoid hook rules in callback
        const showMsgBox = useMsgBoxStore.getState().showMsgBox

        // Show error message
        showMsgBox(
          'Rendering Error',
          `The Mandelbulb renderer encountered an error.\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
          [
            {
              label: 'Reload Page',
              onClick: () => window.location.reload(),
              variant: 'danger'
            },
            {
              label: 'Close',
              onClick: () => useMsgBoxStore.getState().closeMsgBox(),
              variant: 'secondary'
            }
          ]
        )
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS);

  // Generate unique key to force material recreation when shader changes or context is restored
  const materialKey = `mandelbulb-material-${shaderString.length}-${features.join(',')}-${restoreCount}`;

  return (
    <mesh ref={meshRef} scale={[scale ?? 1.0, scale ?? 1.0, scale ?? 1.0]} frustumCulled={true}>
      <boxGeometry args={[4, 4, 4]} />
      <TrackedShaderMaterial
        shaderName="Mandelbulb Raymarcher"
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

export default MandelbulbMesh;
