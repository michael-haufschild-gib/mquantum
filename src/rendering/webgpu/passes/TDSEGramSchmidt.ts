/**
 * TDSE Gram-Schmidt Orthogonalization — Eigenstate Management
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 * Contains eigenstate buffer storage, GS uniform setup, and dispatch logic.
 *
 * @module rendering/webgpu/passes/TDSEGramSchmidt
 */

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { DEFAULT_ORBIT_CONFIG, generateOrbitsAtEnergy } from '@/lib/physics/tdse/classicalOrbit'
import { computeScarCorrelation } from '@/lib/physics/tdse/scarMetric'

import type { WebGPURenderContext } from '../core/types'
import { LINEAR_WG } from './computePassUtils'
import type { TdsePipelineResult } from './TDSEComputePassPipelineTypes'

/** Dispatch function interface for compute passes. */
export type DispatchComputeFn = (
  passEncoder: GPUComputePassEncoder,
  pipeline: GPUComputePipeline,
  bindGroups: GPUBindGroup[],
  wgX: number,
  wgY?: number,
  wgZ?: number
) => void

/** Maximum number of stored eigenstates for Gram-Schmidt orthogonalization */
export const MAX_STORED_EIGENSTATES = 32

/** GSReduceUniforms struct size (16 bytes: totalElements, numWorkgroups, pad, pad) */
const GS_UNIFORM_SIZE = 16

/**
 * Eigenstate GPU buffer with cached norm and diagnostics.
 * Stored as a single `array<vec2f>` (8 bytes/site, .x=Re, .y=Im) to match
 * the merged TDSE psi layout — the gramSchmidt reduce/subtract shaders
 * read both ψ and the stored eigenstate as vec2f.
 */
export interface EigenstateBuffers {
  /** Merged ψ buffer for this stored eigenstate (vec2f, totalSites * 8 bytes). */
  psi: GPUBuffer
  /** ⟨φ|φ⟩ at storage time (from renormalization targetNorm) */
  normSquared: number
  /** Eigenstate energy ⟨H⟩ at storage time (NaN if observables were disabled) */
  energy: number
  /** Inverse participation ratio Σ|ψ|⁴ / (Σ|ψ|²)² — higher = more localized */
  ipr: number
}

/** Mutable state shared between GS functions and the TDSE pass. */
export interface GramSchmidtState {
  gsEigenstates: EigenstateBuffers[]
  gsUniformBuffer: GPUBuffer | null
  gsPartialReBuffer: GPUBuffer | null
  gsPartialImBuffer: GPUBuffer | null
  gsResultBuffer: GPUBuffer | null
  gsNumWorkgroups: number
  /** totalSites used to size the currently allocated GS infrastructure buffers. */
  gsBufferTotalSites: number
  /** Merged ψ buffer (array<vec2f>) — see TDSEComputePassResources. */
  psiBuffer: GPUBuffer | null
  totalSites: number
  pl: TdsePipelineResult | null
  /**
   * Monotonic generation counter incremented on every {@link clearEigenstates}.
   * Async eigenstate-diagnostic readbacks captured at store time check this
   * counter before applying their result so a clear+re-store sequence cannot
   * let the OLD eigenstate's IPR/orbit-correlation overwrite the NEW
   * eigenstate's slot in the diagnostics store.
   */
  eigenstateGeneration: number
}

/**
 * Create GS uniform + partial + result buffers if not yet created.
 */
export function ensureGSBuffers(device: GPUDevice, state: GramSchmidtState): void {
  const totalSites =
    Number.isFinite(state.totalSites) && state.totalSites > 0 ? Math.floor(state.totalSites) : 0
  if (state.gsUniformBuffer && state.gsBufferTotalSites === totalSites) return
  if (
    state.gsUniformBuffer ||
    state.gsPartialReBuffer ||
    state.gsPartialImBuffer ||
    state.gsResultBuffer
  ) {
    destroyGSBuffers(state)
  }

  const wgCount = Math.max(1, Math.ceil(totalSites / 256))
  state.gsNumWorkgroups = wgCount
  state.gsBufferTotalSites = totalSites

  state.gsUniformBuffer = device.createBuffer({
    label: 'gs-uniform',
    size: GS_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  state.gsPartialReBuffer = device.createBuffer({
    label: 'gs-partial-re',
    size: Math.max(4, wgCount * 4),
    usage: GPUBufferUsage.STORAGE,
  })
  state.gsPartialImBuffer = device.createBuffer({
    label: 'gs-partial-im',
    size: Math.max(4, wgCount * 4),
    usage: GPUBufferUsage.STORAGE,
  })
  state.gsResultBuffer = device.createBuffer({
    label: 'gs-result',
    size: 8,
    usage: GPUBufferUsage.STORAGE,
  })
}

/**
 * Copy the current wavefunction into eigenstate storage.
 *
 * Also initiates an async GPU readback to compute the inverse participation
 * ratio (IPR = Σ|ψ|⁴ / (Σ|ψ|²)²) and updates the eigenstate entry when done.
 *
 * @param energy - Eigenstate energy ⟨H⟩ from the observables store (NaN if unavailable)
 * @param tdseConfig - TDSE configuration for classical orbit scar analysis (optional)
 * @returns New eigenstate count, or -1 if storage is full or buffers unavailable
 */
export function storeCurrentEigenstate(
  device: GPUDevice,
  state: GramSchmidtState,
  targetNorm = 1.0,
  energy = NaN,
  tdseConfig?: TdseConfig
): number {
  if (!state.psiBuffer) return -1
  if (!Number.isFinite(state.totalSites) || state.totalSites <= 0) return -1
  if (state.gsEigenstates.length >= MAX_STORED_EIGENSTATES) return -1

  // One vec2f buffer per stored eigenstate, sized 8 bytes/site to mirror the
  // merged TDSE ψ layout (was: two 4-byte/site Re + Im buffers).
  const byteSize = state.totalSites * 8
  const psiCopy = device.createBuffer({
    label: `gs-eigenstate-${state.gsEigenstates.length}-psi`,
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const encoder = device.createCommandEncoder({ label: 'gs-copy-eigenstate' })
  encoder.copyBufferToBuffer(state.psiBuffer, 0, psiCopy, 0, byteSize)
  device.queue.submit([encoder.finish()])

  const eigenstateEntry: EigenstateBuffers = {
    psi: psiCopy,
    normSquared: targetNorm > 0 ? targetNorm : 1.0,
    energy,
    ipr: NaN,
  }
  state.gsEigenstates.push(eigenstateEntry)

  // Async readback: compute IPR and orbit correlation from eigenstate wavefunction on CPU.
  // Capture the generation counter so a stale readback (after clearEigenstates +
  // re-store) cannot apply old data to the new eigenstate's slot.
  const eigIdx = state.gsEigenstates.length - 1
  const capturedGeneration = state.eigenstateGeneration
  void computeEigenstateDiagnosticsAsync(
    device,
    psiCopy,
    state.totalSites,
    energy,
    tdseConfig
  ).then((diag) => {
    if (state.eigenstateGeneration !== capturedGeneration) {
      // Stored eigenstates were cleared while this readback was in flight;
      // the diagnostics store has already been reset and any current entry
      // at `eigIdx` belongs to a fresh sweep, not this one.
      return
    }
    eigenstateEntry.ipr = diag.ipr
    // Push orbit correlation back to the diagnostics store
    void import('@/stores/diagnostics/diagnosticsStore').then((m) => {
      m.useDiagnosticsStore.getState().updateEigenstateIPR(eigIdx, diag.ipr)
      if (Number.isFinite(diag.orbitCorrelation)) {
        m.useDiagnosticsStore
          .getState()
          .updateEigenstateOrbitCorrelation(eigIdx, diag.orbitCorrelation)
      }
    })
  })

  return state.gsEigenstates.length
}

/** Result of async eigenstate diagnostics computation. */
interface EigenstateDiagnostics {
  ipr: number
  orbitCorrelation: number
}

/**
 * Asynchronously compute eigenstate diagnostics: IPR and scar correlation.
 *
 * Reads the eigenstate wavefunction back from GPU, computes:
 * - IPR = Σ|ψ|⁴ / (Σ|ψ|²)² — localization measure
 * - Scar strength — max orbit correlation / mean (if config available and energy finite)
 */
async function computeEigenstateDiagnosticsAsync(
  device: GPUDevice,
  psiBuffer: GPUBuffer,
  totalSites: number,
  energy: number,
  tdseConfig?: TdseConfig
): Promise<EigenstateDiagnostics> {
  // Merged ψ buffer is array<vec2f>: 8 bytes per site, interleaved [re,im,...].
  const byteSize = totalSites * 8

  const staging = device.createBuffer({
    label: 'eigendiag-staging',
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const encoder = device.createCommandEncoder({ label: 'eigendiag-readback' })
  encoder.copyBufferToBuffer(psiBuffer, 0, staging, 0, byteSize)
  device.queue.submit([encoder.finish()])

  try {
    await staging.mapAsync(GPUMapMode.READ)

    // Single Float32Array view — even indices are Re, odd are Im (vec2f layout).
    const interleaved = new Float32Array(staging.getMappedRange())
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = interleaved[2 * i]!
      im[i] = interleaved[2 * i + 1]!
    }

    // IPR computation
    let sumDensity = 0
    let sumDensitySq = 0
    for (let i = 0; i < totalSites; i++) {
      const density = re[i]! * re[i]! + im[i]! * im[i]!
      sumDensity += density
      sumDensitySq += density * density
    }
    const normSq = sumDensity * sumDensity
    const ipr = normSq > 0 ? sumDensitySq / normSq : 0

    // Orbit correlation: compare eigenstate density against classical trajectories
    // at the same energy on the CLEAN (disorder-free) Hamiltonian.
    let orbitCorrelation = NaN
    if (tdseConfig && Number.isFinite(energy) && energy > 0) {
      try {
        const gridSize = tdseConfig.gridSize.slice(0, tdseConfig.latticeDim)
        const spacing = tdseConfig.spacing.slice(0, tdseConfig.latticeDim)
        const orbitCfg = {
          ...DEFAULT_ORBIT_CONFIG,
          tubeWidth: Math.max(...spacing) * 2,
        }
        const orbits = generateOrbitsAtEnergy(energy, tdseConfig, orbitCfg)
        if (orbits.length > 0) {
          const result = computeScarCorrelation(
            re,
            im,
            orbits,
            gridSize,
            spacing,
            orbitCfg.tubeWidth
          )
          orbitCorrelation = result.orbitCorrelation
        }
      } catch {
        orbitCorrelation = NaN
      }
    }

    staging.unmap()
    staging.destroy()

    return { ipr, orbitCorrelation }
  } catch {
    staging.destroy()
    return { ipr: NaN, orbitCorrelation: NaN }
  }
}

/** Destroy all stored eigenstates. */
export function clearEigenstates(state: GramSchmidtState): void {
  for (const es of state.gsEigenstates) {
    es.psi.destroy()
  }
  state.gsEigenstates = []
  // Bump the generation so any in-flight async eigenstate-diagnostic
  // readback discards its result instead of clobbering the next sweep's
  // slot 0 with values computed from the just-destroyed wavefunction.
  state.eigenstateGeneration++
}

/** Destroy GS GPU buffers. */
export function destroyGSBuffers(state: GramSchmidtState): void {
  clearEigenstates(state)
  state.gsUniformBuffer?.destroy()
  state.gsPartialReBuffer?.destroy()
  state.gsPartialImBuffer?.destroy()
  state.gsResultBuffer?.destroy()
  state.gsUniformBuffer = null
  state.gsPartialReBuffer = null
  state.gsPartialImBuffer = null
  state.gsResultBuffer = null
  state.gsNumWorkgroups = 0
  state.gsBufferTotalSites = 0
}

/**
 * Resources for post-GS renormalization dispatch.
 * Passed to dispatchGramSchmidt to re-normalize ψ after projection subtraction.
 */
export interface PostGSRenormResources {
  diagReducePipeline: GPUComputePipeline
  diagReduceBG: GPUBindGroup
  diagFinalizePipeline: GPUComputePipeline
  diagFinalizeBG: GPUBindGroup
  renormalizePipeline: GPUComputePipeline
  renormalizeBG: GPUBindGroup
  diagNumWorkgroups: number
}

/**
 * Dispatch Gram-Schmidt orthogonalization against all stored eigenstates.
 *
 * @param dispatch - Function to dispatch a compute pass (from the TDSE pass)
 * @param postGSRenorm - If provided, re-normalize ψ after projection subtraction
 */
export function dispatchGramSchmidt(
  ctx: WebGPURenderContext,
  state: GramSchmidtState,
  dispatch: DispatchComputeFn,
  postGSRenorm?: PostGSRenormResources
): void {
  if (
    state.gsEigenstates.length === 0 ||
    !state.pl ||
    !state.psiBuffer ||
    !state.gsUniformBuffer ||
    !state.gsPartialReBuffer ||
    !state.gsPartialImBuffer ||
    !state.gsResultBuffer
  )
    return

  const { device } = ctx
  const linearWG = Math.ceil(state.totalSites / LINEAR_WG)

  // Pre-allocate uniform scratch buffers
  const reduceUnifBuf = new Uint32Array([state.totalSites, state.gsNumWorkgroups, 0, 0])
  const subtractUnifBuf = new ArrayBuffer(16)
  const subtractU32 = new Uint32Array(subtractUnifBuf)
  const subtractF32 = new Float32Array(subtractUnifBuf)

  for (const eigenstate of state.gsEigenstates) {
    // Write reduce uniforms: { totalElements, numWorkgroups, 0, 0 }
    device.queue.writeBuffer(state.gsUniformBuffer!, 0, reduceUnifBuf)
    const reduceBG = device.createBindGroup({
      label: 'tdse-gs-reduce-bg',
      layout: state.pl.gsReduceBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: eigenstate.psi } },
        { binding: 2, resource: { buffer: state.psiBuffer } },
        { binding: 3, resource: { buffer: state.gsPartialReBuffer } },
        { binding: 4, resource: { buffer: state.gsPartialImBuffer } },
      ],
    })
    const rPass = ctx.beginComputePass({ label: 'gs-reduce' })
    dispatch(rPass, state.pl.gsReducePipeline, [reduceBG], state.gsNumWorkgroups)
    rPass.end()

    const finalizeBG = device.createBindGroup({
      label: 'tdse-gs-finalize-bg',
      layout: state.pl.gsFinalizeBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: state.gsPartialReBuffer } },
        { binding: 2, resource: { buffer: state.gsPartialImBuffer } },
        { binding: 3, resource: { buffer: state.gsResultBuffer } },
      ],
    })
    const fPass = ctx.beginComputePass({ label: 'gs-finalize' })
    dispatch(fPass, state.pl.gsFinalizePipeline, [finalizeBG], 1)
    fPass.end()

    // Overwrite uniforms for subtract: { totalElements, normSquared, 0, 0 }
    subtractU32[0] = state.totalSites
    subtractF32[1] = eigenstate.normSquared
    subtractU32[2] = 0
    subtractU32[3] = 0
    device.queue.writeBuffer(state.gsUniformBuffer!, 0, subtractUnifBuf)

    const subtractBG = device.createBindGroup({
      label: 'tdse-gs-subtract-bg',
      layout: state.pl.gsSubtractBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: state.gsResultBuffer } },
        { binding: 2, resource: { buffer: eigenstate.psi } },
        { binding: 3, resource: { buffer: state.psiBuffer } },
      ],
    })
    const sPass = ctx.beginComputePass({ label: 'gs-subtract' })
    dispatch(sPass, state.pl.gsSubtractPipeline, [subtractBG], linearWG)
    sPass.end()
  }

  // Re-normalize after GS projection subtraction to restore target norm
  if (postGSRenorm) {
    const r = postGSRenorm
    const rReduce = ctx.beginComputePass({ label: 'post-gs-reduce' })
    dispatch(rReduce, r.diagReducePipeline, [r.diagReduceBG], r.diagNumWorkgroups)
    rReduce.end()
    const rFinal = ctx.beginComputePass({ label: 'post-gs-final' })
    dispatch(rFinal, r.diagFinalizePipeline, [r.diagFinalizeBG], 1)
    rFinal.end()
    const rRenorm = ctx.beginComputePass({ label: 'post-gs-renorm' })
    dispatch(rRenorm, r.renormalizePipeline, [r.renormalizeBG], linearWG)
    rRenorm.end()
  }
}
