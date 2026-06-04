/**
 * CPU reference for the free-scalar retrocausal caustic initial condition.
 *
 * Mirrors the WGSL init branch in
 * `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts`.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/freeScalar'

const MAX_DIM = 12
const ITERATIONS = 6
const EPS = 1e-6
const IMAGE_CLAMP = 8
const PHASE_GAIN = 1.7
const OMEGA_SCALE_MAX = 96

/** Field values produced by one retrocausal caustic lattice sample. */
export interface RetrocausalCausticSample {
  /** Initial scalar field amplitude written to phi buffer. */
  phi: number
  /** Initial conjugate momentum written to pi buffer. */
  pi: number
  /** Bounded advanced/retarded echo sum before amplitude scaling. */
  echo: number
  /** Bounded conjugate-momentum kick sum before amplitude and omega scaling. */
  kick: number
  /** Lattice-dispersion omega scale used to make pi visibly evolve. */
  omegaScale: number
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function latticeDim(config: FreeScalarConfig, vectorLength?: number): number {
  const raw = Math.floor(finiteOr(config.latticeDim, 3))
  const dim = clamp(raw, 1, MAX_DIM)
  return vectorLength === undefined ? dim : Math.min(dim, vectorLength)
}

function modeComponent(config: FreeScalarConfig, d: number): number {
  return finiteOr(config.modeK[d], 0)
}

function causticOffset(config: FreeScalarConfig, d: number, iter: number, dim: number): number {
  const k0 = Math.abs(modeComponent(config, d))
  const k1 = Math.abs(modeComponent(config, (d + 1) % dim))
  const k2 = Math.abs(modeComponent(config, (d + 2) % dim))
  return (
    0.54 +
    0.22 * Math.cos(0.731 * (iter + 1) * (d + 1) + 0.173 * (k0 + 1)) +
    0.13 * Math.sin(0.419 * (iter + 1) * (k1 + k2 + 2))
  )
}

function loopPhase(config: FreeScalarConfig, iter: number, dim: number): number {
  let signedMode = 0
  let absMode = 0
  for (let d = 0; d < dim; d++) {
    const k = modeComponent(config, d)
    signedMode += k * (d + 1)
    absMode += Math.abs(k)
  }
  const modeSign = Math.abs(signedMode) < EPS ? 1 : Math.sign(signedMode)
  return modeSign * (0.31 + 0.029 * absMode) * (iter + 1)
}

function boundedSum(sum: number, norm: number): number {
  return Math.tanh(PHASE_GAIN * (sum / Math.max(norm, EPS)))
}

/** Compute bounded lattice-dispersion scale used for retrocausal pi kick. */
export function computeRetrocausalCausticOmegaScale(config: FreeScalarConfig): number {
  const dim = latticeDim(config)
  let omegaSq = Math.max(0, finiteOr(config.mass, 0) ** 2)
  for (let d = 0; d < dim; d++) {
    const n = Math.max(1, Math.round(finiteOr(config.gridSize[d], 1)))
    const spacing = Math.max(Math.abs(finiteOr(config.spacing[d], 0.1)), EPS)
    if (n <= 1) continue
    const sk = (2 * Math.sin((Math.PI * modeComponent(config, d)) / n)) / spacing
    omegaSq += sk * sk
  }
  return Math.min(Math.sqrt(Math.max(omegaSq, 0)), OMEGA_SCALE_MAX)
}

/** Compute retrocausal caustic phi/pi values at an explicit world-space position. */
export function computeRetrocausalCausticAtPosition(
  position: readonly number[],
  config: FreeScalarConfig
): RetrocausalCausticSample {
  const dim = latticeDim(config, position.length)
  const sigma = Math.max(Math.abs(finiteOr(config.packetWidth, 0)), EPS)
  const p = Array.from({ length: dim }, (_, d) => {
    const x = finiteOr(position[d], 0)
    const center = finiteOr(config.packetCenter[d], 0)
    return (x - center) / sigma
  })

  let echoSum = 0
  let kickSum = 0
  let norm = 0

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let r2 = 0
    for (let d = 0; d < dim; d++) r2 += p[d]! * p[d]!
    r2 = Math.max(r2, EPS)

    for (let d = 0; d < dim; d++) {
      p[d] = clamp(
        Math.abs(p[d]!) / r2 - causticOffset(config, d, iter, dim),
        -IMAGE_CLAMP,
        IMAGE_CLAMP
      )
    }

    let imageR2 = 0
    let phase = loopPhase(config, iter, dim)
    for (let d = 0; d < dim; d++) {
      const pd = p[d]!
      imageR2 += pd * pd
      phase += modeComponent(config, d) * pd
    }

    const tau = Math.sqrt(Math.max(imageR2, EPS))
    const decay = 0.72 ** iter / (1 + 0.035 * imageR2)
    echoSum += decay * Math.cos(phase) * Math.cos(tau)
    kickSum += decay * Math.sin(phase) * Math.sin(tau)
    norm += decay
  }

  const amplitude = finiteOr(config.packetAmplitude, 0)
  const echo = boundedSum(echoSum, norm)
  const kick = boundedSum(kickSum, norm)
  const omegaScale = computeRetrocausalCausticOmegaScale(config)

  return {
    phi: amplitude * echo,
    pi: amplitude * omegaScale * kick,
    echo,
    kick,
    omegaScale,
  }
}

/** Compute retrocausal caustic phi/pi values at integer lattice coordinates. */
export function computeRetrocausalCausticAtLatticeSite(
  coords: readonly number[],
  config: FreeScalarConfig
): RetrocausalCausticSample {
  const dim = latticeDim(config, coords.length)
  const position = Array.from({ length: dim }, (_, d) => {
    const n = Math.max(1, Math.round(finiteOr(config.gridSize[d], 1)))
    const spacing = Math.max(Math.abs(finiteOr(config.spacing[d], 0.1)), EPS)
    const halfExtent = n * spacing * 0.5
    return finiteOr(coords[d], 0) * spacing - halfExtent
  })
  return computeRetrocausalCausticAtPosition(position, config)
}
