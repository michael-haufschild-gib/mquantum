import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { RENDER_LAYERS } from '@/rendering/core/layers';
import { createSkyboxShaderDefaults } from '@/rendering/materials/skybox/SkyboxShader';
import { applyDistributionTS, getCosinePaletteColorTS } from '@/rendering/shaders/palette/cosine.glsl';
import type { ColorAlgorithm, CosineCoefficients, DistributionSettings } from '@/rendering/shaders/palette/types';
import { composeSkyboxFragmentShader, composeSkyboxVertexShader } from '@/rendering/shaders/skybox/compose';
import type { SkyboxMode, SkyboxShaderConfig } from '@/rendering/shaders/skybox/types';
import { useAnimationStore } from '@/stores/animationStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useMsgBoxStore } from '@/stores/msgBoxStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { useShallow } from 'zustand/react/shallow';
import { ProceduralSkyboxWithEnvironment } from './ProceduralSkyboxWithEnvironment';

// Import all skybox ktx2 files as URLs
const skyboxAssets = import.meta.glob('/src/assets/skyboxes/**/*.ktx2', { eager: true, import: 'default', query: '?url' }) as Record<string, string>;

// Selectors defined outside components to comply with useShallow hook rules
const skyboxMeshEnvSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxMode: state.skyboxMode,
  skyboxIntensity: state.skyboxIntensity,
  skyboxRotation: state.skyboxRotation,
  skyboxAnimationMode: state.skyboxAnimationMode,
  skyboxAnimationSpeed: state.skyboxAnimationSpeed,
  proceduralSettings: state.proceduralSettings
});

const skyboxMeshAppearanceSelector = (state: ReturnType<typeof useAppearanceStore.getState>) => ({
  colorAlgorithm: state.colorAlgorithm,
  cosineCoefficients: state.cosineCoefficients,
  distribution: state.distribution,
  lchLightness: state.lchLightness,
  lchChroma: state.lchChroma,
  faceColor: state.faceColor
});

const skyboxLoaderEnvSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxTexture: state.skyboxTexture,
  skyboxHighQuality: state.skyboxHighQuality,
  setSkyboxLoading: state.setSkyboxLoading,
  setClassicCubeTexture: state.setClassicCubeTexture,
});

const skyboxMainEnvSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode
});

// --- Main Component ---

interface SkyboxMeshProps {
    texture: THREE.CubeTexture | null;
}

export const SkyboxMesh: React.FC<SkyboxMeshProps> = ({ texture }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  // Reusable objects
  const eulerRef = useRef(new THREE.Euler());
  const matrix3Ref = useRef(new THREE.Matrix3());
  const matrix4Ref = useRef(new THREE.Matrix4());

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastSkyboxVersionRef = useRef(-1); // -1 forces full sync on first frame
  const lastAppearanceVersionRef = useRef(-1);
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // CRITICAL: Use callback ref to set layer IMMEDIATELY when mesh is created
  // This ensures the layer is set before any render pass happens
  // useEffect/useLayoutEffect both run AFTER the mesh is added to scene
  const setMeshRef = React.useCallback((mesh: THREE.Mesh | null) => {
    if (mesh) {
      mesh.layers.set(RENDER_LAYERS.SKYBOX);
      // Skybox is semantically background - must render before other transparent objects.
      // Without explicit renderOrder, Three.js sort is unstable when z-distances match,
      // causing incorrect ordering when SkyboxMesh remounts (e.g., skybox type change).
      mesh.renderOrder = -1;
    }
    // Update the ref for other hooks to use
    (meshRef as React.MutableRefObject<THREE.Mesh | null>).current = mesh;
  }, []);

  const envSelector = useShallow(skyboxMeshEnvSelector);
  const {
    skyboxMode,
    skyboxIntensity,
    skyboxRotation,
    skyboxAnimationMode,
    skyboxAnimationSpeed,
    proceduralSettings
  } = useEnvironmentStore(envSelector);

  const appearanceSelector = useShallow(skyboxMeshAppearanceSelector);
  const { colorAlgorithm, cosineCoefficients, distribution, lchLightness, lchChroma, faceColor } = useAppearanceStore(appearanceSelector);
  const isPlaying = useAnimationStore((state) => state.isPlaying);
  const setShaderDebugInfo = usePerformanceStore((state) => state.setShaderDebugInfo);

  const baseRotY = skyboxRotation * (Math.PI / 180);

  /**
   * Compute a color at position t (0-1) for any color algorithm.
   * Mirrors the logic in ColorPreview.tsx for consistent sync.
   * @param t
   * @param algorithm
   * @param coeffs
   * @param dist
   * @param baseColor
   * @param lchL
   * @param lchC
   * @returns THREE.Color computed for the given position and algorithm
   */
  const computeColorAtT = (t: number, algorithm: ColorAlgorithm, coeffs: CosineCoefficients, dist: DistributionSettings, baseColor: string, lchL: number, lchC: number): THREE.Color => {
    // Helper: Convert hex color to HSL
    const hexToHsl = (hex: string): [number, number, number] => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return [0, 0, 0.5];
      const r = parseInt(result[1]!, 16) / 255;
      const g = parseInt(result[2]!, 16) / 255;
      const b = parseInt(result[3]!, 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (max === min) return [0, 0, l];
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let h = 0;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      return [h, s, l];
    };

    // Helper: Convert HSL to RGB
    const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((h * 6) % 2 - 1));
      const m = l - c / 2;
      let r = 0, g = 0, b = 0;
      if (h < 1/6) { r = c; g = x; }
      else if (h < 2/6) { r = x; g = c; }
      else if (h < 3/6) { g = c; b = x; }
      else if (h < 4/6) { g = x; b = c; }
      else if (h < 5/6) { r = x; b = c; }
      else { r = c; b = x; }
      return [r + m, g + m, b + m];
    };

    // Helper: Oklab to linear sRGB
    const oklabToLinearSrgb = (L: number, a: number, b_: number): [number, number, number] => {
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b_;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b_;
      const s_ = L - 0.0894841775 * a - 1.2914855480 * b_;
      const l = l_ * l_ * l_;
      const m = m_ * m_ * m_;
      const s = s_ * s_ * s_;
      return [
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
      ];
    };

    let r: number, g: number, b: number;

    if (algorithm === 'monochromatic') {
      const [hue, sat] = hexToHsl(baseColor);
      const distributedT = applyDistributionTS(t, dist.power, dist.cycles, dist.offset);
      const litVar = 0.3 + distributedT * 0.4;
      [r, g, b] = hslToRgb(hue, sat, litVar);
    } else if (algorithm === 'analogous') {
      const [baseHue, sat, lit] = hexToHsl(baseColor);
      const distributedT = applyDistributionTS(t, dist.power, dist.cycles, dist.offset);
      const hueOffset = (distributedT - 0.5) * 0.167;
      const hue = (baseHue + hueOffset + 1) % 1;
      [r, g, b] = hslToRgb(hue, sat, lit);
    } else if (algorithm === 'lch') {
      const distributedT = applyDistributionTS(t, dist.power, dist.cycles, dist.offset);
      const hue = distributedT * 6.28318;
      const a_oklab = lchC * Math.cos(hue);
      const b_oklab = lchC * Math.sin(hue);
      [r, g, b] = oklabToLinearSrgb(lchL, a_oklab, b_oklab);
    } else {
      // cosine, normal, distance, multiSource, radial - all use cosine palette
      const color = getCosinePaletteColorTS(t, coeffs.a, coeffs.b, coeffs.c, coeffs.d, dist.power, dist.cycles, dist.offset);
      r = color.r;
      g = color.g;
      b = color.b;
    }

    // Clamp values
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    b = Math.max(0, Math.min(1, b));

    return new THREE.Color(r, g, b);
  };

  const color1Vec = useMemo(() => {
    const shouldSyncWithObject = skyboxMode !== 'classic' && proceduralSettings.syncWithObject;
    if (shouldSyncWithObject) {
      return computeColorAtT(
        0.0,
        colorAlgorithm,
        cosineCoefficients,
        distribution,
        faceColor,
        lchLightness,
        lchChroma
      );
    }
    const skyboxCoeffs = proceduralSettings.cosineCoefficients;
    const skyboxDist = proceduralSettings.distribution;
    return computeColorAtT(
      0.0,
      'cosine',
      skyboxCoeffs,
      skyboxDist,
      '#ffffff',
      0.5,
      0.15
    );
  }, [
    skyboxMode,
    proceduralSettings.syncWithObject,
    proceduralSettings.cosineCoefficients,
    proceduralSettings.distribution,
    colorAlgorithm,
    cosineCoefficients,
    distribution,
    faceColor,
    lchLightness,
    lchChroma,
  ]);

  const color2Vec = useMemo(() => {
    const shouldSyncWithObject = skyboxMode !== 'classic' && proceduralSettings.syncWithObject;
    if (shouldSyncWithObject) {
      return computeColorAtT(
        1.0,
        colorAlgorithm,
        cosineCoefficients,
        distribution,
        faceColor,
        lchLightness,
        lchChroma
      );
    }
    const skyboxCoeffs = proceduralSettings.cosineCoefficients;
    const skyboxDist = proceduralSettings.distribution;
    return computeColorAtT(
      1.0,
      'cosine',
      skyboxCoeffs,
      skyboxDist,
      '#ffffff',
      0.5,
      0.15
    );
  }, [
    skyboxMode,
    proceduralSettings.syncWithObject,
    proceduralSettings.cosineCoefficients,
    proceduralSettings.distribution,
    colorAlgorithm,
    cosineCoefficients,
    distribution,
    faceColor,
    lchLightness,
    lchChroma,
  ]);

  const paletteVecs = useMemo(() => {
    const shouldSyncWithObject = skyboxMode !== 'classic' && proceduralSettings.syncWithObject;
    if (shouldSyncWithObject) {
      return {
        a: new THREE.Vector3(...cosineCoefficients.a),
        b: new THREE.Vector3(...cosineCoefficients.b),
        c: new THREE.Vector3(...cosineCoefficients.c),
        d: new THREE.Vector3(...cosineCoefficients.d),
      };
    } else {
      const skyboxCoeffs = proceduralSettings.cosineCoefficients;
      return {
        a: new THREE.Vector3(...skyboxCoeffs.a),
        b: new THREE.Vector3(...skyboxCoeffs.b),
        c: new THREE.Vector3(...skyboxCoeffs.c),
        d: new THREE.Vector3(...skyboxCoeffs.d),
      };
    }
  }, [skyboxMode, proceduralSettings.syncWithObject, proceduralSettings.cosineCoefficients, cosineCoefficients]);

  // Derive config for shader composition
  const config = useMemo<SkyboxShaderConfig>(() => {
      const modeStr = skyboxMode.startsWith('procedural_')
          ? skyboxMode.replace('procedural_', '') as SkyboxMode
          : 'classic';

      return {
          mode: modeStr,
          effects: {
              sun: proceduralSettings.sunIntensity > 0,
              vignette: true,
          },
      };
  }, [skyboxMode, proceduralSettings]);

  // Create Material
  const material = useMemo(() => {
      const { glsl } = composeSkyboxFragmentShader(config);
      const mat = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          vertexShader: composeSkyboxVertexShader(config.effects),
          fragmentShader: glsl,
          uniforms: createSkyboxShaderDefaults(),
          side: THREE.BackSide,
          transparent: true,
          depthWrite: false,
      });
      return mat;
  }, [config]);

  // ============ MATERIAL CLEANUP ============
  // Dispose previous material when config changes or on unmount.
  // Without this, shader programs leak when skybox mode changes.
  const prevSkyboxMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    // Dispose previous material if it differs from current
    if (prevSkyboxMaterialRef.current && prevSkyboxMaterialRef.current !== material) {
      prevSkyboxMaterialRef.current.dispose();
    }
    prevSkyboxMaterialRef.current = material;

    // Cleanup on unmount
    return () => {
      material.dispose();
    };
  }, [material]);

  // Update Debug Info
  useEffect(() => {
      const { modules, features } = composeSkyboxFragmentShader(config);
      setShaderDebugInfo('skybox', {
          name: 'Skybox Shader',
          vertexShaderLength: material.vertexShader.length,
          fragmentShaderLength: material.fragmentShader.length,
          activeModules: modules,
          features,
      });
      return () => setShaderDebugInfo('skybox', null);
  }, [config, material, setShaderDebugInfo]);

  // Fade-in animation state
  const [opacity, setOpacity] = useState(0);
  const fadeStartTime = useRef<number | null>(null);
  const FADE_DURATION = 0.5; // seconds

  useFrame((state, delta) => {
    // Handle fade-in animation
    if (fadeStartTime.current === null) {
      fadeStartTime.current = state.clock.elapsedTime;
    }
    const elapsed = state.clock.elapsedTime - fadeStartTime.current;
    const newOpacity = Math.min(1, elapsed / FADE_DURATION);
    if (newOpacity !== opacity) {
      setOpacity(newOpacity);
    }

    if (!material) return;

    // --- DIRTY-FLAG: Material change detection ---
    const materialChanged = material !== prevMaterialRef.current;
    if (materialChanged) {
      prevMaterialRef.current = material;
      lastSkyboxVersionRef.current = -1; // Force full sync
      lastAppearanceVersionRef.current = -1;
    }

    // Get version counters from stores
    const skyboxVersion = useEnvironmentStore.getState().skyboxVersion;
    const appearanceVersion = useAppearanceStore.getState().appearanceVersion;

    const skyboxChanged = skyboxVersion !== lastSkyboxVersionRef.current;
    const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current;

    // --- Animation Logic (Hybrid JS/Shader) ---

    if (isPlaying) {
        // Use animation speed for classic modes, or procedural time scale for procedural modes
        const speed = (skyboxMode === 'classic' && skyboxAnimationMode !== 'none')
            ? skyboxAnimationSpeed
            : 1.0;

        // NOTE: delta is in SECONDS (from R3F useFrame after FpsController fix).
        // Previously TIME_SCALE=0.01 compensated for buggy ms delta; now removed.
        timeRef.current += delta * speed;
    }
    const t = timeRef.current; // Use accumulated time

    // Re-calculate values for animation frame
    let finalRotX = 0;
    let finalRotY = baseRotY;
    let finalRotZ = 0;
    let finalIntensity = skyboxIntensity;
    let finalHue = proceduralSettings.hue ?? 0;
    let finalSaturation = proceduralSettings.saturation ?? 1;
    let finalDistortion = 0;

    // Classic Animations
    if (skyboxMode === 'classic' && isPlaying && skyboxAnimationMode !== 'none') {
        switch (skyboxAnimationMode) {
            case 'cinematic':
                finalRotY += t * 0.1;
                finalRotX += Math.sin(t * 0.5) * 0.005;
                finalRotZ += Math.cos(t * 0.3) * 0.003;
                break;
            case 'heatwave':
                finalDistortion = 1.0 + Math.sin(t * 0.5) * 0.5;
                finalRotY += t * 0.02;
                break;
            case 'tumble':
                finalRotX += t * 0.05;
                finalRotY += t * 0.07;
                finalRotZ += t * 0.03;
                break;
            case 'ethereal':
                finalRotY += t * 0.05;
                finalHue = Math.sin(t * 0.1) * 0.1;
                finalIntensity = skyboxIntensity * (1.0 + Math.sin(t * 10) * 0.02);
                break;
            case 'nebula':
                finalHue = (t * 0.05) % 1.0;
                finalRotY += t * 0.03;
                finalIntensity = skyboxIntensity * 1.1;
                break;
        }
    }

    // Reuse objects to avoid per-frame allocations
    eulerRef.current.set(finalRotX, finalRotY, finalRotZ);
    const rotationMatrix = matrix3Ref.current.setFromMatrix4(
      matrix4Ref.current.makeRotationFromEuler(eulerRef.current)
    );

    // Determine numeric mode (must match shader constants)
    // 0=Classic, 1=Aurora, 2=Nebula, 3=Crystalline, 4=Horizon, 5=Ocean, 6=Twilight
    let modeInt = 0;
    switch (skyboxMode) {
      case 'procedural_aurora': modeInt = 1; break;
      case 'procedural_nebula': modeInt = 2; break;
      case 'procedural_crystalline': modeInt = 3; break;
      case 'procedural_horizon': modeInt = 4; break;
      case 'procedural_ocean': modeInt = 5; break;
      case 'procedural_twilight': modeInt = 6; break;
      default: modeInt = 0; // classic
    }

    // Direct uniform updates for performance
    const uniforms = material.uniforms;

    // --- PER-FRAME UNIFORMS (time-dependent, always update) ---
    if (uniforms.uTex) uniforms.uTex.value = texture;
    if (uniforms.uRotation) uniforms.uRotation.value = rotationMatrix;
    if (uniforms.uTime) uniforms.uTime.value = t;

    // Animation-driven uniforms (can change when animation is playing)
    if (uniforms.uIntensity) uniforms.uIntensity.value = finalIntensity * opacity;
    if (uniforms.uHue) uniforms.uHue.value = finalHue;
    if (uniforms.uSaturation) uniforms.uSaturation.value = finalSaturation;
    // Distortion uses animated value with store fallback
    if (uniforms.uDistortion) uniforms.uDistortion.value = finalDistortion || proceduralSettings.turbulence;

    // --- DIRTY-FLAG: Static procedural settings (only update when store changes) ---
    if (skyboxChanged || appearanceChanged) {
      if (uniforms.uMode) uniforms.uMode.value = modeInt;

      // Core procedural parameters
      if (uniforms.uScale) uniforms.uScale.value = proceduralSettings.scale;
      if (uniforms.uComplexity) uniforms.uComplexity.value = proceduralSettings.complexity;
      if (uniforms.uTimeScale) uniforms.uTimeScale.value = proceduralSettings.timeScale;
      if (uniforms.uEvolution) uniforms.uEvolution.value = proceduralSettings.evolution;

      // Colors and palette
      if (uniforms.uColor1) uniforms.uColor1.value = color1Vec;
      if (uniforms.uColor2) uniforms.uColor2.value = color2Vec;
      if (uniforms.uPalA) uniforms.uPalA.value = paletteVecs.a;
      if (uniforms.uPalB) uniforms.uPalB.value = paletteVecs.b;
      if (uniforms.uPalC) uniforms.uPalC.value = paletteVecs.c;
      if (uniforms.uPalD) uniforms.uPalD.value = paletteVecs.d;
      if (uniforms.uUsePalette) {
        const useSimpleInterpolation = proceduralSettings.syncWithObject &&
          (colorAlgorithm === 'monochromatic' || colorAlgorithm === 'analogous');
        uniforms.uUsePalette.value = useSimpleInterpolation ? 0.0 : 1.0;
      }

      // Effects
      if (uniforms.uVignette) uniforms.uVignette.value = 0.15;
      if (uniforms.uTurbulence) uniforms.uTurbulence.value = proceduralSettings.turbulence;
      if (uniforms.uDualTone) uniforms.uDualTone.value = proceduralSettings.dualToneContrast;
      if (uniforms.uSunIntensity) uniforms.uSunIntensity.value = proceduralSettings.sunIntensity;
      if (uniforms.uSunPosition?.value && typeof (uniforms.uSunPosition.value as THREE.Vector3).set === 'function') {
        (uniforms.uSunPosition.value as THREE.Vector3).set(...proceduralSettings.sunPosition);
      }

      // Aurora settings
      if (uniforms.uAuroraCurtainHeight) uniforms.uAuroraCurtainHeight.value = proceduralSettings.aurora?.curtainHeight ?? 0.5;
      if (uniforms.uAuroraWaveFrequency) uniforms.uAuroraWaveFrequency.value = proceduralSettings.aurora?.waveFrequency ?? 1.0;

      // Horizon gradient settings
      if (uniforms.uHorizonGradientContrast) uniforms.uHorizonGradientContrast.value = proceduralSettings.horizonGradient?.gradientContrast ?? 0.5;
      if (uniforms.uHorizonSpotlightFocus) uniforms.uHorizonSpotlightFocus.value = proceduralSettings.horizonGradient?.spotlightFocus ?? 0.5;

      // Ocean settings
      if (uniforms.uOceanCausticIntensity) uniforms.uOceanCausticIntensity.value = proceduralSettings.ocean?.causticIntensity ?? 0.5;
      if (uniforms.uOceanDepthGradient) uniforms.uOceanDepthGradient.value = proceduralSettings.ocean?.depthGradient ?? 0.5;
      if (uniforms.uOceanBubbleDensity) uniforms.uOceanBubbleDensity.value = proceduralSettings.ocean?.bubbleDensity ?? 0.3;
      if (uniforms.uOceanSurfaceShimmer) uniforms.uOceanSurfaceShimmer.value = proceduralSettings.ocean?.surfaceShimmer ?? 0.4;

      // Update version refs after processing
      lastSkyboxVersionRef.current = skyboxVersion;
      lastAppearanceVersionRef.current = appearanceVersion;
    }
  }, FRAME_PRIORITY.ANIMATION);

  if (opacity === 0 && fadeStartTime.current === null) {
    return null;
  }

  return (
    <mesh ref={setMeshRef} data-testid="skybox-mesh">
        {/* Use sphere geometry instead of box - no visible seams at corners */}
        {/* Reduced segments from [64, 32] to [32, 16] for performance optimization */}
        <sphereGeometry args={[200, 32, 16]} />
        <primitive object={material} attach="material" />
    </mesh>
  );
};

/**
 * Inner component that handles async texture loading.
 * Uses manual async loading instead of useLoader to avoid blocking the scene.
 * Signals loading state to pause animation and trigger low-quality rendering.
 *
 * IMPORTANT: This component only handles LOADING the KTX2 texture.
 * It sets the loaded texture in the store (setClassicCubeTexture), which is then
 * read by CubemapCapturePass in the render graph to:
 * - Set scene.background (for black hole shader)
 * - Generate PMREM and set scene.environment (for wall reflections)
 *
 * This keeps all environment map operations inside the render graph for proper
 * MRT state management, preventing GL_INVALID_OPERATION errors.
 *
 * @returns React element handling async skybox texture loading
 */
const SkyboxLoader: React.FC = () => {
  const loaderEnvSelector = useShallow(skyboxLoaderEnvSelector);
  const {
    skyboxEnabled,
    skyboxTexture,
    skyboxHighQuality,
    setSkyboxLoading,
    setClassicCubeTexture,
  } = useEnvironmentStore(loaderEnvSelector);

  const gl = useThree((state) => state.gl);

  // Manual async texture loading state
  const [texture, setTexture] = useState<THREE.CubeTexture | null>(null);
  const loaderRef = useRef<KTX2Loader | null>(null);

  // Resolve file path
  const ktx2Path = useMemo(() => {
     if (!skyboxTexture || skyboxTexture === 'none') return null;
     const filename = skyboxHighQuality ? 'cubemap_hq.ktx2' : 'cubemap.ktx2';
     const searchStr = `${skyboxTexture}/${filename}`;
     const key = Object.keys(skyboxAssets).find(k => k.endsWith(searchStr));
     return key ? skyboxAssets[key] : null;
  }, [skyboxTexture, skyboxHighQuality]);

  // Track current texture for proper cleanup
  const currentTextureRef = useRef<THREE.CubeTexture | null>(null);

  // Manual async texture loading - doesn't block rendering
  useEffect(() => {
    if (!ktx2Path) {
      // Dispose previous texture when switching to no skybox
      if (currentTextureRef.current) {
        currentTextureRef.current.dispose();
        currentTextureRef.current = null;
      }
      setTexture(null);
      setClassicCubeTexture(null); // Clear from store
      setSkyboxLoading(false);
      return;
    }

    // Signal loading start - this pauses animation and sets low quality
    setSkyboxLoading(true);

    // Create or reuse loader
    if (!loaderRef.current) {
      loaderRef.current = new KTX2Loader();
      loaderRef.current.setTranscoderPath('/basis/');
      loaderRef.current.detectSupport(gl);
    }

    const loader = loaderRef.current;
    let cancelled = false;

    loader.load(
      ktx2Path,
      (loadedTexture) => {
        if (!cancelled) {
          // Dispose previous texture before replacing
          if (currentTextureRef.current) {
            currentTextureRef.current.dispose();
          }

          const cubeTexture = loadedTexture as unknown as THREE.CubeTexture;
          // Configure texture for best quality
          // Note: KTX2 compressed textures cannot generate mipmaps at runtime -
          // they must be pre-baked into the .ktx2 file. Setting generateMipmaps=true
          // causes GL_INVALID_OPERATION on compressed formats.
          // CRITICAL: Check if mipmaps actually exist. Using Mipmap filter on texture without mipmaps
          // causes "Texture Incomplete" state -> samples as black (0,0,0,1).
          // For CubeTextures, mipmaps are stored per-face in image[n].mipmaps, not texture.mipmaps
          const firstFace = cubeTexture.image?.[0] as { mipmaps?: unknown[] } | undefined;
          const hasMipmaps = firstFace?.mipmaps && firstFace.mipmaps.length > 1;
          cubeTexture.minFilter = hasMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
          cubeTexture.magFilter = THREE.LinearFilter;
          cubeTexture.generateMipmaps = false;
          cubeTexture.needsUpdate = true;
          currentTextureRef.current = cubeTexture;
          setTexture(cubeTexture);
          // Set in store for CubemapCapturePass to use
          setClassicCubeTexture(cubeTexture);
          // Signal loading complete - resume animation and quality refinement
          setSkyboxLoading(false);
        } else {
          // Dispose newly loaded texture if load was cancelled
          loadedTexture.dispose();
        }
      },
      undefined, // onProgress
      (error) => {
        if (!cancelled) {
          console.error('Failed to load skybox texture:', error);
          setSkyboxLoading(false);
          setClassicCubeTexture(null);
          useMsgBoxStore.getState().showMsgBox(
            'Skybox Load Failed',
            'Could not load the environment texture. Falling back to default lighting.',
            'warning'
          );
        }
      }
    );

    return () => {
      cancelled = true;
      // Dispose texture on unmount or when ktx2Path changes
      if (currentTextureRef.current) {
        currentTextureRef.current.dispose();
        currentTextureRef.current = null;
      }
      // Clear from store on cleanup
      setClassicCubeTexture(null);
    };
  }, [ktx2Path, gl, setSkyboxLoading, setClassicCubeTexture]);

  // Cleanup loader on unmount
  useEffect(() => {
    return () => {
      if (loaderRef.current) {
        loaderRef.current.dispose();
        loaderRef.current = null;
      }
    };
  }, []);

  // NOTE: scene.background and scene.environment are now handled by CubemapCapturePass
  // in the render graph. This component only handles texture loading.

  // Check if we should render the custom skybox mesh
  const shouldRenderSkybox = Boolean(skyboxEnabled && ktx2Path && texture);

  return (
    <>
        {/* Skybox mesh for visual rendering - uses loaded texture directly */}
        {shouldRenderSkybox && texture && (
            <SkyboxMesh texture={texture} />
        )}
    </>
  );
};

/**
 * Main Skybox component with async loading support.
 * Uses manual async loading to prevent blocking scene rendering.
 * Falls back to studio environment lighting while skybox is loading.
 * @returns React element rendering the skybox with async texture loading
 */
export const Skybox: React.FC = () => {
  const mainEnvSelector = useShallow(skyboxMainEnvSelector);
  const { skyboxEnabled, skyboxMode } = useEnvironmentStore(mainEnvSelector);

  if (!skyboxEnabled) return null;

  // If procedural, use the component that handles environment map generation for wall reflections
  if (skyboxMode !== 'classic') {
    return <ProceduralSkyboxWithEnvironment />;
  }

  return <SkyboxLoader />;
};
