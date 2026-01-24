/**
 * Procedural Skybox Component
 *
 * Renders procedural skybox shaders. Environment map generation (for black hole
 * lensing and wall PBR reflections) is now handled by CubemapCapturePass in the
 * render graph, ensuring proper MRT state management.
 *
 * This component only renders the visual SkyboxMesh - all cubemap capture logic
 * has been moved to src/rendering/graph/passes/CubemapCapturePass.ts
 */

import React from 'react'
import { SkyboxMesh } from './Skybox'

/**
 * Procedural skybox component that renders the visual skybox mesh.
 *
 * Cubemap capture for black hole lensing (scene.background) and wall reflections
 * (scene.environment) is handled by CubemapCapturePass in the render graph.
 *
 * @returns React element rendering procedural skybox mesh
 */
export const ProceduralSkyboxWithEnvironment: React.FC = () => {
  // Just render the visual skybox mesh
  // CubemapCapturePass in PostProcessingV2 handles:
  // - scene.background (raw CubeTexture for black hole samplerCube)
  // - scene.environment (PMREM for wall PBR reflections)
  return <SkyboxMesh texture={null} />
}
