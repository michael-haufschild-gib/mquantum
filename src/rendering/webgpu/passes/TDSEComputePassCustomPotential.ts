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
        (config.trapAnisotropy ?? []).join(','),
        config.spacing.join(','),
      ].join('|')
  const custom = config.potentialType === 'custom' ? config.customPotentialExpression : ''
  return `${base}|${custom}`
}

/**
 * Parse and evaluate a custom potential expression, upload to GPU buffer.
 *
 * @param device - GPU device for buffer write
 * @param potentialBuffer - Target GPU storage buffer
 * @param config - TDSE config containing the expression and grid parameters
 */
export function uploadCustomPotentialBuffer(
  device: GPUDevice,
  potentialBuffer: GPUBuffer | null,
  config: TdseConfig
): void {
  if (!potentialBuffer) return

  const expr = config.customPotentialExpression ?? '0'
  const result = parseExpression(expr)
  if (!result.success) {
    logger.warn(`[TDSE] Custom potential parse error: ${result.error}`)
    return
  }

  const gridSize = config.gridSize.slice(0, config.latticeDim)
  const spacing = config.spacing.slice(0, config.latticeDim)
  const potential = evaluatePotentialGrid(result.evaluate, gridSize, spacing)

  device.queue.writeBuffer(potentialBuffer, 0, potential)
}
