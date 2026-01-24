/**
 * TubeWireframe Component
 *
 * GPU-accelerated tube wireframe renderer with N-D transformation support
 * and PBR material properties. Uses InstancedMesh with CylinderGeometry
 * for true 3D edges that respond to lighting.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

import { createColorCache, updateLinearColorUniform } from '@/rendering/colors/linearCache'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useTrackedShaderMaterial } from '@/rendering/materials/useTrackedShaderMaterial'
import {
  useNDTransformUpdates,
  useProjectionDistanceCache,
  useShadowPatching,
} from '@/rendering/renderers/base'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import { useFrame } from '@react-three/fiber'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  Color,
  CylinderGeometry,
  DoubleSide,
  GLSL3,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
} from 'three'

import { DEFAULT_PROJECTION_DISTANCE } from '@/lib/math/projection'
import type { VectorND } from '@/lib/math/types'
import {
  composeTubeWireframeFragmentShader,
  composeTubeWireframeVertexShader,
} from '@/rendering/shaders/tubewireframe/compose'
import {
  blurToPCFSamples,
  collectShadowDataCached,
  createShadowMapUniforms,
  SHADOW_MAP_SIZES,
  updateShadowMapUniforms,
} from '@/rendering/shadows'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useTransformStore } from '@/stores/transformStore'

// Maximum extra dimensions (beyond XYZ + W)
const MAX_EXTRA_DIMS = 7

// Cylinder segments for tube rendering (balance quality/performance)
const CYLINDER_SEGMENTS = 8

/**
 * GLSL code block containing the nD transformation for tube wireframe shadow materials.
 * This is injected into MeshDepthMaterial and MeshDistanceMaterial via onBeforeCompile.
 * Unlike the polytope version, this handles instanced tube geometry with start/end positions.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 */
const TUBE_ND_TRANSFORM_GLSL = `
#define MAX_EXTRA_DIMS 7

// N-D Transformation uniforms
uniform mat4 uRotationMatrix4D;
uniform int uDimension;
uniform float uUniformScale;  // Applied AFTER projection (like camera zoom)
uniform float uProjectionDistance;
uniform float uExtraRotationCols[28];
uniform float uDepthRowSums[11];
uniform float uDepthNormFactor;  // Precomputed: dimension > 4 ? sqrt(dimension - 3) : 1.0
uniform float uRadius;

// Instance inputs for tube start/end points (WebGL2 GLSL ES 3.00)
in vec3 instanceStart;
in vec3 instanceEnd;
in vec4 instanceStartExtraA;
in vec4 instanceStartExtraB;
in vec4 instanceEndExtraA;
in vec4 instanceEndExtraB;

// Transform a single nD point to 3D
// IMPORTANT: Scale is applied AFTER projection, not before rotation.
vec3 ndTransformPoint(vec3 pos, vec4 extraA, vec4 extraB) {
  // Build input array from raw (unscaled) coordinates
  float inputs[11];
  inputs[0] = pos.x;
  inputs[1] = pos.y;
  inputs[2] = pos.z;
  inputs[3] = extraA.x; // W
  inputs[4] = extraA.y;
  inputs[5] = extraA.z;
  inputs[6] = extraA.w;
  inputs[7] = extraB.x;
  inputs[8] = extraB.y;
  inputs[9] = extraB.z;
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
  // Normalize depth for consistent visual scale across dimensions.
  // uDepthNormFactor is precomputed on CPU: dimension > 4 ? sqrt(dimension - 3) : 1.0
  effectiveDepth /= uDepthNormFactor;

  // Guard against division by zero
  float denom = uProjectionDistance - effectiveDepth;
  if (abs(denom) < 0.0001) denom = denom >= 0.0 ? 0.0001 : -0.0001;
  float factor = 1.0 / denom;

  // Project to 3D, then apply uniform scale (like camera zoom)
  return rotated.xyz * factor * uUniformScale;
}

// Transform tube vertex position (cylinder mesh positioned between start and end)
vec3 tubeTransformVertex(vec3 localPos) {
  // Transform start and end points through nD pipeline
  vec3 start3D = ndTransformPoint(instanceStart, instanceStartExtraA, instanceStartExtraB);
  vec3 end3D = ndTransformPoint(instanceEnd, instanceEndExtraA, instanceEndExtraB);

  // Build tube orientation from start to end
  vec3 dir = end3D - start3D;
  float tubeLength = length(dir);
  if (tubeLength < 0.0001) {
    return start3D; // Degenerate tube
  }
  vec3 axis = dir / tubeLength;

  // Build orthonormal basis for tube cross-section
  vec3 up = abs(axis.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, axis));
  vec3 bitangent = cross(axis, tangent);

  // Transform local cylinder vertex:
  // - localPos.xz is the radial position (scaled by radius)
  // - localPos.y is the height along the tube (scaled by length)
  vec3 radial = (tangent * localPos.x + bitangent * localPos.z) * uRadius;
  vec3 axial = axis * (localPos.y + 0.5) * tubeLength; // +0.5 to shift from centered to start

  return start3D + radial + axial;
}
`

/**
 * Create shared uniforms for tube shadow materials.
 *
 * IMPORTANT: Scale is applied AFTER projection to 3D (like camera zoom).
 * This preserves N-D geometry and prevents extreme values during rotation.
 *
 * @param dimension - Current dimension
 * @param radius - Tube radius
 * @returns Record of tube shadow uniforms
 */
function createTubeShadowUniforms(
  dimension: number,
  radius: number
): Record<string, { value: unknown }> {
  return {
    uRotationMatrix4D: { value: new Matrix4() },
    uDimension: { value: dimension },
    uUniformScale: { value: 1.0 }, // Applied AFTER projection (like camera zoom)
    uExtraRotationCols: { value: new Float32Array(MAX_EXTRA_DIMS * 4) },
    uDepthRowSums: { value: new Float32Array(11) },
    uDepthNormFactor: { value: dimension > 4 ? Math.sqrt(dimension - 3) : 1.0 },
    uProjectionDistance: { value: DEFAULT_PROJECTION_DISTANCE },
    uRadius: { value: radius },
  }
}

export interface TubeWireframeProps {
  /** N-dimensional vertices */
  vertices: VectorND[]
  /** Edge connections as pairs of vertex indices */
  edges: [number, number][]
  /** Current dimension of the object (default: 3) */
  dimension?: number
  /** Color of the tubes */
  color: string
  /** Opacity (0-1) */
  opacity?: number
  /** Tube radius */
  radius?: number
  /** Whether shadows are enabled */
  shadowEnabled?: boolean
  /** Whether to render end caps on tubes (default: false for performance) */
  caps?: boolean
  // Note: PBR properties (metallic, roughness, specularIntensity, specularColor)
  // are now managed via UniformManager using 'pbr-edge' source
}

/**
 * GPU-accelerated tube wireframe renderer with N-D transformation and PBR lighting.
 * PBR properties (metallic, roughness, specularIntensity, specularColor) are managed
 * via UniformManager using the 'pbr-edge' source.
 * @param root0
 * @param root0.vertices
 * @param root0.edges
 * @param root0.dimension
 * @param root0.color
 * @param root0.opacity
 * @param root0.radius
 * @param root0.shadowEnabled
 * @param root0.caps
 * @returns React element rendering instanced tube wireframe mesh or null
 */
export function TubeWireframe({
  vertices,
  edges,
  dimension = 3,
  color,
  opacity = 1.0,
  radius = 0.02,
  shadowEnabled = false,
  caps = false,
}: TubeWireframeProps): React.JSX.Element | null {
  const meshRef = useRef<InstancedMesh>(null)

  // N-D transform hook - handles rotation matrix computation with version tracking
  const ndTransform = useNDTransformUpdates()

  // Cached linear colors - avoid per-frame sRGB->linear conversion
  const colorCacheRef = useRef(createColorCache())

  // Projection distance caching - uses shared hook to avoid O(N) recalculation every frame
  const projDistCache = useProjectionDistanceCache()

  // P4 Optimization: Pre-allocated instance attribute arrays to avoid per-change allocations
  // These are resized only when edge count increases, otherwise reused
  const instanceArraysRef = useRef<{
    capacity: number
    start: Float32Array
    end: Float32Array
    startExtraA: Float32Array
    startExtraB: Float32Array
    endExtraA: Float32Array
    endExtraB: Float32Array
  } | null>(null)

  // Performance optimization: Cache store state in refs to avoid getState() calls every frame
  // Note: rotation state is handled by ndTransform hook
  const transformStateRef = useRef(useTransformStore.getState())
  const appearanceStateRef = useRef(useAppearanceStore.getState())
  const lightingStateRef = useRef(useLightingStore.getState())
  const environmentStateRef = useRef(useEnvironmentStore.getState())
  const extendedObjectStateRef = useRef(useExtendedObjectStore.getState())

  // DIRTY-FLAG TRACKING: Track store versions to skip unchanged uniform categories
  const lastAppearanceVersionRef = useRef(-1) // -1 forces full sync on first frame
  const lastIblVersionRef = useRef(-1)
  const lastLightingVersionRef = useRef(-1)
  const prevMaterialRef = useRef<ShaderMaterial | null>(null)

  // Subscribe to store changes to update refs
  useEffect(() => {
    const unsubTrans = useTransformStore.subscribe((s) => {
      transformStateRef.current = s
    })
    const unsubApp = useAppearanceStore.subscribe((s) => {
      appearanceStateRef.current = s
    })
    const unsubLight = useLightingStore.subscribe((s) => {
      lightingStateRef.current = s
    })
    const unsubEnv = useEnvironmentStore.subscribe((s) => {
      environmentStateRef.current = s
    })
    const unsubExt = useExtendedObjectStore.subscribe((s) => {
      extendedObjectStateRef.current = s
    })
    return () => {
      unsubTrans()
      unsubApp()
      unsubLight()
      unsubEnv()
      unsubExt()
    }
  }, [])

  // Base cylinder geometry (Y-axis aligned, height 1, centered at origin)
  // openEnded = !caps: when caps is false (default), tubes are hollow for performance
  const geometry = useMemo(() => {
    return new CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS, 1, !caps)
  }, [caps])

  const setShaderDebugInfo = usePerformanceStore((state) => state.setShaderDebugInfo)

  // Feature flags for conditional shader compilation
  const sssEnabled = useAppearanceStore((state) => state.sssEnabled)
  const fresnelEnabled = useAppearanceStore((state) => state.shaderSettings.surface.fresnelEnabled)

  // Compute shader configuration for tracking (used outside the hook)
  const {
    glsl: fragmentShaderString,
    modules: shaderModules,
    features: shaderFeatures,
  } = useMemo(() => {
    return composeTubeWireframeFragmentShader({
      sss: sssEnabled,
      fresnel: fresnelEnabled,
    })
  }, [sssEnabled, fresnelEnabled])

  // Create shader material with tracking - shows overlay during compilation
  // Feature flags in deps trigger shader recompilation when features are toggled
  const { material, isCompiling } = useTrackedShaderMaterial(
    'TubeWireframe PBR',
    () => {
      // Convert colors from sRGB to linear for physically correct lighting
      const colorValue = new Color(color).convertSRGBToLinear()
      const vertexShaderString = composeTubeWireframeVertexShader()

      return new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: vertexShaderString,
        fragmentShader: fragmentShaderString,
        uniforms: {
          // Material (colors converted to linear space)
          // Note: uMetallic and uRoughness are provided by 'pbr-edge' source via UniformManager
          uColor: { value: colorValue },
          uOpacity: { value: opacity },
          uRadius: { value: radius },

          // N-D transformation (scale is applied AFTER projection, like camera zoom)
          uRotationMatrix4D: { value: new Matrix4() },
          uDimension: { value: dimension },
          uUniformScale: { value: 1.0 }, // Applied AFTER projection
          uExtraRotationCols: { value: new Float32Array(MAX_EXTRA_DIMS * 4) },
          uDepthRowSums: { value: new Float32Array(11) },
          uDepthNormFactor: { value: dimension > 4 ? Math.sqrt(dimension - 3) : 1.0 },
          uProjectionDistance: { value: DEFAULT_PROJECTION_DISTANCE },

          // Lighting and PBR uniforms (via UniformManager)
          ...UniformManager.getCombinedUniforms(['lighting', 'pbr-edge']),

          // Fresnel (colors converted to linear space)
          uFresnelEnabled: { value: true },
          uFresnelIntensity: { value: 0.1 },
          uRimColor: { value: new Color(color).convertSRGBToLinear() },

          // Rim SSS (subsurface scattering for backlight transmission)
          uSssEnabled: { value: false },
          uSssIntensity: { value: 1.0 },
          uSssColor: { value: new Color('#ff8844').convertSRGBToLinear() },
          uSssThickness: { value: 1.0 },
          uSssJitter: { value: 0.2 },

          // Shadow map uniforms
          // Shadow map uniforms
          ...createShadowMapUniforms(),

          // IBL (Image-Based Lighting) uniforms - PMREM texture (sampler2D)
          uEnvMap: { value: null },
          uEnvMapSize: { value: 256.0 },
          uIBLIntensity: { value: 1.0 },
          uIBLQuality: { value: 0 }, // 0=off, 1=low, 2=high
        },
        // Initial transparency state - updated dynamically in useFrame based on current opacity
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: DoubleSide,
      })
    },
    // Note: opacity removed from deps - it's updated via uniforms in useFrame.
    // Changing opacity value should NOT trigger shader rebuild, only feature toggles should.
    // Color, metallic, roughness, radius, dimension are also updated via uniforms.
    [sssEnabled, fresnelEnabled, fragmentShaderString]
  )

  // Create shared uniforms for shadow materials (patched MeshDepthMaterial and MeshDistanceMaterial)
  // These uniforms are shared and updated per-frame
  const shadowUniforms = useMemo(
    () => createTubeShadowUniforms(dimension, radius),
    [dimension, radius]
  )

  // Use shared shadow patching hook for tube N-D transformation in shadow materials.
  // This handles creation, lifecycle, and runtime toggling of patched materials.
  const { assignToMesh: assignShadowToMesh } = useShadowPatching({
    transformGLSL: TUBE_ND_TRANSFORM_GLSL,
    transformFunctionCall: 'tubeTransformVertex(transformed)',
    uniforms: shadowUniforms,
    shadowEnabled,
  })

  // Combined callback ref for mesh: assigns layer and shadow materials
  const setMeshRef = useCallback(
    (mesh: InstancedMesh | null) => {
      meshRef.current = mesh
      // Delegate layer and shadow material assignment to the hook
      assignShadowToMesh(mesh)
    },
    [assignShadowToMesh]
  )

  // Dispatch shader debug info (only when material is ready)
  useEffect(() => {
    if (!material) return
    setShaderDebugInfo('object', {
      name: 'TubeWireframe PBR',
      vertexShaderLength: material.vertexShader.length,
      fragmentShaderLength: material.fragmentShader.length,
      activeModules: shaderModules,
      features: shaderFeatures,
    })
    return () => setShaderDebugInfo('object', null)
  }, [material, shaderModules, shaderFeatures, setShaderDebugInfo])

  // Cleanup geometry on unmount or when it changes
  // Note: Material disposal is handled by useTrackedShaderMaterial hook
  const prevGeometryRef = useRef<CylinderGeometry | null>(null)

  useEffect(() => {
    // Dispose old geometry if it exists and differs from current
    if (prevGeometryRef.current && prevGeometryRef.current !== geometry) {
      prevGeometryRef.current.dispose()
    }

    // Update ref to current value
    prevGeometryRef.current = geometry

    // Cleanup on unmount
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  // Note: Shadow material cleanup and runtime toggle are handled by useShadowPatching hook

  // Update instance attributes when vertices/edges change
  // P4 Optimization: Reuse pre-allocated arrays when possible to reduce GC pressure
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !vertices || vertices.length === 0 || !edges || edges.length === 0) return

    const instanceCount = edges.length

    // P4 Optimization: Get or create pre-allocated arrays
    // Only allocate new arrays when capacity is insufficient
    let arrays = instanceArraysRef.current
    if (!arrays || arrays.capacity < instanceCount) {
      // Allocate with 20% extra capacity to reduce future reallocations
      const newCapacity = Math.ceil(instanceCount * 1.2)
      arrays = {
        capacity: newCapacity,
        start: new Float32Array(newCapacity * 3),
        end: new Float32Array(newCapacity * 3),
        startExtraA: new Float32Array(newCapacity * 4),
        startExtraB: new Float32Array(newCapacity * 4),
        endExtraA: new Float32Array(newCapacity * 4),
        endExtraB: new Float32Array(newCapacity * 4),
      }
      instanceArraysRef.current = arrays
    }

    // Use the pre-allocated arrays
    const {
      start: instanceStart,
      end: instanceEnd,
      startExtraA: instanceStartExtraA,
      startExtraB: instanceStartExtraB,
      endExtraA: instanceEndExtraA,
      endExtraB: instanceEndExtraB,
    } = arrays

    // Fill instance arrays
    for (let i = 0; i < edges.length; i++) {
      const [startIdx, endIdx] = edges[i]!
      const v1 = vertices[startIdx]
      const v2 = vertices[endIdx]

      const baseIdx3 = i * 3
      const baseIdx4 = i * 4

      if (v1 && v2) {
        // XYZ positions
        instanceStart[baseIdx3 + 0] = v1[0] ?? 0
        instanceStart[baseIdx3 + 1] = v1[1] ?? 0
        instanceStart[baseIdx3 + 2] = v1[2] ?? 0
        instanceEnd[baseIdx3 + 0] = v2[0] ?? 0
        instanceEnd[baseIdx3 + 1] = v2[1] ?? 0
        instanceEnd[baseIdx3 + 2] = v2[2] ?? 0

        // Pack start extra dimensions
        // ExtraA: (W, Extra0, Extra1, Extra2)
        instanceStartExtraA[baseIdx4 + 0] = v1[3] ?? 0 // W
        instanceStartExtraA[baseIdx4 + 1] = v1[4] ?? 0 // Extra0
        instanceStartExtraA[baseIdx4 + 2] = v1[5] ?? 0 // Extra1
        instanceStartExtraA[baseIdx4 + 3] = v1[6] ?? 0 // Extra2
        // ExtraB: (Extra3, Extra4, Extra5, Extra6)
        instanceStartExtraB[baseIdx4 + 0] = v1[7] ?? 0 // Extra3
        instanceStartExtraB[baseIdx4 + 1] = v1[8] ?? 0 // Extra4
        instanceStartExtraB[baseIdx4 + 2] = v1[9] ?? 0 // Extra5
        instanceStartExtraB[baseIdx4 + 3] = v1[10] ?? 0 // Extra6

        // Pack end extra dimensions
        instanceEndExtraA[baseIdx4 + 0] = v2[3] ?? 0
        instanceEndExtraA[baseIdx4 + 1] = v2[4] ?? 0
        instanceEndExtraA[baseIdx4 + 2] = v2[5] ?? 0
        instanceEndExtraA[baseIdx4 + 3] = v2[6] ?? 0
        instanceEndExtraB[baseIdx4 + 0] = v2[7] ?? 0
        instanceEndExtraB[baseIdx4 + 1] = v2[8] ?? 0
        instanceEndExtraB[baseIdx4 + 2] = v2[9] ?? 0
        instanceEndExtraB[baseIdx4 + 3] = v2[10] ?? 0
      } else {
        // Invalid edge - use degenerate tube (same start/end)
        for (let j = 0; j < 3; j++) {
          instanceStart[baseIdx3 + j] = 0
          instanceEnd[baseIdx3 + j] = 0
        }
        for (let j = 0; j < 4; j++) {
          instanceStartExtraA[baseIdx4 + j] = 0
          instanceStartExtraB[baseIdx4 + j] = 0
          instanceEndExtraA[baseIdx4 + j] = 0
          instanceEndExtraB[baseIdx4 + j] = 0
        }
      }
    }

    // P4 Optimization: Check if attributes already exist and can be updated in-place
    // This avoids creating new InstancedBufferAttribute objects every time
    const existingStart = geometry.getAttribute('instanceStart') as
      | InstancedBufferAttribute
      | undefined
    if (existingStart && existingStart.array.length >= instanceCount * 3) {
      // Reuse existing attribute - just update the data
      existingStart.array.set(instanceStart.subarray(0, instanceCount * 3))
      existingStart.needsUpdate = true
      ;(geometry.getAttribute('instanceEnd') as InstancedBufferAttribute).array.set(
        instanceEnd.subarray(0, instanceCount * 3)
      )
      ;(geometry.getAttribute('instanceEnd') as InstancedBufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('instanceStartExtraA') as InstancedBufferAttribute).array.set(
        instanceStartExtraA.subarray(0, instanceCount * 4)
      )
      ;(geometry.getAttribute('instanceStartExtraA') as InstancedBufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('instanceStartExtraB') as InstancedBufferAttribute).array.set(
        instanceStartExtraB.subarray(0, instanceCount * 4)
      )
      ;(geometry.getAttribute('instanceStartExtraB') as InstancedBufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('instanceEndExtraA') as InstancedBufferAttribute).array.set(
        instanceEndExtraA.subarray(0, instanceCount * 4)
      )
      ;(geometry.getAttribute('instanceEndExtraA') as InstancedBufferAttribute).needsUpdate = true
      ;(geometry.getAttribute('instanceEndExtraB') as InstancedBufferAttribute).array.set(
        instanceEndExtraB.subarray(0, instanceCount * 4)
      )
      ;(geometry.getAttribute('instanceEndExtraB') as InstancedBufferAttribute).needsUpdate = true
    } else {
      // Create new attributes (first time or capacity increased)
      geometry.setAttribute(
        'instanceStart',
        new InstancedBufferAttribute(instanceStart.subarray(0, instanceCount * 3), 3)
      )
      geometry.setAttribute(
        'instanceEnd',
        new InstancedBufferAttribute(instanceEnd.subarray(0, instanceCount * 3), 3)
      )
      geometry.setAttribute(
        'instanceStartExtraA',
        new InstancedBufferAttribute(instanceStartExtraA.subarray(0, instanceCount * 4), 4)
      )
      geometry.setAttribute(
        'instanceStartExtraB',
        new InstancedBufferAttribute(instanceStartExtraB.subarray(0, instanceCount * 4), 4)
      )
      geometry.setAttribute(
        'instanceEndExtraA',
        new InstancedBufferAttribute(instanceEndExtraA.subarray(0, instanceCount * 4), 4)
      )
      geometry.setAttribute(
        'instanceEndExtraB',
        new InstancedBufferAttribute(instanceEndExtraB.subarray(0, instanceCount * 4), 4)
      )
    }

    // Update instance count
    mesh.count = instanceCount
    // Note: `isCompiling` in deps ensures this runs after shader compilation finishes.
    // When compiling, we return null (no mesh), so meshRef.current is null and effect exits early.
    // When isCompiling becomes false, the mesh renders and this effect re-runs to set up
    // instance attributes. Using isCompiling (not material) because material reference changes
    // BEFORE isCompiling becomes false.
  }, [vertices, edges, geometry, isCompiling])

  // Update uniforms every frame
  useFrame(({ scene }) => {
    // Skip if material is not ready (still compiling)
    if (!material || !material.uniforms.uRotationMatrix4D) return

    // ============================================
    // DIRTY-FLAG: Material change detection
    // ============================================
    const materialChanged = material !== prevMaterialRef.current
    if (materialChanged) {
      prevMaterialRef.current = material
      // Force full sync on material change
      lastAppearanceVersionRef.current = -1
      lastIblVersionRef.current = -1
      lastLightingVersionRef.current = -1
    }

    // Read state from cached refs (updated via subscriptions, not getState() per frame)
    const extendedObjectState = extendedObjectStateRef.current
    const appearanceState = appearanceStateRef.current
    // Visual scale is read from polytope config (applied post-projection via shader)
    // Geometry is always unit-scale, this acts like camera zoom
    const visualScale = extendedObjectState.polytope.scale
    const lightingState = lightingStateRef.current
    const environmentState = environmentStateRef.current

    // ============================================
    // DIRTY-FLAG: Get versions and check for changes
    // ============================================
    const appearanceVersion = appearanceState.appearanceVersion
    const iblVersion = environmentState.iblVersion
    const lightingVersion = lightingState.version

    const appearanceChanged = appearanceVersion !== lastAppearanceVersionRef.current
    const iblChanged = iblVersion !== lastIblVersionRef.current
    // Note: lightingChanged was previously tracked but lighting is now handled via UniformManager
    void lightingVersion // Suppress unused variable warning while keeping version tracking

    // Update rotation matrix via shared hook (handles version tracking)
    // Note: Scale is now applied AFTER projection, so we don't pass scales to rotation
    ndTransform.update({})
    const gpuData = ndTransform.source.getGPUData()

    // Get projection distance (no longer needs scale adjustment since scale is post-projection)
    const projectionDistance = projDistCache.getProjectionDistance(vertices, dimension)

    // Update N-D transformation uniforms (visualScale is applied AFTER projection like camera zoom)
    const u = material.uniforms
    ;(u.uRotationMatrix4D!.value as Matrix4).copy(gpuData.rotationMatrix4D)
    u.uDimension!.value = dimension
    u.uUniformScale!.value = visualScale
    ;(u.uExtraRotationCols!.value as Float32Array).set(gpuData.extraRotationCols)
    ;(u.uDepthRowSums!.value as Float32Array).set(gpuData.depthRowSums)
    u.uDepthNormFactor!.value = dimension > 4 ? Math.sqrt(dimension - 3) : 1.0
    u.uProjectionDistance!.value = projectionDistance

    // Update material properties (cached linear conversion)
    // Note: PBR properties (uMetallic, uRoughness, uSpecularIntensity, uSpecularColor)
    // are applied via UniformManager using 'pbr-edge' source
    const cache = colorCacheRef.current
    updateLinearColorUniform(cache.edgeColor, u.uColor!.value as Color, color)
    u.uOpacity!.value = opacity
    u.uRadius!.value = radius

    // Update material transparency based on opacity dynamically (like Mandelbulb)
    // This avoids shader rebuild when opacity value changes
    const isTransparent = opacity < 1
    if (material.transparent !== isTransparent) {
      material.transparent = isTransparent
      material.depthWrite = !isTransparent
      material.needsUpdate = true
    }

    // Note: Ambient and Specular uniforms are provided by UniformManager 'lighting' source below.
    // Do not set them manually here - they would be immediately overwritten.

    // ============================================
    // DIRTY-FLAG: Appearance uniforms (only update when changed)
    // ============================================
    if (appearanceChanged) {
      // Fresnel (cached linear conversion)
      u.uFresnelEnabled!.value = appearanceState.shaderSettings.surface.fresnelEnabled
      u.uFresnelIntensity!.value = appearanceState.fresnelIntensity
      updateLinearColorUniform(
        cache.rimColor,
        u.uRimColor!.value as Color,
        appearanceState.edgeColor
      )

      // Rim SSS (shared with raymarched objects)
      u.uSssEnabled!.value = appearanceState.sssEnabled
      u.uSssIntensity!.value = appearanceState.sssIntensity
      updateLinearColorUniform(
        cache.sssColor,
        u.uSssColor!.value as Color,
        appearanceState.sssColor
      )
      u.uSssThickness!.value = appearanceState.sssThickness
      if (u.uSssJitter) u.uSssJitter.value = appearanceState.sssJitter

      lastAppearanceVersionRef.current = appearanceVersion
    }

    // Update multi-light system and PBR (via UniformManager)
    UniformManager.applyToMaterial(material, ['lighting', 'pbr-edge'])

    // ============================================
    // IBL: Environment map updated every frame (changes with scene)
    // ============================================
    const env = scene.environment
    const isPMREM = env && env.mapping === THREE.CubeUVReflectionMapping
    u.uEnvMap!.value = isPMREM ? env : null

    // ============================================
    // DIRTY-FLAG: IBL settings (only update when changed)
    // ============================================
    if (iblChanged) {
      const iblState = environmentStateRef.current
      const qualityMap = { off: 0, low: 1, high: 2 } as const
      // Force IBL off when no valid PMREM texture
      u.uIBLQuality!.value = isPMREM ? qualityMap[iblState.iblQuality] : 0
      u.uIBLIntensity!.value = iblState.iblIntensity

      lastIblVersionRef.current = iblVersion
    }

    // ============================================
    // Shadow uniforms - matrices must update every frame, but use cached scene traversal
    // Note: Shadow matrices are references to Three.js objects that update every frame,
    // so we must call updateShadowMapUniforms to copy fresh matrix values to GPU uniforms.
    // The expensive scene traversal is cached by collectShadowDataCached.
    // ============================================
    if (shadowEnabled && lightingState.shadowEnabled) {
      const shadowData = collectShadowDataCached(scene, lightingState.lights)
      const shadowQuality = lightingState.shadowQuality
      const shadowMapSize = SHADOW_MAP_SIZES[shadowQuality]
      const pcfSamples = blurToPCFSamples(lightingState.shadowMapBlur)
      updateShadowMapUniforms(
        u as Record<string, { value: unknown }>,
        shadowData,
        lightingState.shadowMapBias,
        shadowMapSize,
        pcfSamples
      )
    }

    // Update shadow material uniforms for animated shadows
    // Patched MeshDepthMaterial and MeshDistanceMaterial share the same shadowUniforms object.
    // Updates to shadowUniforms are automatically reflected in the compiled shaders.
    if (shadowEnabled) {
      const su = shadowUniforms

      // Update N-D transformation uniforms (visualScale is applied AFTER projection like camera zoom)
      ;(su.uRotationMatrix4D!.value as Matrix4).copy(gpuData.rotationMatrix4D)
      su.uDimension!.value = dimension
      su.uUniformScale!.value = visualScale
      ;(su.uExtraRotationCols!.value as Float32Array).set(gpuData.extraRotationCols)
      ;(su.uDepthRowSums!.value as Float32Array).set(gpuData.depthRowSums)
      su.uDepthNormFactor!.value = dimension > 4 ? Math.sqrt(dimension - 3) : 1.0
      su.uProjectionDistance!.value = projectionDistance
      su.uRadius!.value = radius
    }
  }, FRAME_PRIORITY.RENDERER_UNIFORMS)

  // Don't render if no valid data
  if (!vertices || vertices.length === 0 || !edges || edges.length === 0) {
    return null
  }

  // NOTE: No placeholder mesh during shader compilation. The placeholder was using
  // MeshBasicMaterial which only outputs to 1 color attachment, causing
  // GL_INVALID_OPERATION when rendered to 3-attachment MRT targets.
  // The shader compilation overlay still shows because it's a separate React component.
  if (isCompiling || !material) {
    return null
  }

  return (
    <instancedMesh
      ref={setMeshRef}
      args={[geometry, material, edges.length]}
      frustumCulled={false}
      castShadow={shadowEnabled}
      receiveShadow={shadowEnabled}
    />
  )
}
