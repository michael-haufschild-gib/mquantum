import { describe, expect, it } from 'vitest'
import { buildLindbladChannels } from '@/lib/physics/openQuantum/channels'
import type { OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

/** Helper: config with all channels disabled */
function allDisabledConfig(): OpenQuantumConfig {
  return {
    ...DEFAULT_OPEN_QUANTUM_CONFIG,
    dephasingEnabled: false,
    relaxationEnabled: false,
    thermalEnabled: false,
    dephasingRate: 0,
    relaxationRate: 0,
    thermalUpRate: 0,
  }
}

/** Helper: config with specific channels enabled and nonzero rates */
function configWith(
  overrides: Partial<OpenQuantumConfig>,
): OpenQuantumConfig {
  return { ...allDisabledConfig(), ...overrides }
}

describe('buildLindbladChannels', () => {
  const K = 4

  describe('empty output', () => {
    it('returns empty array when no channels are enabled', () => {
      const result = buildLindbladChannels(allDisabledConfig(), K)
      expect(result).toEqual([])
    })

    it('returns empty array when channel is enabled but rate is zero', () => {
      const cfg = configWith({ dephasingEnabled: true, dephasingRate: 0 })
      expect(buildLindbladChannels(cfg, K)).toEqual([])
    })

    it('returns empty array when rate is nonzero but channel is disabled', () => {
      const cfg = configWith({ dephasingEnabled: false, dephasingRate: 1.0 })
      expect(buildLindbladChannels(cfg, K)).toEqual([])
    })
  })

  describe('dephasing channels', () => {
    const gamma = 0.5
    const cfg = configWith({ dephasingEnabled: true, dephasingRate: gamma })

    it('produces K channels (one per basis state)', () => {
      const channels = buildLindbladChannels(cfg, K)
      expect(channels).toHaveLength(K)
    })

    it('each channel is a diagonal projector |k><k|', () => {
      const channels = buildLindbladChannels(cfg, K)
      for (let k = 0; k < K; k++) {
        expect(channels[k]!.row).toBe(k)
        expect(channels[k]!.col).toBe(k)
      }
    })

    it('amplitude equals sqrt(gamma) with zero imaginary part', () => {
      const channels = buildLindbladChannels(cfg, K)
      const expectedAmp = Math.sqrt(gamma)
      for (const ch of channels) {
        expect(ch.amplitudeRe).toBeCloseTo(expectedAmp, 12)
        expect(ch.amplitudeIm).toBe(0)
      }
    })
  })

  describe('relaxation channels', () => {
    const gamma = 2.0
    const cfg = configWith({ relaxationEnabled: true, relaxationRate: gamma })

    it('produces K-1 channels (one per excited state)', () => {
      const channels = buildLindbladChannels(cfg, K)
      expect(channels).toHaveLength(K - 1)
    })

    it('each channel maps excited state k to ground state: |0><k|', () => {
      const channels = buildLindbladChannels(cfg, K)
      for (let i = 0; i < channels.length; i++) {
        expect(channels[i]!.row).toBe(0)
        expect(channels[i]!.col).toBe(i + 1)
      }
    })

    it('amplitude equals sqrt(gamma) with zero imaginary part', () => {
      const channels = buildLindbladChannels(cfg, K)
      const expectedAmp = Math.sqrt(gamma)
      for (const ch of channels) {
        expect(ch.amplitudeRe).toBeCloseTo(expectedAmp, 12)
        expect(ch.amplitudeIm).toBe(0)
      }
    })
  })

  describe('thermal excitation channels', () => {
    const gamma = 0.3
    const cfg = configWith({ thermalEnabled: true, thermalUpRate: gamma })

    it('produces K-1 channels (ground to each excited state)', () => {
      const channels = buildLindbladChannels(cfg, K)
      expect(channels).toHaveLength(K - 1)
    })

    it('each channel maps ground state to excited state k: |k><0|', () => {
      const channels = buildLindbladChannels(cfg, K)
      for (let i = 0; i < channels.length; i++) {
        expect(channels[i]!.row).toBe(i + 1)
        expect(channels[i]!.col).toBe(0)
      }
    })

    it('amplitude equals sqrt(gamma) with zero imaginary part', () => {
      const channels = buildLindbladChannels(cfg, K)
      const expectedAmp = Math.sqrt(gamma)
      for (const ch of channels) {
        expect(ch.amplitudeRe).toBeCloseTo(expectedAmp, 12)
        expect(ch.amplitudeIm).toBe(0)
      }
    })
  })

  describe('all channels enabled', () => {
    const cfg: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      dephasingEnabled: true,
      dephasingRate: 1.0,
      relaxationEnabled: true,
      relaxationRate: 1.0,
      thermalEnabled: true,
      thermalUpRate: 1.0,
    }

    it('produces K + (K-1) + (K-1) = 3K-2 channels total', () => {
      const channels = buildLindbladChannels(cfg, K)
      expect(channels).toHaveLength(3 * K - 2)
    })

    it('channels appear in order: dephasing, relaxation, thermal', () => {
      const channels = buildLindbladChannels(cfg, K)

      // First K: dephasing (diagonal)
      for (let i = 0; i < K; i++) {
        expect(channels[i]!.row).toBe(i)
        expect(channels[i]!.col).toBe(i)
      }

      // Next K-1: relaxation (row=0, col=1..K-1)
      for (let i = 0; i < K - 1; i++) {
        expect(channels[K + i]!.row).toBe(0)
        expect(channels[K + i]!.col).toBe(i + 1)
      }

      // Last K-1: thermal (row=1..K-1, col=0)
      for (let i = 0; i < K - 1; i++) {
        expect(channels[2 * K - 1 + i]!.row).toBe(i + 1)
        expect(channels[2 * K - 1 + i]!.col).toBe(0)
      }
    })
  })

  describe('edge cases', () => {
    it('K=1 with all channels enabled produces only 1 dephasing channel', () => {
      const cfg: OpenQuantumConfig = {
        ...DEFAULT_OPEN_QUANTUM_CONFIG,
        dephasingEnabled: true,
        dephasingRate: 1.0,
        relaxationEnabled: true,
        relaxationRate: 1.0,
        thermalEnabled: true,
        thermalUpRate: 1.0,
      }
      const channels = buildLindbladChannels(cfg, 1)
      // K=1: dephasing=1, relaxation=0, thermal=0
      expect(channels).toHaveLength(1)
      expect(channels[0]).toEqual({
        row: 0,
        col: 0,
        amplitudeRe: Math.sqrt(1.0),
        amplitudeIm: 0,
      })
    })

    it('K=0 with all channels enabled produces no channels', () => {
      const cfg: OpenQuantumConfig = {
        ...DEFAULT_OPEN_QUANTUM_CONFIG,
        dephasingEnabled: true,
        dephasingRate: 1.0,
        relaxationEnabled: true,
        relaxationRate: 1.0,
        thermalEnabled: true,
        thermalUpRate: 1.0,
      }
      expect(buildLindbladChannels(cfg, 0)).toEqual([])
    })

    it('different rates produce different amplitudes per channel type', () => {
      const cfg = configWith({
        dephasingEnabled: true,
        dephasingRate: 0.25,
        relaxationEnabled: true,
        relaxationRate: 4.0,
        thermalEnabled: true,
        thermalUpRate: 1.0,
      })
      const channels = buildLindbladChannels(cfg, 2)
      // K=2: 2 dephasing + 1 relaxation + 1 thermal = 4
      expect(channels).toHaveLength(4)
      expect(channels[0]!.amplitudeRe).toBeCloseTo(0.5, 12)   // sqrt(0.25)
      expect(channels[1]!.amplitudeRe).toBeCloseTo(0.5, 12)   // sqrt(0.25)
      expect(channels[2]!.amplitudeRe).toBeCloseTo(2.0, 12)   // sqrt(4.0)
      expect(channels[3]!.amplitudeRe).toBeCloseTo(1.0, 12)   // sqrt(1.0)
    })
  })
})
