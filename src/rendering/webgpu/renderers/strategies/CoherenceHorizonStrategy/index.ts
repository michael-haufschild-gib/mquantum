/**
 * Strategy for the Coherence Horizon mode (coherence-sourced gravity).
 *
 * The mode is fully analytic and self-contained: the dedicated geodesic main
 * block (`mainCoherenceHorizon.wgsl.ts`) evaluates the cat-state density and
 * traces null Tangherlini geodesics inline, so this strategy owns *no* compute
 * passes, caches, or extra bind group entries. Its only physics duty is the
 * bounding radius: the volume must contain the cat cloud and the
 * strong-lensing region around the coherence-sourced horizon.
 *
 * @module rendering/webgpu/renderers/strategies/CoherenceHorizonStrategy
 */

import { DEFAULT_COHERENCE_HORIZON_CONFIG } from '@/lib/geometry/extended/coherenceHorizon'
import { coherenceHorizonBoundingRadius } from '@/lib/physics/coherenceHorizon'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../../schrodingerRendererTypes'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from '../types'

/** Strategy for the Coherence Horizon geodesic mode — no compute passes. */
export class CoherenceHorizonStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Coherence Horizon shader
    // config; re-assert the structural flags defensively so a stale cached
    // config can never compose the shared-path shader with this strategy's
    // empty bind group layout.
    shader.isCoherenceHorizon = true
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
  }

  setup(_ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    return {
      initPromises: [],
      additionalLayoutEntries: [],
      getBindGroupEntries: () => [],
    }
  }

  computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const cfg = schroedinger?.coherenceHorizon
    const defaults = DEFAULT_COHERENCE_HORIZON_CONFIG
    return coherenceHorizonBoundingRadius(
      {
        decoherence: typeof cfg?.decoherence === 'number' ? cfg.decoherence : defaults.decoherence,
        separation: typeof cfg?.separation === 'number' ? cfg.separation : defaults.separation,
        width: typeof cfg?.width === 'number' ? cfg.width : defaults.width,
        horizonScale:
          typeof cfg?.horizonScale === 'number' ? cfg.horizonScale : defaults.horizonScale,
      },
      dimension
    )
  }

  executeFrame(_ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    // No compute passes — the geodesic march lives entirely in the fragment shader.
  }

  dispose(): void {
    // No GPU resources owned.
  }
}
