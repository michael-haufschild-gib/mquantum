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
import type { TdsePipelineResult } from './TDSEComputePassSetup'

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

/** Eigenstate GPU buffer pair with cached norm and diagnostics. */
export interface EigenstateBuffers {
  re: GPUBuffer
  im: GPUBuffer
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
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  totalSites: number
  pl: TdsePipelineResult | null
}

/**
 * Create GS uniform + partial + result buffers if not yet created.
 */
export function ensureGSBuffers(device: GPUDevice, state: GramSchmidtState): void {
  if (state.gsUniformBuffer) return
  const wgCount = Math.max(1, Math.ceil(state.totalSites / 256))
  state.gsNumWorkgroups = wgCount

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
  if (!state.psiReBuffer || !state.psiImBuffer) return -1
  if (state.gsEigenstates.length >= MAX_STORED_EIGENSTATES) return -1

  const byteSize = state.totalSites * 4
  const reBuffer = device.createBuffer({
    label: `gs-eigenstate-${state.gsEigenstates.length}-re`,
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })
  const imBuffer = device.createBuffer({
    label: `gs-eigenstate-${state.gsEigenstates.length}-im`,
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const encoder = device.createCommandEncoder({ label: 'gs-copy-eigenstate' })
  encoder.copyBufferToBuffer(state.psiReBuffer, 0, reBuffer, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, imBuffer, 0, byteSize)
  device.queue.submit([encoder.finish()])

  const eigenstateEntry: EigenstateBuffers = {
    re: reBuffer,
    im: imBuffer,
    normSquared: targetNorm > 0 ? targetNorm : 1.0,
    energy,
    ipr: NaN,
  }
  state.gsEigenstates.push(eigenstateEntry)

  // Async readback: compute IPR and orbit correlation from eigenstate wavefunction on CPU
  const eigIdx = state.gsEigenstates.length - 1
  computeEigenstateDiagnosticsAsync(
    device, reBuffer, imBuffer, state.totalSites, energy, tdseConfig
  ).then((diag) => {
    eigenstateEntry.ipr = diag.ipr
    // Push orbit correlation back to the diagnostics store
    import('@/stores/eigenstateDiagnosticsStore').then((m) => {
      m.useEigenstateDiagnosticsStore.getState().updateIPR(eigIdx, diag.ipr)
      if (Number.isFinite(diag.orbitCorrelation)) {
        m.useEigenstateDiagnosticsStore.getState().updateOrbitCorrelation(eigIdx, diag.orbitCorrelation)
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
  reBuffer: GPUBuffer,
  imBuffer: GPUBuffer,
  totalSites: number,
  energy: number,
  tdseConfig?: TdseConfig
): Promise<EigenstateDiagnostics> {
  const byteSize = totalSites * 4

  const stagingRe = device.createBuffer({
    label: 'eigendiag-staging-re',
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const stagingIm = device.createBuffer({
    label: 'eigendiag-staging-im',
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  const encoder = device.createCommandEncoder({ label: 'eigendiag-readback' })
  encoder.copyBufferToBuffer(reBuffer, 0, stagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(imBuffer, 0, stagingIm, 0, byteSize)
  device.queue.submit([encoder.finish()])

  try {
    await stagingRe.mapAsync(GPUMapMode.READ)
    await stagingIm.mapAsync(GPUMapMode.READ)

    const re = new Float32Array(stagingRe.getMappedRange())
    const im = new Float32Array(stagingIm.getMappedRange())

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
    // This is intentional: for scar–localization competition studies, we measure
    // whether clean-system orbits leave an imprint on the disordered eigenstates.
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
          const result = computeScarCorrelation(re, im, orbits, gridSize, spacing, orbitCfg.tubeWidth)
          orbitCorrelation = result.orbitCorrelation
        }
      } catch {
        // Orbit correlation is non-critical — proceed with IPR only
        orbitCorrelation = NaN
      }
    }

    stagingRe.unmap()
    stagingIm.unmap()
    stagingRe.destroy()
    stagingIm.destroy()

    return { ipr, orbitCorrelation }
  } catch {
    stagingRe.destroy()
    stagingIm.destroy()
    return { ipr: NaN, orbitCorrelation: NaN }
  }
}

/** Destroy all stored eigenstates. */
export function clearEigenstates(state: GramSchmidtState): void {
  for (const es of state.gsEigenstates) {
    es.re.destroy()
    es.im.destroy()
  }
  state.gsEigenstates = []
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
    !state.psiReBuffer ||
    !state.psiImBuffer ||
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
      layout: state.pl.gsReduceBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: eigenstate.re } },
        { binding: 2, resource: { buffer: eigenstate.im } },
        { binding: 3, resource: { buffer: state.psiReBuffer } },
        { binding: 4, resource: { buffer: state.psiImBuffer } },
        { binding: 5, resource: { buffer: state.gsPartialReBuffer } },
        { binding: 6, resource: { buffer: state.gsPartialImBuffer } },
      ],
    })
    const rPass = ctx.beginComputePass({ label: 'gs-reduce' })
    dispatch(rPass, state.pl.gsReducePipeline, [reduceBG], state.gsNumWorkgroups)
    rPass.end()

    const finalizeBG = device.createBindGroup({
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
      layout: state.pl.gsSubtractBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: state.gsResultBuffer } },
        { binding: 2, resource: { buffer: eigenstate.re } },
        { binding: 3, resource: { buffer: eigenstate.im } },
        { binding: 4, resource: { buffer: state.psiReBuffer } },
        { binding: 5, resource: { buffer: state.psiImBuffer } },
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
