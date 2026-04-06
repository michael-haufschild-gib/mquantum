/**
 * Shared utilities for compute-grid-based quantum mode strategies.
 *
 * All lattice-based modes (FSF, TDSE, BEC, Dirac, Pauli) share the same
 * bounding radius computation, PML override pattern, density texture binding
 * setup, and simulation state save/load.
 *
 * @module rendering/webgpu/renderers/strategies/computeGridUtils
 */

import { useSimulationStateStore } from '@/stores/simulationStateStore'

import type { WebGPURenderContext } from '../../core/types'
import type { ModeSetupResult } from './types'

/**
 * Compute bounding radius from lattice extent.
 * Uses the maximum extent across all active dimensions (not just 0..2) so that
 * after N-D rotation, the density texture covers the full lattice.
 *
 * @param latticeDim - Number of lattice dimensions
 * @param gridSize - Grid points per dimension
 * @param spacing - Spatial spacing per dimension
 * @returns Raw bounding radius (half-extent × 1.15 margin)
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
  // Fallback: 32 grid points × 0.1 default spacing = 3.2 (matches DEFAULT_FREE_SCALAR_CONFIG)
  if (maxExtent <= 0) maxExtent = 3.2
  // 1.15x margin so the field doesn't fill the entire cube edge-to-edge
  return (maxExtent / 2) * 1.15
}

/**
 * Apply shared PML (perfectly matched layer) absorber overrides.
 * Each mode stores per-mode PML settings, but the shared schroedinger-level
 * absorber controls interact with per-mode settings:
 * - `absorberEnabled`: AND logic — both shared and per-mode must be true.
 *   The shared toggle acts as a master switch; per-mode can additionally disable.
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
    absorberEnabled: (schroedinger?.absorberEnabled ?? true) && (config.absorberEnabled ?? true),
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
  requestStateSave(ctx: WebGPURenderContext): void
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void
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
    simState.clearSaveRequest()
    pass.requestStateSave(ctx)
  }

  if (simState.pendingLoadData) {
    const loadData = simState.pendingLoadData
    if (acceptedModes.includes(loadData.quantumMode)) {
      pass.setLoadedWavefunction(loadData.psiRe, loadData.psiIm)
      simState.clearLoadData()
    }
  }
}
