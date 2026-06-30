/**
 * Strategy for the entire WDW ⊗ ζ visualization suite (ten modes).
 *
 * All ten modes share one strategy, one shader, and one compiled pipeline. Each
 * uploads a compact ζ-LUT (group-2 read-only storage buffer at binding 2) built
 * on the CPU by `buildWdwZetaLut`; the shared `mainWdwZetaVolume` block branches
 * on the `wzModeId` uniform and synthesizes a **live, lit, mode-distinct 3D
 * form** from that LUT — sphere-traced surfaces with normals, rim light,
 * specular, soft shadow and AO, plus emissive ζ accents and relational-time
 * animation. There is no baked image and no 3D texture: switching modes is a
 * tiny LUT re-upload (4 KB), never a pipeline recompile.
 *
 * Emission/glow is the shared `appearanceStore.faceEmission` (Advanced ▸
 * "Emission & Rim") read by the shader as `emissionIntensity`; rotation is the
 * shared `animationStore` turntable applied to the object matrix. This strategy
 * owns neither — there is no bespoke glow uniform and no bespoke spin.
 *
 * @module rendering/webgpu/renderers/strategies/WdwZetaVolumeStrategy
 */

import { WDW_ZETA_LUT_VEC4 } from '@/lib/physics/wdwZeta/lut'
import { getWdwZetaSpec, type WdwZetaConfigHost } from '@/lib/physics/wdwZeta/registry'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../../schrodingerRendererTypes'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from '../types'

/** LUT byte size: WDW_ZETA_LUT_VEC4 × vec4f × 4 bytes (256 × 16 = 4 KB). */
const LUT_BYTES = WDW_ZETA_LUT_VEC4 * 4 * 4

/** Strategy for the WDW ⊗ ζ suite — no compute passes. */
export class WdwZetaVolumeStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The ζ-LUT storage buffer (group 2, binding 2). */
  private lutBuffer: GPUBuffer | null = null

  /** Hash of the last upload (`mode | lutHash`); `null` forces a first-frame upload. */
  private lastLutHash: string | null = null

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Defensively re-assert the structural flags so a stale cached config can
    // never compose the shared-path shader with this strategy's
    // single-storage-buffer bind-group layout.
    shader.isWdwZetaVolume = true
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
    shader.isRiemannZeta = false
    shader.isBifurcationHorizon = false
    shader.isCoherenceHorizon = false
    shader.isHilbertPolya = false
    shader.isModularKnot = false
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.lutBuffer) {
      this.lutBuffer = ctx.device.createBuffer({
        label: 'wdw-zeta-lut',
        size: LUT_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      this.lastLutHash = null
    }
    const buffer = this.lutBuffer
    return {
      initPromises: [],
      additionalLayoutEntries: [
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        },
      ],
      getBindGroupEntries: () => (buffer ? [{ binding: 2, resource: { buffer } }] : []),
    }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    config: SchrodingerRendererConfig
  ): number | null {
    const s = getWdwZetaSpec(config.quantumMode)
    return s ? s.boundingRadius : null
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const buffer = this.lutBuffer
    if (!buffer) return
    const mode = shared.rendererConfig.quantumMode
    const s = getWdwZetaSpec(mode)
    if (!s) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const host = (extended?.schroedinger ?? {}) as WdwZetaConfigHost
    const dimension = shared.rendererConfig.dimension ?? 3

    const hash = `${mode}|${s.lutHash(host, dimension)}`
    if (hash === this.lastLutHash) return

    const lut = s.buildLut(host, dimension)
    shared.device.queue.writeBuffer(buffer, 0, lut as Float32Array<ArrayBuffer>)
    this.lastLutHash = hash
  }

  dispose(): void {
    this.lutBuffer?.destroy()
    this.lutBuffer = null
    this.lastLutHash = null
  }
}
