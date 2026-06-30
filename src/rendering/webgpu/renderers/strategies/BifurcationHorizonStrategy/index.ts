/**
 * Strategy for the Bifurcation Horizon mode (Kruskal eternal black hole on the
 * Riemann critical strip).
 *
 * The mode is fully analytic: the dedicated volumetric main block
 * (`mainBifurcationHorizon.wgsl.ts`) bilinearly samples a 2D `(t, u)` look-up
 * table that this strategy generates on the CPU and uploads as a group-2
 * read-only storage buffer (binding 2). The throat-membrane + ζ-zero-ring +
 * KMS-haze math runs once whenever the LUT-shaping config (offLine /
 * throatWidth / thermalGain / winding) changes — never per frame — so the
 * per-sample shader cost stays a bilinear lookup + a flow shift + an optional
 * extremal redshift. The other knobs (glow, flowRate, swirl, redshiftRadius,
 * neckRadius) are applied by the shader via uniforms.
 *
 * ## Living log-gas (`spectralDynamics`)
 * When `spectralDynamics !== 'static'` the ζ-zero rings come alive as a Coulomb
 * log-gas and the LUT is regenerated + re-uploaded EVERY frame with per-ring
 * centre offsets:
 *
 *   - `softMode` — the rings breathe in the marginal soft mode of the
 *     transverse-rigidity Laplacian M (see {@link bifurcationSoftMode}):
 *     ringOffsets[n] = amplitude·mode[n]·sin(ω·t), ω = rate·√λ₁(M)·C. Because
 *     λ₁(M) → 0 ~ N⁻¹, the breathing is slow and nearly free — the type-II₁
 *     "no-margin" gaplessness made visible.
 *   - `dyson` — a damped Dyson Coulomb-gas relaxation: rings repel via the 1/r
 *     force and relax toward equilibrium without ever crossing (level
 *     repulsion / reality-from-Hermiticity).
 *
 * The `stiffnessTint` knob mixes each ring's amplitude toward its normalised
 * transverse stiffness K_i so stiffer rings glow brighter. The soft-mode
 * analysis is computed once and cached, recomputed only if the ring count
 * changes.
 *
 * @module rendering/webgpu/renderers/strategies/BifurcationHorizonStrategy
 */

import type { BifurcationSpectralDynamics } from '@/lib/geometry/extended/bifurcationHorizon'
import {
  BIFURCATION_DEFAULT_LUT,
  BIFURCATION_NT,
  BIFURCATION_NU,
  BIFURCATION_RING_COUNT,
  bifurcationHorizonBoundingRadius,
  bifurcationRingHeight,
  type BifurcationSoftMode,
  bifurcationSoftMode,
  generateBifurcationLut,
} from '@/lib/physics/bifurcationHorizon'
import { RIEMANN_ZEROS } from '@/lib/physics/riemannZeta'

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

/** LUT byte size: NT × NU × vec4f × 4 bytes. */
const BIFURCATION_LUT_BYTES = BIFURCATION_NT * BIFURCATION_NU * 4 * 4

/**
 * Soft-mode breathing frequency constant. The angular frequency is
 * ω = dynamicsRate · √(max(λ₁, λ₁_floor)) · OMEGA_C. For the default 40-ring
 * spectrum λ₁ ≈ 0.143 in unfolded coords (√λ₁ ≈ 0.378), so OMEGA_C = 6 gives a
 * default-rate breathing period 2π/ω ≈ 2.8 s — a slow, visibly marginal
 * oscillation befitting the nearly free type-II₁ soft mode. The √λ₁ factor ties
 * the breathing speed to the gaplessness: as N grows λ₁ → 0 ~ N⁻¹ and the
 * breathing slows, so the rendering literally shows the mode going marginal.
 */
const SOFT_MODE_OMEGA_C = 6

/** λ₁ floor so a degenerate spectrum still breathes at a finite rate. */
const SOFT_MODE_LAMBDA_FLOOR = 1e-4

/** Maximum Δt the soft mode can push a ring (t-units), at amplitude 1. */
const SOFT_MODE_MAX_DT = 0.6

/** Dyson relaxation: equilibrium-restoring spring constant. */
const DYSON_SPRING = 1.4

/** Dyson relaxation: pairwise Coulomb-force weight w. */
const DYSON_FORCE_WEIGHT = 0.02

/** Dyson relaxation: integration substep cap (s) to keep the explicit step stable. */
const DYSON_MAX_DT = 1 / 30

/**
 * Dyson order-preservation guard: rings may never approach closer than this
 * fraction of their static gap (level repulsion / reality-from-Hermiticity).
 */
const DYSON_MIN_GAP_FRAC = 0.2

/** Strategy for the Bifurcation Horizon volumetric mode — no compute passes. */
export class BifurcationHorizonStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The 2D (t, u) LUT storage buffer (group 2, binding 2). */
  private lutBuffer: GPUBuffer | null = null

  /** Config hash of the last-uploaded LUT (`null` forces a first-frame upload). */
  private lastLutHash: string | null = null

  /** Cached soft-mode analysis; recomputed only when the ring count changes. */
  private softMode: BifurcationSoftMode | null = null

  /** Ring count the cached {@link softMode} / derived arrays were built for. */
  private softModeCount = -1

  /** Static (unfolded) ring centres in t-units — the dyson equilibrium x_n. */
  private ringEquilibrium: Float64Array | null = null

  /** Per-ring normalised stiffness K_i / max(K) (for the stiffness tint). */
  private normStiffness: Float64Array | null = null

  /** Dyson per-ring displacement state Δ_i (t-units). Persisted across frames. */
  private dysonDisplace: Float64Array | null = null

  /** Whether the dyson state has been seeded with its deterministic kick. */
  private dysonSeeded = false

  /** Reusable ringOffsets / ringAmpScale scratch (allocation-light per frame). */
  private ringOffsets: Float64Array | null = null
  private ringAmpScale: Float64Array | null = null

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Bifurcation Horizon shader
    // config; re-assert the structural flags defensively so a stale cached
    // config can never compose the shared-path shader with this strategy's
    // single-storage-buffer bind group layout.
    shader.isBifurcationHorizon = true
    shader.isRiemannZeta = false
    shader.isHilbertPolya = false
    shader.isCoherenceHorizon = false
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.lutBuffer) {
      this.lutBuffer = ctx.device.createBuffer({
        label: 'bifurcation-horizon-lut',
        size: BIFURCATION_LUT_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      // Force a regenerate + upload on the next frame for this buffer.
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
    dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // The spatial extent depends only on the throat-height window (tMax); the
    // per-state config carries no tMax override, so the physics helper uses its
    // default.
    return bifurcationHorizonBoundingRadius(undefined, dimension)
  }

  /**
   * Lazily compute and cache the living-log-gas soft-mode analysis plus the
   * derived per-ring equilibrium centres and normalised stiffness. Recomputed
   * only when the ring count changes (the ζ-zeros are fixed). Allocating the
   * reusable per-frame scratch here keeps the hot path allocation-light.
   */
  private ensureSoftMode(count: number): BifurcationSoftMode {
    if (this.softMode && this.softModeCount === count) return this.softMode

    const sm = bifurcationSoftMode(RIEMANN_ZEROS, count)
    this.softMode = sm
    this.softModeCount = count

    // Static ring centres (t-units) — these are the dyson equilibrium x_n.
    const equilibrium = new Float64Array(count)
    for (let n = 0; n < count; n++) equilibrium[n] = bifurcationRingHeight(RIEMANN_ZEROS[n]!)
    this.ringEquilibrium = equilibrium

    // Normalised transverse stiffness K_i / max(K) for the stiffness tint.
    let maxK = 0
    for (let n = 0; n < count; n++) if (sm.stiffness[n]! > maxK) maxK = sm.stiffness[n]!
    const invMaxK = maxK > 1e-12 ? 1 / maxK : 1
    const normStiff = new Float64Array(count)
    for (let n = 0; n < count; n++) normStiff[n] = sm.stiffness[n]! * invMaxK
    this.normStiffness = normStiff

    this.ringOffsets = new Float64Array(count)
    this.ringAmpScale = new Float64Array(count)
    // Reset the dyson integrator so it re-seeds against the new equilibrium.
    this.dysonDisplace = new Float64Array(count)
    this.dysonSeeded = false
    return sm
  }

  /** Fill ringAmpScale from the stiffness tint: mix(1, normStiff, tint). */
  private applyStiffnessTint(count: number, tint: number): void {
    const amp = this.ringAmpScale!
    const normStiff = this.normStiffness!
    const clampedTint = tint < 0 ? 0 : tint > 1 ? 1 : tint
    for (let n = 0; n < count; n++) {
      amp[n] = 1 + clampedTint * (normStiff[n]! - 1)
    }
  }

  /**
   * Advance the damped Dyson Coulomb-gas relaxation by one frame and write the
   * resulting per-ring Δt into {@link ringOffsets}. Rings repel via the 1/r
   * force and relax toward equilibrium; an order-preserving guard keeps them
   * from ever crossing (level repulsion / reality-from-Hermiticity). The seed
   * is a deterministic index-derived kick — never `Math.random` — so the
   * relaxation is reproducible.
   */
  private stepDyson(count: number, rate: number, amplitude: number, dt: number): void {
    const equilibrium = this.ringEquilibrium!
    const displace = this.dysonDisplace!
    const offsets = this.ringOffsets!

    if (!this.dysonSeeded) {
      // Deterministic, index-derived perturbation (no RNG): a small alternating
      // kick scaled by amplitude so the gas starts off-equilibrium.
      for (let n = 0; n < count; n++) displace[n] = amplitude * 0.15 * Math.sin(n * 1.7)
      this.dysonSeeded = true
    }

    const step = Math.min(dt, DYSON_MAX_DT)
    for (let i = 0; i < count; i++) {
      const xi = equilibrium[i]! + displace[i]!
      let force = 0
      for (let j = 0; j < count; j++) {
        if (j === i) continue
        const xj = equilibrium[j]! + displace[j]!
        const d = xi - xj
        // Coulomb repulsion 1/r (sign points away from neighbours).
        force += DYSON_FORCE_WEIGHT / (d !== 0 ? d : 1e-6)
      }
      // Damped relaxation toward equilibrium.
      const dDelta = rate * step * (force - DYSON_SPRING * displace[i]!)
      displace[i] = displace[i]! + dDelta
    }

    // Order-preservation guard: clamp each displacement so adjacent rings keep
    // at least DYSON_MIN_GAP_FRAC of their static gap. Sweep low→high.
    for (let i = 1; i < count; i++) {
      const gap = equilibrium[i]! - equilibrium[i - 1]!
      const minGap = DYSON_MIN_GAP_FRAC * gap
      const lo = equilibrium[i - 1]! + displace[i - 1]!
      const cur = equilibrium[i]! + displace[i]!
      if (cur - lo < minGap) displace[i] = lo + minGap - equilibrium[i]!
    }

    for (let n = 0; n < count; n++) offsets[n] = displace[n]!
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const buffer = this.lutBuffer
    if (!buffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const cfg = extended?.schroedinger?.bifurcationHorizon
    const defaults = BIFURCATION_DEFAULT_LUT

    const finite = (value: number | undefined, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback

    // Static fields that reshape F(t, u): offLine (ring displacement),
    // throatWidth (membrane width), thermalGain (wedge haze), winding (phase
    // channel). The rest (glow, flowRate, swirl, redshiftRadius, neckRadius)
    // are applied by the shader via uniforms.
    const offLine = finite(cfg?.offLine, 0)
    const throatWidth = finite(cfg?.throatWidth, defaults.throatWidth)
    const thermalGain = finite(cfg?.thermalGain, defaults.thermalGain)
    const winding = finite(cfg?.winding, defaults.winding)

    // Living-log-gas dynamics.
    const dynamics: BifurcationSpectralDynamics = cfg?.spectralDynamics ?? 'static'
    const amplitude = finite(cfg?.dynamicsAmplitude, 0.4)
    const rate = finite(cfg?.dynamicsRate, 1)
    const stiffnessTint = finite(cfg?.stiffnessTint, 0.4)

    if (dynamics === 'static') {
      // Hash-gated regen — no per-frame work when the static knobs are steady.
      const hash = `static|${offLine}|${throatWidth}|${thermalGain}|${winding}`
      if (hash === this.lastLutHash) return
      const lut = generateBifurcationLut({
        ...BIFURCATION_DEFAULT_LUT,
        offLine,
        throatWidth,
        thermalGain,
        winding,
      })
      shared.device.queue.writeBuffer(buffer, 0, lut as Float32Array<ArrayBuffer>)
      this.lastLutHash = hash
      return
    }

    // Dynamic modes: regenerate the FULL LUT every frame with current offsets +
    // amplitude scale, then upload. The ring loop early-continues outside ±5σ,
    // so the cost stays a handful of Gaussians per cell.
    const count = BIFURCATION_RING_COUNT
    const sm = this.ensureSoftMode(count)
    const offsets = this.ringOffsets!

    if (dynamics === 'softMode') {
      const time = ctx.frame?.time ?? 0
      const omega =
        rate * Math.sqrt(Math.max(sm.lambda1, SOFT_MODE_LAMBDA_FLOOR)) * SOFT_MODE_OMEGA_C
      const phase = Math.sin(omega * time)
      // Breathing in the marginal soft mode: ringOffsets[n] ∝ mode[n]·sin(ωt).
      const scale = amplitude * SOFT_MODE_MAX_DT * phase
      for (let n = 0; n < count; n++) offsets[n] = scale * sm.mode[n]!
    } else {
      // dyson
      const dt = ctx.frame?.delta ?? 1 / 60
      this.stepDyson(count, rate, amplitude, dt)
    }

    this.applyStiffnessTint(count, stiffnessTint)

    const lut = generateBifurcationLut({
      ...BIFURCATION_DEFAULT_LUT,
      offLine,
      throatWidth,
      thermalGain,
      winding,
      ringOffsets: offsets,
      ringAmpScale: this.ringAmpScale!,
    })
    shared.device.queue.writeBuffer(buffer, 0, lut as Float32Array<ArrayBuffer>)
    // Force a static-path rebuild when dynamics is next disabled.
    this.lastLutHash = null
  }

  dispose(): void {
    this.lutBuffer?.destroy()
    this.lutBuffer = null
    this.lastLutHash = null
    this.softMode = null
    this.softModeCount = -1
    this.ringEquilibrium = null
    this.normStiffness = null
    this.dysonDisplace = null
    this.dysonSeeded = false
    this.ringOffsets = null
    this.ringAmpScale = null
  }
}
