/**
 * Custom Potential Buffer Upload
 *
 * Parses a user-defined mathematical expression and evaluates it on the
 * N-D lattice grid, then uploads the result to the GPU potential buffer.
 *
 * @module rendering/webgpu/passes/TDSEComputePassCustomPotential
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { generateDisorderPotential } from '@/lib/physics/anderson/disorderPotential'
import { parseExpression } from '@/lib/physics/expressionParser'
import { evaluatePotentialGrid } from '@/lib/physics/potentialGridEvaluator'
import { computeTdseEffectiveSpacing } from '@/lib/physics/tdse/effectiveSpacing'

import { computeTdseDisorderScaling } from './TDSEDisorderScaling'

/**
 * Compute a hash string for potential dirty-tracking.
 * Returns a unique string when any parameter affecting V(x) changes.
 *
 * @param config - TDSE config
 * @param simTime - Current simulation time (for driven potentials)
 * @returns Hash string for comparison
 */
export function computePotentialHash(config: TdseConfig, simTime: number): string {
  // Always include the full set of V(x)-shaping parameters. This matters even
  // when the potential type is time-dependent: if the user pauses playback
  // (`simTime` frozen) and edits, say, `barrierHeight` or `driveAmplitude`,
  // the hash must still change so the potential buffer is rebuilt. The
  // previous `isDriven ? 'driven_${simTime}' : fullList` fast-path dropped
  // every base parameter and introduced a silent stale-V bug on pause-edit.
  const base = [
    config.potentialType,
    config.barrierHeight,
    config.barrierWidth,
    config.barrierCenter,
    config.harmonicOmega,
    config.wellDepth,
    config.wellWidth,
    config.stepHeight,
    config.mass,
    config.interactionStrength,
    config.slitSeparation,
    config.slitWidth,
    config.wallThickness,
    config.wallHeight,
    config.latticeDepth,
    config.latticePeriod,
    config.doubleWellLambda,
    config.doubleWellSeparation,
    config.doubleWellAsymmetry,
    config.radialWellInner,
    config.radialWellOuter,
    config.radialWellDepth,
    config.radialWellTilt,
    config.anharmonicLambda,
    config.bhMass,
    config.bhMultipoleL,
    config.bhSpin,
    (config.trapAnisotropy ?? []).join(','),
    config.spacing.join(','),
    (config.compactDims ?? []).map(Number).join(','),
    (config.compactRadii ?? []).join(','),
    config.disorderStrength,
    config.disorderSeed,
  ].join('|')

  // Driven-mode suffix: drive params AND the advancing `simTime` appear only
  // when the driven slab barrier is actually time-modulated. This drives the
  // per-frame rebuild while the sim is playing and still lets pause-edit flow
  // through `base` above.
  const driven =
    config.potentialType === 'driven' && config.driveEnabled
      ? `|drive|${config.driveWaveform}|${config.driveFrequency}|${config.driveAmplitude}|${simTime}`
      : ''

  const custom =
    config.potentialType === 'custom' ? `|custom|${config.customPotentialExpression}` : ''

  // Anderson hash includes `hbar` because `t_eff = ℏ²/(2m·dx²)` scales the
  // disorder strength (see uploadAndersonDisorderBuffer). `mass`, `spacing`,
  // `disorderStrength`, `disorderSeed` are already in `base` — only the
  // disorder distribution and hbar need appending here.
  const anderson =
    config.potentialType === 'andersonDisorder'
      ? `|anderson|${config.disorderDistribution}|${config.hbar}`
      : ''

  return `${base}${driven}${custom}${anderson}`
}

/**
 * Parse and evaluate a custom potential expression, upload to GPU buffer.
 *
 * Returns the maximum absolute potential value for display normalization.
 * The caller writes this scale into the TDSE uniform buffer so the WGSL
 * shader can correctly normalize the potential overlay and field view.
 *
 * @param device - GPU device for buffer write
 * @param potentialBuffer - Target GPU storage buffer
 * @param config - TDSE config containing the expression and grid parameters
 * @returns Maximum |V| across the grid, or 0 if parsing fails
 */
export function uploadCustomPotentialBuffer(
  device: GPUDevice,
  potentialBuffer: GPUBuffer | null,
  config: TdseConfig
): number {
  if (!potentialBuffer) return 0

  const expr = config.customPotentialExpression ?? '0'
  const result = parseExpression(expr)
  if (!result.success) {
    logger.warn(`[TDSE] Custom potential parse error: ${result.error}`)
    return 0
  }

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const spacing = computeTdseEffectiveSpacing(config)
  const potential = evaluatePotentialGrid(result.evaluate, gridSize, spacing)

  device.queue.writeBuffer(potentialBuffer, 0, potential)

  // Compute max|V| for display normalization
  let maxAbsV = 0
  for (let i = 0; i < potential.length; i++) {
    const absV = Math.abs(potential[i]!)
    if (absV > maxAbsV) maxAbsV = absV
  }
  return maxAbsV
}

/**
 * Generate Anderson disorder potential and upload to GPU buffer.
 *
 * The user-facing `disorderStrength` (W) is in tight-binding units, i.e.
 * measured relative to the nearest-neighbor hopping energy t = ℏ²/(2m·dx²).
 * The Anderson metal–insulator transition in 3D occurs at W_c/t ≈ 16.5.
 * This function multiplies W by t so the actual lattice potential has the
 * correct physical scale regardless of grid spacing, mass, or ℏ.
 *
 * Returns the maximum absolute potential value for display normalization.
 *
 * @param device - GPU device for buffer write
 * @param potentialBuffer - Target GPU storage buffer
 * @param config - TDSE config containing disorder parameters
 * @returns Maximum |V| across the grid
 */
export function uploadAndersonDisorderBuffer(
  device: GPUDevice,
  potentialBuffer: GPUBuffer | null,
  config: TdseConfig
): number {
  if (!potentialBuffer) return 0

  // Effective hopping energy t = ℏ²/(2m·dx²). Scale disorder by t so that
  // config.disorderStrength is in tight-binding units (W/t).
  const { tEff, effectiveStrength, disorderStrength } = computeTdseDisorderScaling(config)

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const potential = generateDisorderPotential(
    gridSize,
    config.latticeDim,
    effectiveStrength,
    config.disorderSeed,
    config.disorderDistribution
  )

  // Pass the typed array itself (not `.buffer`) so WebGPU respects its
  // `byteOffset` / `byteLength`. Identical behaviour today because
  // `generateDisorderPotential` returns a full-buffer `new Float32Array`,
  // but robust to any future refactor that hands out a pooled subview —
  // a raw `.buffer` upload would silently ship the wrong bytes from offset 0.
  device.queue.writeBuffer(potentialBuffer, 0, potential)

  // Compute max|V| for display normalization
  let maxAbsV = 0
  for (let i = 0; i < potential.length; i++) {
    const absV = Math.abs(potential[i]!)
    if (absV > maxAbsV) maxAbsV = absV
  }
  logger.log(
    `[TDSE] Anderson disorder: W/t=${disorderStrength}, t=${tEff.toFixed(2)}, ` +
      `W_eff=${effectiveStrength.toFixed(1)}, seed=${config.disorderSeed}, ` +
      `dist=${config.disorderDistribution}, maxV=${maxAbsV.toFixed(3)}`
  )
  return maxAbsV
}
