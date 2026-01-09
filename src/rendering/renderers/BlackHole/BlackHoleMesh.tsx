/**
 * BlackHoleMesh - Renders N-dimensional black hole with gravitational lensing
 *
 * Visualizes a black hole with:
 * - Event horizon (pure black sphere)
 * - Photon shell (bright ring at R_p = 1.5 R_h)
 * - Accretion manifold (luminous disk/sheet/field based on dimension)
 * - Gravitational lensing (bent rays)
 * - Optional polar jets
 *
 * TODO: Deferred Lensing Integration
 * The deferred lensing shader (src/rendering/shaders/blackhole/effects/deferred-lensing.glsl.ts)
 * is currently not integrated into the render pipeline. To enable deferred lensing:
 * 1. Create a post-processing pass using deferredLensingBlock
 * 2. Render the scene (without black hole) to a texture
 * 3. Apply lensing distortion based on black hole position
 * 4. Composite with the black hole's direct contribution
 * This allows background objects to be visibly lensed around the black hole.
 */

import { RENDER_LAYERS } from '@/rendering/core/layers'
import { TrackedShaderMaterial } from '@/rendering/materials/TrackedShaderMaterial'
import { composeBlackHoleShader, generateBlackHoleVertexShader } from '@/rendering/shaders/blackhole/compose'
import { generateBlackbodyLUT, generateRidgedNoiseTexture3D } from '@/rendering/utils/NoiseGenerator'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAX_DIMENSION } from './types'
import { useBlackHoleUniforms } from './useBlackHoleUniforms'
import { useBlackHoleUniformUpdates } from './useBlackHoleUniformUpdates'

/**
 * BlackHoleMesh - Renders N-dimensional black hole visualization
 * @returns The black hole mesh component
 */
const BlackHoleMesh = () => {
  const meshRef = useRef<THREE.Mesh>(null)

  // Values that affect shader compilation
  const rawDimension = useGeometryStore((state) => state.dimension)

  // Validate dimension at compile time (not every frame)
  // This ensures dimension is within valid bounds for N-D array operations
  const dimension = useMemo(() => {
    const clamped = Math.min(Math.max(rawDimension, 3), MAX_DIMENSION)
    if (import.meta.env.DEV && clamped !== rawDimension) {
      console.warn(
        `BlackHole: dimension ${rawDimension} clamped to ${clamped} (valid range: 3-${MAX_DIMENSION})`
      )
    }
    return clamped
  }, [rawDimension])

  // Black hole specific settings that affect shader compilation
  const dopplerEnabled = useExtendedObjectStore((state) => state.blackhole.dopplerEnabled)
  const temporalEnabled = useExtendedObjectStore(
    (state) => state.blackhole.temporalAccumulationEnabled
  )
  // Note: globalTemporalEnabled is checked dynamically in useBlackHoleUniformUpdates
  // along with screen coverage to determine when to use temporal rendering
  const sliceAnimationEnabled = useExtendedObjectStore(
    (state) => state.blackhole.sliceAnimationEnabled
  )
  // Scale and Bounds
  const farRadius = useExtendedObjectStore((state) => state.blackhole.farRadius)
  const horizonRadius = useExtendedObjectStore((state) => state.blackhole.horizonRadius)

  // Create uniforms using extracted hook
  const uniforms = useBlackHoleUniforms()

  // PERF (OPT-BH-1): Create pre-baked noise texture for faster volumetric disk rendering
  // This replaces expensive per-pixel noise computation with a single texture lookup
  const noiseTexture = useMemo(() => generateRidgedNoiseTexture3D(64), [])

  // PERF (OPT-BH-17): Create pre-baked blackbody LUT for faster temperature coloring
  // This replaces expensive pow()/log() operations with a single texture lookup
  const blackbodyLUT = useMemo(() => generateBlackbodyLUT(256), [])

  // Dispose textures on unmount
  useEffect(() => {
    return () => {
      noiseTexture.dispose()
      blackbodyLUT.dispose()
    }
  }, [noiseTexture, blackbodyLUT])

  // Pass textures to uniforms (static, only needs to be set once)
  useEffect(() => {
    if (uniforms.tDiskNoise) {
      uniforms.tDiskNoise.value = noiseTexture
    }
    if (uniforms.tBlackbodyLUT) {
      uniforms.tBlackbodyLUT.value = blackbodyLUT
    }
  }, [uniforms, noiseTexture, blackbodyLUT])

  // Shader version - increment to force recompilation when GLSL source changes
  // v2: Added immediate horizon check after ray step to fix transparency bug
  // v3: Added OPT-BH-1/2/3/5 performance optimizations
  // v4: Added OPT-BH-15/16/17 major performance overhaul (2x FPS target)
  const SHADER_VERSION = 4

  // Compile shader
  const { fragmentShader } = useMemo(() => {
    return composeBlackHoleShader({
      dimension,
      shadows: false,
      temporal: false,
      ambientOcclusion: false,
      temporalAccumulation: temporalEnabled,
      doppler: dopplerEnabled,
      envMap: true,
      sliceAnimation: sliceAnimationEnabled,
      volumetricDisk: true,
      noiseTexture: true, // PERF (OPT-BH-1): Enable noise texture for faster rendering
      blackbodyLUT: true, // PERF (OPT-BH-17): Enable blackbody LUT for faster temperature coloring
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, temporalEnabled, dopplerEnabled, sliceAnimationEnabled, SHADER_VERSION])

  // Generate vertex shader
  const vertexShader = useMemo(() => generateBlackHoleVertexShader(), [])

  // Generate material key for caching
  const materialKey = useMemo(() => {
    return `blackhole-${dimension}-${temporalEnabled}-${dopplerEnabled}-${sliceAnimationEnabled}-v${SHADER_VERSION}`
  }, [dimension, temporalEnabled, dopplerEnabled, sliceAnimationEnabled, SHADER_VERSION])

  // Note: Material disposal is handled automatically by React Three Fiber
  // when TrackedShaderMaterial unmounts (materialKey change causes remount).
  // Manual disposal here would cause double-disposal and WebGL errors.

  // Layer assignment is handled dynamically in useBlackHoleUniformUpdates
  // based on screen coverage (only uses temporal when coverage > 50%)

  // Update uniforms each frame using extracted hook
  useBlackHoleUniformUpdates({
    meshRef,
  })

  // Calculate box size to ensure it covers the entire visual effect
  // Shader uses farRadius * horizonRadius as the bounding sphere radius for raymarching.
  // Use 2.2x radius (diameter + 10% padding) to prevent clipping.
  const shaderRadius = farRadius * horizonRadius
  const boxSize = shaderRadius * 2.2

  return (
    <mesh ref={meshRef} layers={RENDER_LAYERS.MAIN_OBJECT} frustumCulled={true} scale={[1, 1, 1]}>
      <boxGeometry args={[boxSize, boxSize, boxSize]} />
      <TrackedShaderMaterial
        shaderName="Black Hole N-Dimensional"
        materialKey={materialKey}
        glslVersion={THREE.GLSL3}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        /* transparent and depthWrite are set dynamically in useBlackHoleUniformUpdates
         * based on opacity mode (solid = depthWrite:true, others = depthWrite:false) */
      />
    </mesh>
  )
}

export default BlackHoleMesh
