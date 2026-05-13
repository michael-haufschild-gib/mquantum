/**
 * PauliUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `PauliUniforms` struct in
 * `shaders/schroedinger/compute/pauliUniforms.wgsl.ts` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from `PauliComputePassBuffers.ts`
 * (`PAULI_UNIFORM_SIZE = 640`, `PAULI_FIELD_VIEW_U32_OFFSET = 76`, the raw
 * `f32[36]` / `f32[37]` / `f32[66]` field-vector slots, and the
 * `f32[148 + d]` kGridScale loop).
 *
 * The struct is bound as `var<storage, read>` (see `pauliInit.wgsl.ts`), so
 * scalar-element arrays use natural (4-byte) stride rather than the 16-byte
 * stride that uniform-address-space arrays require. The layout engine's
 * scalar-array support matches this: `array<f32, 12>` packs at 48 bytes.
 *
 * Fields whose name begins with `_` (`_pad3`, `_pad4`, `_pad5`) are reserved
 * padding slots that the WGSL struct keeps for layout stability. They are
 * auto-classified as reserved by the layout engine; the packer uses
 * `u32.fill(0)` so explicit zeroing is unnecessary.
 *
 * Validated at test time by parsing the WGSL template literal and comparing
 * field names, types, and computed offsets.
 *
 * @module rendering/webgpu/passes/pauliUniformsLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the PauliUniforms WGSL struct.
 *
 * Order and types must match `pauliUniforms.wgsl.ts` exactly. Total size is
 * 640 bytes (160 × 4); `fieldView` lives at u32 index 76.
 */
const PAULI_UNIFORMS_FIELDS = [
  // --- Lattice (offset 0..103) ---
  { name: 'latticeDim', type: 'u32' }, // [0]
  { name: 'gridSize', type: arr('u32', 12) }, // [1..12]
  { name: 'strides', type: arr('u32', 12) }, // [13..24]
  { name: 'totalSites', type: 'u32' }, // [25]

  // --- Physics (offset 104..119) ---
  { name: 'dt', type: 'f32' }, // [26]
  { name: 'hbar', type: 'f32' }, // [27]
  { name: 'mass', type: 'f32' }, // [28]
  { name: 'simTime', type: 'f32' }, // [29]

  // --- Magnetic field (offset 120..143) ---
  { name: 'fieldType', type: 'u32' }, // [30]
  { name: 'fieldStrength', type: 'f32' }, // [31]
  { name: 'fieldDirTheta', type: 'f32' }, // [32]
  { name: 'fieldDirPhi', type: 'f32' }, // [33]
  { name: 'gradientStrength', type: 'f32' }, // [34]
  { name: 'rotatingFrequency', type: 'f32' }, // [35]

  // --- Host-precomputed B vector for fieldType=0 (offset 144..151) ---
  { name: 'fieldVecBx', type: 'f32' }, // [36]
  { name: 'fieldVecBy', type: 'f32' }, // [37]

  // --- Spin state (offset 152..159) ---
  { name: 'spinTheta', type: 'f32' }, // [38]
  { name: 'spinPhi', type: 'f32' }, // [39]

  // --- Initial condition + packet (offset 160..267) ---
  { name: 'initCondition', type: 'u32' }, // [40]
  { name: 'packetWidth', type: 'f32' }, // [41]
  { name: 'packetCenter', type: arr('f32', 12) }, // [42..53]
  { name: 'packetMomentum', type: arr('f32', 12) }, // [54..65]
  { name: 'fieldVecBz', type: 'f32' }, // [66]

  // --- Potential (offset 268..287) ---
  { name: 'potentialType', type: 'u32' }, // [67]
  { name: 'harmonicOmega', type: 'f32' }, // [68]
  { name: 'wellDepth', type: 'f32' }, // [69]
  { name: 'wellWidth', type: 'f32' }, // [70]
  { name: 'showPotential', type: 'u32' }, // [71]

  // --- Absorber (offset 288..303) ---
  { name: 'absorberEnabled', type: 'u32' }, // [72]
  { name: 'absorberWidth', type: 'f32' }, // [73]
  { name: 'absorberStrength', type: 'f32' }, // [74]
  { name: '_pad3', type: 'u32' }, // [75]

  // --- Display (offset 304..335) ---
  { name: 'fieldView', type: 'u32' }, // [76]
  { name: 'autoScale', type: 'u32' }, // [77]
  { name: 'spinUpR', type: 'f32' }, // [78]
  { name: 'spinUpG', type: 'f32' }, // [79]
  { name: 'spinUpB', type: 'f32' }, // [80]
  { name: 'spinDownR', type: 'f32' }, // [81]
  { name: 'spinDownG', type: 'f32' }, // [82]
  { name: 'spinDownB', type: 'f32' }, // [83]

  // --- Bounding (offset 336..351) ---
  { name: 'boundingRadius', type: 'f32' }, // [84]
  { name: 'densityScale', type: 'f32' }, // [85]
  { name: '_pad4', type: 'u32' }, // [86]
  { name: '_pad5', type: 'u32' }, // [87]

  // --- Basis vectors (offset 352..495) ---
  { name: 'basisX', type: arr('f32', 12) }, // [88..99]
  { name: 'basisY', type: arr('f32', 12) }, // [100..111]
  { name: 'basisZ', type: arr('f32', 12) }, // [112..123]

  // --- Lattice spacing + slice positions (offset 496..591) ---
  { name: 'spacing', type: arr('f32', 12) }, // [124..135]
  { name: 'slicePositions', type: arr('f32', 12) }, // [136..147]

  // --- k-space grid info (offset 592..639) ---
  { name: 'kGridScale', type: arr('f32', 12) }, // [148..159]
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for PauliUniforms. */
export const PAULI_UNIFORMS_LAYOUT = computeStructLayout(PAULI_UNIFORMS_FIELDS)
