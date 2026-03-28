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

/**
 * Compute a hash string for potential dirty-tracking.
 * Returns a unique string when any parameter affecting V(x) changes.
 *
 * @param config - TDSE config
 * @param simTime - Current simulation time (for driven potentials)
 * @returns Hash string for comparison
 */
export function computePotentialHash(config: TdseConfig, simTime: number): string {
  const isDriven = config.potentialType === 'driven' && config.driveEnabled
  const base = isDriven
    ? `driven_${simTime}`
    : [
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
        (config.trapAnisotropy ?? []).join(','),
        config.spacing.join(','),
        config.disorderStrength,
        config.disorderSeed,
      ].join('|')
  const custom = config.potentialType === 'custom' ? config.customPotentialExpression : ''
  const anderson =
    config.potentialType === 'andersonDisorder'
      ? `${config.disorderStrength}|${config.disorderSeed}|${config.disorderDistribution}`
      : ''
  return `${base}|${custom}|${anderson}`
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
  const spacing = config.spacing.slice(0, config.latticeDim)
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

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const potential = generateDisorderPotential(
    gridSize,
    config.latticeDim,
    config.disorderStrength,
    config.disorderSeed,
    config.disorderDistribution
  )

  device.queue.writeBuffer(potentialBuffer, 0, potential.buffer)

  // Compute max|V| for display normalization
  let maxAbsV = 0
  for (let i = 0; i < potential.length; i++) {
    const absV = Math.abs(potential[i]!)
    if (absV > maxAbsV) maxAbsV = absV
  }
  logger.log(
    `[TDSE] Anderson disorder: W=${config.disorderStrength}, seed=${config.disorderSeed}, ` +
      `dist=${config.disorderDistribution}, maxV=${maxAbsV.toFixed(3)}`
  )
  return maxAbsV
}
