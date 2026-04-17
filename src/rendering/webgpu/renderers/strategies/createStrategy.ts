/**
 * Factory function that maps quantum mode configuration to the appropriate strategy.
 *
 * @module rendering/webgpu/renderers/strategies/createStrategy
 */

import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { AnalyticModeStrategy } from './AnalyticModeStrategy'
import { AntiDeSitterStrategy } from './AntiDeSitterStrategy'
import { DiracStrategy } from './DiracStrategy'
import { FreeScalarFieldStrategy } from './FreeScalarFieldStrategy'
import { PauliStrategy } from './PauliStrategy'
import { QuantumWalkStrategy } from './QuantumWalkStrategy'
import { TdseBecStrategy } from './TdseBecStrategy'
import type { QuantumModeStrategy } from './types'
import { WheelerDeWittStrategy } from './WheelerDeWittStrategy'

/**
 * Create the appropriate quantum mode strategy for the given renderer configuration.
 *
 * @param config - Renderer configuration with quantum mode and feature flags
 * @returns Strategy instance that handles mode-specific compute passes and bounding radius
 */
export function createModeStrategy(config: SchrodingerRendererConfig): QuantumModeStrategy {
  // Pauli takes priority (isPauli flag overrides quantumMode)
  if (config.isPauli) {
    return new PauliStrategy()
  }

  switch (config.quantumMode) {
    case 'freeScalarField':
      return new FreeScalarFieldStrategy()
    case 'tdseDynamics':
    case 'becDynamics':
      return new TdseBecStrategy()
    case 'diracEquation':
      return new DiracStrategy()
    case 'quantumWalk':
      return new QuantumWalkStrategy()
    case 'wheelerDeWitt':
      return new WheelerDeWittStrategy()
    case 'antiDeSitter':
      return new AntiDeSitterStrategy()
    case 'harmonicOscillator':
    case 'hydrogenND':
    case 'hydrogenNDCoupled':
    default:
      return new AnalyticModeStrategy()
  }
}
