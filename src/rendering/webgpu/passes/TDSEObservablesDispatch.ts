/** TDSE Observables — Resource Management, Dispatch & Readback */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { computeTdseEffectiveSpacing } from '@/lib/physics/tdse/effectiveSpacing'
import { NUM_ENERGY_BINS } from '@/rendering/webgpu/shaders/schroedinger/compute/energySpectralDensity.wgsl'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { DIAG_DECIMATION } from './computePassUtils'
import {
  createObservablesBuffers,
  destroyObservablesBuffers,
  MAX_OBS_CHANNELS,
  type ObservablesResources,
  processObservablesReadback,
  sanitizeObservablesLatticeDim,
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
  psiBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  totalSites: number
  pl: TdsePipelineResult | null
  diagGeneration: number
}

/**
 * Returns true when the configured metric admits a flat-space Fourier path
 * for observables (flat or torus). Curved metrics fall back to real-space.
 */
export function supportsFlatFourierObservables(config: Pick<TdseConfig, 'metric'>): boolean {
  const metricKind = config.metric?.kind ?? 'flat'
  return metricKind === 'flat' || metricKind === 'torus'
}

/** Clear observables GPU buffers, bind groups, enabled flag, and store state. */
function teardownObservables(state: ObservablesState): void {
  destroyObservablesBuffers(state.obsResources)
  state.obsResources = null
  state.obsPosReduceBG = null
  state.obsPosFinalBG = null
  state.obsMomReduceBG = null
  state.obsMomFinalBG = null
  state.esSpectrumBG = null
  state.obsEnabled = false
  useDiagnosticsStore.getState().resetObservables()
}

/**
 * Create or destroy observables GPU resources when observablesEnabled changes.
 */
export function updateObservablesResources(
  device: GPUDevice,
  config: TdseConfig,
  state: ObservablesState
): void {
  const supported = supportsFlatFourierObservables(config)
  const wantObs = config.observablesEnabled && supported

  if (config.observablesEnabled && !supported) {
    if (
      state.obsEnabled ||
      state.obsResources ||
      useDiagnosticsStore.getState().observables.hasData
    ) {
      teardownObservables(state)
    }
    return
  }

  if (wantObs === state.obsEnabled && (state.obsResources || !wantObs)) return

  if (!wantObs) {
    teardownObservables(state)
    return
  }

  if (!state.pl || !state.psiBuffer || !state.potentialBuffer || !state.fftScratchA) return

  destroyObservablesBuffers(state.obsResources)
  state.obsResources = createObservablesBuffers(device, state.totalSites, config.latticeDim)
  const res = state.obsResources

  state.obsPosReduceBG = device.createBindGroup({
    label: 'tdse-obs-pos-reduce-bg',
    layout: state.pl.obsPosReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: res.posUniformBuffer } },
      { binding: 1, resource: { buffer: state.psiBuffer } },
      { binding: 2, resource: { buffer: res.posPartialBuffer } },
      { binding: 3, resource: { buffer: state.potentialBuffer } },
    ],
  })
  state.obsPosFinalBG = device.createBindGroup({
    label: 'tdse-obs-pos-final-bg',
    layout: state.pl.obsPosFinalBGL,
    entries: [
      { binding: 0, resource: { buffer: res.posUniformBuffer } },
      { binding: 1, resource: { buffer: res.posPartialBuffer } },
      { binding: 2, resource: { buffer: res.posResultBuffer } },
    ],
  })
  state.obsMomReduceBG = device.createBindGroup({
    label: 'tdse-obs-mom-reduce-bg',
    layout: state.pl.obsMomReduceBGL,
    entries: [
      { binding: 0, resource: { buffer: res.momUniformBuffer } },
      { binding: 1, resource: { buffer: state.fftScratchA } },
      { binding: 2, resource: { buffer: res.momPartialBuffer } },
    ],
  })
  state.obsMomFinalBG = device.createBindGroup({
    label: 'tdse-obs-mom-final-bg',
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
  const latticeDim = sanitizeObservablesLatticeDim(config.latticeDim)
  const totalSites = res.totalSites
  const hbar = Number.isFinite(config.hbar) && config.hbar > 0 ? config.hbar : 1
  const mass = Number.isFinite(config.mass) && config.mass > 0 ? config.mass : 1
  const gridAt = (d: number): number => {
    const value = config.gridSize[d]
    return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : 64
  }
  const strideAt = (d: number): number => {
    const value = strides[d]
    return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : 1
  }
  const spacingAt = (d: number): number => {
    const value = effSpacing[d]
    return Number.isFinite(value) && value! > 0 ? value! : 0.1
  }

  // Effective spacing accounts for KK compactification and torus metrics.
  const effSpacing = computeTdseEffectiveSpacing({ ...config, latticeDim })

  const uniformSize = 16 + 12 * 4 * 3
  const obsBuf = new ArrayBuffer(uniformSize)
  const obsU32 = new Uint32Array(obsBuf)
  const obsF32 = new Float32Array(obsBuf)
  obsU32[0] = totalSites
  obsU32[1] = res.numWorkgroups
  obsU32[2] = latticeDim
  obsU32[3] = res.posNumChannels
  for (let d = 0; d < latticeDim; d++) obsU32[4 + d] = gridAt(d)
  for (let d = 0; d < latticeDim; d++) obsU32[16 + d] = strideAt(d)
  for (let d = 0; d < latticeDim; d++) obsF32[28 + d] = spacingAt(d)
  device.queue.writeBuffer(res.posUniformBuffer, 0, obsBuf)

  const momBuf = new ArrayBuffer(uniformSize)
  const momU32 = new Uint32Array(momBuf)
  const momF32 = new Float32Array(momBuf)
  momU32[0] = totalSites
  momU32[1] = res.numWorkgroups
  momU32[2] = latticeDim
  momU32[3] = res.momNumChannels
  for (let d = 0; d < latticeDim; d++) momU32[4 + d] = gridAt(d)
  for (let d = 0; d < latticeDim; d++) momU32[16 + d] = strideAt(d)
  for (let d = 0; d < latticeDim; d++) {
    const Nd = gridAt(d)
    const ad = spacingAt(d)
    momF32[28 + d] = (2 * Math.PI) / (Nd * ad)
  }
  device.queue.writeBuffer(res.momUniformBuffer, 0, momBuf)

  // Energy spectrum uniforms
  // EnergySpectrumUniforms: 8 scalars + 3 arrays of 12 = 44 u32s = 176 bytes
  const esBuf = new ArrayBuffer(176)
  const esU32 = new Uint32Array(esBuf)
  const esF32 = new Float32Array(esBuf)
  esU32[0] = totalSites
  esU32[1] = NUM_ENERGY_BINS
  // Auto-compute energy range from lattice: E_max = ℏ²/(2m) * (π/a_min)² * D
  const aMin = Math.min(...Array.from({ length: latticeDim }, (_, d) => spacingAt(d)))
  const kMax = Math.PI / aMin
  const eMaxAuto = (hbar * hbar * kMax * kMax * latticeDim) / (2 * mass)
  esF32[2] = 0 // eMin
  esF32[3] = eMaxAuto // eMax
  esF32[4] = hbar
  esF32[5] = mass
  esU32[6] = latticeDim
  esU32[7] = 0 // pad
  // gridSize at offset 32 (index 8)
  for (let d = 0; d < latticeDim; d++) esU32[8 + d] = gridAt(d)
  // strides at offset 80 (index 20)
  for (let d = 0; d < latticeDim; d++) esU32[20 + d] = strideAt(d)
  // kGridScale at offset 128 (index 32)
  for (let d = 0; d < latticeDim; d++) {
    const Nd = gridAt(d)
    const ad = spacingAt(d)
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
  if (!supportsFlatFourierObservables(config)) return false
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
  const latticeDim = sanitizeObservablesLatticeDim(config.latticeDim)
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

          const store = useDiagnosticsStore.getState()
          if (snapshot) store.pushObservablesSnapshot(snapshot)
          store.setObservablesEnergySpectrum(spectrum)
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
  state.esSpectrumBG = null
  state.obsEnabled = false
}
