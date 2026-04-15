/**
 * Strategy for the Wheeler–DeWitt (minisuperspace) quantum mode.
 *
 * Unlike TDSE/BEC/Dirac, WdW is solved on the CPU because:
 *   - the grid is modest (default Na=128, Nphi=32 → 128 × 32 × 32 ≈ 131k complex cells)
 *   - the solution is static — recomputed only when config changes
 *   - the output has to be trilinearly resampled into the shared
 *     `DENSITY_GRID_SIZE`³ density texture for the existing raymarcher to consume
 *
 * This strategy owns the density texture directly and re-uploads it via
 * `device.queue.writeTexture` whenever the WdW config hash changes.
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittStrategy
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import { packWdwDensityGrid } from '@/lib/physics/wheelerDeWitt/densityGrid'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'
import {
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbStreamlines,
  type StreamlineOverlay,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { createDensityTexture } from '../../passes/computePassUtils'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../schrodingerRendererTypes'
import { createDensityTextureBindings } from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/**
 * Compute a stable hash of the WdW config fields that affect the solver
 * output. Display-only fields (swamplandEnabled, swamplandC) are excluded.
 */
function computeWdwConfigHash(config: WheelerDeWittConfig): string {
  return [
    config.boundaryCondition,
    config.inflatonMass.toFixed(6),
    config.cosmologicalConstant.toFixed(6),
    config.aMin.toFixed(4),
    config.aMax.toFixed(4),
    config.gridNa,
    config.gridNphi,
    config.phiExtent.toFixed(4),
    config.streamlinesEnabled ? 1 : 0,
    config.streamlineDensity,
  ].join('|')
}

/** Strategy owning a CPU-solved Wheeler–DeWitt density texture. */
export class WheelerDeWittStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private lastConfigHash: string | null = null
  private transferredOut = false

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute-mode overrides are applied by the renderer constructor.
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (this.transferredOut && !this.densityTexture) {
      // Adopted by a successor — stay dormant.
      return { initPromises: [], ...createDensityTextureBindings(ctx.device, null) }
    }
    if (!this.densityTexture) {
      this.densityTexture = createDensityTexture(
        ctx.device,
        'wheeler-dewitt',
        GPUTextureUsage.COPY_DST
      )
      this.densityTextureView = this.densityTexture.createView({
        label: 'wheeler-dewitt-density-view',
        dimension: '3d',
      })
      // Initial write — zero-filled density covering the FULL density texture
      // (`DENSITY_GRID_SIZE`³) so every voxel is defined before the first
      // `executeFrame` runs the solver and overwrites the texture.
      const N = DENSITY_GRID_SIZE
      const bytesPerTexel = 8 // rgba16float
      const zeros = new Uint8Array(N * N * N * bytesPerTexel)
      ctx.device.queue.writeTexture(
        { texture: this.densityTexture },
        zeros,
        { bytesPerRow: N * bytesPerTexel, rowsPerImage: N },
        { width: N, height: N, depthOrArrayLayers: N }
      )
    }
    return {
      initPromises: [],
      ...createDensityTextureBindings(ctx.device, this.densityTextureView),
    }
  }

  computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const wdw = schroedinger.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return null
    // Bounding radius = a_max so the density cube covers the simulated range.
    return Math.max(0.25, wdw.aMax) * 1.05
  }

  executeFrame(ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    if (!this.densityTexture) return
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const wdw = extended?.schroedinger?.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return

    const hash = computeWdwConfigHash(wdw)
    if (hash === this.lastConfigHash && !wdw.needsReset) return

    // Solve the WdW equation on the CPU. Bounded cost at default grid
    // (Na=128, Nphi=32 → 128 × 32 × 32 ≈ 131k complex cells × ~12 FLOPs/cell/step
    // × ~125 leapfrog steps ≈ 200 MFLOPs). Completes in ≈ 10–15 ms on
    // budget hardware; the result is cached behind `lastConfigHash` so the
    // solver only re-runs when WdW physics inputs change.
    const solverOutput = solveWheelerDeWitt({
      boundaryCondition: wdw.boundaryCondition,
      inflatonMass: wdw.inflatonMass,
      cosmologicalConstant: wdw.cosmologicalConstant,
      aMin: wdw.aMin,
      aMax: wdw.aMax,
      gridNa: wdw.gridNa,
      gridNphi: wdw.gridNphi,
      phiExtent: wdw.phiExtent,
    })

    let overlay: StreamlineOverlay | null = null
    if (wdw.streamlinesEnabled) {
      overlay = integrateWkbStreamlines(solverOutput, {
        ...DEFAULT_STREAMLINE_INPUT,
        density: wdw.streamlineDensity,
      })
    }

    const packed = packWdwDensityGrid(solverOutput, overlay)

    ctx.device.queue.writeTexture(
      { texture: this.densityTexture },
      packed.density.buffer,
      {
        offset: packed.density.byteOffset,
        bytesPerRow: packed.bytesPerRow,
        rowsPerImage: packed.rowsPerImage,
      },
      { width: packed.gridSize, height: packed.gridSize, depthOrArrayLayers: packed.gridSize }
    )

    this.lastConfigHash = hash
    if (wdw.needsReset) {
      extended?.clearWdwNeedsReset?.()
    }
  }

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof WheelerDeWittStrategy) || !source.densityTexture) return false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.lastConfigHash = source.lastConfigHash
    source.densityTexture = null
    source.densityTextureView = null
    source.transferredOut = true
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  dispose(): void {
    this.densityTexture?.destroy()
    this.densityTexture = null
    this.densityTextureView = null
  }
}
