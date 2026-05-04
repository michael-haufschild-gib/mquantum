/**
 * Shared utilities for compute-grid-based quantum mode strategies.
 *
 * All lattice-based modes (FSF, TDSE, BEC, Dirac, Pauli) share the same
 * bounding radius computation, PML override pattern, density texture binding
 * setup, and simulation state save/load.
 *
 * @module rendering/webgpu/renderers/strategies/computeGridUtils
 */

import { logger } from '@/lib/logger'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

import type { WebGPURenderContext } from '../../core/types'
import type { ModeSetupResult } from './types'

/**
 * Fallback lattice extent when every active dimension's `gridSize × spacing`
 * is zero or missing. Matches the canonical `DEFAULT_FREE_SCALAR_CONFIG`
 * (32 grid points × 0.1 spacing per axis), so a strategy that mounts
 * before its config has populated still produces a sane bounding radius.
 */
export const FALLBACK_LATTICE_EXTENT = 3.2

/**
 * Margin multiplier applied to the half-extent when sizing the bounding
 * cube. 1.15 keeps a ~7.5% breathing room on each side so the wavefunction
 * isn't clamped hard against the cube edge under N-D rotation.
 */
export const LATTICE_BOUNDING_MARGIN = 1.15

/**
 * Compute bounding radius from lattice extent.
 * Uses the maximum extent across all active dimensions (not just 0..2) so that
 * after N-D rotation, the density texture covers the full lattice.
 *
 * @param latticeDim - Number of lattice dimensions
 * @param gridSize - Grid points per dimension
 * @param spacing - Spatial spacing per dimension
 * @returns Raw bounding radius (half-extent × {@link LATTICE_BOUNDING_MARGIN})
 */
export function computeLatticeBoundingRadius(
  latticeDim: number,
  gridSize: number[],
  spacing: number[]
): number {
  let maxExtent = 0
  for (let d = 0; d < latticeDim; d++) {
    const Ld = (gridSize[d] ?? 32) * (spacing[d] ?? 0.1)
    if (Ld > maxExtent) maxExtent = Ld
  }
  if (maxExtent <= 0) maxExtent = FALLBACK_LATTICE_EXTENT
  return (maxExtent / 2) * LATTICE_BOUNDING_MARGIN
}

/**
 * Apply shared PML (perfectly matched layer) absorber overrides.
 * Each mode stores per-mode PML settings, but the shared schroedinger-level
 * absorber controls interact with per-mode settings via nullish-coalescing:
 * - `absorberEnabled`: shared overrides per-mode (fallback to per-mode, then true).
 *   Priority: `schroedinger.absorberEnabled ?? config.absorberEnabled ?? true`.
 * - `absorberWidth`, `pmlTargetReflection`: shared overrides per-mode (fallback).
 *
 * @param config - Mode-specific config object
 * @param schroedinger - Parent schroedinger store snapshot
 * @returns Config with shared PML values merged into per-mode values
 */
export function applySharedPml<
  T extends {
    absorberEnabled?: boolean
    absorberWidth?: number
    pmlTargetReflection?: number
  },
>(
  config: T,
  schroedinger:
    | {
        absorberEnabled?: boolean
        absorberWidth?: number
        pmlTargetReflection?: number
      }
    | undefined
): T {
  return {
    ...config,
    absorberEnabled: schroedinger?.absorberEnabled ?? config.absorberEnabled ?? true,
    absorberWidth: schroedinger?.absorberWidth ?? config.absorberWidth,
    pmlTargetReflection: schroedinger?.pmlTargetReflection ?? config.pmlTargetReflection,
  }
}

// ---------------------------------------------------------------------------
// Density texture binding setup (shared by all compute strategies)
// ---------------------------------------------------------------------------

/**
 * Create the standard density texture bind group layout entries and bind group
 * entries for compute-mode strategies.
 *
 * All compute strategies bind a 3D density texture (binding 4) and a linear
 * sampler (binding 5) to the object bind group. This helper encapsulates that
 * boilerplate.
 *
 * @param device - GPU device for sampler creation
 * @param densityTextureView - 3D density texture view (or null if not ready)
 * @returns Partial ModeSetupResult with layout entries and bind group entry getter
 */
export function createDensityTextureBindings(
  device: GPUDevice,
  densityTextureView: GPUTextureView | null
): Pick<ModeSetupResult, 'additionalLayoutEntries' | 'getBindGroupEntries'> {
  const additionalLayoutEntries: GPUBindGroupLayoutEntry[] = []

  const sampler = densityTextureView
    ? device.createSampler({
        label: 'density-grid-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
      })
    : null

  if (densityTextureView) {
    additionalLayoutEntries.push(
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
      },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' as const },
      }
    )
  }

  return {
    additionalLayoutEntries,
    getBindGroupEntries: () => {
      if (!densityTextureView || !sampler) return []
      logger.log(
        `[computeGridUtils] bind density view=${densityTextureView.label ?? 'unlabeled-view'}`
      )
      return [
        { binding: 4, resource: densityTextureView },
        { binding: 5, resource: sampler },
      ]
    },
  }
}

// ---------------------------------------------------------------------------
// Simulation state save/load (shared by all compute strategies)
// ---------------------------------------------------------------------------

/** Minimal interface for compute passes that support state save/load. */
export interface StateSaveLoadPass {
  /**
   * Schedule an async state save. Returns `true` when the readback was
   * scheduled, `false` when a previous save (or, for modes that share the
   * `saveMappingInFlight` flag with slice capture, a previous slice
   * readback) is still in flight. Callers must defer clearing the
   * pending-save request flag until this returns `true`.
   */
  requestStateSave(ctx: WebGPURenderContext): boolean
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void
  /**
   * Optional: restore mode-specific runtime scalars (e.g. the Free Scalar
   * Field cosmological simulation time `simEta`) from a loaded save file.
   * Passes that don't need runtime state should leave this undefined.
   */
  setLoadedRuntimeSimEta?(eta: number): void
  /**
   * Optional: restore mode-specific preheating drive state (the reference
   * time anchor and the Minkowski-path clock counter) from a loaded save
   * file. Consumed alongside `setLoadedRuntimeSimEta` so the time-dependent
   * Hamiltonian resumes in phase with the saved phi/pi buffers.
   */
  setLoadedRuntimePreheatingState?(referenceEta: number, time: number): void
}

/**
 * Handle simulation state save/load for a compute mode strategy.
 *
 * All compute strategies share this identical pattern: check if save is
 * requested, check if load data is pending for the given mode(s), and
 * dispatch to the compute pass.
 *
 * @param ctx - Render context (passed to requestStateSave)
 * @param pass - Compute pass with save/load methods
 * @param acceptedModes - Quantum mode names this strategy handles
 */
export function handleSimulationStateIO(
  ctx: WebGPURenderContext,
  pass: StateSaveLoadPass,
  acceptedModes: string[]
): void {
  const simState = useSimulationStateStore.getState()

  if (simState.saveRequested) {
    // Only clear the request once the save has actually been scheduled.
    // `requestStateSave` returns `false` when a previous save (or slice
    // readback that shares the in-flight flag) is still mapping; in that
    // case the request must persist so the next frame can retry instead
    // of silently dropping the user's "Save State" click.
    const scheduled = pass.requestStateSave(ctx)
    if (scheduled) simState.clearSaveRequest()
  }

  if (simState.pendingLoadData) {
    const loadData = simState.pendingLoadData
    if (acceptedModes.includes(loadData.quantumMode)) {
      pass.setLoadedWavefunction(loadData.psiRe, loadData.psiIm)
      // Restore mode-specific runtime state (currently just FSF: simEta +
      // preheating drive clocks).
      const savedSimEta = loadData.runtimeMeta?.simEta
      if (
        typeof savedSimEta === 'number' &&
        Number.isFinite(savedSimEta) &&
        pass.setLoadedRuntimeSimEta
      ) {
        pass.setLoadedRuntimeSimEta(savedSimEta)
      }
      // Restore the preheating drive state so the Mathieu modulation
      // `1 + A·sin(Ω·(clock − ref))` resumes at the exact phase the save
      // was taken. Pre-preheating saves lack both fields, in which case
      // the pass falls back to its reset-time phase-0 anchor.
      const savedRefEta = loadData.runtimeMeta?.preheatingReferenceEta
      const savedPreheatingTime = loadData.runtimeMeta?.preheatingTime
      if (
        typeof savedRefEta === 'number' &&
        typeof savedPreheatingTime === 'number' &&
        Number.isFinite(savedRefEta) &&
        Number.isFinite(savedPreheatingTime) &&
        pass.setLoadedRuntimePreheatingState
      ) {
        pass.setLoadedRuntimePreheatingState(savedRefEta, savedPreheatingTime)
      }
      simState.clearLoadData()
    }
  }
}
