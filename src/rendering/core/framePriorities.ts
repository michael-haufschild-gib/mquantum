/**
 * Explicit useFrame priorities to document hidden dependencies.
 *
 * R3F executes useFrame callbacks in order of priority (lower runs first).
 * The default priority is 0. All callbacks at the same priority run in
 * registration order, which creates hidden dependencies on component
 * mount timing.
 *
 * This module centralizes priority constants to make these dependencies
 * explicit and prevent subtle ordering bugs.
 *
 * @see https://docs.pmnd.rs/react-three-fiber/api/hooks#useframe
 */

/**
 * Frame callback priority constants.
 *
 * Lower numbers run first. Use these constants instead of magic numbers
 * to document why a callback needs a specific execution order.
 *
 * @example
 * ```tsx
 * import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
 *
 * useFrame(() => {
 *   // This runs after environment capture but before post-effects
 *   updateUniforms();
 * }, FRAME_PRIORITY.RENDERER_UNIFORMS);
 * ```
 */
export const FRAME_PRIORITY = {
  /**
   * Environment cubemap capture (first).
   * Black hole lensing needs the environment map ready before reading it.
   */
  ENVIRONMENT_CAPTURE: -30,

  /**
   * Skybox rendering to cubemap.
   * Must complete before any consumer (like black hole) reads the envMap.
   */
  SKYBOX_CAPTURE: -20,

  /**
   * Black hole uniform updates.
   * Depends on environment map being ready from SKYBOX_CAPTURE.
   */
  BLACK_HOLE_UNIFORMS: -10,

  /**
   * Camera controller updates.
   * Default priority - no special ordering required.
   */
  CAMERA: 0,

  /**
   * Animation state updates.
   * Default priority - order among priority-0 callbacks is registration-based.
   */
  ANIMATION: 0,

  /**
   * General renderer updates.
   * Default priority for callbacks without specific ordering needs.
   */
  RENDERERS: 0,

  /**
   * Uniform Manager update.
   * Runs after camera (0) but before renderer uniform updates (1).
   * Also called at start of RenderGraph.execute() for proper ordering.
   */
  UNIFORM_MANAGER_UPDATE: 0.5,

  /**
   * Renderer uniform updates (Mandelbulb, Schrödinger, Quaternion Julia, etc.).
   * Runs AFTER camera update to get fresh camera position for ray computation.
   * This is between CAMERA (0) and POST_EFFECTS (10).
   */
  RENDERER_UNIFORMS: 1,

  /**
   * Post-processing effect updates.
   * Runs after all scene updates are complete.
   */
  POST_EFFECTS: 10,

  /**
   * Performance statistics collection.
   * Always runs last to capture accurate frame timing.
   */
  STATS: 20,
} as const

/**
 * Type for frame priority values.
 */
export type FramePriority = (typeof FRAME_PRIORITY)[keyof typeof FRAME_PRIORITY]
