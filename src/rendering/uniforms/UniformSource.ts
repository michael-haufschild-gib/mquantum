/**
 * Interface for uniform sources.
 *
 * Uniform sources provide a way to centralize and cache uniform values
 * that are shared across multiple renderers. Each source tracks its
 * version number so consumers can efficiently detect changes.
 *
 * @module rendering/uniforms/UniformSource
 */

import type * as THREE from 'three'

/**
 * A single uniform value with type information.
 */
export interface IUniform<T = unknown> {
  value: T
}

/**
 * State passed to uniform sources during update.
 */
export interface UniformUpdateState {
  /** Current frame time in seconds */
  time: number
  /** Delta time since last frame */
  delta: number
  /** Current camera */
  camera: THREE.Camera
  /** Current scene */
  scene: THREE.Scene
  /** WebGL renderer */
  gl: THREE.WebGLRenderer
  /** Viewport size */
  size: { width: number; height: number }
}

/**
 * Interface for uniform sources.
 *
 * Uniform sources encapsulate a set of related uniforms (e.g., lighting,
 * temporal, quality) and track when they change. This allows renderers
 * to efficiently skip uniform updates when nothing has changed.
 *
 * @example
 * ```typescript
 * class MySource implements UniformSource {
 *   readonly id = 'my-source';
 *   private _version = 0;
 *
 *   get version() { return this._version; }
 *
 *   getUniforms() {
 *     return {
 *       uMyValue: { value: this.myValue },
 *     };
 *   }
 *
 *   update(state: UniformUpdateState) {
 *     const newValue = computeNewValue(state);
 *     if (newValue !== this.myValue) {
 *       this.myValue = newValue;
 *       this._version++;
 *     }
 *   }
 * }
 * ```
 */
export interface UniformSource {
  /**
   * Unique identifier for this source.
   * Used to register and reference the source in the manager.
   */
  readonly id: string

  /**
   * Version number that increments whenever uniforms change.
   * Consumers can compare versions to skip redundant updates.
   */
  readonly version: number

  /**
   * Get the current uniform values.
   * The returned record should not be mutated by the caller.
   *
   * @returns Record of uniform names to uniform objects
   */
  getUniforms(): Record<string, IUniform>

  /**
   * Update internal state based on the current frame state.
   * Should increment version if any uniform values changed.
   *
   * @param state - Current frame state
   */
  update(state: UniformUpdateState): void

  /**
   * Apply uniforms to a material.
   * Only updates uniforms that exist on the material.
   *
   * @param material - The shader material to update
   */
  applyToMaterial(material: THREE.ShaderMaterial): void
}

/**
 * Base class for uniform sources with common functionality.
 *
 * Provides version tracking and material application logic.
 * Subclasses should implement getUniforms() and update().
 */
export abstract class BaseUniformSource implements UniformSource {
  abstract readonly id: string

  protected _version = 0

  get version(): number {
    return this._version
  }

  /**
   * Increment version to signal that uniforms have changed.
   * Call this when any uniform value changes.
   */
  protected incrementVersion(): void {
    this._version++
  }

  abstract getUniforms(): Record<string, IUniform>

  abstract update(state: UniformUpdateState): void

  /**
   * Apply uniforms to a material.
   * Only updates uniforms that exist on the material.
   * @param material
   */
  applyToMaterial(material: THREE.ShaderMaterial): void {
    const uniforms = this.getUniforms()
    const materialUniforms = material.uniforms

    for (const [name, uniform] of Object.entries(uniforms)) {
      if (materialUniforms[name]) {
        // Handle different value types appropriately
        const targetValue = materialUniforms[name].value
        const sourceValue = uniform.value

        if (targetValue && typeof targetValue === 'object' && 'copy' in targetValue) {
          // Value has a copy method (Vector3, Matrix4, Color, etc.)
          ;(targetValue as { copy: (v: unknown) => void }).copy(sourceValue)
        } else if (targetValue instanceof Float32Array && sourceValue instanceof Float32Array) {
          // Float32Array - use set method
          targetValue.set(sourceValue)
        } else {
          // Primitive or other value - direct assignment
          materialUniforms[name].value = sourceValue
        }
      }
    }
  }
}
