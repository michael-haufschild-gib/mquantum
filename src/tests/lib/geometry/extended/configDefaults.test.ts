/**
 * Tests for quantum mode default configuration consistency.
 *
 * Default configs are consumed by the GPU compute passes. If array lengths
 * don't match latticeDim, or numeric values are out of their declared ranges,
 * the compute pass will either crash or produce silently wrong physics.
 *
 * These tests verify structural invariants that must hold for every default.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import {
  createDefaultSchroedingerConfig,
  DEFAULT_SCHROEDINGER_CONFIG,
} from '@/lib/geometry/extended/schroedinger'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'

describe('DEFAULT_TDSE_CONFIG structural invariants', () => {
  const cfg = DEFAULT_TDSE_CONFIG

  it('gridSize length matches latticeDim', () => {
    expect(cfg.gridSize).toHaveLength(cfg.latticeDim)
  })

  it('spacing length matches latticeDim', () => {
    expect(cfg.spacing).toHaveLength(cfg.latticeDim)
  })

  it('packetCenter length matches latticeDim', () => {
    expect(cfg.packetCenter).toHaveLength(cfg.latticeDim)
  })

  it('packetMomentum length matches latticeDim', () => {
    expect(cfg.packetMomentum).toHaveLength(cfg.latticeDim)
  })

  it('all gridSize values are positive powers of 2', () => {
    for (const g of cfg.gridSize) {
      expect(g).toBeGreaterThan(0)
      expect(Math.log2(g) % 1).toBe(0)
    }
  })

  it('all spacing values are positive', () => {
    for (const s of cfg.spacing) {
      expect(s).toBeGreaterThan(0)
    }
  })

  it('dt is positive and within valid range', () => {
    expect(cfg.dt).toBeGreaterThan(0)
    expect(cfg.dt).toBeLessThanOrEqual(0.05)
  })

  it('stepsPerFrame is within [1, 16]', () => {
    expect(cfg.stepsPerFrame).toBeGreaterThanOrEqual(1)
    expect(cfg.stepsPerFrame).toBeLessThanOrEqual(16)
  })

  it('mass is positive', () => {
    expect(cfg.mass).toBeGreaterThan(0)
  })

  it('hbar is positive', () => {
    expect(cfg.hbar).toBeGreaterThan(0)
  })

  it('slicePositions length matches max(0, latticeDim - 3)', () => {
    expect(cfg.slicePositions).toHaveLength(Math.max(0, cfg.latticeDim - 3))
  })

  it('needsReset is false by default', () => {
    expect(cfg.needsReset).toBe(false)
  })

  it('absorberWidth is within [0.05, 0.5]', () => {
    expect(cfg.absorberWidth).toBeGreaterThanOrEqual(0.05)
    expect(cfg.absorberWidth).toBeLessThanOrEqual(0.5)
  })

  it('pmlTargetReflection is positive and small', () => {
    expect(cfg.pmlTargetReflection).toBeGreaterThan(0)
    expect(cfg.pmlTargetReflection).toBeLessThan(0.1)
  })
})

describe('DEFAULT_BEC_CONFIG structural invariants', () => {
  const cfg = DEFAULT_BEC_CONFIG

  it('gridSize length matches latticeDim', () => {
    expect(cfg.gridSize).toHaveLength(cfg.latticeDim)
  })

  it('spacing length matches latticeDim', () => {
    expect(cfg.spacing).toHaveLength(cfg.latticeDim)
  })

  it('all gridSize values are positive powers of 2', () => {
    for (const g of cfg.gridSize) {
      expect(g).toBeGreaterThan(0)
      expect(Math.log2(g) % 1).toBe(0)
    }
  })

  it('interactionStrength is non-negative for repulsive BEC', () => {
    expect(cfg.interactionStrength).toBeGreaterThanOrEqual(0)
  })

  it('trapAnisotropy length matches latticeDim', () => {
    expect(cfg.trapAnisotropy).toHaveLength(cfg.latticeDim)
  })

  it('all trapAnisotropy values are positive', () => {
    for (const a of cfg.trapAnisotropy) {
      expect(a).toBeGreaterThan(0)
    }
  })

  it('needsReset is true by default (needs first initialization)', () => {
    expect(cfg.needsReset).toBe(true)
  })
})

describe('DEFAULT_DIRAC_CONFIG structural invariants', () => {
  const cfg = DEFAULT_DIRAC_CONFIG

  it('gridSize length matches latticeDim', () => {
    expect(cfg.gridSize).toHaveLength(cfg.latticeDim)
  })

  it('spacing length matches latticeDim', () => {
    expect(cfg.spacing).toHaveLength(cfg.latticeDim)
  })

  it('mass is positive', () => {
    expect(cfg.mass).toBeGreaterThan(0)
  })

  it('speedOfLight is positive', () => {
    expect(cfg.speedOfLight).toBeGreaterThan(0)
  })

  it('needsReset is true by default (needs first initialization)', () => {
    expect(cfg.needsReset).toBe(true)
  })
})

describe('DEFAULT_FREE_SCALAR_CONFIG structural invariants', () => {
  const cfg = DEFAULT_FREE_SCALAR_CONFIG

  it('gridSize length matches latticeDim', () => {
    expect(cfg.gridSize).toHaveLength(cfg.latticeDim)
  })

  it('spacing length matches latticeDim', () => {
    expect(cfg.spacing).toHaveLength(cfg.latticeDim)
  })

  it('mass is non-negative', () => {
    expect(cfg.mass).toBeGreaterThanOrEqual(0)
  })

  it('needsReset is false by default', () => {
    expect(cfg.needsReset).toBe(false)
  })
})

describe('DEFAULT_SCHROEDINGER_CONFIG structural invariants', () => {
  const cfg = DEFAULT_SCHROEDINGER_CONFIG

  it('quantum number constraints: 0 <= l < n, -l <= m <= l', () => {
    const { principalQuantumNumber: n, azimuthalQuantumNumber: l, magneticQuantumNumber: m } = cfg
    expect(l).toBeGreaterThanOrEqual(0)
    expect(l).toBeLessThan(n)
    expect(m).toBeGreaterThanOrEqual(-l)
    expect(m).toBeLessThanOrEqual(l)
  })

  it('extraDimQuantumNumbers has exactly 8 elements', () => {
    expect(cfg.extraDimQuantumNumbers).toHaveLength(8)
  })

  it('extraDimOmega has exactly 8 elements', () => {
    expect(cfg.extraDimOmega).toHaveLength(8)
  })

  it('all extraDimQuantumNumbers are non-negative integers', () => {
    for (const n of cfg.extraDimQuantumNumbers) {
      expect(n).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(n)).toBe(true)
    }
  })

  it('all extraDimOmega values are positive', () => {
    for (const w of cfg.extraDimOmega) {
      expect(w).toBeGreaterThan(0)
    }
  })

  it('scale is within valid range [0.1, 2.0]', () => {
    expect(cfg.scale).toBeGreaterThanOrEqual(0.1)
    expect(cfg.scale).toBeLessThanOrEqual(2.0)
  })

  it('termCount is within valid range [1, 8]', () => {
    expect(cfg.termCount).toBeGreaterThanOrEqual(1)
    expect(cfg.termCount).toBeLessThanOrEqual(8)
  })

  it('bilocal ER bridge defaults are in shader control ranges', () => {
    expect(cfg.bilocalERBridgeEnabled).toBe(false)
    expect(cfg.bilocalERBridgeStrength).toBeGreaterThanOrEqual(0)
    expect(cfg.bilocalERBridgeStrength).toBeLessThanOrEqual(2)
    expect(cfg.bilocalERBridgeThroatRadius).toBeGreaterThanOrEqual(0.05)
    expect(cfg.bilocalERBridgeThroatRadius).toBeLessThanOrEqual(2)
    expect(cfg.bilocalERBridgePhaseLock).toBeGreaterThanOrEqual(0)
    expect(cfg.bilocalERBridgePhaseLock).toBeLessThanOrEqual(1)
  })

  it('entropic time-shear defaults are in shader control ranges', () => {
    expect(cfg.entropicTimeShearEnabled).toBe(false)
    expect(cfg.entropicTimeShearStrength).toBeGreaterThanOrEqual(0)
    expect(cfg.entropicTimeShearStrength).toBeLessThanOrEqual(2)
    expect(cfg.entropicTimeShearFilamentScale).toBeGreaterThanOrEqual(0.1)
    expect(cfg.entropicTimeShearFilamentScale).toBeLessThanOrEqual(4)
    expect(cfg.entropicTimeShearIrreversibility).toBeGreaterThanOrEqual(0)
    expect(cfg.entropicTimeShearIrreversibility).toBeLessThanOrEqual(1)
    expect(cfg.bornNullWeaveEnabled).toBe(false)
    expect(cfg.bornNullWeaveStrength).toBeGreaterThanOrEqual(0)
    expect(cfg.bornNullWeaveStrength).toBeLessThanOrEqual(2)
    expect(cfg.bornNullWeaveNodeWidth).toBeGreaterThanOrEqual(0.0001)
    expect(cfg.bornNullWeaveNodeWidth).toBeLessThanOrEqual(0.2)
    expect(cfg.bornNullWeaveCirculation).toBeGreaterThanOrEqual(0)
    expect(cfg.bornNullWeaveCirculation).toBeLessThanOrEqual(8)
  })

  it('spectral dimension flow defaults are in shader control ranges', () => {
    expect(cfg.spectralDimensionFlowEnabled).toBe(false)
    expect(cfg.spectralDimensionFlowStrength).toBeGreaterThanOrEqual(0)
    expect(cfg.spectralDimensionFlowStrength).toBeLessThanOrEqual(2)
    expect(cfg.spectralDimensionFlowUvDimension).toBeGreaterThanOrEqual(1)
    expect(cfg.spectralDimensionFlowUvDimension).toBeLessThanOrEqual(4)
    expect(cfg.spectralDimensionFlowDiffusionScale).toBeGreaterThanOrEqual(0)
    expect(cfg.spectralDimensionFlowDiffusionScale).toBeLessThanOrEqual(2)
  })

  it('vacuum bubble lens defaults are in shader control ranges', () => {
    expect(cfg.vacuumBubbleLensEnabled).toBe(false)
    expect(cfg.vacuumBubbleLensStrength).toBeGreaterThanOrEqual(0)
    expect(cfg.vacuumBubbleLensStrength).toBeLessThanOrEqual(2)
    expect(cfg.vacuumBubbleWallRadius).toBeGreaterThanOrEqual(0.05)
    expect(cfg.vacuumBubbleWallRadius).toBeLessThanOrEqual(1)
    expect(cfg.vacuumBubbleWallThickness).toBeGreaterThanOrEqual(0.01)
    expect(cfg.vacuumBubbleWallThickness).toBeLessThanOrEqual(0.5)
    expect(cfg.vacuumBubbleTension).toBeGreaterThanOrEqual(0)
    expect(cfg.vacuumBubbleTension).toBeLessThanOrEqual(2)
    expect(cfg.vacuumBubbleBias).toBeGreaterThanOrEqual(0)
    expect(cfg.vacuumBubbleBias).toBeLessThanOrEqual(2)
  })

  it('cosineParams has correct structure', () => {
    for (const key of ['a', 'b', 'c', 'd'] as const) {
      expect(cfg.cosineParams[key]).toHaveLength(3)
      for (const v of cfg.cosineParams[key]) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
  })

  it('basisX, basisY, basisZ are orthonormal', () => {
    const dotXY = Array.from(cfg.basisX).reduce((sum, v, i) => sum + v * cfg.basisY[i]!, 0)
    const dotXZ = Array.from(cfg.basisX).reduce((sum, v, i) => sum + v * cfg.basisZ[i]!, 0)
    const dotYZ = Array.from(cfg.basisY).reduce((sum, v, i) => sum + v * cfg.basisZ[i]!, 0)
    expect(dotXY).toBeCloseTo(0, 10)
    expect(dotXZ).toBeCloseTo(0, 10)
    expect(dotYZ).toBeCloseTo(0, 10)

    const magX = Math.sqrt(Array.from(cfg.basisX).reduce((sum, v) => sum + v * v, 0))
    const magY = Math.sqrt(Array.from(cfg.basisY).reduce((sum, v) => sum + v * v, 0))
    const magZ = Math.sqrt(Array.from(cfg.basisZ).reduce((sum, v) => sum + v * v, 0))
    expect(magX).toBeCloseTo(1, 10)
    expect(magY).toBeCloseTo(1, 10)
    expect(magZ).toBeCloseTo(1, 10)
  })

  it('TDSE sub-config has needsReset=false (standard TDSE starts ready)', () => {
    expect(cfg.tdse.needsReset).toBe(false)
  })

  it('BEC and Dirac sub-configs have needsReset=true (need first init)', () => {
    expect(cfg.bec.needsReset).toBe(true)
    expect(cfg.dirac.needsReset).toBe(true)
  })

  it('createDefaultSchroedingerConfig returns mutation-isolated nested config', () => {
    const first = createDefaultSchroedingerConfig()
    const second = createDefaultSchroedingerConfig()

    expect(first).toEqual(DEFAULT_SCHROEDINGER_CONFIG)
    expect(first.tdse).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse)
    expect(first.tdse).not.toBe(second.tdse)
    expect(first.tdse.gridSize).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.gridSize)
    expect(first.extraDimQuantumNumbers).not.toBe(
      DEFAULT_SCHROEDINGER_CONFIG.extraDimQuantumNumbers
    )
    expect(first.cosineParams.a).not.toBe(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.a)

    first.tdse.gridSize[0] = 128
    first.extraDimQuantumNumbers[0] = 7
    first.cosineParams.a[0] = 1.5

    expect(second.tdse.gridSize[0]).toBe(DEFAULT_SCHROEDINGER_CONFIG.tdse.gridSize[0])
    expect(second.extraDimQuantumNumbers[0]).toBe(
      DEFAULT_SCHROEDINGER_CONFIG.extraDimQuantumNumbers[0]
    )
    expect(second.cosineParams.a[0]).toBe(DEFAULT_SCHROEDINGER_CONFIG.cosineParams.a[0])
  })
})
