/**
 * WebGPU Uniform Buffer Manager
 *
 * Provides typed, efficient uniform buffer management with automatic
 * alignment handling and dirty flag tracking.
 *
 * @module rendering/webgpu/core/WebGPUUniformBuffer
 */

import type { ManagedUniformBuffer, UniformBufferDescriptor, UniformEntry } from './types'

// =============================================================================
// Alignment Utilities
// =============================================================================

/**
 * Get the alignment requirement for a WGSL type.
 */
function getTypeAlignment(type: UniformEntry['type']): number {
  switch (type) {
    case 'f32':
    case 'i32':
    case 'u32':
      return 4
    case 'vec2f':
      return 8
    case 'vec3f':
    case 'vec4f':
      return 16
    case 'mat3x3f':
    case 'mat4x4f':
      return 16
    default:
      return 4
  }
}

/**
 * Get the size of a WGSL type in bytes.
 */
function getTypeSize(type: UniformEntry['type']): number {
  switch (type) {
    case 'f32':
    case 'i32':
    case 'u32':
      return 4
    case 'vec2f':
      return 8
    case 'vec3f':
      return 12 // Note: vec3 is 12 bytes but aligned to 16
    case 'vec4f':
      return 16
    case 'mat3x3f':
      return 48 // 3 x vec4f (padded)
    case 'mat4x4f':
      return 64
    default:
      return 4
  }
}

/**
 * Align an offset to the required alignment.
 */
function alignOffset(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment
}

// =============================================================================
// Uniform Buffer Builder
// =============================================================================

/**
 * Builder for creating uniform buffer layouts.
 *
 * Automatically handles WGSL alignment requirements.
 *
 * @example
 * ```ts
 * const layout = new UniformBufferBuilder()
 *   .addFloat('time')
 *   .addVec2('resolution')
 *   .addVec3('cameraPosition')
 *   .addMat4('viewMatrix')
 *   .build()
 * ```
 */
export class UniformBufferBuilder {
  private entries: UniformEntry[] = []
  private currentOffset = 0

  /**
   * Add a f32 uniform.
   */
  addFloat(name: string): this {
    return this.addEntry(name, 'f32')
  }

  /**
   * Add an i32 uniform.
   */
  addInt(name: string): this {
    return this.addEntry(name, 'i32')
  }

  /**
   * Add a u32 uniform.
   */
  addUint(name: string): this {
    return this.addEntry(name, 'u32')
  }

  /**
   * Add a vec2f uniform.
   */
  addVec2(name: string): this {
    return this.addEntry(name, 'vec2f')
  }

  /**
   * Add a vec3f uniform.
   */
  addVec3(name: string): this {
    return this.addEntry(name, 'vec3f')
  }

  /**
   * Add a vec4f uniform.
   */
  addVec4(name: string): this {
    return this.addEntry(name, 'vec4f')
  }

  /**
   * Add a mat3x3f uniform.
   */
  addMat3(name: string): this {
    return this.addEntry(name, 'mat3x3f')
  }

  /**
   * Add a mat4x4f uniform.
   */
  addMat4(name: string): this {
    return this.addEntry(name, 'mat4x4f')
  }

  /**
   * Add an array of floats.
   */
  addFloatArray(name: string, length: number): this {
    return this.addEntry(name, 'f32', length)
  }

  /**
   * Add an array of vec4f.
   */
  addVec4Array(name: string, length: number): this {
    return this.addEntry(name, 'vec4f', length)
  }

  /**
   * Add a custom entry.
   */
  private addEntry(name: string, type: UniformEntry['type'], arrayLength?: number): this {
    const alignment = getTypeAlignment(type)
    const baseSize = getTypeSize(type)

    // Align the offset
    this.currentOffset = alignOffset(this.currentOffset, alignment)

    // Calculate total size (handle arrays)
    let size = baseSize
    if (arrayLength !== undefined && arrayLength > 1) {
      // Array elements must be aligned to 16 bytes in WGSL
      const elementStride = alignOffset(baseSize, 16)
      size = elementStride * arrayLength
    }

    this.entries.push({
      name,
      type,
      offset: this.currentOffset,
      size,
      arrayLength,
    })

    this.currentOffset += size

    return this
  }

  /**
   * Build the uniform buffer descriptor.
   */
  build(): UniformBufferDescriptor {
    // Final size must be aligned to 16 bytes
    const totalSize = alignOffset(this.currentOffset, 16)

    return {
      entries: [...this.entries],
      totalSize,
    }
  }
}

// =============================================================================
// Managed Uniform Buffer
// =============================================================================

/**
 * Create a managed uniform buffer.
 */
export function createManagedUniformBuffer(
  device: GPUDevice,
  descriptor: UniformBufferDescriptor,
  label?: string
): ManagedUniformBuffer {
  const buffer = device.createBuffer({
    label: label ?? 'uniform-buffer',
    size: descriptor.totalSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const data = new ArrayBuffer(descriptor.totalSize)
  const view = new DataView(data)

  return {
    buffer,
    data,
    view,
    descriptor,
    dirty: false,
  }
}

/**
 * Uniform buffer writer with type-safe setters.
 */
export class UniformBufferWriter {
  private managed: ManagedUniformBuffer
  private entryMap: Map<string, UniformEntry>
  private float32View: Float32Array
  private int32View: Int32Array
  private uint32View: Uint32Array

  constructor(managed: ManagedUniformBuffer) {
    this.managed = managed
    this.entryMap = new Map(managed.descriptor.entries.map((e) => [e.name, e]))

    // Create typed views for efficient writing
    this.float32View = new Float32Array(managed.data)
    this.int32View = new Int32Array(managed.data)
    this.uint32View = new Uint32Array(managed.data)
  }

  /**
   * Set a f32 value.
   */
  setFloat(name: string, value: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'f32') {
      this.float32View[entry.offset / 4] = value
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set an i32 value.
   */
  setInt(name: string, value: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'i32') {
      this.int32View[entry.offset / 4] = value
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a u32 value.
   */
  setUint(name: string, value: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'u32') {
      this.uint32View[entry.offset / 4] = value
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a vec2f value.
   */
  setVec2(name: string, x: number, y: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'vec2f') {
      const base = entry.offset / 4
      this.float32View[base] = x
      this.float32View[base + 1] = y
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a vec3f value.
   */
  setVec3(name: string, x: number, y: number, z: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'vec3f') {
      const base = entry.offset / 4
      this.float32View[base] = x
      this.float32View[base + 1] = y
      this.float32View[base + 2] = z
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a vec4f value.
   */
  setVec4(name: string, x: number, y: number, z: number, w: number): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'vec4f') {
      const base = entry.offset / 4
      this.float32View[base] = x
      this.float32View[base + 1] = y
      this.float32View[base + 2] = z
      this.float32View[base + 3] = w
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a mat3x3f value from array (9 floats, column-major).
   * Note: In WGSL, mat3x3f is stored as 3 vec4f (padded).
   */
  setMat3(name: string, values: ArrayLike<number>): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'mat3x3f' && values.length >= 9) {
      const base = entry.offset / 4
      // Column 0
      this.float32View[base] = values[0]!
      this.float32View[base + 1] = values[1]!
      this.float32View[base + 2] = values[2]!
      // Column 1 (offset by 4 for padding)
      this.float32View[base + 4] = values[3]!
      this.float32View[base + 5] = values[4]!
      this.float32View[base + 6] = values[5]!
      // Column 2 (offset by 8 for padding)
      this.float32View[base + 8] = values[6]!
      this.float32View[base + 9] = values[7]!
      this.float32View[base + 10] = values[8]!
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a mat4x4f value from array (16 floats, column-major).
   */
  setMat4(name: string, values: ArrayLike<number>): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'mat4x4f' && values.length >= 16) {
      const base = entry.offset / 4
      for (let i = 0; i < 16; i++) {
        this.float32View[base + i] = values[i]!
      }
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a float array.
   */
  setFloatArray(name: string, values: ArrayLike<number>): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'f32' && entry.arrayLength) {
      const base = entry.offset / 4
      // Arrays are padded to 16 bytes per element in WGSL
      const stride = 4 // 16 bytes / 4 = 4 float32 indices
      for (let i = 0; i < Math.min(values.length, entry.arrayLength); i++) {
        this.float32View[base + i * stride] = values[i]!
      }
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Set a vec4 array.
   */
  setVec4Array(name: string, values: ArrayLike<number>): this {
    const entry = this.entryMap.get(name)
    if (entry && entry.type === 'vec4f' && entry.arrayLength) {
      const base = entry.offset / 4
      const componentCount = Math.min(values.length, entry.arrayLength * 4)
      for (let i = 0; i < componentCount; i++) {
        this.float32View[base + i] = values[i]!
      }
      this.managed.dirty = true
    }
    return this
  }

  /**
   * Upload dirty buffer to GPU.
   */
  upload(device: GPUDevice): void {
    if (this.managed.dirty) {
      device.queue.writeBuffer(this.managed.buffer, 0, this.managed.data)
      this.managed.dirty = false
    }
  }

  /**
   * Force upload (ignore dirty flag).
   */
  forceUpload(device: GPUDevice): void {
    device.queue.writeBuffer(this.managed.buffer, 0, this.managed.data)
    this.managed.dirty = false
  }

  /**
   * Get the GPU buffer.
   */
  getBuffer(): GPUBuffer {
    return this.managed.buffer
  }
}

// =============================================================================
// Common Uniform Layouts
// =============================================================================

/**
 * Common uniforms for camera/view.
 */
export const cameraUniformLayout = new UniformBufferBuilder()
  .addMat4('viewMatrix')
  .addMat4('projectionMatrix')
  .addMat4('viewProjectionMatrix')
  .addMat4('inverseViewMatrix')
  .addMat4('inverseProjectionMatrix')
  .addVec3('cameraPosition')
  .addFloat('cameraNear')
  .addFloat('cameraFar')
  .addFloat('fov')
  .addVec2('resolution')
  .addFloat('aspectRatio')
  .addFloat('time')
  .addFloat('deltaTime')
  .addUint('frameNumber')
  .build()

/**
 * Common uniforms for lighting.
 */
export const lightingUniformLayout = new UniformBufferBuilder()
  .addVec4Array('lightPositions', 8)
  .addVec4Array('lightDirections', 8)
  .addVec4Array('lightColors', 8)
  .addFloatArray('lightIntensities', 8)
  .addFloatArray('lightRanges', 8)
  .addFloatArray('lightDecays', 8)
  .addVec3('ambientColor')
  .addFloat('ambientIntensity')
  .addInt('lightCount')
  .build()

/**
 * Common uniforms for PBR materials.
 */
export const materialUniformLayout = new UniformBufferBuilder()
  .addVec4('baseColor')
  .addFloat('metallic')
  .addFloat('roughness')
  .addFloat('reflectance')
  .addFloat('ao')
  .addVec3('emissive')
  .addFloat('emissiveIntensity')
  .addFloat('ior')
  .addFloat('transmission')
  .addFloat('thickness')
  .build()
