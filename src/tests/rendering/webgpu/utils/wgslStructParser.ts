/**
 * Shared WGSL struct parser used by `*Layout.test.ts` files to cross-validate
 * TypeScript layout mirrors against canonical WGSL struct text.
 *
 * Each layout test parses the field list from a WGSL template literal and
 * compares names, types, and computed byte offsets against the TypeScript
 * `StructLayout` that drives uniform packing at runtime. The parser supports
 * the subset of WGSL host-shareable types used by uniform structs in this
 * codebase:
 *
 *   - scalars: `i32`, `u32`, `f32`
 *   - vectors: `vecNf` shorthand and explicit `vecN<f32|i32|u32>` forms
 *     (explicit-`<f32>` forms are normalised to `vecNf` so the resulting
 *     `WGSLFieldType` strings string-equal the TS layout's `vecNf` strings)
 *   - fixed-size arrays: `array<element, count>` over scalars or vectors
 *   - matrix shorthand: `mat4x4f`, `mat4x4<f32>` → `arr('vec4f', 4)`;
 *     `mat3x3f`, `mat3x3<f32>` → `arr('vec4f', 3)`. WGSL §13.4.1 makes
 *     `mat3x3<f32>` column-aligned to 16 bytes with column stride 16 — i.e.
 *     identical alignment, stride, and total size to `array<vec4f, 3>`. The
 *     TypeScript skybox layout (`SKYBOX_VERTEX_UNIFORMS_LAYOUT`) models the
 *     `rotationMatrix: mat3x3<f32>` field as `arr('vec4f', 3)`, so the
 *     parser must produce the same shape for `typesEqual` to succeed.
 *
 * Any other WGSL type causes `parseWGSLType` to throw — keeping unknown
 * additions visible at test time so the layout drift the test was built to
 * catch can't sneak in via a silently-skipped field.
 *
 * @module tests/rendering/webgpu/utils/wgslStructParser
 */

import {
  arr,
  type WGSLFieldType,
  type WGSLScalarType,
  type WGSLVecType,
} from '@/rendering/webgpu/utils/structLayout'

const SCALAR_TYPES = new Set<string>(['i32', 'u32', 'f32'])

const VEC_PATTERN = /^vec[234](?:f|<(?:i32|u32|f32)>)$/

/** A field parsed out of a WGSL struct: declaration name and resolved type. */
export interface ParsedField {
  readonly name: string
  readonly type: WGSLFieldType
}

/**
 * Normalise an explicit-form vector type to its shorthand. `vec3<f32>` →
 * `vec3f` so type-equality against the TS layout (which uses shorthand)
 * collapses to a string compare. Non-vector inputs and integer-vector
 * inputs (`vec3<i32>`, `vec3<u32>`) are returned unchanged.
 */
function normaliseVecType(t: string): string {
  if (t === 'vec2<f32>') return 'vec2f'
  if (t === 'vec3<f32>') return 'vec3f'
  if (t === 'vec4<f32>') return 'vec4f'
  return t
}

/**
 * Parse a WGSL type string into a `WGSLFieldType`.
 *
 * Throws on any type that is not a scalar, vector, supported matrix shape,
 * or fixed-size array of scalar/vector elements. Throwing keeps unknown
 * struct additions visible — silently skipping a field would let layout
 * drift slip past the test that was built to catch it.
 *
 * @param typeStr - Raw WGSL type text (e.g. `'array<f32, 12>'`, `'mat4x4f'`).
 * @returns The parsed `WGSLFieldType`.
 * @throws If the type is not one of the supported forms.
 */
export function parseWGSLType(typeStr: string): WGSLFieldType {
  const t = typeStr.trim()

  if (SCALAR_TYPES.has(t)) return t as WGSLScalarType

  if (VEC_PATTERN.test(t)) return normaliseVecType(t) as WGSLVecType

  // Matrix shorthand and explicit forms. WGSL `matCxR<f32>` (and the
  // `matCxRf` shorthand) has column stride 16 and total size `C * 16`,
  // which matches `array<vec4f, C>` for the C and R values used in this
  // codebase (4x4 and 3x3). Other shapes are rejected so that adding e.g.
  // `mat3x4<f32>` triggers a visible test failure rather than silent drift.
  const matMatch = t.match(/^mat(\d)x(\d)(?:f|<f32>)$/)
  if (matMatch) {
    const cols = parseInt(matMatch[1]!, 10)
    const rows = parseInt(matMatch[2]!, 10)
    if (rows !== 4 && rows !== 3) {
      throw new Error(`Unsupported matrix row count: ${t}`)
    }
    if (cols !== 4 && cols !== 3) {
      throw new Error(`Unsupported matrix column count: ${t}`)
    }
    return arr('vec4f', cols)
  }

  // array<element, count> — element may be a scalar or a vector.
  const arrayMatch = t.match(/^array<(.+),\s*(\d+)>$/)
  if (arrayMatch) {
    const elementStr = normaliseVecType(arrayMatch[1]!.trim())
    const count = parseInt(arrayMatch[2]!, 10)
    if (SCALAR_TYPES.has(elementStr)) {
      return arr(elementStr as WGSLScalarType, count)
    }
    if (VEC_PATTERN.test(elementStr)) {
      return arr(elementStr as WGSLVecType, count)
    }
    throw new Error(`Unsupported array element type: ${elementStr}`)
  }

  throw new Error(`Unknown WGSL type: ${t}`)
}

/**
 * Extract field definitions from a named WGSL struct in arbitrary WGSL
 * source text. Strips line comments and ignores lines that don't match
 * the `name: type,` shape so that decorators / blank lines / inline
 * documentation don't trip the parser.
 *
 * @param wgsl - WGSL source text containing the struct declaration.
 * @param structName - Exact struct name to look for (e.g. `'CameraUniforms'`).
 * @returns Parsed fields in declaration order.
 * @throws If the struct cannot be located in the source text.
 */
export function parseStructFields(wgsl: string, structName: string): ParsedField[] {
  const re = new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\n\\}`)
  const structMatch = wgsl.match(re)
  if (!structMatch) {
    throw new Error(`Could not find ${structName} struct in WGSL block`)
  }

  const fields: ParsedField[] = []
  for (const line of structMatch[1]!.split('\n')) {
    const noComment = line.replace(/\/\/.*$/, '').trim()
    if (!noComment) continue

    // Match: fieldName: type,
    const match = noComment.match(/^(\w+)\s*:\s*(.+?)\s*,?\s*$/)
    if (!match) continue

    fields.push({ name: match[1]!, type: parseWGSLType(match[2]!) })
  }
  return fields
}

/**
 * Compare two `WGSLFieldType` values for structural equality. Scalars and
 * vectors compare by string identity; arrays compare by element + count.
 *
 * @param a - First type.
 * @param b - Second type.
 * @returns True iff both types describe the same WGSL host-shareable shape.
 */
export function typesEqual(a: WGSLFieldType, b: WGSLFieldType): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b
  if (typeof a === 'object' && typeof b === 'object') {
    return a.element === b.element && a.count === b.count
  }
  return false
}
