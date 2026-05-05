/**
 * Shared test factories for common test data construction.
 *
 * Centralizes config/state builders to eliminate duplication across test files
 * and make test intent clearer through semantic defaults.
 *
 * @module tests/factories
 */

import { vi } from 'vitest'

import type { WebGPURenderPass, WebGPURenderPassConfig } from '@/rendering/webgpu/core/types'

/**
 * Build a mock render pass from config. Used by render-graph and
 * topological-sort tests to construct lightweight passes without
 * reaching into renderer internals.
 */
export function createMockPass(config: WebGPURenderPassConfig): WebGPURenderPass {
  return {
    id: config.id,
    config,
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(),
    dispose: vi.fn(),
  }
}
