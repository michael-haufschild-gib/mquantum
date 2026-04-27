/**
 * WGSL struct layout computation.
 *
 * Computes byte offsets for struct fields following WGSL alignment rules
 * (spec §13.4.1), providing compile-time type-safe field access and
 * automatic reserved-field zeroing. Replaces brittle hand-computed
 * magic-number offsets in uniform packing code.
 *
 * @module rendering/webgpu/utils/structLayout
 */

// ---------------------------------------------------------------------------
// WGSL type definitions
// ---------------------------------------------------------------------------

/** WGSL scalar types (all 4-byte aligned, 4-byte size). */
type WGSLScalarType = 'i32' | 'u32' | 'f32'

/** WGSL vector types. */
type WGSLVecType =
  | 'vec2f'
  | 'vec2<i32>'
  | 'vec2<u32>'
  | 'vec3f'
  | 'vec3<i32>'
  | 'vec3<u32>'
  | 'vec4f'
  | 'vec4<i32>'
  | 'vec4<u32>'

/** WGSL fixed-size array type descriptor. */
interface WGSLArrayType {
  readonly element: WGSLVecType
  readonly count: number
}

/** Union of all supported WGSL host-shareable field types. */
type WGSLFieldType = WGSLScalarType | WGSLVecType | WGSLArrayType

/** A field in a struct definition (input to layout computation). */
interface StructFieldDef {
  readonly name: string
  readonly type: WGSLFieldType
}

/** Computed layout information for a single struct field. */
interface StructFieldInfo {
  readonly name: string
  readonly type: WGSLFieldType
  readonly offset: number
  readonly size: number
  readonly align: number
  /** True when the field name starts with `_` (padding or removed feature). */
  readonly reserved: boolean
}

/** Computed layout for an entire WGSL struct. */
interface StructLayout<Names extends string = string> {
  /** Per-field layout information, in declaration order. */
  readonly fields: readonly StructFieldInfo[]
  /** Field name → byte offset mapping. */
  readonly byteOffset: Readonly<Record<Names, number>>
  /** Field name → byte size (matches WGSL stride·count for arrays). */
  readonly byteSize: Readonly<Record<Names, number>>
  /** Field name → float32/int32 index (byteOffset / 4). */
  readonly index: Readonly<Record<Names, number>>
  /** Total struct size in bytes (including trailing alignment padding). */
  readonly totalSize: number
}

// ---------------------------------------------------------------------------
// WGSL alignment rules (spec §13.4.1)
// ---------------------------------------------------------------------------

function roundUp(alignment: number, value: number): number {
  return Math.ceil(value / alignment) * alignment
}

function vecComponents(type: WGSLVecType): number {
  if (type.startsWith('vec2')) return 2
  if (type.startsWith('vec3')) return 3
  return 4
}

function vecAlignAndSize(components: number): { align: number; size: number } {
  // vec2: align 8, size 8
  // vec3: align 16, size 12
  // vec4: align 16, size 16
  if (components === 2) return { align: 8, size: 8 }
  if (components === 3) return { align: 16, size: 12 }
  return { align: 16, size: 16 }
}

function typeAlignAndSize(type: WGSLFieldType): { align: number; size: number } {
  if (typeof type === 'object') {
    const elem = vecAlignAndSize(vecComponents(type.element))
    const stride = roundUp(elem.align, elem.size)
    return { align: elem.align, size: type.count * stride }
  }
  if (type === 'i32' || type === 'u32' || type === 'f32') {
    return { align: 4, size: 4 }
  }
  return vecAlignAndSize(vecComponents(type))
}

// ---------------------------------------------------------------------------
// Layout computation
// ---------------------------------------------------------------------------

/**
 * Construct a WGSL array type descriptor for use in field definitions.
 *
 * @param element - Vector element type (e.g. `'vec4f'`, `'vec4<i32>'`)
 * @param count - Number of array elements
 */
function arr(element: WGSLVecType, count: number): WGSLArrayType {
  return { element, count }
}

/**
 * Compute byte offsets for a WGSL struct from its field definitions.
 *
 * Follows WGSL alignment rules: each field starts at an offset aligned to
 * its type's alignment requirement. The total struct size is rounded up to
 * the struct's alignment (max of all member alignments).
 *
 * Fields whose name starts with `_` are marked as reserved and can be
 * bulk-zeroed via {@link zeroReservedFields}.
 *
 * @param fields - Ordered field definitions matching the WGSL struct
 * @returns Layout with byte offsets, float32 indices, and total size
 */
function computeStructLayout<const T extends readonly StructFieldDef[]>(
  fields: T
): StructLayout<T[number]['name']> {
  const computed: StructFieldInfo[] = []
  const byteOffset = {} as Record<string, number>
  const byteSize = {} as Record<string, number>
  const index = {} as Record<string, number>
  let offset = 0
  let maxAlign = 0

  for (const field of fields) {
    const { align, size } = typeAlignAndSize(field.type)
    offset = roundUp(align, offset)
    maxAlign = Math.max(maxAlign, align)

    computed.push({
      name: field.name,
      type: field.type,
      offset,
      size,
      align,
      reserved: field.name.startsWith('_'),
    })
    byteOffset[field.name] = offset
    byteSize[field.name] = size
    index[field.name] = offset / 4

    offset += size
  }

  return {
    fields: computed,
    byteOffset: byteOffset as Readonly<Record<T[number]['name'], number>>,
    byteSize: byteSize as Readonly<Record<T[number]['name'], number>>,
    index: index as Readonly<Record<T[number]['name'], number>>,
    totalSize: roundUp(maxAlign || 1, offset),
  }
}

/**
 * Zero all reserved and padding fields in a uniform buffer.
 *
 * Reserved fields are identified by name starting with `_`. This replaces
 * scattered manual zeroing of dead fields with a single declarative pass.
 * Safe because IEEE 754 `0.0` and int32 `0` share the same all-zero bits.
 *
 * @param floatView - Float32Array view of the uniform buffer
 * @param layout - Computed struct layout identifying reserved fields
 */
function zeroReservedFields(floatView: Float32Array, layout: StructLayout): void {
  for (const field of layout.fields) {
    if (!field.reserved) continue
    const start = field.offset / 4
    const count = field.size / 4
    for (let i = 0; i < count; i++) {
      floatView[start + i] = 0
    }
  }
}

export { arr, computeStructLayout, zeroReservedFields }
export type {
  StructFieldDef,
  StructFieldInfo,
  StructLayout,
  WGSLArrayType,
  WGSLFieldType,
  WGSLScalarType,
  WGSLVecType,
}
