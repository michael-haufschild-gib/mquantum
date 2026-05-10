/**
 * DiracUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `DiracUniforms` struct in
 * `shaders/schroedinger/compute/diracUniforms.wgsl.ts` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from the packing code.
 *
 * The struct is bound as `var<storage, read>`, so arrays use natural
 * (4-byte) stride for scalar elements rather than the 16-byte stride
 * required of arrays in the uniform address space. The layout engine's
 * scalar-array support matches this: `array<f32, 12>` packs at 48 bytes.
 *
 * Validated at test time by parsing the WGSL template literal and
 * comparing field names, types, and computed offsets.
 *
 * @module rendering/webgpu/passes/diracUniformsLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the DiracUniforms WGSL struct.
 *
 * Order and types must match `diracUniforms.wgsl.ts` exactly. The struct
 * has no `_`-prefixed reserved fields — every named field is live.
 */
const DIRAC_FIELDS = [
  // --- Lattice parameters (offset 0..143) ---
  { name: 'gridSize', type: arr('u32', 12) },
  { name: 'strides', type: arr('u32', 12) },
  { name: 'spacing', type: arr('f32', 12) },

  // --- Lattice scalars (offset 144..159) ---
  { name: 'totalSites', type: 'u32' },
  { name: 'latticeDim', type: 'u32' },
  { name: 'mass', type: 'f32' },
  { name: 'speedOfLight', type: 'f32' },

  // --- Physics scalars (offset 160..175) ---
  { name: 'hbar', type: 'f32' },
  { name: 'dt', type: 'f32' },
  { name: 'spinorSize', type: 'u32' },
  { name: 'potentialType', type: 'u32' },

  // --- Potential parameters (offset 176..191) ---
  { name: 'potentialStrength', type: 'f32' },
  { name: 'potentialWidth', type: 'f32' },
  { name: 'potentialCenter', type: 'f32' },
  { name: 'harmonicOmega', type: 'f32' },

  // --- Potential + init (offset 192..207) ---
  { name: 'coulombZ', type: 'f32' },
  { name: 'initCondition', type: 'u32' },
  { name: 'packetWidth', type: 'f32' },
  { name: 'positiveEnergyFraction', type: 'f32' },

  // --- Packet init arrays (offset 208..303) ---
  { name: 'packetCenter', type: arr('f32', 12) },
  { name: 'packetMomentum', type: arr('f32', 12) },

  // --- Display + simulation state (offset 304..319) ---
  { name: 'fieldView', type: 'u32' },
  { name: 'autoScale', type: 'u32' },
  { name: 'simTime', type: 'f32' },
  { name: 'absorberEnabled', type: 'u32' },

  // --- Absorber parameters (offset 320..327) ---
  { name: 'absorberWidth', type: 'f32' },
  { name: 'absorberStrength', type: 'f32' },

  // --- Slice positions for extra dimensions (offset 328..375) ---
  { name: 'slicePositions', type: arr('f32', 12) },

  // --- Basis vectors for N-D -> 3D projection (offset 376..519) ---
  { name: 'basisX', type: arr('f32', 12) },
  { name: 'basisY', type: arr('f32', 12) },
  { name: 'basisZ', type: arr('f32', 12) },

  // --- Bounding + density scale (offset 520..535) ---
  { name: 'boundingRadius', type: 'f32' },
  { name: 'densityScale', type: 'f32' },
  { name: 'stepsPerFrame', type: 'u32' },
  { name: 'showPotential', type: 'u32' },

  // --- Spin polarization angles (Bloch sphere, offset 536..543) ---
  { name: 'spinTheta', type: 'f32' },
  { name: 'spinPhi', type: 'f32' },

  // --- k-space grid info (offset 544..591): 2π / (N · a) per dimension. ---
  { name: 'kGridScale', type: arr('f32', 12) },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for DiracUniforms. */
export const DIRAC_UNIFORMS_LAYOUT = computeStructLayout(DIRAC_FIELDS)

/** Total byte size of the DiracUniforms GPU buffer (derived from layout). */
export const DIRAC_UNIFORM_SIZE = DIRAC_UNIFORMS_LAYOUT.totalSize
