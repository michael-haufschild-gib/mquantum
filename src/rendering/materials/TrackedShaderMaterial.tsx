/**
 * TrackedShaderMaterial - Centralized shader compilation tracking
 *
 * Wrapper component around <shaderMaterial> that automatically tracks
 * shader compilation state and shows a loading overlay to users.
 *
 * Features:
 * - Supports multiple simultaneous shader compilations
 * - Properly cleans up on unmount to prevent stuck overlay
 * - Validates required props at runtime
 * - Uses getState() for performance (no subscription overhead)
 * - Defers shader rendering to allow overlay to appear first
 *
 * Usage:
 * ```tsx
 * <TrackedShaderMaterial
 *   shaderName="My Shader"
 *   vertexShader={vertexSource}
 *   fragmentShader={fragmentSource}
 *   uniforms={uniforms}
 *   // ... other shaderMaterial props
 * />
 * ```
 *
 * The overlay appears BEFORE the GPU compiles by deferring shader rendering
 * by one frame, giving React time to paint the overlay.
 *
 * @module rendering/materials/TrackedShaderMaterial
 */

import { usePerformanceStore } from '@/stores/performanceStore'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Side } from 'three'
import * as THREE from 'three'

/**
 * Props for TrackedShaderMaterial component.
 * Extends standard shaderMaterial props with tracking metadata.
 */
interface TrackedShaderMaterialProps {
  /** Display name shown in compilation overlay (e.g., "Schrödinger Quantum Volume") */
  shaderName: string
  /** Fragment shader GLSL source (required) */
  fragmentShader: string
  /** Vertex shader GLSL source (required) */
  vertexShader: string
  /** Material key for React reconciliation (forces remount when changed) */
  materialKey?: string
  /** Shader uniforms (required for functional shaders) */
  uniforms: Record<string, THREE.IUniform>
  /** GLSL version (WebGL2/GLSL ES 3.00 required) */
  glslVersion?: typeof THREE.GLSL3
  /** Which side of faces to render */
  side?: Side
  /** Whether material is transparent */
  transparent?: boolean
  /** Whether to write to depth buffer */
  depthWrite?: boolean
  /** Blending mode */
  blending?: THREE.Blending
}

/**
 * ShaderMaterial wrapper that automatically tracks compilation state.
 *
 * Shows a loading overlay when:
 * - Component first mounts (initial shader compilation)
 * - fragmentShader or vertexShader strings change (recompilation)
 *
 * The tracking is automatic - no manual dependency arrays needed.
 * Properly handles multiple simultaneous compilations and cleanup on unmount.
 *
 * Key insight: Shader compilation blocks the main thread, preventing React from
 * rendering the overlay. We solve this by deferring the actual shader render
 * by one frame, giving the overlay time to appear first.
 * @param root0 - Component props
 * @param root0.shaderName - Name of the shader for display
 * @param root0.fragmentShader - Fragment shader source code
 * @param root0.vertexShader - Vertex shader source code
 * @param root0.materialKey - Unique key for material instance
 * @param root0.glslVersion - GLSL version (defaults to GLSL3 for WebGL2)
 * @returns The shader material component
 */
export function TrackedShaderMaterial({
  shaderName,
  fragmentShader,
  vertexShader,
  materialKey,
  glslVersion = THREE.GLSL3,
  ...props
}: TrackedShaderMaterialProps) {
  // Input validation - provide fallback for empty shaderName
  const validShaderName = shaderName?.trim() || 'Unknown Shader'
  const hasValidShaders = Boolean(fragmentShader && vertexShader)

  // Track which shader version we've rendered to detect changes
  const renderedShaderRef = useRef<{ fragment: string; vertex: string } | null>(null)

  // State to control deferred rendering
  // When shaders change, we set this to false, show overlay, then set to true next frame
  const [readyToRender, setReadyToRender] = useState(false)

  // Detect if shaders have changed since last render
  const shadersChanged =
    !renderedShaderRef.current ||
    renderedShaderRef.current.fragment !== fragmentShader ||
    renderedShaderRef.current.vertex !== vertexShader

  // When shaders change, reset ready state and show overlay
  useLayoutEffect(() => {
    if (!hasValidShaders) {
      return
    }

    if (shadersChanged) {
      // Reset ready state - this will cause us to return null this render
      setReadyToRender(false)

      // Show the compilation overlay immediately
      usePerformanceStore.getState().setShaderCompiling(validShaderName, true)
    } else if (!readyToRender) {
      // FIX: If shaders reverted to previous state while hidden (e.g. A->B->A),
      // we are stuck in hidden state because the RAF effect won't fire (shadersChanged is false).
      // Since we match the renderedShaderRef, we can show immediately.
      setReadyToRender(true)
      usePerformanceStore.getState().setShaderCompiling(validShaderName, false)
    }
  }, [
    fragmentShader,
    vertexShader,
    validShaderName,
    hasValidShaders,
    shadersChanged,
    readyToRender,
  ])

  // After overlay has painted, allow shader to render
  useEffect(() => {
    if (!hasValidShaders) {
      return
    }

    if (!readyToRender && shadersChanged) {
      // Use DOUBLE RAF to defer rendering until overlay has actually painted.
      // Single RAF fires before the browser paint, so shader compilation would
      // block before the overlay is visible. Double RAF ensures:
      // 1st RAF: overlay render is queued for paint
      // 2nd RAF: browser has painted the overlay, safe to block for compilation
      let cancelled = false
      const frameId = requestAnimationFrame(() => {
        if (cancelled) return
        requestAnimationFrame(() => {
          if (cancelled) return
          setReadyToRender(true)
          // Update the ref to track what we're about to render
          renderedShaderRef.current = { fragment: fragmentShader, vertex: vertexShader }
        })
      })

      return () => {
        cancelled = true
        cancelAnimationFrame(frameId)
      }
    }

    return
  }, [fragmentShader, vertexShader, hasValidShaders, readyToRender, shadersChanged])

  // Hide overlay after shader has compiled (render completes)
  useEffect(() => {
    if (!hasValidShaders || !readyToRender) {
      return
    }

    // Shader is rendering this frame, hide overlay after GPU compile finishes
    let cancelled = false
    let innerFrameId: number | null = null

    // Double RAF ensures we're past the blocking GPU compilation
    const outerFrameId = requestAnimationFrame(() => {
      if (cancelled) return
      innerFrameId = requestAnimationFrame(() => {
        if (cancelled) return
        usePerformanceStore.getState().setShaderCompiling(validShaderName, false)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(outerFrameId)
      if (innerFrameId !== null) {
        cancelAnimationFrame(innerFrameId)
      }
    }
  }, [readyToRender, validShaderName, hasValidShaders])

  // Cleanup on unmount - prevent stuck overlay
  useEffect(() => {
    return () => {
      usePerformanceStore.getState().setShaderCompiling(validShaderName, false)
    }
  }, [validShaderName])

  // Warn about missing shader sources in development
  if (!hasValidShaders) {
    if (import.meta.env.DEV) {
      console.error(
        `TrackedShaderMaterial [${validShaderName}]: Missing shader source. ` +
          `fragmentShader: ${fragmentShader ? 'provided' : 'MISSING'}, ` +
          `vertexShader: ${vertexShader ? 'provided' : 'MISSING'}`
      )
    }
    return null
  }

  // While shader is compiling, render an invisible placeholder material
  // to prevent Three.js from using a default white MeshBasicMaterial.
  // Returning null would leave the mesh without a material, causing a white cube flash.
  if (!readyToRender) {
    // CRITICAL FIX: Use a ShaderMaterial with explicit MRT outputs as placeholder.
    // When rendering to G-Buffer (2 targets) or Cloud Buffer (3 targets), the active
    // program MUST have outputs for all active draw buffers, otherwise WebGL throws
    // "Active draw buffers with missing fragment shader outputs".
    // MeshBasicMaterial only outputs to location 0, causing this error in MRT passes.
    return (
      <shaderMaterial
        key="placeholder-while-compiling"
        visible={false}
        glslVersion={THREE.GLSL3}
        vertexShader={`
          void main() {
            gl_Position = vec4(0.0); // Collapse geometry to prevent rasterization
          }
        `}
        fragmentShader={`
          precision highp float;
          // Declare outputs for up to 3 targets (Color, Normal, Position)
          // Extra outputs are ignored if not bound, which is safe.
          layout(location = 0) out vec4 gColor;
          layout(location = 1) out vec4 gNormal;
          layout(location = 2) out vec4 gPosition;
          void main() {
            gColor = vec4(0.0);
            gNormal = vec4(0.0);
            gPosition = vec4(0.0);
            discard; // Discard fragment
          }
        `}
        {...props}
      />
    )
  }

  return (
    <shaderMaterial
      key={materialKey}
      fragmentShader={fragmentShader}
      vertexShader={vertexShader}
      glslVersion={glslVersion}
      {...props}
    />
  )
}
