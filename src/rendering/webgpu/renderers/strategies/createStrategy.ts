/**
 * Factory function that maps quantum mode configuration to the appropriate strategy.
 *
 * @module rendering/webgpu/renderers/strategies/createStrategy
 */

import { getQuantumTypeStrategyKind } from '@/lib/geometry/registry'

import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { AnalyticModeStrategy } from './AnalyticModeStrategy'
import type { QuantumModeStrategy } from './types'

/** Lightweight placeholder used before async pipeline setup selects the real strategy. */
export function createInitialModeStrategy(): QuantumModeStrategy {
  return new AnalyticModeStrategy()
}

/**
 * Create the appropriate quantum mode strategy for the given renderer configuration.
 *
 * @param config - Renderer configuration with quantum mode and feature flags
 * @returns Strategy instance that handles mode-specific compute passes and bounding radius
 */
export async function createModeStrategy(
  config: SchrodingerRendererConfig
): Promise<QuantumModeStrategy> {
  // Pauli takes priority (isPauli flag overrides quantumMode)
  if (config.isPauli) {
    const { PauliStrategy } = await import('./PauliStrategy')
    return new PauliStrategy()
  }

  // Bell-pair owns its own ObjectType, so the renderer config carries an
  // isBellPair flag rather than a quantum-mode discriminator.
  if (config.isBellPair) {
    const { BellPairStrategy } = await import('./BellPairStrategy')
    return new BellPairStrategy()
  }

  const strategyKind = config.quantumMode
    ? getQuantumTypeStrategyKind(config.quantumMode)
    : undefined

  switch (strategyKind) {
    case 'freeScalarField': {
      const { FreeScalarFieldStrategy } = await import('./FreeScalarFieldStrategy')
      return new FreeScalarFieldStrategy()
    }
    case 'tdseBec': {
      const { TdseBecStrategy } = await import('./TdseBecStrategy')
      return new TdseBecStrategy()
    }
    case 'dirac': {
      const { DiracStrategy } = await import('./DiracStrategy')
      return new DiracStrategy()
    }
    case 'quantumWalk': {
      const { QuantumWalkStrategy } = await import('./QuantumWalkStrategy')
      return new QuantumWalkStrategy()
    }
    case 'wheelerDeWitt': {
      const { WheelerDeWittStrategy } = await import('./WheelerDeWittStrategy')
      return new WheelerDeWittStrategy()
    }
    case 'antiDeSitter': {
      const { AntiDeSitterStrategy } = await import('./AntiDeSitterStrategy')
      return new AntiDeSitterStrategy()
    }
    case 'analytic':
    default:
      return new AnalyticModeStrategy()
  }
}
