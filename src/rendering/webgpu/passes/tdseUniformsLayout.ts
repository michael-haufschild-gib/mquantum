/**
 * TDSEUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `TDSEUniforms` struct in
 * `shaders/schroedinger/compute/tdseUniforms.wgsl.ts` exactly. The layout
 * engine computes byte offsets using WGSL alignment rules, eliminating
 * hand-computed magic numbers from `writeTdseUniforms` and the
 * `TDSE_UNIFORM_*` constants in `TDSEComputePassResources`.
 *
 * The buffer is bound as `var<storage, read>` (see `tdseInit.wgsl.ts`), so
 * arrays of scalars use storage-buffer stride rules: `array<f32, N>` has
 * stride 4 (not 16 as a uniform-buffer array would).
 *
 * Validated at test time by parsing the WGSL template literal and
 * comparing field names, types, and computed offsets.
 *
 * @module rendering/webgpu/passes/tdseUniformsLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the TDSEUniforms WGSL struct.
 *
 * Order and types must match `tdseUniforms.wgsl.ts` exactly. Fields whose
 * name starts with `_` are reserved padding (auto-classified by the layout
 * engine; the writer uses `u32.fill(0)` so explicit zeroing is not needed).
 */
const TDSE_UNIFORMS_FIELDS = [
  // --- Lattice parameters (offset 0) ---
  { name: 'latticeDim', type: 'u32' },
  { name: 'totalSites', type: 'u32' },
  { name: 'dt', type: 'f32' },
  { name: 'hbar', type: 'f32' },

  // --- Physics scalars (offset 16) ---
  { name: 'mass', type: 'f32' },
  { name: 'stepsPerFrame', type: 'u32' },
  { name: 'initCondition', type: 'u32' },
  { name: 'potentialType', type: 'u32' },

  // --- Per-dimension arrays (offset 32) ---
  { name: 'gridSize', type: arr('u32', 12) },
  { name: 'strides', type: arr('u32', 12) },
  { name: 'spacing', type: arr('f32', 12) },

  // --- Packet init parameters (offset 176) ---
  { name: 'packetCenter', type: arr('f32', 12) },
  { name: 'packetMomentum', type: arr('f32', 12) },
  { name: 'packetWidth', type: 'f32' },
  { name: 'packetAmplitude', type: 'f32' },
  { name: 'boundingRadius', type: 'f32' },
  { name: 'fieldView', type: 'u32' },

  // --- Potential parameters (offset 288) ---
  { name: 'barrierHeight', type: 'f32' },
  { name: 'barrierWidth', type: 'f32' },
  { name: 'barrierCenter', type: 'f32' },
  { name: 'wellDepth', type: 'f32' },
  { name: 'wellWidth', type: 'f32' },
  { name: 'harmonicOmega', type: 'f32' },
  { name: 'stepHeight', type: 'f32' },
  { name: 'absorberEnabled', type: 'u32' },

  // --- Absorber and drive parameters (offset 320) ---
  { name: 'absorberWidth', type: 'f32' },
  { name: 'absorberStrength', type: 'f32' },
  { name: 'driveEnabled', type: 'u32' },
  { name: 'driveWaveform', type: 'u32' },
  { name: 'driveFrequency', type: 'f32' },
  { name: 'driveAmplitude', type: 'f32' },
  { name: 'simTime', type: 'f32' },
  { name: 'maxDensity', type: 'f32' },

  // --- Slice positions (offset 352) ---
  { name: 'slicePositions', type: arr('f32', 12) },

  // --- Basis vectors for N-D → 3D projection (offset 400) ---
  { name: 'basisX', type: arr('f32', 12) },
  { name: 'basisY', type: arr('f32', 12) },
  { name: 'basisZ', type: arr('f32', 12) },

  // --- k-space grid info for kinetic step (offset 544) ---
  { name: 'kGridScale', type: arr('f32', 12) },

  // --- Double slit parameters (offset 592) ---
  { name: 'slitSeparation', type: 'f32' },
  { name: 'slitWidth', type: 'f32' },
  { name: 'wallThickness', type: 'f32' },
  { name: 'wallHeight', type: 'f32' },

  // --- Periodic lattice parameters (offset 608) ---
  { name: 'latticeDepth', type: 'f32' },
  { name: 'latticePeriod', type: 'f32' },

  // --- Display overlay (offset 616) ---
  { name: 'showPotential', type: 'u32' },

  // --- Double well parameters (offset 620) ---
  { name: 'doubleWellLambda', type: 'f32' },
  { name: 'doubleWellSeparation', type: 'f32' },
  { name: 'doubleWellAsymmetry', type: 'f32' },
  { name: 'interactionStrength', type: 'f32' },

  // --- BEC trap anisotropy (offset 636) ---
  { name: 'trapAnisotropy', type: arr('f32', 12) },

  // --- Radial double well (offset 684) ---
  { name: 'radialWellInner', type: 'f32' },
  { name: 'radialWellOuter', type: 'f32' },
  { name: 'radialWellDepth', type: 'f32' },
  { name: 'radialWellTilt', type: 'f32' },

  // --- Imaginary time + custom potential scale (offset 700) ---
  { name: 'imaginaryTime', type: 'u32' },
  { name: 'customPotentialScale', type: 'f32' },

  // --- N-D vortex reconnection parameters (offset 708) ---
  { name: 'vortexPlane1Axis0', type: 'u32' },
  { name: 'vortexPlane1Axis1', type: 'u32' },
  { name: 'vortexPlane2Axis0', type: 'u32' },
  { name: 'vortexPlane2Axis1', type: 'u32' },
  { name: 'vortexSeparation', type: 'f32' },
  { name: 'vortexCount', type: 'u32' },
  { name: 'anharmonicLambda', type: 'f32' },
  { name: 'compactDimsMask', type: 'u32' },

  // --- Stochastic decoherence branching (offset 740) ---
  { name: 'branchingEnabled', type: 'u32' },
  { name: 'branchPlanePosition', type: 'f32' },

  // --- Black-hole Regge–Wheeler ringdown barrier (offset 748) ---
  { name: 'bhMass', type: 'f32' },
  { name: 'bhMultipoleL', type: 'f32' },
  { name: 'bhSpin', type: 'f32' },

  // --- Analog Hawking (waterfall sonic horizon) (offset 760) ---
  { name: 'hawkingVmax', type: 'f32' },
  { name: 'hawkingLh', type: 'f32' },
  { name: 'hawkingDeltaN', type: 'f32' },
  { name: 'hawkingInjectRate', type: 'f32' },
  { name: 'hawkingPairInjection', type: 'u32' },
  { name: 'hawkingSeed', type: 'u32' },
  { name: 'hawkingStepIndex', type: 'u32' },
  { name: '_padHawk0', type: 'u32' },

  // --- Wormhole-shader trig precompute (offset 792) ---
  { name: 'wormholeCosTau', type: 'f32' },
  { name: 'wormholeSinTau', type: 'f32' },

  // --- ER=EPR double-trace wormhole coupling (offset 800) ---
  { name: 'wormholeCouplingEnabled', type: 'u32' },
  { name: 'wormholeCouplingG', type: 'f32' },
  { name: 'wormholeMirrorAxis', type: 'u32' },
  { name: '_padWormhole', type: 'u32' },

  // --- Analog-Hawking quantum-extremal island overlay (offset 816) ---
  { name: 'islandOverlayEnabled', type: 'u32' },
  { name: 'islandCenterX0', type: 'f32' },
  { name: 'islandRadiusWs', type: 'f32' },
  { name: 'islandBoost', type: 'f32' },

  // --- Curved-space TDSE v1 metric (offset 832) ---
  { name: 'metricKind', type: 'u32' },
  { name: 'throatRadius', type: 'f32' },
  { name: '_padMetric0', type: 'u32' },
  { name: '_padMetric1', type: 'u32' },

  // --- Curved-space TDSE v2 metric block (offset 848) ---
  { name: 'schwarzschildMass', type: 'f32' },
  { name: 'hubbleRate', type: 'f32' },
  { name: 'adsRadius', type: 'f32' },
  { name: 'sphereRadius', type: 'f32' },
  { name: 'doubleThroatSep', type: 'f32' },
  { name: 'doubleThroatRad', type: 'f32' },
  { name: '_padV2a', type: 'f32' },
  { name: '_padV2b', type: 'f32' },

  // --- Torus periods (offset 880) ---
  { name: 'torusPeriod', type: arr('f32', 3) },
  { name: '_padV2c', type: 'f32' },

  // --- RK4 per-stage simTime offsets (offset 896) ---
  { name: 'stageTimeK1', type: 'f32' },
  { name: 'stageTimeK2', type: 'f32' },
  { name: 'stageTimeK3', type: 'f32' },
  { name: 'stageTimeK4', type: 'f32' },

  // --- Curved-space TDSE v2 Wave 6 visualization (offset 912) ---
  { name: 'showCurvatureOverlay', type: 'u32' },
  { name: 'densityViewMode', type: 'u32' },
  { name: 'curvatureOverlayOpacity', type: 'f32' },
  { name: '_padV2d', type: 'u32' },

  // --- Host-precomputed reciprocal spacing (offset 928) ---
  { name: 'invSpacing', type: arr('f32', 12) },
  { name: 'invSpacing2', type: arr('f32', 12) },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for TDSEUniforms. */
export const TDSE_UNIFORMS_LAYOUT = computeStructLayout(TDSE_UNIFORMS_FIELDS)

// Module-load sanity check: any future WGSL field insertion that breaks
// the documented 1024-byte total surfaces here at first import rather than
// silently corrupting GPU uploads. The dedicated test in
// `tdseUniformsLayout.test.ts` provides the authoritative WGSL parity check.
const TDSE_WGSL_DOCUMENTED_TOTAL = 1024
if (TDSE_UNIFORMS_LAYOUT.totalSize !== TDSE_WGSL_DOCUMENTED_TOTAL) {
  throw new Error(
    `TDSE_UNIFORMS_LAYOUT.totalSize=${TDSE_UNIFORMS_LAYOUT.totalSize} ` +
      `does not match WGSL TDSEUniforms documented size ${TDSE_WGSL_DOCUMENTED_TOTAL}. ` +
      `Update TDSE_UNIFORMS_FIELDS to match the WGSL struct in tdseUniforms.wgsl.ts.`
  )
}
