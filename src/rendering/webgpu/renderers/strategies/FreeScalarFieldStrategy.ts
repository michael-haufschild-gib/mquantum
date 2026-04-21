/**
 * Strategy for Free Scalar Field (Klein-Gordon lattice) quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { FreeScalarFieldComputePass } from '../../passes/FreeScalarFieldComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
  isFreeScalarAnalysisAlgorithm,
} from '../schrodingerRendererTypes'
import {
  applySharedPml,
  computeLatticeBoundingRadius,
  createDensityTextureBindings,
  handleSimulationStateIO,
} from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Strategy for the free scalar quantum field mode using k-space compute dispatch. */
export class FreeScalarFieldStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private freeScalarFieldPass: FreeScalarFieldComputePass | null = null

  // FSF diagnostic: throttled per-second state reporting
  private _fsfDiagLastTime = 0
  private _fsfDiagLastCamDist = -1
  private _fsfDiagLastCanvasW = -1
  private _fsfDiagLastCanvasH = -1

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides are applied by the renderer constructor's isComputeMode path
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    // If compute state was already adopted from a predecessor, reuse it.
    if (!this.freeScalarFieldPass) {
      this.freeScalarFieldPass = new FreeScalarFieldComputePass(config.densityGridResolution)
      this.freeScalarFieldPass.initializeDensityTexture(ctx.device)
    }

    const densityTextureView = this.freeScalarFieldPass.getDensityTextureView() ?? null
    const bindings = createDensityTextureBindings(ctx.device, densityTextureView)

    // Analysis texture for educational color modes (binding 6)
    const freeScalarAnalysis = isFreeScalarAnalysisAlgorithm(config.colorAlgorithm)
    if (freeScalarAnalysis) {
      const analysisTextureView = this.freeScalarFieldPass.getAnalysisTextureView() ?? null
      if (analysisTextureView) {
        bindings.additionalLayoutEntries.push({
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        })
      }
    }

    // Pre-computed gradient normal texture (binding 7) — replaces 6 per-step
    // fragment texture fetches with 1 lookup (saves ~0.4-1.6ms/frame at Retina).
    // Always declare in layout: getBindGroupEntries() always emits binding 7
    // (falling back to densityTextureView when normals aren't ready yet).
    bindings.additionalLayoutEntries.push({
      binding: 7,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
    })

    const fsfRef = this.freeScalarFieldPass
    const baseGetEntries = bindings.getBindGroupEntries

    return {
      initPromises: [],
      additionalLayoutEntries: bindings.additionalLayoutEntries,
      getBindGroupEntries: () => {
        const entries = baseGetEntries()
        if (freeScalarAnalysis && fsfRef) {
          const analysisView = fsfRef.getAnalysisTextureView()
          if (analysisView) {
            entries.push({ binding: 6, resource: analysisView })
          }
        }
        // Normal grid: use pre-computed normals if available, fall back to
        // density view to avoid bind group layout/entry count mismatch.
        // Layout always declares binding 7, so we must always emit it.
        const view7 = fsfRef?.getNormalTextureView() ?? densityTextureView
        if (view7) {
          entries.push({ binding: 7, resource: view7 })
        } else {
          logger.warn('[FreeScalarFieldStrategy] No texture view for binding 7 — layout mismatch')
        }
        return entries
      },
    }
  }

  computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const fs = schroedinger.freeScalar
    if (!fs) return null
    return computeLatticeBoundingRadius(
      fs.latticeDim ?? 3,
      fs.gridSize ?? [32],
      fs.spacing ?? [0.1]
    )
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const freeScalarPass = this.freeScalarFieldPass
    if (!freeScalarPass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const freeScalarConfig = extended?.schroedinger?.freeScalar
    const isPlaying = animation?.isPlaying ?? false
    const fsfSpeed = animation?.speed ?? 1.0

    if (!freeScalarConfig) return

    const schroedinger = extended?.schroedinger
    const fsWithSharedPml = applySharedPml(freeScalarConfig, schroedinger)

    // Queue save/load BEFORE executeField so pendingInjection and
    // pendingLoadedSimEta are in place when the pass checks needsReset and
    // runs initializeField. Running IO after executeField leaves the loaded
    // buffers on the pass with no reset flag to consume them on the next
    // frame — the field silently keeps whatever vacuum data the reinit
    // sampled. See freeScalarField.md cosmology notes.
    handleSimulationStateIO(ctx, freeScalarPass, ['freeScalarField'])

    freeScalarPass.executeField(
      ctx,
      fsWithSharedPml,
      isPlaying,
      fsfSpeed,
      schroedinger?.basisX as Float32Array | undefined,
      schroedinger?.basisY as Float32Array | undefined,
      schroedinger?.basisZ as Float32Array | undefined,
      shared.boundingRadius,
      shared.colorAlgorithm
    )

    // Clear needsReset after processing
    if (freeScalarConfig.needsReset) {
      extended?.clearFreeScalarNeedsReset?.()
    }

    // FSF diagnostic: log state changes once per second (dev only)
    if (import.meta.env.DEV) {
      const now = performance.now()
      if (now - this._fsfDiagLastTime > 1000) {
        this._fsfDiagLastTime = now
        const camera = getStoreSnapshot<import('../schrodingerRendererTypes').CameraSnapshot>(
          ctx,
          'camera'
        )
        const camPos = camera?.position
        const camDist = camPos
          ? Math.sqrt(camPos.x * camPos.x + camPos.y * camPos.y + camPos.z * camPos.z)
          : -1
        const canvasW = ctx.size.width
        const canvasH = ctx.size.height
        const camChanged = Math.abs(camDist - this._fsfDiagLastCamDist) > 0.01
        const sizeChanged =
          canvasW !== this._fsfDiagLastCanvasW || canvasH !== this._fsfDiagLastCanvasH
        if (camChanged || sizeChanged) {
          logger.log(
            `[FSF-DIAG] cam=${camDist.toFixed(2)} canvas=${canvasW}x${canvasH}` +
              ` bound=${shared.boundingRadius.toFixed(2)}` +
              ` hash=${freeScalarPass.getConfigHash()}` +
              ` maxPhi=${freeScalarPass.getMaxFieldValue().toFixed(4)}` +
              ` dim=${freeScalarConfig.latticeDim} grid=${freeScalarConfig.gridSize}`
          )
          this._fsfDiagLastCamDist = camDist
          this._fsfDiagLastCanvasW = canvasW
          this._fsfDiagLastCanvasH = canvasH
        }
      }
    }
  }

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof FreeScalarFieldStrategy) || !source.freeScalarFieldPass) return false
    this.freeScalarFieldPass?.dispose()
    this.freeScalarFieldPass = source.freeScalarFieldPass
    source.freeScalarFieldPass = null
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.freeScalarFieldPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.freeScalarFieldPass?.dispose()
    this.freeScalarFieldPass = null
  }
}
