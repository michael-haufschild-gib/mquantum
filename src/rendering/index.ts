/**
 * Rendering Module
 *
 * Entry point for all rendering-related functionality including materials,
 * shaders, environment, and render utilities.
 *
 * ## Folder Structure
 *
 * ```
 * rendering/
 * ├── materials/          # Shader materials with external shader files
 * │   ├── skybox/         # Skybox rendering (skybox.vert, skybox.frag)
 * │   └── unified/        # N-D material system (shader generators)
 * │
 * ├── shaders/            # Shared shader utilities
 * │   ├── palette/        # Cosine palette system
 * │   ├── postprocessing/ # Post-processing effects (Bokeh, SSR, etc.)
 * │   └── transforms/     # N-D transformation utilities
 * │
 * ├── renderers/          # Object-specific renderers
 * │   ├── Mandelbulb/     # Fractal raymarching
 * │   ├── Polytope/       # N-D polytope rendering
 * │   ├── QuaternionJulia/# 4D Julia set
 * │   └── TubeWireframe/  # 3D tube wireframes
 * │
 * ├── environment/        # Scene environment components
 * │   ├── Skybox.tsx      # Classic/procedural skybox
 * │   ├── PostProcessingV2.tsx  # Render Graph post-processing
 * │   ├── SceneLighting.tsx
 * │   └── SceneFog.tsx
 * │
 * ├── core/               # Core rendering utilities
 * │   ├── layers.ts       # Render layer constants
 * │   ├── temporalDepth.ts  # Temporal depth state and hooks
 * │   └── framePriorities.ts  # useFrame priority constants
 * │
 * ├── lights/             # Lighting system
 * ├── opacity/            # Opacity management
 * └── shadows/            # Shadow system
 * ```
 *
 * ## Import Guidelines
 *
 * For materials:
 * ```ts
 * import { createUnifiedMaterial } from '@/rendering/materials'
 * import { skyboxFragmentShader } from '@/rendering/materials/skybox/SkyboxShader'
 * ```
 *
 * For shared shader utilities:
 * ```ts
 * import { GLSL_COSINE_PALETTE } from '@/rendering/shaders/palette/cosine.glsl'
 * import { BokehShader } from '@/rendering/shaders/postprocessing/BokehShader'
 * ```
 *
 * @module
 */

// Re-export materials
export * from './materials'

// Re-export shader utilities
export * from './shaders'


















