import {
  HydrogenNDPresetName,
  type PauliConfig,
  type PauliFieldType,
  type PauliFieldView,
  type PauliInitialCondition,
  type PauliPotentialType,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerPresetName,
  SchroedingerQualityPreset,
  SchroedingerQuantumMode,
  SchroedingerRenderStyle,
} from '@/lib/geometry/extended/types'
import type { OpenQuantumVisualizationMode } from '@/lib/physics/openQuantum/types'
import type { AntiDeSitterSetters } from '@/stores/slices/geometry/setters/antiDeSitterSetters'
import type { BecSetters } from '@/stores/slices/geometry/setters/becSetters'
import type { DiracSetters } from '@/stores/slices/geometry/setters/diracSetters'
import type { FreeScalarSetters } from '@/stores/slices/geometry/setters/freeScalarSetters'
import type { QuantumWalkSetters } from '@/stores/slices/geometry/setters/quantumWalkSetters'
import type { TdseSetters } from '@/stores/slices/geometry/setters/tdseSetters'
import type { VisualEffectSetters } from '@/stores/slices/geometry/setters/visualEffectSetters'
import type { WheelerDeWittSetters } from '@/stores/slices/geometry/setters/wheelerDeWittSetters'

// ============================================================================
// Schroedinger Slice
// ============================================================================
/** Read-only state for the Schroedinger quantum configuration. */
export interface SchroedingerSliceState {
  schroedinger: SchroedingerConfig
}

/** Mutation actions for the Schroedinger quantum configuration. */
export interface SchroedingerSliceActions
  extends
    WheelerDeWittSetters,
    AntiDeSitterSetters,
    BecSetters,
    DiracSetters,
    FreeScalarSetters,
    TdseSetters,
    QuantumWalkSetters,
    VisualEffectSetters {
  // Geometry Settings
  setSchroedingerScale: (scale: number) => void

  // Quality Settings
  setSchroedingerQualityPreset: (preset: SchroedingerQualityPreset) => void
  setSchroedingerResolution: (value: number) => void

  // Visualization Axes
  setSchroedingerVisualizationAxes: (axes: [number, number, number]) => void
  setSchroedingerVisualizationAxis: (index: 0 | 1 | 2, dimIndex: number) => void

  // Slice Parameters
  setSchroedingerParameterValue: (dimIndex: number, value: number) => void
  setSchroedingerParameterValues: (values: number[]) => void
  resetSchroedingerParameters: () => void

  // Navigation
  setSchroedingerCenter: (center: number[]) => void
  setSchroedingerExtent: (extent: number) => void
  fitSchroedingerToView: () => void

  // Color Settings
  setSchroedingerColorMode: (mode: SchroedingerColorMode) => void
  setSchroedingerPalette: (palette: SchroedingerPalette) => void
  setSchroedingerCustomPalette: (palette: { start: string; mid: string; end: string }) => void
  setSchroedingerInvertColors: (invert: boolean) => void

  // Rendering Style
  setSchroedingerRenderStyle: (style: SchroedingerRenderStyle) => void

  // Quantum Mode Selection
  setSchroedingerQuantumMode: (mode: SchroedingerQuantumMode) => void
  setSchroedingerRepresentation: (mode: SchroedingerConfig['representation']) => void
  setSchroedingerMomentumDisplayUnits: (units: SchroedingerConfig['momentumDisplayUnits']) => void
  setSchroedingerMomentumScale: (scale: number) => void
  setSchroedingerMomentumHbar: (hbar: number) => void

  // Harmonic Oscillator Configuration
  setSchroedingerPresetName: (name: SchroedingerPresetName) => void
  setSchroedingerSeed: (seed: number) => void
  randomizeSchroedingerSeed: () => void
  setSchroedingerTermCount: (count: number) => void
  setSchroedingerMaxQuantumNumber: (maxN: number) => void
  setSchroedingerFrequencySpread: (spread: number) => void

  // Hydrogen Configuration
  setSchroedingerPrincipalQuantumNumber: (n: number) => void
  setSchroedingerAzimuthalQuantumNumber: (l: number) => void
  setSchroedingerMagneticQuantumNumber: (m: number) => void
  setSchroedingerUseRealOrbitals: (useReal: boolean) => void
  setSchroedingerBohrRadiusScale: (scale: number) => void

  // Hydrogen ND Configuration
  setSchroedingerHydrogenNDPreset: (preset: HydrogenNDPresetName) => void
  setSchroedingerExtraDimQuantumNumber: (dimIndex: number, n: number) => void
  setSchroedingerExtraDimQuantumNumbers: (numbers: number[]) => void
  setSchroedingerAngularChainValue: (chainIndex: number, value: number) => void
  setSchroedingerExtraDimOmega: (dimIndex: number, omega: number) => void
  setSchroedingerExtraDimOmegaAll: (omegas: number[]) => void
  setSchroedingerExtraDimFrequencySpread: (spread: number) => void

  /** Clear needsReset on any schroedinger sub-config (no version bump). */
  clearComputeNeedsReset: (configKey: string) => void
  /** Mark needsReset on any schroedinger sub-config (with version bump). */
  markComputeNeedsReset: (configKey: string) => void

  // Open Quantum System
  setOpenQuantumEnabled: (enabled: boolean) => void
  setOpenQuantumDephasingRate: (rate: number) => void
  setOpenQuantumRelaxationRate: (rate: number) => void
  setOpenQuantumThermalUpRate: (rate: number) => void
  setOpenQuantumDt: (dt: number) => void
  setOpenQuantumSubsteps: (n: number) => void
  setOpenQuantumChannelEnabled: (
    channel: 'dephasing' | 'relaxation' | 'thermal',
    enabled: boolean
  ) => void
  setOpenQuantumVisualizationMode: (mode: OpenQuantumVisualizationMode) => void
  requestOpenQuantumStateReset: () => void
  resetOpenQuantumToDefault: () => void
  setOpenQuantumBathTemperature: (T: number) => void
  setOpenQuantumCouplingScale: (s: number) => void
  setOpenQuantumHydrogenBasisMaxN: (n: number) => void
  setOpenQuantumDephasingModel: (model: 'none' | 'uniform') => void

  // Config Operations
  setSchroedingerConfig: (config: Partial<SchroedingerConfig>) => void
  initializeSchroedingerForDimension: (dimension: number) => void
  /**
   * Lightweight, synchronous lattice-dim sync for the active compute mode.
   * Called from geometryStore.setDimension so every compute mode (TDSE, BEC,
   * Dirac, QW, FSF) sees the new global dimension on the same microtask as
   * the geometry state update, without waiting for the React
   * `useObjectTypeInitialization` hook to fire.
   */
  syncActiveComputeModeLatticeDim: (dimension: number) => void
  getSchroedingerConfig: () => SchroedingerConfig
}

/** Combined Schroedinger state and actions. */
export type SchroedingerSlice = SchroedingerSliceState & SchroedingerSliceActions

// ============================================================================
// Pauli Spinor Slice
// ============================================================================

/** Pauli spinor state — holds the full PauliConfig for 2-component spinor evolution. */
export interface PauliSpinorSliceState {
  pauliSpinor: PauliConfig
}

/** Actions for mutating Pauli spinor configuration (physics, magnetic field, visualization, grid). */
export interface PauliSpinorSliceActions {
  // Physics
  setPauliDt: (dt: number) => void
  setPauliStepsPerFrame: (steps: number) => void
  setPauliHbar: (hbar: number) => void
  setPauliMass: (mass: number) => void

  // Magnetic Field
  setPauliFieldType: (type: PauliFieldType) => void
  setPauliFieldStrength: (strength: number) => void
  setPauliFieldDirection: (direction: [number, number]) => void
  setPauliGradientStrength: (strength: number) => void
  setPauliRotatingFrequency: (frequency: number) => void

  // Initial Spin State
  setPauliInitialSpinDirection: (direction: [number, number]) => void

  // Initial Wavepacket
  setPauliInitialCondition: (condition: PauliInitialCondition) => void
  setPauliPacketCenter: (dimIndex: number, value: number) => void
  setPauliPacketWidth: (width: number) => void
  setPauliPacketMomentum: (dimIndex: number, value: number) => void

  // Scalar Potential
  setPauliPotentialType: (type: PauliPotentialType) => void
  setPauliHarmonicOmega: (omega: number) => void
  setPauliWellDepth: (depth: number) => void
  setPauliWellWidth: (width: number) => void
  setPauliShowPotential: (show: boolean) => void

  // Visualization
  setPauliFieldView: (view: PauliFieldView) => void
  setPauliSpinUpColor: (color: [number, number, number]) => void
  setPauliSpinDownColor: (color: [number, number, number]) => void
  setPauliAutoScale: (autoScale: boolean) => void

  // Grid
  setPauliGridSize: (size: number[]) => void
  setPauliSpacing: (spacing: number[]) => void
  setPauliSlicePosition: (dimIndex: number, value: number) => void

  // Absorber (PML)
  setPauliAbsorberEnabled: (enabled: boolean) => void
  setPauliAbsorberWidth: (width: number) => void
  setPauliPmlTargetReflection: (r: number) => void

  // Diagnostics
  setPauliDiagnosticsEnabled: (enabled: boolean) => void
  setPauliDiagnosticsInterval: (interval: number) => void

  // Slice Animation
  setPauliSliceAnimationEnabled: (enabled: boolean) => void
  setPauliSliceSpeed: (speed: number) => void
  setPauliSliceAmplitude: (amplitude: number) => void

  // Lifecycle
  resetPauliField: () => void
  setPauliConfig: (config: Partial<PauliConfig>) => void
  initializePauliForDimension: (dimension: number) => void
  getPauliConfig: () => PauliConfig
}

/** Combined Pauli spinor slice type (state + actions). */
export type PauliSpinorSlice = PauliSpinorSliceState & PauliSpinorSliceActions

// ============================================================================
// Combined Extended Object Slice
// ============================================================================

/** Combined extended-object slice: Schroedinger + Pauli with version tracking and reset. */
export type ExtendedObjectSlice = SchroedingerSlice &
  PauliSpinorSlice & {
    /** Version counter for schroedinger state changes (dirty-flag tracking) */
    schroedingerVersion: number
    /** Version counter for pauli spinor state changes (dirty-flag tracking) */
    pauliSpinorVersion: number
    /** Manually bump all version counters (used after direct setState calls) */
    bumpAllVersions: () => void
    reset: () => void
  }
