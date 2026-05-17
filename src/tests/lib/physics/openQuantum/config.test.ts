import { describe, expect, it } from 'vitest'

import {
  DEFAULT_OPEN_QUANTUM_CONFIG,
  sanitizeOpenQuantumConfig,
} from '@/lib/physics/openQuantum/types'

describe('sanitizeOpenQuantumConfig', () => {
  it('clamps loaded numeric controls and rejects invalid enums before physics use', () => {
    const sanitized = sanitizeOpenQuantumConfig({
      enabled: true,
      dt: Infinity,
      substeps: NaN,
      dephasingRate: -1,
      relaxationRate: 99,
      thermalUpRate: Number.POSITIVE_INFINITY,
      dephasingEnabled: 'yes',
      relaxationEnabled: true,
      thermalEnabled: null,
      resetToken: -4,
      visualizationMode: 'phase',
      bathTemperature: 0,
      couplingScale: Number.NaN,
      dephasingModel: 'bogus',
      hydrogenBasisMaxN: 99,
    })

    expect(sanitized.enabled).toBe(true)
    expect(sanitized.dt).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.dt)
    expect(sanitized.substeps).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.substeps)
    expect(sanitized.dephasingRate).toBe(0)
    expect(sanitized.relaxationRate).toBe(5)
    expect(sanitized.thermalUpRate).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.thermalUpRate)
    expect(sanitized.dephasingEnabled).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.dephasingEnabled)
    expect(sanitized.relaxationEnabled).toBe(true)
    expect(sanitized.thermalEnabled).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.thermalEnabled)
    expect(sanitized.resetToken).toBe(0)
    expect(sanitized.visualizationMode).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.visualizationMode)
    expect(sanitized.bathTemperature).toBe(0.1)
    expect(sanitized.couplingScale).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.couplingScale)
    expect(sanitized.dephasingModel).toBe(DEFAULT_OPEN_QUANTUM_CONFIG.dephasingModel)
    expect(sanitized.hydrogenBasisMaxN).toBe(3)
  })
})
