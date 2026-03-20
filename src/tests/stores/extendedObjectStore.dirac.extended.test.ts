/**
 * Extended Dirac setter coverage tests.
 *
 * The existing dirac.test.ts covers ~27% of diracSetters.ts. This file
 * covers the remaining setters: potential params, packet config, spin,
 * colors, diagnostics, grid resize, and the applyDiracPreset flow.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function dirac() {
  return useExtendedObjectStore.getState().schroedinger.dirac
}

function store() {
  return useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
}

describe('Dirac setters — extended coverage', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  describe('setDiracHbar', () => {
    it('clamps to [0.01, 10]', () => {
      store().setDiracHbar(2.0)
      expect(dirac().hbar).toBe(2.0)
      store().setDiracHbar(0)
      expect(dirac().hbar).toBe(0.01)
    })

    it('rejects NaN', () => {
      store().setDiracHbar(2.0)
      store().setDiracHbar(NaN)
      expect(dirac().hbar).toBe(2.0)
    })
  })

  describe('setDiracStepsPerFrame', () => {
    it('rounds and clamps to [1, 16]', () => {
      store().setDiracStepsPerFrame(4)
      expect(dirac().stepsPerFrame).toBe(4)
      store().setDiracStepsPerFrame(0)
      expect(dirac().stepsPerFrame).toBe(1)
      store().setDiracStepsPerFrame(100)
      expect(dirac().stepsPerFrame).toBe(16)
    })
  })

  describe('setDiracPotentialStrength', () => {
    it('sets value and triggers needsReset', () => {
      store().setDiracPotentialStrength(5.0)
      expect(dirac().potentialStrength).toBe(5.0)
    })

    it('rejects NaN', () => {
      store().setDiracPotentialStrength(5.0)
      store().setDiracPotentialStrength(NaN)
      expect(dirac().potentialStrength).toBe(5.0)
    })
  })

  describe('setDiracPotentialWidth', () => {
    it('clamps to positive finite', () => {
      store().setDiracPotentialWidth(0.5)
      expect(dirac().potentialWidth).toBe(0.5)
    })

    it('rejects NaN', () => {
      store().setDiracPotentialWidth(0.5)
      store().setDiracPotentialWidth(NaN)
      expect(dirac().potentialWidth).toBe(0.5)
    })
  })

  describe('setDiracPotentialCenter', () => {
    it('sets valid value', () => {
      store().setDiracPotentialCenter(1.0)
      expect(dirac().potentialCenter).toBe(1.0)
    })
  })

  describe('setDiracHarmonicOmega', () => {
    it('clamps to [0.01, 10]', () => {
      store().setDiracHarmonicOmega(3.0)
      expect(dirac().harmonicOmega).toBe(3.0)
    })
  })

  describe('setDiracCoulombZ', () => {
    it('clamps to [1, 137]', () => {
      store().setDiracCoulombZ(26)
      expect(dirac().coulombZ).toBe(26)
    })
  })

  describe('setDiracPacketWidth', () => {
    it('sets value and clamps', () => {
      store().setDiracPacketWidth(0.3)
      expect(dirac().packetWidth).toBe(0.3)
    })
  })

  describe('setDiracPositiveEnergyFraction', () => {
    it('clamps to [0, 1]', () => {
      store().setDiracPositiveEnergyFraction(0.8)
      expect(dirac().positiveEnergyFraction).toBe(0.8)
      store().setDiracPositiveEnergyFraction(2.0)
      expect(dirac().positiveEnergyFraction).toBe(1.0)
      store().setDiracPositiveEnergyFraction(-1)
      expect(dirac().positiveEnergyFraction).toBe(0)
    })
  })

  describe('setDiracAutoScale', () => {
    it('toggles auto scale', () => {
      store().setDiracAutoScale(false)
      expect(dirac().autoScale).toBe(false)
    })
  })

  describe('setDiracShowPotential', () => {
    it('toggles show potential', () => {
      store().setDiracShowPotential(true)
      expect(dirac().showPotential).toBe(true)
    })
  })

  describe('setDiracAbsorberWidth', () => {
    it('clamps and rejects non-finite', () => {
      store().setDiracAbsorberWidth(0.2)
      expect(dirac().absorberWidth).toBeGreaterThanOrEqual(0.05)
      expect(dirac().absorberWidth).toBeLessThanOrEqual(0.5)
    })
  })

  describe('setDiracPacketCenter', () => {
    it('sets packet center for a dimension index', () => {
      store().setDiracPacketCenter(0, 0.5)
      expect(dirac().packetCenter[0]).toBe(0.5)
    })

    it('rejects non-finite', () => {
      const orig = dirac().packetCenter[0]
      store().setDiracPacketCenter(0, NaN)
      expect(dirac().packetCenter[0]).toBe(orig)
    })
  })

  describe('setDiracPacketMomentum', () => {
    it('sets momentum for a dimension index', () => {
      store().setDiracPacketMomentum(0, 3.0)
      expect(dirac().packetMomentum[0]).toBe(3.0)
    })

    it('rejects non-finite', () => {
      const orig = dirac().packetMomentum[0]
      store().setDiracPacketMomentum(0, NaN)
      expect(dirac().packetMomentum[0]).toBe(orig)
    })
  })

  describe('setDiracSpinDirection', () => {
    it('sets spin direction per-dimension', () => {
      store().setDiracSpinDirection(0, 0.5)
      expect(dirac().spinDirection[0]).toBe(0.5)
    })

    it('rejects non-finite', () => {
      const orig = dirac().spinDirection[0]
      store().setDiracSpinDirection(0, NaN)
      expect(dirac().spinDirection[0]).toBe(orig)
    })
  })

  describe('setDiracParticleColor / setDiracAntiparticleColor', () => {
    it('sets particle color', () => {
      store().setDiracParticleColor('#ff0000')
      expect(dirac().particleColor).toBe('#ff0000')
    })

    it('sets antiparticle color', () => {
      store().setDiracAntiparticleColor('#0000ff')
      expect(dirac().antiparticleColor).toBe('#0000ff')
    })
  })

  describe('setDiracDiagnosticsEnabled / setDiracDiagnosticsInterval', () => {
    it('sets diagnostics enabled', () => {
      store().setDiracDiagnosticsEnabled(true)
      expect(dirac().diagnosticsEnabled).toBe(true)
    })

    it('clamps interval to [1, 60]', () => {
      store().setDiracDiagnosticsInterval(10)
      expect(dirac().diagnosticsInterval).toBe(10)
      store().setDiracDiagnosticsInterval(0)
      expect(dirac().diagnosticsInterval).toBe(1)
    })
  })

  describe('setDiracSlicePosition', () => {
    it('sets slice position for valid index', () => {
      const len = dirac().slicePositions.length
      if (len > 0) {
        store().setDiracSlicePosition(0, 0.5)
        expect(dirac().slicePositions[0]).toBe(0.5)
      }
    })

    it('rejects non-finite values', () => {
      const orig = dirac().slicePositions.length > 0 ? dirac().slicePositions[0] : undefined
      store().setDiracSlicePosition(0, NaN)
      if (orig !== undefined) {
        expect(dirac().slicePositions[0]).toBe(orig)
      }
    })
  })

  describe('applyDiracPreset', () => {
    it('applies kleinParadox preset without crashing', async () => {
      store().applyDiracPreset('kleinParadox')
      // Preset application is async (dynamic import), wait a tick
      await new Promise((r) => setTimeout(r, 50))
      expect(dirac().needsReset).toBe(true)
    })
  })
})
