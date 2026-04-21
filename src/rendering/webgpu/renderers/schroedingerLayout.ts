/**
 * SchroedingerUniforms struct layout — single source of truth for byte offsets.
 *
 * Field definitions mirror the WGSL `SchroedingerUniforms` struct in
 * `shaders/schroedinger/uniforms.wgsl.ts` exactly. The layout engine
 * computes byte offsets using WGSL alignment rules, eliminating hand-
 * computed magic numbers from the packing code.
 *
 * Validated at test time by parsing the WGSL template literal and
 * comparing field names, types, and computed offsets.
 *
 * @module rendering/webgpu/renderers/schroedingerLayout
 */

import { arr, computeStructLayout, type StructFieldDef } from '../utils/structLayout'

/**
 * Field definitions for the SchroedingerUniforms WGSL struct.
 *
 * Order and types must match `uniforms.wgsl.ts` exactly.
 * Fields starting with `_` are reserved (padding or removed features)
 * and are bulk-zeroed by `zeroReservedFields`.
 */
const SCHROEDINGER_FIELDS = [
  // --- Quantum mode selection (offset 0) ---
  { name: 'quantumMode', type: 'i32' },
  { name: 'termCount', type: 'i32' },
  { name: '_padScalar0', type: 'i32' },
  { name: '_padScalar1', type: 'i32' },

  // --- Packed arrays (offset 16-575) ---
  { name: 'omega', type: arr('vec4f', 3) },
  { name: 'quantum', type: arr('vec4<i32>', 22) },
  { name: 'coeff', type: arr('vec4f', 8) },
  { name: 'energy', type: arr('vec4f', 2) },

  // --- Hydrogen configuration (offset 576) ---
  { name: 'principalN', type: 'i32' },
  { name: 'azimuthalL', type: 'i32' },
  { name: 'magneticM', type: 'i32' },
  { name: 'bohrRadius', type: 'f32' },
  { name: 'useRealOrbitals', type: 'u32' },
  { name: 'hydrogenBoost', type: 'f32' },
  { name: 'hydrogenNDBoost', type: 'f32' },
  { name: 'hydrogenRadialThreshold', type: 'f32' },
  { name: 'extraDimN', type: arr('vec4<i32>', 2) },
  { name: 'extraDimOmega', type: arr('vec4f', 2) },

  // --- Visual / volume rendering (offset 672) ---
  { name: 'phaseAnimationEnabled', type: 'u32' },
  { name: 'timeScale', type: 'f32' },
  { name: 'fieldScale', type: 'f32' },
  { name: 'densityGain', type: 'f32' },
  { name: 'powderScale', type: 'f32' },
  { name: 'emissionIntensity', type: 'f32' },
  { name: 'emissionThreshold', type: 'f32' },
  { name: 'emissionColorShift', type: 'f32' },
  { name: 'peakDensity', type: 'f32' },
  { name: 'densityContrast', type: 'f32' },
  { name: 'scatteringAnisotropy', type: 'f32' },
  { name: 'roughness', type: 'f32' },

  // --- Nodal surfaces ---
  { name: 'nodalEnabled', type: 'u32' },
  { name: 'nodalColor', type: 'vec3f' },
  { name: 'nodalStrength', type: 'f32' },
  { name: '_padEnergy', type: 'u32' },

  // --- Uncertainty boundary (offset 900) ---
  { name: 'uncertaintyBoundaryEnabled', type: 'u32' },
  { name: 'uncertaintyBoundaryStrength', type: 'f32' },

  // --- Animation + isosurface (offset 908) ---
  { name: 'time', type: 'f32' },
  { name: 'isoEnabled', type: 'u32' },
  { name: 'isoThreshold', type: 'f32' },
  { name: 'sampleCount', type: 'i32' },

  // --- Precomputed constants (offset 924) ---
  { name: '_reserved924', type: 'u32' },
  { name: 'hydrogenRadialNorm', type: 'f32' },
  { name: '_reserved932', type: 'f32' },
  { name: '_reserved936', type: 'f32' },

  // --- Color algorithm system (offset 940) ---
  { name: 'colorAlgorithm', type: 'i32' },
  { name: 'distPower', type: 'f32' },
  { name: 'distCycles', type: 'f32' },
  { name: 'distOffset', type: 'f32' },
  { name: 'cosineA', type: 'vec4f' },
  { name: 'cosineB', type: 'vec4f' },
  { name: 'cosineC', type: 'vec4f' },
  { name: 'cosineD', type: 'vec4f' },

  // --- Reserved: formerly fog + erosionHQ (offset 1024) ---
  { name: '_reserved1024', type: 'u32' },
  { name: '_reserved1028', type: 'f32' },
  { name: '_reserved1032', type: 'f32' },
  { name: '_reserved1036', type: 'u32' },

  // --- Bounding radius + phase materiality (offset 1040) ---
  { name: 'boundingRadius', type: 'f32' },
  { name: 'invBoundingRadius', type: 'f32' },
  { name: 'phaseMaterialityEnabled', type: 'u32' },
  { name: 'phaseMaterialityStrength', type: 'f32' },
  { name: 'interferenceEnabled', type: 'u32' },
  { name: 'interferenceAmp', type: 'f32' },
  { name: 'interferenceFreq', type: 'f32' },
  { name: 'interferenceSpeed', type: 'f32' },

  // --- Physical nodal controls (offset 1072) ---
  { name: 'nodalDefinition', type: 'i32' },
  { name: 'nodalTolerance', type: 'f32' },
  { name: 'nodalFamilyFilter', type: 'i32' },
  { name: 'nodalLobeColoringEnabled', type: 'u32' },
  { name: 'nodalColorReal', type: 'vec3f' },
  { name: '_padNodal0', type: 'f32' },
  { name: 'nodalColorImag', type: 'vec3f' },
  { name: '_padNodal1', type: 'f32' },
  { name: 'nodalColorPositive', type: 'vec3f' },
  { name: '_padNodal2', type: 'f32' },
  { name: 'nodalColorNegative', type: 'vec3f' },
  { name: '_padNodal3', type: 'f32' },

  // --- Phase shimmer + uncertainty (offset 1152) ---
  { name: 'phaseShimmerEnabled', type: 'u32' },
  { name: 'phaseShimmerSpeed', type: 'f32' },
  { name: 'phaseShimmerStrength', type: 'f32' },
  { name: 'uncertaintyConfidenceMass', type: 'f32' },
  { name: 'lchLightness', type: 'f32' },
  { name: 'lchChroma', type: 'f32' },
  { name: 'uncertaintyBoundaryWidth', type: 'f32' },
  { name: 'uncertaintyLogRhoThreshold', type: 'f32' },
  { name: 'multiSourceWeights', type: 'vec4f' },

  // --- Nodal render mode (offset 1200) ---
  { name: 'nodalRenderMode', type: 'i32' },
  { name: '_nodalRenderPad0', type: 'i32' },
  { name: '_nodalRenderPad1', type: 'f32' },
  { name: '_nodalRenderPad2', type: 'f32' },

  // --- Cross-section slice (offset 1216) ---
  { name: 'crossSectionEnabled', type: 'u32' },
  { name: 'crossSectionCompositeMode', type: 'i32' },
  { name: 'crossSectionScalar', type: 'i32' },
  { name: 'crossSectionAutoWindow', type: 'u32' },
  { name: 'crossSectionPlane', type: 'vec4f' },
  { name: 'crossSectionWindow', type: 'vec4f' },
  { name: 'crossSectionPlaneColor', type: 'vec4f' },

  // --- Physical probability current (offset 1280) ---
  { name: 'probabilityCurrentEnabled', type: 'u32' },
  { name: 'probabilityCurrentStyle', type: 'i32' },
  { name: 'probabilityCurrentPlacement', type: 'i32' },
  { name: 'probabilityCurrentColorMode', type: 'i32' },
  { name: 'probabilityCurrentScale', type: 'f32' },
  { name: 'probabilityCurrentSpeed', type: 'f32' },
  { name: 'probabilityCurrentDensityThreshold', type: 'f32' },
  { name: 'probabilityCurrentMagnitudeThreshold', type: 'f32' },
  { name: 'probabilityCurrentLineDensity', type: 'f32' },
  { name: 'probabilityCurrentStepSize', type: 'f32' },
  { name: 'probabilityCurrentSteps', type: 'i32' },
  { name: 'probabilityCurrentOpacity', type: 'f32' },

  // --- Momentum-space representation (offset 1328) ---
  { name: 'representationMode', type: 'i32' },
  { name: 'momentumDisplayMode', type: 'i32' },
  { name: 'momentumScale', type: 'f32' },
  { name: 'momentumHbar', type: 'f32' },

  // --- Radial probability overlay (offset 1344) ---
  { name: 'radialProbabilityEnabled', type: 'u32' },
  { name: 'radialProbabilityOpacity', type: 'f32' },
  { name: 'radialProbabilityNorm', type: 'f32' },
  { name: '_padRadialProb0', type: 'f32' },
  { name: 'radialProbabilityColor', type: 'vec3f' },
  { name: '_padRadialProb1', type: 'f32' },

  // --- Domain coloring (offset 1376) ---
  { name: 'domainColoringParams0', type: 'vec4f' },
  { name: 'domainColoringParams1', type: 'vec4f' },

  // --- Diverging palettes (offset 1408) ---
  { name: 'divergingNeutralParams', type: 'vec4f' },
  { name: 'divergingPositiveParams', type: 'vec4f' },
  { name: 'divergingNegativeParams', type: 'vec4f' },

  // --- Wigner phase-space (offset 1456) ---
  { name: 'wignerDimensionIndex', type: 'i32' },
  { name: 'wignerCrossTermsEnabled', type: 'u32' },
  { name: 'wignerXRange', type: 'f32' },
  { name: 'wignerPRange', type: 'f32' },
  { name: 'wignerQuadPoints', type: 'i32' },
  { name: '_padWigner0', type: 'f32' },
  { name: '_padWigner1', type: 'f32' },

  // --- Pauli spinor colors (offset 1488) ---
  { name: 'pauliSpinUpColor', type: 'vec3f' },
  { name: '_padPauliUp', type: 'f32' },
  { name: 'pauliSpinDownColor', type: 'vec3f' },
  { name: '_padPauliDown', type: 'f32' },

  // --- Precomputed hyperspherical-layer norms for coupled hydrogen ND (offset 1520) ---
  // Eliminates redundant log/exp/gamma calls that are constant per quantum state.
  // Slot [0].x reserved; layer k packed at slot k+1 (up to 11 layers).
  { name: 'coupledNorms', type: arr('vec4f', 3) },

  // --- Decoherent branching visualization colors ---
  { name: 'branchColorA', type: 'vec3f' },
  { name: 'branchSeparation', type: 'f32' },
  { name: 'branchColorB', type: 'vec3f' },
  // Branch plane position in world-space (for fragment-shader branch fraction computation).
  // Moved from compute shader density texture alpha encoding to avoid a Metal shader
  // compiler bug on Apple Silicon that corrupted texture sampling.
  { name: 'branchPlaneThreshold', type: 'f32' },
  { name: 'branchTransitionWidth', type: 'f32' },
  { name: '_padBranch', type: 'vec3f' },

  // --- Wheeler–DeWitt render-only effects (offset 1628) ---
  // Phase rotation rate (rad/unit-time). 0 disables visually; non-WdW modes always write 0.
  { name: 'wdwPhaseRotationRate', type: 'f32' },

  // --- Anti-de Sitter render-time time evolution (offset 1632) ---
  // Energy E used to rotate the stored spatial phase as -E*t. Written only when
  // the active quantum mode is antiDeSitter AND the state is above the BF
  // bound (stable). 0 for all other modes and for tachyonic states.
  { name: 'adsEnergy', type: 'f32' },
  // Tachyon growth rate γ. Written only when the active mode is antiDeSitter
  // AND the state is below the BF bound (tachyonic). The shader multiplies |ψ|²
  // by cosh²(γ*t) at render time. 0 otherwise.
  { name: 'adsGrowthRate', type: 'f32' },
] as const satisfies readonly StructFieldDef[]

/** Computed struct layout for SchroedingerUniforms. */
export const SCHROEDINGER_LAYOUT = computeStructLayout(SCHROEDINGER_FIELDS)

/** Total byte size of the SchroedingerUniforms GPU buffer (derived from layout). */
export const SCHROEDINGER_UNIFORM_SIZE = SCHROEDINGER_LAYOUT.totalSize
