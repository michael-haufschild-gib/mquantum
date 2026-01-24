/**
 * Uniform Sources Initialization
 *
 * Registers all uniform sources with the UniformManager.
 * Call this once at application startup.
 *
 * @module rendering/uniforms/init
 */

import { UniformManager } from './UniformManager'
import {
  ColorSource,
  createEdgePBRSource,
  createFacePBRSource,
  createGroundPBRSource,
  LightingSource,
  QualitySource,
  TemporalSource,
} from './sources'

let initialized = false

/**
 * Initialize and register all uniform sources.
 *
 * This should be called once at application startup, before any
 * renderers attempt to use the UniformManager.
 *
 * @example
 * ```typescript
 * // In main.tsx or App.tsx
 * import { initUniformSources } from '@/rendering/uniforms/init';
 *
 * initUniformSources();
 * ```
 */
export function initUniformSources(): void {
  if (initialized) {
    return
  }

  // Register all uniform sources
  UniformManager.register(new LightingSource())
  UniformManager.register(new QualitySource())
  UniformManager.register(new TemporalSource())
  UniformManager.register(new ColorSource())

  // Register PBR sources for each object type
  UniformManager.register(createFacePBRSource())
  UniformManager.register(createEdgePBRSource())
  UniformManager.register(createGroundPBRSource())

  initialized = true
}

/**
 * Check if uniform sources have been initialized.
 * @returns True if initialized
 */
export function isUniformSourcesInitialized(): boolean {
  return initialized
}

/**
 * Reset initialization state (for testing).
 */
export function resetUniformSourcesForTesting(): void {
  initialized = false
  UniformManager.reset()
}
