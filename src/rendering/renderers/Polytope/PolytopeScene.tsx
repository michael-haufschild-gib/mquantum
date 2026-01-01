/**
 * Unified Polytope Scene Component - GPU Accelerated
 *
 * High-performance renderer using GPU shaders for N-dimensional transformations.
 * All geometry (faces, edges) uses the same GPU pipeline:
 * 1. Store base N-D vertices as shader attributes
 * 2. Perform rotation/scale/projection in vertex shader
 * 3. Only update uniform values in useFrame (no CPU transformation)
 */

import { useTrackedShaderMaterial } from '@/rendering/materials/useTrackedShaderMaterial';
import {
    useNDTransformUpdates,
    useProjectionDistanceCache,
    useShadowPatching,
} from '@/rendering/renderers/base';
import { useFrame } from '@react-three/fiber';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
    BufferGeometry,
    Color,
    DoubleSide,
    Float32BufferAttribute,
    Matrix4,
    ShaderMaterial,
    Vector3,
} from 'three';
import { useShallow } from 'zustand/react/shallow';

import type { Face } from '@/lib/geometry/faces';
import { DEFAULT_PROJECTION_DISTANCE } from '@/lib/math/projection';
import type { VectorND } from '@/lib/math/types';
import { createColorCache, updateLinearColorUniform } from '@/rendering/colors/linearCache';
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { RENDER_LAYERS } from '@/rendering/core/layers';
import { COLOR_ALGORITHM_TO_INT } from '@/rendering/shaders/palette';
import { matrixToGPUUniforms } from '@/rendering/shaders/transforms/ndTransform';
import {
    blurToPCFSamples,
    collectShadowDataCached,
    createShadowMapUniforms,
    SHADOW_MAP_SIZES,
    updateShadowMapUniforms,
} from '@/rendering/shadows';
import { UniformManager } from '@/rendering/uniforms/UniformManager';
import { useAnimationStore } from '@/stores/animationStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useEnvironmentStore } from '@/stores/environmentStore';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useLightingStore } from '@/stores/lightingStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { SCREEN_SPACE_NORMAL_MIN_DIMENSION } from '@/rendering/shaders/constants';
import { TubeWireframe } from '../TubeWireframe';
import {
    buildEdgeFragmentShader,
    buildEdgeVertexShader,
    buildFaceFragmentShader,
    buildFaceFragmentShaderScreenSpace,
    buildFaceVertexShader,
    buildFaceVertexShaderScreenSpace,
    MAX_EXTRA_DIMS,
} from './index';

/**
 * Props for PolytopeScene component
 */
export interface PolytopeSceneProps {
  /** Base (untransformed) vertices in N dimensions */
  baseVertices: VectorND[];
  /** Edge connections as pairs of vertex indices */
  edges: [number, number][];
  /** Detected faces for surface rendering */
  faces?: Face[];
  /** Current dimension of the polytope */
  dimension: number;
  /** Per-face depth values for palette coloring */
  faceDepths?: number[];
  /** Overall opacity (default: 1.0) */
  opacity?: number;
}

/**
 * Create base uniforms for N-D transformation (shared by all materials)
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @returns Record of N-D transformation uniforms
 */
function createNDUniforms(): Record<string, { value: unknown }> {
  return {
    uRotationMatrix4D: { value: new Matrix4() },
    uDimension: { value: 4 },
    uUniformScale: { value: 1.0 },  // Applied AFTER projection (like camera zoom)
    uExtraRotationCols: { value: new Float32Array(MAX_EXTRA_DIMS * 4) },
    uDepthRowSums: { value: new Float32Array(11) },
    uProjectionDistance: { value: DEFAULT_PROJECTION_DISTANCE },
  };
}

/**
 * Update N-D uniforms on a material.
 * Works with both ShaderMaterial (uniforms on material) and
 * MeshPhongMaterial with onBeforeCompile (uniforms in userData).
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @param material - The material to update
 * @param gpuData - GPU data from matrixToGPUUniforms
 * @param dimension - Current dimension
 * @param uniformScale - Uniform scale factor (applied after projection)
 * @param projectionDistance - Projection distance for perspective
 */
function updateNDUniforms(
  material: THREE.Material,
  gpuData: ReturnType<typeof matrixToGPUUniforms>,
  dimension: number,
  uniformScale: number,
  projectionDistance: number
): void {
  // Get uniforms - either from ShaderMaterial directly or from userData for Phong
  let u: Record<string, { value: unknown }> | undefined;

  if ('uniforms' in material && material.uniforms) {
    // ShaderMaterial
    u = (material as ShaderMaterial).uniforms;
  } else if (material.userData?.ndUniforms) {
    // MeshPhongMaterial with onBeforeCompile
    u = material.userData.ndUniforms;
  }

  if (!u) return;

  if (u.uRotationMatrix4D) (u.uRotationMatrix4D.value as Matrix4).copy(gpuData.rotationMatrix4D);
  if (u.uDimension) u.uDimension.value = dimension;
  if (u.uUniformScale) u.uUniformScale.value = uniformScale;
  if (u.uExtraRotationCols) {
    (u.uExtraRotationCols.value as Float32Array).set(gpuData.extraRotationCols);
  }
  if (u.uDepthRowSums) {
    (u.uDepthRowSums.value as Float32Array).set(gpuData.depthRowSums);
  }
  if (u.uProjectionDistance) u.uProjectionDistance.value = projectionDistance;
}

/**
 * Create edge material with N-D transformation (no lighting)
 *
 * @param edgeColor - CSS color string for the edge
 * @param opacity - Edge opacity (0-1)
 * @returns Configured ShaderMaterial for edge rendering
 */
function createEdgeMaterial(edgeColor: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...createNDUniforms(),
      uColor: { value: new Color(edgeColor).convertSRGBToLinear() },
      uOpacity: { value: opacity },
    },
    vertexShader: buildEdgeVertexShader(),
    fragmentShader: buildEdgeFragmentShader(),
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    glslVersion: THREE.GLSL3,
  });
}

/**
 * GLSL code block containing the nD transformation functions for shadow materials.
 * This is injected into MeshDepthMaterial and MeshDistanceMaterial via onBeforeCompile.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 */
const ND_TRANSFORM_GLSL = `
#define MAX_EXTRA_DIMS 7

// N-D Transformation uniforms
uniform mat4 uRotationMatrix4D;
uniform int uDimension;
uniform float uUniformScale;  // Applied AFTER projection (like camera zoom)
uniform float uProjectionDistance;
uniform float uExtraRotationCols[28];
uniform float uDepthRowSums[11];

// Packed extra dimension inputs (WebGL2 GLSL ES 3.00)
in vec4 aExtraDims0_3;
in vec3 aExtraDims4_6;

vec3 ndTransformVertex(vec3 pos) {
  // Build input array from raw (unscaled) coordinates
  float inputs[11];
  inputs[0] = pos.x;
  inputs[1] = pos.y;
  inputs[2] = pos.z;
  inputs[3] = aExtraDims0_3.x;
  inputs[4] = aExtraDims0_3.y;
  inputs[5] = aExtraDims0_3.z;
  inputs[6] = aExtraDims0_3.w;
  inputs[7] = aExtraDims4_6.x;
  inputs[8] = aExtraDims4_6.y;
  inputs[9] = aExtraDims4_6.z;
  inputs[10] = 0.0;

  // Apply rotation to first 4 dimensions (unscaled)
  vec4 pos4 = vec4(inputs[0], inputs[1], inputs[2], inputs[3]);
  vec4 rotated = uRotationMatrix4D * pos4;

  // Add contribution from extra dimensions (5D+)
  for (int i = 0; i < MAX_EXTRA_DIMS; i++) {
    if (i + 5 <= uDimension) {
      float extraDimValue = inputs[i + 4];
      rotated.x += uExtraRotationCols[i * 4 + 0] * extraDimValue;
      rotated.y += uExtraRotationCols[i * 4 + 1] * extraDimValue;
      rotated.z += uExtraRotationCols[i * 4 + 2] * extraDimValue;
      rotated.w += uExtraRotationCols[i * 4 + 3] * extraDimValue;
    }
  }

  // Perspective projection: compute effective depth from higher dimensions
  float effectiveDepth = rotated.w;
  for (int j = 0; j < 11; j++) {
    if (j < uDimension) {
      effectiveDepth += uDepthRowSums[j] * inputs[j];
    }
  }
  // Normalize depth by sqrt(dimension - 3) for consistent visual scale.
  // See transforms/ndTransform.ts for mathematical justification.
  float normFactor = uDimension > 4 ? sqrt(max(1.0, float(uDimension - 3))) : 1.0;
  effectiveDepth /= normFactor;

  // Guard against division by zero
  float denom = uProjectionDistance - effectiveDepth;
  if (abs(denom) < 0.0001) denom = denom >= 0.0 ? 0.0001 : -0.0001;
  float factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale (like camera zoom)
  vec3 projected = rotated.xyz * factor * uUniformScale;

  return projected;
}
`;


/**
 * Build BufferGeometry with N-D attributes from vertices.
 * Uses packed attributes (vec4 + vec3) for extra dimensions to stay within WebGL 16 attribute limit.
 * @param vertices
 * @param setNormal
 * @returns BufferGeometry with position, normal, and extra dimension attributes
 */
function buildNDGeometry(
  vertices: VectorND[],
  setNormal?: (idx: number, normals: Float32Array) => void
): BufferGeometry {
  const count = vertices.length;
  const geo = new BufferGeometry();

  const positions = new Float32Array(count * 3);
  const normals = setNormal ? new Float32Array(count * 3) : null;
  // Packed extra dimensions: vec4 (dims 4-7) + vec3 (dims 8-10)
  const extraDims0_3 = new Float32Array(count * 4);
  const extraDims4_6 = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const v = vertices[i]!;
    const i3 = i * 3;
    const i4 = i * 4;

    // Position (vec3)
    positions[i3] = v[0] ?? 0;
    positions[i3 + 1] = v[1] ?? 0;
    positions[i3 + 2] = v[2] ?? 0;

    // Extra dims packed: vec4(dims 4-7) + vec3(dims 8-10)
    extraDims0_3[i4] = v[3] ?? 0;
    extraDims0_3[i4 + 1] = v[4] ?? 0;
    extraDims0_3[i4 + 2] = v[5] ?? 0;
    extraDims0_3[i4 + 3] = v[6] ?? 0;
    extraDims4_6[i3] = v[7] ?? 0;
    extraDims4_6[i3 + 1] = v[8] ?? 0;
    extraDims4_6[i3 + 2] = v[9] ?? 0;

    if (normals && setNormal) {
      setNormal(i, normals);
    }
  }

  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (normals) {
    geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  }
  // Packed extra dimension attributes
  geo.setAttribute('aExtraDims0_3', new Float32BufferAttribute(extraDims0_3, 4));
  geo.setAttribute('aExtraDims4_6', new Float32BufferAttribute(extraDims4_6, 3));

  return geo;
}

/**
 * GPU-accelerated polytope renderer.
 * All transformations happen in vertex shaders - only uniforms updated per frame.
 */
export const PolytopeScene = React.memo(function PolytopeScene({
  baseVertices,
  edges,
  faces = [],
  dimension,
  faceDepths: _faceDepths = [],
  opacity = 1.0,
}: PolytopeSceneProps) {
  void _faceDepths; // Reserved for future per-face depth-based coloring
  const numVertices = baseVertices.length;


  const numEdges = edges.length;
  const numFaces = faces.length;


  // ============ REFS ============
  const faceMeshRef = useRef<THREE.Mesh>(null);
  const edgeMeshRef = useRef<THREE.LineSegments>(null);

  // N-D transform hook - handles rotation matrix computation with version tracking
  const ndTransform = useNDTransformUpdates();

  // Cached linear colors - avoid per-frame sRGB->linear conversion
  const colorCacheRef = useRef(createColorCache());

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastPolytopeVersionRef = useRef(-1); // -1 forces full sync on first frame
  const lastAppearanceVersionRef = useRef(-1);
  const lastIblVersionRef = useRef(-1);
  const lastLightingVersionRef = useRef(-1);
  // Note: skybox version tracking removed - no longer used for dirty-flag optimization
  const prevFaceMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Performance optimization: Cache store state in refs to avoid getState() calls every frame
  // Note: rotation state is handled by ndTransform hook
  const animationStateRef = useRef(useAnimationStore.getState());
  const extendedObjectStateRef = useRef(useExtendedObjectStore.getState());
  const appearanceStateRef = useRef(useAppearanceStore.getState());
  const lightingStateRef = useRef(useLightingStore.getState());
  const environmentStateRef = useRef(useEnvironmentStore.getState());

  // Subscribe to store changes to update refs
  useEffect(() => {
    const unsubAnim = useAnimationStore.subscribe((s) => { animationStateRef.current = s; });
    const unsubExt = useExtendedObjectStore.subscribe((s) => { extendedObjectStateRef.current = s; });
    const unsubApp = useAppearanceStore.subscribe((s) => { appearanceStateRef.current = s; });
    const unsubLight = useLightingStore.subscribe((s) => { lightingStateRef.current = s; });
    const unsubEnv = useEnvironmentStore.subscribe((s) => { environmentStateRef.current = s; });
    return () => {
      unsubAnim();
      unsubExt();
      unsubApp();
      unsubLight();
      unsubEnv();
    };
  }, []);

  // Projection distance caching - uses shared hook to avoid O(N) recalculation every frame
  const projDistCache = useProjectionDistanceCache();

  // Simple callback ref for edge mesh - just assigns layer
  const setEdgeMeshRef = useCallback((lineSegments: THREE.LineSegments | null) => {
    edgeMeshRef.current = lineSegments;
    if (lineSegments?.layers) {
      lineSegments.layers.set(RENDER_LAYERS.MAIN_OBJECT);
    }
  }, []);

  // ============ VISUAL SETTINGS ============
  const {
    edgesVisible,
    facesVisible,
    edgeColor,
    edgeThickness,
    tubeCaps,
    faceColor,
    shaderSettings,
    sssEnabled,
  } = useAppearanceStore(
    useShallow((state) => ({
      edgesVisible: state.edgesVisible,
      facesVisible: state.facesVisible,
      edgeColor: state.edgeColor,
      edgeThickness: state.edgeThickness,
      tubeCaps: state.tubeCaps,
      faceColor: state.faceColor,
      shaderSettings: state.shaderSettings,
      sssEnabled: state.sssEnabled,
    }))
  );

  const shadowEnabled = useLightingStore((state) => state.shadowEnabled);

  // Subscribe to preset load version to trigger material recreation on scene/style load
  // This ensures material properties (transparent, depthWrite) match loaded state
  const presetLoadVersion = usePerformanceStore((state) => state.presetLoadVersion);

  const surfaceSettings = shaderSettings.surface;
  // Use TubeWireframe for thick lines (>1), native lineSegments for thin lines (1)
  const useFatWireframe = edgeThickness > 1;

  // ============ NORMAL COMPUTATION STRATEGY ============
  // For high-dimensional polytopes (7D+), use screen-space normals (dFdx/dFdy)
  // for better performance (67% fewer transforms, 67% less memory).
  // Modulation is disabled when using screen-space normals.
  const useScreenSpaceNormals = dimension >= SCREEN_SPACE_NORMAL_MIN_DIMENSION;

  // ============ MATERIALS ============
  // Uses custom ShaderMaterial with lighting (same approach as Mandelbulb)
  // DoubleSide handles both front and back faces - two-pass rendering disabled
  // because nD transformations can flip winding order, causing culling issues.
  // Feature flags in deps trigger shader recompilation when features are toggled

  // Compute shader composition separately to get modules/features for debug info
  // Use screen-space variant for high dimensions
  const { glsl: faceFragmentShader, modules: faceShaderModules, features: faceShaderFeatures } = useMemo(() => {
    const config = {
      shadows: shadowEnabled,
      sss: sssEnabled,
      fresnel: surfaceSettings.fresnelEnabled,
    };
    return useScreenSpaceNormals
      ? buildFaceFragmentShaderScreenSpace(config)
      : buildFaceFragmentShader(config);
  }, [shadowEnabled, sssEnabled, surfaceSettings.fresnelEnabled, useScreenSpaceNormals]);

  // Build vertex shader based on normal computation mode
  const faceVertexShader = useMemo(() => {
    return useScreenSpaceNormals
      ? buildFaceVertexShaderScreenSpace()
      : buildFaceVertexShader();
  }, [useScreenSpaceNormals]);

  // Create face material with tracking - shows overlay during shader compilation
  const { material: faceMaterial, isCompiling: isFaceShaderCompiling } = useTrackedShaderMaterial(
    'Polytope Face Shader',
    () => {


      return new ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: {
          // N-D transformation uniforms
          ...createNDUniforms(),
          // Shadow map uniforms
          ...createShadowMapUniforms(),
          // Color (converted to linear space for physically correct lighting)
          uColor: { value: new Color(faceColor).convertSRGBToLinear() },
          uOpacity: { value: surfaceSettings.faceOpacity },
          // Material properties for G-buffer
          uMetallic: { value: 0.0 },
          // GGX PBR roughness
          uRoughness: { value: 0.3 },
          // View matrix for normal transformation (updated every frame)
          uViewMatrix: { value: new Matrix4() },
          // Advanced Color System uniforms
          uColorAlgorithm: { value: 2 }, // Default to cosine
          uCosineA: { value: new Vector3(0.5, 0.5, 0.5) },
          uCosineB: { value: new Vector3(0.5, 0.5, 0.5) },
          uCosineC: { value: new Vector3(1.0, 1.0, 1.0) },
          uCosineD: { value: new Vector3(0.0, 0.33, 0.67) },
          uDistPower: { value: 1.0 },
          uDistCycles: { value: 1.0 },
          uDistOffset: { value: 0.0 },
          uLchLightness: { value: 0.7 },
          uLchChroma: { value: 0.15 },
          uMultiSourceWeights: { value: new Vector3(0.5, 0.3, 0.2) },
          // Fresnel (colors converted to linear space)
          uFresnelEnabled: { value: false },
          uFresnelIntensity: { value: 0.5 },
          uRimColor: { value: new Color('#ffffff').convertSRGBToLinear() },
          // Rim SSS (subsurface scattering for backlight transmission)
          uSssEnabled: { value: false },
          uSssIntensity: { value: 1.0 },
          uSssColor: { value: new Color('#ff8844').convertSRGBToLinear() },
          uSssThickness: { value: 1.0 },
          uSssJitter: { value: 0.2 },
          // Lighting and PBR uniforms (via UniformManager)
          ...UniformManager.getCombinedUniforms(['lighting', 'pbr-face']),
          // IBL (Image-Based Lighting) uniforms - PMREM texture (sampler2D)
          uEnvMap: { value: null },
          uEnvMapSize: { value: 256.0 }, // PMREMGenerator default size
          uIBLIntensity: { value: 1.0 },
          uIBLQuality: { value: 0 }, // 0=off, 1=low, 2=high
        },
        vertexShader: faceVertexShader,
        fragmentShader: faceFragmentShader,
        // Initialize transparency based on current opacity to avoid first-frame sorting issues.
        // Still updated dynamically in useFrame for runtime changes.
        transparent: surfaceSettings.faceOpacity < 1,
        side: DoubleSide,
        depthWrite: surfaceSettings.faceOpacity >= 1,
      });
    },
    // Note: faceOpacity removed from deps - it's updated via uniforms in useFrame.
    // Changing opacity value should NOT trigger shader rebuild, only feature toggles should.
    // faceColor is also updated via uniforms.
    // presetLoadVersion: triggers material recreation on scene/style load to ensure
    // transparent/depthWrite properties match the loaded state (fixes skybox visibility bug).
    // useScreenSpaceNormals: triggers shader rebuild when dimension crosses threshold
    [surfaceSettings.fresnelEnabled, sssEnabled, faceFragmentShader, faceVertexShader, presetLoadVersion]
  );


  const edgeMaterial = useMemo(() => {
    return createEdgeMaterial(edgeColor, opacity);
  }, [edgeColor, opacity]);

  // Create shared uniforms for shadow materials (patched MeshDepthMaterial and MeshDistanceMaterial)
  // These uniforms are shared with the main face material and updated per-frame
  const shadowUniforms = useMemo(() => createNDUniforms(), []);

  // Use shared shadow patching hook for N-D transformation in shadow materials.
  // This handles creation, lifecycle, and runtime toggling of patched materials.
  const { assignToMesh: assignShadowToFaceMesh } = useShadowPatching({
    transformGLSL: ND_TRANSFORM_GLSL,
    transformFunctionCall: 'ndTransformVertex(transformed)',
    uniforms: shadowUniforms,
    shadowEnabled,
  });

  // Combined callback ref for face mesh: assigns layer and shadow materials
  const setFaceMeshRef = useCallback((mesh: THREE.Mesh | null) => {

    faceMeshRef.current = mesh;
    // Delegate layer and shadow material assignment to the hook
    assignShadowToFaceMesh(mesh);

  }, [assignShadowToFaceMesh]);

  const setShaderDebugInfo = usePerformanceStore((state) => state.setShaderDebugInfo);

  useEffect(() => {
    // Report shader stats for debugging (only when materials are ready)
    const activeMaterial = facesVisible ? faceMaterial : edgeMaterial;
    if (!activeMaterial) return;

    const name = facesVisible ? 'Polytope Face Shader' : 'Polytope Edge Shader';

    // Use modules/features from shader compilation for face shader, compute for edge shader
    let modules: string[];
    let features: string[];
    if (facesVisible) {
        // Use the actual modules from shader composition
        modules = useScreenSpaceNormals
          ? ['ND Transform (Simple)', ...faceShaderModules]
          : ['ND Transform', ...faceShaderModules];
        // Start with shader-compiled features (Multi-Light, Shadow Maps, Fog/SSS/Fresnel if enabled)
        features = [...faceShaderFeatures];
        features.push(`Opacity: ${surfaceSettings.faceOpacity < 1 ? 'Transparent' : 'Solid'}`);
        features.push(`Normals: ${useScreenSpaceNormals ? 'Screen-Space (dFdx/dFdy)' : 'Geometry-Based'}`);
    } else {
        modules = ['ND Transform'];
        features = ['Edges'];
    }

    setShaderDebugInfo('object', {
      name,
      vertexShaderLength: activeMaterial.vertexShader.length,
      fragmentShaderLength: activeMaterial.fragmentShader.length,
      activeModules: modules,
      features,
    });

    return () => setShaderDebugInfo('object', null);
  }, [faceMaterial, edgeMaterial, facesVisible, faceShaderModules, faceShaderFeatures, surfaceSettings.faceOpacity, setShaderDebugInfo, useScreenSpaceNormals]);

  // ============ FACE GEOMETRY ============
  // Two modes based on useScreenSpaceNormals:
  // 1. Geometry-based normals: Each triangle has 3 unique vertices + neighbor coords (9 attribute slots)
  // 2. Screen-space normals: Each triangle has 3 unique vertices only (3 attribute slots, 67% reduction)
  //
  // Screen-space mode uses dFdx/dFdy in fragment shader for normal computation,
  // which is faster for high-dimensional polytopes but may have minor edge artifacts.
  const faceGeometry = useMemo(() => {
    if (numFaces === 0 || baseVertices.length === 0) return null;

    // Count triangles for buffer sizing
    let triangleCount = 0;
    for (const face of faces) {
      if (face.vertices.length === 3) triangleCount += 1;
      else if (face.vertices.length === 4) triangleCount += 2;
    }
    if (triangleCount === 0) return null;

    const geo = new BufferGeometry();
    const vertexCount = triangleCount * 3; // 3 vertices per triangle, non-indexed

    // Primary vertex data (always needed)
    const positions = new Float32Array(vertexCount * 3);
    const extraDims0_3 = new Float32Array(vertexCount * 4);  // vec4: dims 4-7
    const extraDims4_6 = new Float32Array(vertexCount * 3);  // vec3: dims 8-10

    // Neighbor data only needed for geometry-based normals (not screen-space)
    const neighbor1Pos = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 3);
    const neighbor1Extra0_3 = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 4);
    const neighbor1Extra4_6 = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 3);
    const neighbor2Pos = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 3);
    const neighbor2Extra0_3 = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 4);
    const neighbor2Extra4_6 = useScreenSpaceNormals ? null : new Float32Array(vertexCount * 3);

    /**
     * Helper to write vertex data at a given output index.
     * For screen-space mode: only writes this vertex data (faster, less memory)
     * For geometry mode: writes this vertex + 2 neighbors (for vertex shader normal computation)
     */
    const writeTriangleVertex = (
      outIdx: number,
      thisIdx: number,
      neighbor1Idx: number,
      neighbor2Idx: number
    ) => {
      const v = baseVertices[thisIdx]!;
      const i3 = outIdx * 3;
      const i4 = outIdx * 4;

      // This vertex position (vec3)
      positions[i3] = v[0] ?? 0;
      positions[i3 + 1] = v[1] ?? 0;
      positions[i3 + 2] = v[2] ?? 0;
      // This vertex extra dims packed: vec4(dims 4-7) + vec3(dims 8-10)
      extraDims0_3[i4] = v[3] ?? 0;
      extraDims0_3[i4 + 1] = v[4] ?? 0;
      extraDims0_3[i4 + 2] = v[5] ?? 0;
      extraDims0_3[i4 + 3] = v[6] ?? 0;
      extraDims4_6[i3] = v[7] ?? 0;
      extraDims4_6[i3 + 1] = v[8] ?? 0;
      extraDims4_6[i3 + 2] = v[9] ?? 0;

      // Skip neighbor data for screen-space normals mode (67% memory reduction)
      if (useScreenSpaceNormals) return;

      const n1 = baseVertices[neighbor1Idx]!;
      const n2 = baseVertices[neighbor2Idx]!;

      // Neighbor 1 position (vec3)
      neighbor1Pos![i3] = n1[0] ?? 0;
      neighbor1Pos![i3 + 1] = n1[1] ?? 0;
      neighbor1Pos![i3 + 2] = n1[2] ?? 0;
      // Neighbor 1 extra dims packed
      neighbor1Extra0_3![i4] = n1[3] ?? 0;
      neighbor1Extra0_3![i4 + 1] = n1[4] ?? 0;
      neighbor1Extra0_3![i4 + 2] = n1[5] ?? 0;
      neighbor1Extra0_3![i4 + 3] = n1[6] ?? 0;
      neighbor1Extra4_6![i3] = n1[7] ?? 0;
      neighbor1Extra4_6![i3 + 1] = n1[8] ?? 0;
      neighbor1Extra4_6![i3 + 2] = n1[9] ?? 0;

      // Neighbor 2 position (vec3)
      neighbor2Pos![i3] = n2[0] ?? 0;
      neighbor2Pos![i3 + 1] = n2[1] ?? 0;
      neighbor2Pos![i3 + 2] = n2[2] ?? 0;
      // Neighbor 2 extra dims packed
      neighbor2Extra0_3![i4] = n2[3] ?? 0;
      neighbor2Extra0_3![i4 + 1] = n2[4] ?? 0;
      neighbor2Extra0_3![i4 + 2] = n2[5] ?? 0;
      neighbor2Extra0_3![i4 + 3] = n2[6] ?? 0;
      neighbor2Extra4_6![i3] = n2[7] ?? 0;
      neighbor2Extra4_6![i3 + 1] = n2[8] ?? 0;
      neighbor2Extra4_6![i3 + 2] = n2[9] ?? 0;
    };

    // Build non-indexed geometry
    let outIdx = 0;
    const vertexBound = baseVertices.length;

    for (const face of faces) {
      const vis = face.vertices;

      // Skip faces with any out-of-bounds vertex indices
      // This can happen during async face detection when geometry changes
      const hasValidIndices = vis.every((idx) => idx >= 0 && idx < vertexBound);
      if (!hasValidIndices) continue;

      if (vis.length === 3) {
        // Triangle: each vertex needs to know its 2 neighbors (for geometry-based normals)
        writeTriangleVertex(outIdx++, vis[0]!, vis[1]!, vis[2]!);
        writeTriangleVertex(outIdx++, vis[1]!, vis[2]!, vis[0]!);
        writeTriangleVertex(outIdx++, vis[2]!, vis[0]!, vis[1]!);
      } else if (vis.length === 4) {
        // Quad: split into 2 triangles (0,1,2) and (0,2,3)
        writeTriangleVertex(outIdx++, vis[0]!, vis[1]!, vis[2]!);
        writeTriangleVertex(outIdx++, vis[1]!, vis[2]!, vis[0]!);
        writeTriangleVertex(outIdx++, vis[2]!, vis[0]!, vis[1]!);
        writeTriangleVertex(outIdx++, vis[0]!, vis[2]!, vis[3]!);
        writeTriangleVertex(outIdx++, vis[2]!, vis[3]!, vis[0]!);
        writeTriangleVertex(outIdx++, vis[3]!, vis[0]!, vis[2]!);
      }
    }

    // Set packed attributes (no index buffer - non-indexed geometry)
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('aExtraDims0_3', new Float32BufferAttribute(extraDims0_3, 4));
    geo.setAttribute('aExtraDims4_6', new Float32BufferAttribute(extraDims4_6, 3));

    // Neighbor attributes only for geometry-based normals mode
    if (!useScreenSpaceNormals) {
      geo.setAttribute('aNeighbor1Pos', new Float32BufferAttribute(neighbor1Pos!, 3));
      geo.setAttribute('aNeighbor1Extra0_3', new Float32BufferAttribute(neighbor1Extra0_3!, 4));
      geo.setAttribute('aNeighbor1Extra4_6', new Float32BufferAttribute(neighbor1Extra4_6!, 3));
      geo.setAttribute('aNeighbor2Pos', new Float32BufferAttribute(neighbor2Pos!, 3));
      geo.setAttribute('aNeighbor2Extra0_3', new Float32BufferAttribute(neighbor2Extra0_3!, 4));
      geo.setAttribute('aNeighbor2Extra4_6', new Float32BufferAttribute(neighbor2Extra4_6!, 3));
    }

    return geo;
  }, [numFaces, faces, baseVertices, useScreenSpaceNormals]);

  // ============ EDGE GEOMETRY ============
  const edgeGeometry = useMemo(() => {
    if (numEdges === 0) return null;

    const edgeVertices: VectorND[] = [];
    for (const [a, b] of edges) {
      const vA = baseVertices[a];
      const vB = baseVertices[b];
      if (vA && vB) {
        edgeVertices.push(vA, vB);
      }
    }

    return buildNDGeometry(edgeVertices);
  }, [numEdges, edges, baseVertices]);

  // ============ CLEANUP ============
  // Track previous resources for proper disposal when dependencies change
  // Note: faceMaterial disposal is handled by useTrackedShaderMaterial hook
  const prevEdgeMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const prevFaceGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const prevEdgeGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  // Dispose previous resources when new ones are created
  useEffect(() => {
    // Dispose old resources if they exist and differ from current
    // (faceMaterial disposal handled by useTrackedShaderMaterial hook)
    if (prevEdgeMaterialRef.current && prevEdgeMaterialRef.current !== edgeMaterial) {
      prevEdgeMaterialRef.current.dispose();
    }
    if (prevFaceGeometryRef.current && prevFaceGeometryRef.current !== faceGeometry) {
      prevFaceGeometryRef.current.dispose();
    }
    if (prevEdgeGeometryRef.current && prevEdgeGeometryRef.current !== edgeGeometry) {
      prevEdgeGeometryRef.current.dispose();
    }

    // Update refs to current values
    prevEdgeMaterialRef.current = edgeMaterial;
    prevFaceGeometryRef.current = faceGeometry;
    prevEdgeGeometryRef.current = edgeGeometry;

    // Cleanup on unmount - dispose current resources
    // (faceMaterial disposed by useTrackedShaderMaterial hook)
    return () => {
      edgeMaterial.dispose();
      faceGeometry?.dispose();
      edgeGeometry?.dispose();
    };
  }, [edgeMaterial, faceGeometry, edgeGeometry]);

  // Note: Shadow material cleanup and runtime toggle are handled by useShadowPatching hook

  // ============ USEFRAME: UPDATE UNIFORMS ONLY ============
  useFrame(({ camera, scene }) => {
    if (numVertices === 0) return;

    // Read state from cached refs (updated via subscriptions, not getState() per frame)
    // Note: rotation state is handled by ndTransform hook
    // Note: animationState ref is kept for future use but not currently read in useFrame
    const extendedObjectState = extendedObjectStateRef.current;
    const appearanceState = appearanceStateRef.current;
    const lightingState = lightingStateRef.current;
    const environmentState = environmentStateRef.current;

    // ============================================
    // DIRTY-FLAG: Material change detection
    // ============================================
    const faceMesh = faceMeshRef.current;
    const currentFaceMaterial = faceMesh?.material as ShaderMaterial | undefined;
    const faceMaterialChanged = currentFaceMaterial !== prevFaceMaterialRef.current;
    if (faceMaterialChanged && currentFaceMaterial) {
      prevFaceMaterialRef.current = currentFaceMaterial;
      // Force full sync on material change
      lastPolytopeVersionRef.current = -1;
      lastAppearanceVersionRef.current = -1;
      lastIblVersionRef.current = -1;
      lastLightingVersionRef.current = -1;
    }

    // ============================================
    // DIRTY-FLAG: Get versions and check for changes
    // ============================================
    const polytopeVersion = extendedObjectState.polytopeVersion;
    const appearanceVersion = appearanceState.appearanceVersion;
    const iblVersion = environmentState.iblVersion;
    const lightingVersion = lightingState.version;

    const polytopeChanged = polytopeVersion !== lastPolytopeVersionRef.current;
    const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current;
    const iblChanged = iblVersion !== lastIblVersionRef.current;
    const lightingChanged = lightingVersion !== lastLightingVersionRef.current;

    const polytopeConfig = extendedObjectState.polytope;

    // Update polytope version ref after reading config
    if (polytopeChanged) {
      lastPolytopeVersionRef.current = polytopeVersion;
    }

    // Visual scale is read from polytope config (applied post-projection via shader)
    // Geometry is always unit-scale, this acts like camera zoom
    const visualScale = polytopeConfig.scale;

    const fresnelEnabled = appearanceState.shaderSettings.surface.fresnelEnabled;
    const fresnelIntensity = appearanceState.fresnelIntensity;
    const rimColor = appearanceState.edgeColor;
    // Note: PBR properties (roughness, metallic, specularIntensity, specularColor)
    // are now applied via UniformManager using 'pbr-face' source
    // Face opacity - read dynamically to update uniform without shader rebuild
    const faceOpacity = appearanceState.shaderSettings.surface.faceOpacity;

    // Read SSS state (shared with raymarched objects)
    const sssEnabled = appearanceState.sssEnabled;
    const sssIntensity = appearanceState.sssIntensity;
    const sssColor = appearanceState.sssColor;
    const sssThickness = appearanceState.sssThickness;
    const sssJitter = appearanceState.sssJitter;

    // Read advanced color system state
    const colorAlgorithm = appearanceState.colorAlgorithm;
    const cosineCoefficients = appearanceState.cosineCoefficients;
    const distribution = appearanceState.distribution;
    const lchLightness = appearanceState.lchLightness;
    const lchChroma = appearanceState.lchChroma;
    const multiSourceWeights = appearanceState.multiSourceWeights;

    // Update rotation matrix via shared hook (handles version tracking and lazy evaluation)
    // Note: Scale is now applied AFTER projection, so we don't pass scales to rotation
    ndTransform.update({});
    const gpuData = ndTransform.source.getGPUData();

    // Get projection distance (no longer needs scale adjustment since scale is post-projection)
    const projectionDistance = projDistCache.getProjectionDistance(baseVertices, dimension, []);



    // Cached linear colors - avoid per-frame sRGB->linear conversion
    const cache = colorCacheRef.current;

    // Update all materials through mesh refs
    const meshUpdates = [
      { ref: faceMeshRef, color: appearanceState.faceColor, cache: cache.faceColor },
      { ref: edgeMeshRef, color: appearanceState.edgeColor, cache: cache.edgeColor },
    ];

    for (const { ref, color, cache: colorCache } of meshUpdates) {
      if (ref.current) {
        const material = ref.current.material as ShaderMaterial;

        // Skip if material is not ready (still compiling) or not a ShaderMaterial
        if (!material || !('uniforms' in material)) continue;

        // Update N-D transformation uniforms (visualScale is applied AFTER projection like camera zoom)
        updateNDUniforms(material, gpuData, dimension, visualScale, projectionDistance);

        const u = material.uniforms;

        // Update view matrix for normal transformation (needed for SSR)
        if (u.uViewMatrix) (u.uViewMatrix.value as Matrix4).copy(camera.matrixWorldInverse);

        // ============================================
        // DIRTY-FLAG: Only update appearance uniforms when settings change
        // ============================================
        if (appearanceChanged) {
          // Update surface color
          if (u.uColor) updateLinearColorUniform(colorCache, u.uColor.value as Color, color);

          // Update opacity uniform (only for face material which has it)
          // Also update material transparency state dynamically to avoid shader rebuild
          if (u.uOpacity) {
            u.uOpacity.value = faceOpacity;
            // Update material transparency based on opacity (like Mandelbulb)
            const isTransparent = faceOpacity < 1;
            if (material.transparent !== isTransparent) {
              material.transparent = isTransparent;
              material.depthWrite = !isTransparent;
              material.needsUpdate = true;
            }
          }

          // Note: PBR material properties (uRoughness, uMetallic, uSpecularIntensity, uSpecularColor)
          // are applied via UniformManager using 'pbr-face' source
          if (u.uFresnelEnabled) u.uFresnelEnabled.value = fresnelEnabled;
          if (u.uFresnelIntensity) u.uFresnelIntensity.value = fresnelIntensity;
          if (u.uRimColor) updateLinearColorUniform(cache.rimColor, u.uRimColor.value as Color, rimColor);

          // Update rim SSS uniforms (shared with raymarched objects)
          if (u.uSssEnabled) u.uSssEnabled.value = sssEnabled;
          if (u.uSssIntensity) u.uSssIntensity.value = sssIntensity;
          if (u.uSssColor) updateLinearColorUniform(cache.sssColor, u.uSssColor.value as Color, sssColor);
          if (u.uSssThickness) u.uSssThickness.value = sssThickness;
          if (u.uSssJitter) u.uSssJitter.value = sssJitter;

          // Update advanced color system uniforms (only for face materials)
          if (u.uColorAlgorithm) u.uColorAlgorithm.value = COLOR_ALGORITHM_TO_INT[colorAlgorithm];
          if (u.uCosineA) (u.uCosineA.value as Vector3).set(cosineCoefficients.a[0], cosineCoefficients.a[1], cosineCoefficients.a[2]);
          if (u.uCosineB) (u.uCosineB.value as Vector3).set(cosineCoefficients.b[0], cosineCoefficients.b[1], cosineCoefficients.b[2]);
          if (u.uCosineC) (u.uCosineC.value as Vector3).set(cosineCoefficients.c[0], cosineCoefficients.c[1], cosineCoefficients.c[2]);
          if (u.uCosineD) (u.uCosineD.value as Vector3).set(cosineCoefficients.d[0], cosineCoefficients.d[1], cosineCoefficients.d[2]);
          if (u.uDistPower) u.uDistPower.value = distribution.power;
          if (u.uDistCycles) u.uDistCycles.value = distribution.cycles;
          if (u.uDistOffset) u.uDistOffset.value = distribution.offset;
          if (u.uLchLightness) u.uLchLightness.value = lchLightness;
          if (u.uLchChroma) u.uLchChroma.value = lchChroma;
          if (u.uMultiSourceWeights) (u.uMultiSourceWeights.value as Vector3).set(multiSourceWeights.depth, multiSourceWeights.orbitTrap, multiSourceWeights.normal);
        }

        // ============================================
        // DIRTY-FLAG: Only update IBL uniforms when settings change
        // ============================================
        if (iblChanged) {
          // IBL (Image-Based Lighting) uniforms
          // Compute isPMREM first to gate quality (prevents null texture sampling)
          const env = scene.environment;
          const isPMREM = env && env.mapping === THREE.CubeUVReflectionMapping;
          const iblState = environmentStateRef.current;
          if (u.uIBLQuality) {
            const qualityMap = { off: 0, low: 1, high: 2 } as const;
            // Force IBL off when no valid PMREM texture
            u.uIBLQuality.value = isPMREM ? qualityMap[iblState.iblQuality] : 0;
          }
          if (u.uIBLIntensity) u.uIBLIntensity.value = iblState.iblIntensity;
          if (u.uEnvMap) {
            u.uEnvMap.value = isPMREM ? env : null;
          }
        }

        // Lighting and PBR (via UniformManager) - uses internal version tracking
        UniformManager.applyToMaterial(material, ['lighting', 'pbr-face']);

        // ============================================
        // Shadow uniforms - matrices must update every frame, but use cached scene traversal
        // Note: Shadow matrices are references to Three.js objects that update every frame,
        // so we must call updateShadowMapUniforms to copy fresh matrix values to GPU uniforms.
        // The expensive scene traversal is cached by collectShadowDataCached.
        // ============================================
        if (shadowEnabled) {
          const shadowData = collectShadowDataCached(scene, lightingState.lights);
          const shadowQuality = lightingState.shadowQuality;
          const shadowMapSize = SHADOW_MAP_SIZES[shadowQuality];
          const pcfSamples = blurToPCFSamples(lightingState.shadowMapBlur);
          updateShadowMapUniforms(
            u as Record<string, { value: unknown }>,
            shadowData,
            lightingState.shadowMapBias,
            shadowMapSize,
            pcfSamples
          );
        }
      }
    }

    // Update version refs at end of frame
    if (appearanceChanged) {
      lastAppearanceVersionRef.current = appearanceVersion;
    }
    if (iblChanged) {
      lastIblVersionRef.current = iblVersion;
    }
    if (lightingChanged) {
      lastLightingVersionRef.current = lightingVersion;
    }

    // Update shadow material uniforms for animated shadows
    // Patched MeshDepthMaterial and MeshDistanceMaterial share the same shadowUniforms object.
    // Updates to shadowUniforms are automatically reflected in the compiled shaders.
    if (shadowEnabled) {
      const u = shadowUniforms;

      // Update N-D transformation uniforms (visualScale is applied AFTER projection like camera zoom)
      (u.uRotationMatrix4D!.value as Matrix4).copy(gpuData.rotationMatrix4D);
      u.uDimension!.value = dimension;
      u.uUniformScale!.value = visualScale;
      (u.uExtraRotationCols!.value as Float32Array).set(gpuData.extraRotationCols);
      (u.uDepthRowSums!.value as Float32Array).set(gpuData.depthRowSums);
      u.uProjectionDistance!.value = projectionDistance;
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS);

  // ============ RENDER ============
  // NOTE: No placeholder mesh during shader compilation. The placeholder was using
  // MeshBasicMaterial which only outputs to 1 color attachment, causing
  // GL_INVALID_OPERATION when rendered to 3-attachment MRT targets.
  // The shader compilation overlay still shows because it's a separate React component.

  return (
    <group>
      {/* Polytope faces - DoubleSide handles both front and back faces */}
      {/* Only render when shader is ready - no placeholder to avoid MRT mismatch */}
      {facesVisible && faceGeometry && !isFaceShaderCompiling && faceMaterial && (
        <mesh
          ref={setFaceMeshRef}
          geometry={faceGeometry}
          material={faceMaterial}
          castShadow={shadowEnabled}
          receiveShadow={shadowEnabled}
        />
      )}

      {/* Polytope edges - use TubeWireframe for thick lines, native lineSegments for thin */}
      {/* Note: PBR properties (metallic, roughness, specularIntensity, specularColor) */}
      {/* are managed via UniformManager using 'pbr-edge' source inside TubeWireframe */}
      {edgesVisible && useFatWireframe && (
        <TubeWireframe
          vertices={baseVertices}
          edges={edges}
          dimension={dimension}
          color={edgeColor}
          opacity={opacity}
          radius={edgeThickness * 0.015}
          shadowEnabled={shadowEnabled}
          caps={tubeCaps}
        />
      )}
      {edgesVisible && !useFatWireframe && edgeGeometry && (
        <lineSegments ref={setEdgeMeshRef} geometry={edgeGeometry} material={edgeMaterial} />
      )}
    </group>
  );
});
