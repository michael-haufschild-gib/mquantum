/**
 * Web Worker for k-space occupation computation.
 *
 * Offloads the CPU-intensive pipeline (FFT + n_k + display transforms) from
 * the main thread so rendering is not blocked during k-space updates.
 *
 * Message protocol:
 *   Main → Worker: KSpaceWorkerRequest (with Transferable phi/pi buffers)
 *   Worker → Main: KSpaceWorkerResponse (with Transferable density/analysis buffers)
 */

import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'
import { buildKSpaceDisplayTextures } from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'
import {
  computeRawKSpaceDataFromComplex,
  computeTotalParticleNumber,
  type KSpaceBasisCoefs,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import type { VacuumDispersion } from '@/lib/physics/freeScalar/vacuumSpectrum'

/** Inbound message to the k-space web worker requesting a texture computation. */
export interface KSpaceWorkerRequest {
  type: 'compute'
  epoch: number
  phiComplex: Float32Array
  piComplex: Float32Array
  gridSize: number[]
  spacing: number[]
  mass: number
  latticeDim: number
  kSpaceViz: KSpaceVizConfig
  /**
   * Mass-term dispatch for the vacuum reference state used to measure `n_k`.
   * Omitting (or passing `'kgFloor'`) yields the static Klein-Gordon vacuum.
   * Passing a finite signed squared mass yields the instantaneous adiabatic
   * vacuum with `ω_k² = k_lat² + dispersion`, which on FLRW is `m²·a²(η)`.
   */
  dispersion?: VacuumDispersion
  /**
   * Canonical-basis rescale coefficients for the `n_k` kernel. Omitting
   * defaults to the Minkowski identity `(1, 1)`. Under cosmology, pass
   * `{aKinetic: 1/B, aPotential: B}` with `B = a^(n−2)` so that the
   * adiabatic vacuum reads back as zero particles (see
   * `computeRawKSpaceData` for the derivation).
   */
  basisCoefs?: KSpaceBasisCoefs
  /** Output display grid size — must match the density texture dimension. */
  outputGridSize?: number
}

/** Outbound result from the k-space web worker with computed display textures. */
export interface KSpaceWorkerResponse {
  type: 'result'
  epoch: number
  density: Uint16Array
  analysis: Uint16Array
  /** Total particle number `N(η) = Σ_k max(n_k, 0)` at the current vacuum reference. */
  totalParticles: number
}

self.onmessage = (e: MessageEvent<KSpaceWorkerRequest>) => {
  const msg = e.data
  if (msg.type !== 'compute') return

  const raw = computeRawKSpaceDataFromComplex(
    msg.phiComplex,
    msg.piComplex,
    msg.gridSize,
    msg.spacing,
    msg.mass,
    msg.latticeDim,
    msg.dispersion ?? 'kgFloor',
    msg.basisCoefs
  )

  const { density, analysis } = buildKSpaceDisplayTextures(
    raw,
    msg.kSpaceViz,
    true,
    msg.outputGridSize
  )
  const totalParticles = computeTotalParticleNumber(raw)

  const response: KSpaceWorkerResponse = {
    type: 'result',
    epoch: msg.epoch,
    density,
    analysis,
    totalParticles,
  }

  // Transfer ownership of the typed array buffers back to main thread
  self.postMessage(response, { transfer: [density.buffer, analysis.buffer] })
}
