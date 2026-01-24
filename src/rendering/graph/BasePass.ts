/**
 * Base Pass Implementation
 *
 * Abstract base class for render passes that provides common functionality.
 * Extend this class to create custom passes.
 *
 * @module rendering/graph/BasePass
 */

import type { RenderContext, RenderPass, RenderPassConfig } from './types'

/**
 * Abstract base class for render passes.
 *
 * Provides:
 * - Configuration storage
 * - ID/config accessors
 * - Optional dispose method
 *
 * @example
 * ```typescript
 * class MyCustomPass extends BasePass {
 *   constructor() {
 *     super({
 *       id: 'my-custom',
 *       inputs: [{ resourceId: 'sceneColor', access: 'read' }],
 *       outputs: [{ resourceId: 'output', access: 'write' }],
 *     });
 *   }
 *
 *   execute(ctx: RenderContext): void {
 *     const input = ctx.getReadTexture('sceneColor');
 *     const output = ctx.getWriteTarget('output');
 *
 *     // ... render logic
 *   }
 * }
 * ```
 */
export abstract class BasePass implements RenderPass {
  readonly config: RenderPassConfig

  constructor(config: RenderPassConfig) {
    this.config = config
  }

  get id(): string {
    return this.config.id
  }

  /**
   * Execute the pass.
   *
   * Subclasses must implement this method.
   *
   * @param ctx - Render context with access to resources and renderer
   */
  abstract execute(ctx: RenderContext): void

  /**
   * Optional cleanup when pass is removed.
   *
   * Override this to dispose of any GPU resources the pass owns.
   */
  dispose(): void {
    // Default: no cleanup needed
  }
}
