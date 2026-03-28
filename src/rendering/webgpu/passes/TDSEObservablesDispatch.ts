/** TDSE Observables — Resource Management, Dispatch & Readback */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { NUM_ENERGY_BINS } from '@/rendering/webgpu/shaders/schroedinger/compute/energySpectralDensity.wgsl'
import { useObservablesDiagnosticsStore } from '@/stores/observablesDiagnosticsStore'

import { DIAG_DECIMATION } from './computePassUtils'
import {
  createObservablesBuffers,
  destroyObservablesBuffers,
  MAX_OBS_CHANNELS,
  type ObservablesResources,
  processObservablesReadback,
} from './ObservablesComputeSetup'
import type { TdsePipelineResult } from './TDSEComputePassSetup'

/** Mutable state for observables resources. */
export interface ObservablesState {
  obsResources: ObservablesResources | null
  obsPosReduceBG: GPUBindGroup | null
  obsPosFinalBG: GPUBindGroup | null
  obsMomReduceBG: GPUBindGroup | null
  obsMomFinalBG: GPUBindGroup | null
  esSpectrumBG: GPUBindGroup | null
  esMappingInFlight: boolean
  obsMappingInFlight: boolean
  obsEnabled: boolean
  // References to pass state
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  totalSites: number
  pl: TdsePipelineResult | null
  diagGeneration: number
}

/**
 * Create or destroy observables GPU resources when observablesEnabled changes.
 */
export function updateObservablesResources(
  device: GPUDevice,
  config: TdseConfig,
  state: ObservablesState
): void {
  const wantObs = config.observablesEnabled
  if (wantObs === state.obsEnabled && state.obsResources) return

  if (!wantObs) {
    destroyObservablesBuffers(state.obsResources)
    state.obsResources = null
    state.obsPosReduceBG = null
    state.obsPosFinalBG = null
    state.obsMomReduceBG = null
    state.obsMomFinalBG = null
    state.obsEnabled = false
    useObservablesDiagnosticsStore.getState().reset()
    return
  }

  if (
    !state.pl ||
    !state.psiReBuffer ||
    !state.psiImBuffer ||
    !state.potentialBuffer ||
    !state.fftScratchA
  )
    return

  destroyObservablesBuffers(state.obsResources)
  state.obsResources = createObservablesBuffers(device, state.totalSites, config.latticeDim)
  const res = state.obsResources

  state.obsPosReduceBG = device.createBindGroup({
    layout: state.pl.obsPosReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: res.posUniformBuffer } },
      { binding: 1, resource: { buffer: state.psiReBuffer } },
      { binding: 2, resource: { buffer: state.psiImBuffer } },
      { binding: 3, resource: { buffer: res.posPartialBuffer } },
      { binding: 4, resource: { buffer: state.potentialBuffer } },
    ],
  })
  state.obsPosFinalBG = device.createBindGroup({
    layout: state.pl.obsPosFinalBGL,
    entries: [
      { binding: 0, resource: { buffer: res.posUniformBuffer } },
      { binding: 1, resource: { buffer: res.posPartialBuffer } },
      { binding: 2, resource: { buffer: res.posResultBuffer } },
    ],
  })
  state.obsMomReduceBG = device.createBindGroup({
    layout: state.pl.obsMomReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: res.momUniformBuffer } },
      { binding: 1, resource: { buffer: state.fftScratchA } },
      { binding: 2, resource: { buffer: res.momPartialBuffer } },
    ],
  })
  state.obsMomFinalBG = device.createBindGroup({
    layout: state.pl.obsMomFinalBGL,
    entries: [
      { binding: 0, resource: { buffer: res.momUniformBuffer } },
      { binding: 1, resource: { buffer: res.momPartialBuffer } },
      { binding: 2, resource: { buffer: res.momResultBuffer } },
    ],
  })
  state.esSpectrumBG = device.createBindGroup({
    label: 'energy-spectrum-bg',
    layout: state.pl.energySpectrumBGL,
    entries: [
      { binding: 0, resource: { buffer: res.esUniformBuffer } },
      { binding: 1, resource: { buffer: state.fftScratchA } },
      { binding: 2, resource: { buffer: res.esBinsBuffer } },
    ],
  })
  state.obsEnabled = true
}

/** Write observables uniforms for position + momentum reduction. */
export function writeObservablesUniforms(
  device: GPUDevice,
  config: TdseConfig,
  state: ObservablesState,
  strides: number[]
): void {
  const res = state.obsResources
  if (!res) return

  const uniformSize = 16 + 12 * 4 * 3
  const obsBuf = new ArrayBuffer(uniformSize)
  const obsU32 = new Uint32Array(obsBuf)
  const obsF32 = new Float32Array(obsBuf)
  obsU32[0] = state.totalSites
  obsU32[1] = res.numWorkgroups
  obsU32[2] = config.latticeDim
  obsU32[3] = res.posNumChannels
  for (let d = 0; d < config.latticeDim; d++) obsU32[4 + d] = config.gridSize[d] ?? 64
  for (let d = 0; d < config.latticeDim; d++) obsU32[16 + d] = strides[d] ?? 1
  for (let d = 0; d < config.latticeDim; d++) obsF32[28 + d] = config.spacing[d] ?? 0.1
  device.queue.writeBuffer(res.posUniformBuffer, 0, obsBuf)

  const momBuf = new ArrayBuffer(uniformSize)
  const momU32 = new Uint32Array(momBuf)
  const momF32 = new Float32Array(momBuf)
  momU32[0] = state.totalSites
  momU32[1] = res.numWorkgroups
  momU32[2] = config.latticeDim
  momU32[3] = res.momNumChannels
  for (let d = 0; d < config.latticeDim; d++) momU32[4 + d] = config.gridSize[d] ?? 64
  for (let d = 0; d < config.latticeDim; d++) momU32[16 + d] = strides[d] ?? 1
  for (let d = 0; d < config.latticeDim; d++) {
    const Nd = config.gridSize[d] ?? 64
    const ad = config.spacing[d] ?? 0.1
    momF32[28 + d] = (2 * Math.PI) / (Nd * ad)
  }
  device.queue.writeBuffer(res.momUniformBuffer, 0, momBuf)

  // Energy spectrum uniforms
  // EnergySpectrumUniforms: 8 scalars + 3 arrays of 12 = 44 u32s = 176 bytes
  const esBuf = new ArrayBuffer(176)
  const esU32 = new Uint32Array(esBuf)
  const esF32 = new Float32Array(esBuf)
  esU32[0] = state.totalSites
  esU32[1] = NUM_ENERGY_BINS
  // Auto-compute energy range from lattice: E_max = ℏ²/(2m) * (π/a_min)² * D
  const aMin = Math.min(...config.spacing.slice(0, config.latticeDim))
  const kMax = Math.PI / aMin
  const eMaxAuto = (config.hbar * config.hbar * kMax * kMax * config.latticeDim) / (2 * config.mass)
  esF32[2] = 0 // eMin
  esF32[3] = eMaxAuto // eMax
  esF32[4] = config.hbar
  esF32[5] = config.mass
  esU32[6] = config.latticeDim
  esU32[7] = 0 // pad
  // gridSize at offset 32 (index 8)
  for (let d = 0; d < config.latticeDim; d++) esU32[8 + d] = config.gridSize[d] ?? 64
  // strides at offset 80 (index 20)
  for (let d = 0; d < config.latticeDim; d++) esU32[20 + d] = strides[d] ?? 1
  // kGridScale at offset 128 (index 32)
  for (let d = 0; d < config.latticeDim; d++) {
    const Nd = config.gridSize[d] ?? 64
    const ad = config.spacing[d] ?? 0.1
    esF32[32 + d] = (2 * Math.PI) / (Nd * ad)
  }
  device.queue.writeBuffer(res.esUniformBuffer, 0, esBuf)
}

/** Check whether observables should be dispatched this frame. */
export function shouldDispatchObs(
  obsEnabled: boolean,
  diagFrameCounter: number,
  config: TdseConfig
): boolean {
  if (!obsEnabled) return false
  const interval = config.diagnosticsEnabled
    ? config.diagnosticsInterval || DIAG_DECIMATION
    : DIAG_DECIMATION
  return diagFrameCounter + 1 >= interval
}

/** Dispatch async readback for observable expectation values. */
export function dispatchObservablesReadback(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  config: TdseConfig,
  state: ObservablesState
): void {
  const res = state.obsResources
  if (!res || state.obsMappingInFlight) return

  const resultBytes = MAX_OBS_CHANNELS * 4
  encoder.copyBufferToBuffer(res.posResultBuffer, 0, res.posStagingBuffer, 0, resultBytes)
  encoder.copyBufferToBuffer(res.momResultBuffer, 0, res.momStagingBuffer, 0, resultBytes)

  // Energy spectrum: copy bins → staging for readback
  const esBinBytes = NUM_ENERGY_BINS * 4
  encoder.copyBufferToBuffer(res.esBinsBuffer, 0, res.esStagingBuffer, 0, esBinBytes)

  state.obsMappingInFlight = true
  const posStaging = res.posStagingBuffer
  const momStaging = res.momStagingBuffer
  const esStaging = res.esStagingBuffer
  const latticeDim = config.latticeDim
  const hbar = config.hbar
  const mass = config.mass ?? 1
  const gen = state.diagGeneration

  device.queue
    .onSubmittedWorkDone()
    .then(() => {
      if (gen !== state.diagGeneration) {
        state.obsMappingInFlight = false
        return
      }
      if (
        posStaging.mapState !== 'unmapped' ||
        momStaging.mapState !== 'unmapped' ||
        esStaging.mapState !== 'unmapped'
      ) {
        state.obsMappingInFlight = false
        return
      }
      Promise.all([
        posStaging.mapAsync(GPUMapMode.READ),
        momStaging.mapAsync(GPUMapMode.READ),
        esStaging.mapAsync(GPUMapMode.READ),
      ])
        .then(() => {
          const posData = new Float32Array(posStaging.getMappedRange())
          const momData = new Float32Array(momStaging.getMappedRange())
          const snapshot = processObservablesReadback(posData, momData, latticeDim, hbar, mass)
          posStaging.unmap()
          momStaging.unmap()

          // Decode energy spectrum from fixed-point u32 → float
          const esRaw = new Uint32Array(esStaging.getMappedRange())
          const spectrum = new Float32Array(NUM_ENERGY_BINS)
          for (let i = 0; i < NUM_ENERGY_BINS; i++) {
            spectrum[i] = (esRaw[i] ?? 0) / 1048576.0
          }
          esStaging.unmap()

          const store = useObservablesDiagnosticsStore.getState()
          if (snapshot) store.pushSnapshot(snapshot)
          store.setEnergySpectrum(spectrum)
          state.obsMappingInFlight = false
        })
        .catch(() => {
          state.obsMappingInFlight = false
        })
    })
    .catch(() => {
      state.obsMappingInFlight = false
    })
}

/** Destroy observables resources. */
export function disposeObservables(state: ObservablesState): void {
  destroyObservablesBuffers(state.obsResources)
  state.obsResources = null
  state.obsPosReduceBG = null
  state.obsPosFinalBG = null
  state.obsMomReduceBG = null
  state.obsMomFinalBG = null
  state.obsEnabled = false
}
