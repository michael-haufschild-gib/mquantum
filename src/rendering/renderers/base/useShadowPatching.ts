/**
 * Hook for managing shadow material patching with N-D vertex transformations.
 *
 * This hook extracts the common pattern of creating patched MeshDepthMaterial
 * and MeshDistanceMaterial with custom vertex transformation GLSL injected via
 * onBeforeCompile. Used by PolytopeScene and TubeWireframe.
 *
 * The patching approach avoids the double shadow bug that occurs when using
 * raw ShaderMaterial for shadow materials. Three.js's internal shadow pipeline
 * has special handling for MeshDistanceMaterial (auto-updating referencePosition,
 * nearDistance, farDistance for point lights).
 *
 * @module rendering/renderers/base/useShadowPatching
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { RENDER_LAYERS } from '@/rendering/core/layers'

/**
 * Options for the useShadowPatching hook.
 */
export interface UseShadowPatchingOptions {
  /**
   * GLSL code block to inject for vertex transformation.
   * This should contain uniform declarations and the transform function.
   * Injected after #include <common> in the vertex shader.
   */
  transformGLSL: string

  /**
   * The transform function call to apply to the vertex.
   * This is injected after #include <begin_vertex>.
   * Example: "ndTransformVertex(transformed)" or "tubeTransformVertex(transformed)"
   */
  transformFunctionCall: string

  /**
   * Shared uniform objects that are updated per-frame.
   * These uniforms are merged with Three.js's built-in uniforms.
   */
  uniforms: Record<string, { value: unknown }>

  /**
   * Whether shadows are currently enabled.
   * Controls whether shadow materials are assigned to the mesh.
   */
  shadowEnabled: boolean
}

/**
 * Result from the useShadowPatching hook.
 */
export interface UseShadowPatchingResult {
  /**
   * The patched MeshDepthMaterial for directional/spot light shadows.
   */
  depthMaterial: THREE.MeshDepthMaterial

  /**
   * The patched MeshDistanceMaterial for point light shadows.
   */
  distanceMaterial: THREE.MeshDistanceMaterial

  /**
   * Callback ref to assign shadow materials and render layer to a mesh.
   * Use this as the ref callback for your mesh element.
   *
   * @example
   * ```tsx
   * <mesh ref={assignToMesh} geometry={geo} material={mat} />
   * ```
   */
  assignToMesh: (mesh: THREE.Mesh | THREE.InstancedMesh | null) => void

  /**
   * The shared uniforms object (same reference as passed in options).
   * Useful for updating uniforms in useFrame.
   */
  uniforms: Record<string, { value: unknown }>
}

/**
 * Create patched shadow materials with custom vertex transformation.
 *
 * @param transformGLSL - GLSL code to inject (uniforms + transform function)
 * @param transformFunctionCall - Transform function call expression
 * @param uniforms - Shared uniform objects to merge
 * @returns Patched depth and distance materials
 */
function createPatchedShadowMaterials(
  transformGLSL: string,
  transformFunctionCall: string,
  uniforms: Record<string, { value: unknown }>
): {
  depthMaterial: THREE.MeshDepthMaterial
  distanceMaterial: THREE.MeshDistanceMaterial
} {
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  })

  const distanceMaterial = new THREE.MeshDistanceMaterial()

  const patchMaterial = (mat: THREE.Material) => {
    mat.onBeforeCompile = (shader) => {
      // Merge our nD uniforms with Three.js's built-in uniforms
      Object.assign(shader.uniforms, uniforms)

      // Inject our GLSL helpers after #include <common>
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n${transformGLSL}`
      )

      // Apply our transformation after #include <begin_vertex>
      // Three.js sets `transformed` to the local-space vertex position there
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed = ${transformFunctionCall};`
      )
    }
    mat.needsUpdate = true
  }

  patchMaterial(depthMaterial)
  patchMaterial(distanceMaterial)

  return { depthMaterial, distanceMaterial }
}

/**
 * Hook for managing shadow material patching with N-D vertex transformations.
 *
 * This hook:
 * - Creates patched MeshDepthMaterial and MeshDistanceMaterial
 * - Injects custom vertex transformation GLSL via onBeforeCompile
 * - Provides a callback ref for assigning materials to meshes
 * - Handles material lifecycle (cleanup on unmount)
 * - Reacts to shadowEnabled changes at runtime
 *
 * @param options - Hook configuration
 * @returns Shadow patching utilities
 *
 * @example
 * ```tsx
 * function MyRenderer({ shadowEnabled }) {
 *   const shadowUniforms = useMemo(() => createNDUniforms(), []);
 *
 *   const { assignToMesh, uniforms } = useShadowPatching({
 *     transformGLSL: ND_TRANSFORM_GLSL,
 *     transformFunctionCall: 'ndTransformVertex(transformed)',
 *     uniforms: shadowUniforms,
 *     shadowEnabled,
 *   });
 *
 *   useFrame(() => {
 *     // Update uniforms for animated shadows
 *     uniforms.uRotationMatrix4D.value.copy(gpuData.rotationMatrix4D);
 *     // ... other uniform updates
 *   });
 *
 *   return (
 *     <mesh ref={assignToMesh} castShadow={shadowEnabled}>
 *       <boxGeometry />
 *       <meshStandardMaterial />
 *     </mesh>
 *   );
 * }
 * ```
 */
export function useShadowPatching(
  options: UseShadowPatchingOptions
): UseShadowPatchingResult {
  const { transformGLSL, transformFunctionCall, uniforms, shadowEnabled } = options

  // Track mesh ref for runtime shadow toggle
  const meshRef = useRef<THREE.Mesh | THREE.InstancedMesh | null>(null)

  // Create patched shadow materials
  // Note: We memoize on transformGLSL and transformFunctionCall since they define the shader
  // The uniforms object reference should remain stable (created via useMemo in parent)
  const { depthMaterial, distanceMaterial } = useMemo(
    () => createPatchedShadowMaterials(transformGLSL, transformFunctionCall, uniforms),
    [transformGLSL, transformFunctionCall, uniforms]
  )

  // Callback ref that assigns render layer and shadow materials
  const assignToMesh = useCallback(
    (mesh: THREE.Mesh | THREE.InstancedMesh | null) => {
      meshRef.current = mesh

      if (mesh?.layers) {
        mesh.layers.set(RENDER_LAYERS.MAIN_OBJECT)
      }

      // Assign patched shadow materials when shadows are enabled:
      // - customDepthMaterial (MeshDepthMaterial): for directional and spot lights
      // - customDistanceMaterial (MeshDistanceMaterial): for point lights
      if (mesh && shadowEnabled) {
        mesh.customDepthMaterial = depthMaterial
        mesh.customDistanceMaterial = distanceMaterial
      } else if (mesh) {
        mesh.customDepthMaterial = undefined
        mesh.customDistanceMaterial = undefined
      }
    },
    [shadowEnabled, depthMaterial, distanceMaterial]
  )

  // Handle shadowEnabled changes at runtime
  // The callback ref only runs on mount, so we need an effect for runtime changes
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    if (shadowEnabled) {
      mesh.customDepthMaterial = depthMaterial
      mesh.customDistanceMaterial = distanceMaterial
    } else {
      mesh.customDepthMaterial = undefined
      mesh.customDistanceMaterial = undefined
    }
  }, [shadowEnabled, depthMaterial, distanceMaterial])

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      depthMaterial.dispose()
      distanceMaterial.dispose()
    }
  }, [depthMaterial, distanceMaterial])

  return {
    depthMaterial,
    distanceMaterial,
    assignToMesh,
    uniforms,
  }
}















