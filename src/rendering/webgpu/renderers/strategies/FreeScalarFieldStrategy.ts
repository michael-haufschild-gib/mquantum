/**
 * Strategy for Free Scalar Field (Klein-Gordon lattice) quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/FreeScalarFieldStrategy
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/freeScalar'
import { logger } from '@/lib/logger'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { FreeScalarFieldComputePass } from '../../passes/FreeScalarFieldComputePass'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
  isFreeScalarAnalysisAlgorithm,
} from '../schrodingerRendererTypes'
import { computeLatticeBoundingRadius, type createDensityTextureBindings } from './computeGridUtils'
import { SinglePassComputeStrategy, type SinglePassFrameArgs } from './SinglePassComputeStrategy'
import type { SchroedingerSnapshot } from './types'

/** Strategy for the free scalar quantum field mode using k-space compute dispatch. */
export class FreeScalarFieldStrategy extends SinglePassComputeStrategy<
  FreeScalarFieldComputePass,
  FreeScalarConfig
> {
  // FSF diagnostic: throttled per-second state reporting
  private _fsfDiagLastTime = 0
  private _fsfDiagLastCamDist = -1
  private _fsfDiagLastCanvasW = -1
  private _fsfDiagLastCanvasH = -1

  protected override stateIOOrder: 'before' | 'after' = 'before'

  protected createPass(densityGridResolution: number): FreeScalarFieldComputePass {
    return new FreeScalarFieldComputePass(densityGridResolution)
  }

  protected getConfig(extended: ExtendedStoreSnapshot | undefined): FreeScalarConfig | undefined {
    return extended?.schroedinger?.freeScalar as FreeScalarConfig | undefined
  }

  protected get stateIOModeKeys(): string[] {
    return ['freeScalarField']
  }

  protected get configSubKey(): string {
    return 'freeScalar'
  }

  override computeBoundingRadius(
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

  protected override augmentSetup(
    ctx: WebGPUSetupContext,
    config: SchrodingerRendererConfig,
    bindings: ReturnType<typeof createDensityTextureBindings>
  ): ReturnType<typeof createDensityTextureBindings> {
    void ctx
    const fsfRef = this.pass
    const densityTextureView = fsfRef?.getDensityTextureView() ?? null

    // Analysis texture for educational color modes (binding 6)
    const freeScalarAnalysis = isFreeScalarAnalysisAlgorithm(config.colorAlgorithm)
    if (freeScalarAnalysis) {
      const analysisTextureView = fsfRef?.getAnalysisTextureView() ?? null
      if (analysisTextureView) {
        bindings.additionalLayoutEntries.push({
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        })
      }
    }

    // Pre-computed gradient normal texture (binding 7) — replaces 6
    // per-step fragment texture fetches with 1 lookup (saves ~0.4-1.6ms /
    // frame at Retina). Always declare in layout: getBindGroupEntries()
    // always emits binding 7 (falling back to densityTextureView when
    // normals aren't ready yet).
    bindings.additionalLayoutEntries.push({
      binding: 7,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
    })

    const baseGetEntries = bindings.getBindGroupEntries

    return {
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

  protected executePass(
    pass: FreeScalarFieldComputePass,
    ctx: WebGPURenderContext,
    config: FreeScalarConfig,
    args: SinglePassFrameArgs
  ): void {
    pass.executeField(
      ctx,
      config,
      args.isPlaying,
      args.speed,
      args.basisX,
      args.basisY,
      args.basisZ,
      args.boundingRadius,
      args.colorAlgorithm
    )
  }

  protected override afterExecute(
    ctx: WebGPURenderContext,
    pass: FreeScalarFieldComputePass,
    config: FreeScalarConfig,
    args: SinglePassFrameArgs
  ): void {
    // FSF diagnostic: log state changes once per second (dev only)
    if (!import.meta.env.DEV) return
    const now = performance.now()
    if (now - this._fsfDiagLastTime <= 1000) return
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
    const sizeChanged = canvasW !== this._fsfDiagLastCanvasW || canvasH !== this._fsfDiagLastCanvasH
    if (!camChanged && !sizeChanged) return
    logger.log(
      `[FSF-DIAG] cam=${camDist.toFixed(2)} canvas=${canvasW}x${canvasH}` +
        ` bound=${args.boundingRadius.toFixed(2)}` +
        ` hash=${pass.getConfigHash()}` +
        ` maxPhi=${pass.getMaxFieldValue().toFixed(4)}` +
        ` dim=${config.latticeDim} grid=${config.gridSize}`
    )
    this._fsfDiagLastCamDist = camDist
    this._fsfDiagLastCanvasW = canvasW
    this._fsfDiagLastCanvasH = canvasH
  }
}
