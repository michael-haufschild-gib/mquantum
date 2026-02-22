import { describe, expect, it } from 'vitest'

import { buildHydrogenBasis, basisEnergies } from '@/lib/physics/openQuantum/hydrogenBasis'
import { buildHydrogenChannels } from '@/lib/physics/openQuantum/hydrogenChannels'
import { buildTransitionRates } from '@/lib/physics/openQuantum/hydrogenRates'
import { isAllowedE1 } from '@/lib/physics/openQuantum/selectionRules'

/**
 * Helper: build basis, rates, and channels for a given maxN and temperature.
 */
function buildTestChannels(
  maxN: number,
  temperature: number,
  dephasingRate: number,
  dephasingEnabled: boolean,
) {
  const basis = buildHydrogenBasis(maxN, 3)
  const rates = buildTransitionRates(basis, temperature)
  const channels = buildHydrogenChannels(basis, rates, dephasingRate, dephasingEnabled)
  return { basis, rates, channels }
}

describe('buildHydrogenChannels', () => {
  it('produces channels for maxN=2 at T=300K', () => {
    // Bug caught: buildHydrogenChannels returns empty array when it should
    // produce emission/absorption channels for allowed E1 transitions.
    const { channels } = buildTestChannels(2, 300, 0, false)
    expect(channels.length).toBeGreaterThan(0)
  })

  it('includes emission channels (|to⟩⟨from| where from has higher energy)', () => {
    // Bug caught: emission channels have wrong row/col assignment (swapped
    // ket/bra indices), which would reverse the direction of population transfer.
    const { basis, channels } = buildTestChannels(2, 300, 0, false)

    // Find channels where row < col (to < from in index), indicating downward transition.
    // Because basis is sorted by energy ascending, a lower index means lower energy.
    const emissionChannels = channels.filter((ch) => {
      // Emission: row = to (lower energy), col = from (higher energy)
      // Since basis is sorted ascending by energy, to.index < from.index → row < col
      return ch.row < ch.col
    })

    expect(emissionChannels.length).toBeGreaterThan(0)

    // Verify each emission channel connects states where from has strictly higher energy
    for (const ch of emissionChannels) {
      const toState = basis[ch.row]!
      const fromState = basis[ch.col]!
      expect(fromState.energy).toBeGreaterThan(toState.energy)
    }
  })

  it('includes absorption channels (|from⟩⟨to| where to has higher energy)', () => {
    // Bug caught: absorption channels missing entirely (gammaUp always zero)
    // or have wrong row/col mapping.
    //
    // At T=300K, hydrogen transition frequencies are ~0.75 Hartree while kT ≈ 9.5e-4 Hartree,
    // so thermal occupation is negligible. Use T=100000K to get meaningful absorption.
    const { basis, channels } = buildTestChannels(2, 100000, 0, false)

    // Absorption: row = from (higher energy), col = to (lower energy) → row > col
    const absorptionChannels = channels.filter((ch) => ch.row > ch.col)

    // At T=100000K, thermal photon number is non-negligible → absorption channels exist
    expect(absorptionChannels.length).toBeGreaterThan(0)

    // Verify each absorption channel goes from lower to higher energy state
    for (const ch of absorptionChannels) {
      const fromState = basis[ch.col]! // bra index (lower energy)
      const toState = basis[ch.row]!   // ket index (higher energy)
      expect(toState.energy).toBeGreaterThan(fromState.energy)
    }
  })

  it('includes diagonal dephasing channels when dephasing is enabled', () => {
    // Bug caught: dephasing channels missing (dephasing logic never runs)
    // or produces off-diagonal channels instead of |k⟩⟨k| projectors.
    const { basis, channels } = buildTestChannels(2, 300, 0.5, true)

    const diagonalChannels = channels.filter((ch) => ch.row === ch.col)

    // Should have exactly K diagonal channels (one per basis state)
    expect(diagonalChannels.length).toBe(basis.length)

    // Each diagonal channel should have amplitude = sqrt(dephasingRate)
    const expectedAmp = Math.sqrt(0.5)
    for (const ch of diagonalChannels) {
      expect(ch.amplitudeRe).toBeCloseTo(expectedAmp, 10)
    }
  })

  it('has no diagonal channels when dephasing is disabled', () => {
    // Bug caught: dephasing channels leak in even when dephasingEnabled=false.
    const { channels } = buildTestChannels(2, 300, 0.5, false)

    const diagonalChannels = channels.filter((ch) => ch.row === ch.col)
    expect(diagonalChannels.length).toBe(0)
  })

  it('has no diagonal channels when dephasingRate is zero', () => {
    // Bug caught: dephasing channels with zero amplitude added needlessly.
    const { channels } = buildTestChannels(2, 300, 0, true)

    const diagonalChannels = channels.filter((ch) => ch.row === ch.col)
    expect(diagonalChannels.length).toBe(0)
  })

  it('all channel amplitudes are real and non-negative', () => {
    // Bug caught: amplitudeIm set to non-zero, or amplitudeRe is negative
    // (should be sqrt of a non-negative rate).
    const { channels } = buildTestChannels(2, 300, 0.5, true)

    for (const ch of channels) {
      expect(ch.amplitudeIm).toBe(0)
      expect(ch.amplitudeRe).toBeGreaterThanOrEqual(0)
    }
  })

  it('no channels connect forbidden E1 transitions', () => {
    // Bug caught: channels created for transitions that violate
    // Δl = ±1 or |Δm| > 1 selection rules.
    const { basis, channels } = buildTestChannels(3, 300, 0, false)

    // Off-diagonal channels represent transitions
    const transitionChannels = channels.filter((ch) => ch.row !== ch.col)

    for (const ch of transitionChannels) {
      // Determine which basis states are involved.
      // Emission: row=to, col=from. Absorption: row=from(higher), col=to(lower).
      // Either way, both indices must correspond to E1-allowed pairs.
      const stateA = basis[ch.row]!
      const stateB = basis[ch.col]!
      expect(isAllowedE1(stateA, stateB)).toBe(true)
    }
  })

  it('emission rate exceeds absorption rate at finite temperature (detailed balance)', () => {
    // Bug caught: gammaDown/gammaUp reversed, violating thermodynamic consistency.
    // At any finite temperature, stimulated+spontaneous emission > thermal absorption.
    const { channels } = buildTestChannels(2, 300, 0, false)

    // Group channels by transition pair (same pair has one emission + one absorption)
    const emissionChannels = channels.filter((ch) => ch.row < ch.col)
    const absorptionChannels = channels.filter((ch) => ch.row > ch.col)

    // For each emission channel, find its paired absorption channel
    for (const emCh of emissionChannels) {
      const abCh = absorptionChannels.find(
        (a) => a.row === emCh.col && a.col === emCh.row,
      )
      // amplitude² = rate, so emission amplitude > absorption amplitude
      if (abCh) {
        expect(emCh.amplitudeRe).toBeGreaterThan(abCh.amplitudeRe)
      }
    }
  })

  it('produces correct channel count for maxN=2 with dephasing', () => {
    // Bug caught: wrong number of channels due to missing transitions or
    // duplicated channels.
    // maxN=2 gives 5 basis states: 1s, 2s, 2p₋₁, 2p₀, 2p₊₁
    // Allowed E1 transitions from 1s (l=0): to 2p₋₁, 2p₀, 2p₊₁ (Δl=+1, |Δm|≤1)
    // 2s→2p transitions are degenerate (same n, ΔE≈0), so skipped.
    // That gives 3 transition pairs → 3 emission + 3 absorption = 6 transition channels
    // Plus 5 dephasing channels = 11 total
    const { basis, rates, channels } = buildTestChannels(2, 300, 0.5, true)

    // Verify basis size
    expect(basis.length).toBe(5)

    // Count transition channels from rates (each rate can produce up to 2 channels)
    let expectedTransitionChannels = 0
    for (const rate of rates) {
      if (rate.gammaDown > 0) expectedTransitionChannels++
      if (rate.gammaUp > 0) expectedTransitionChannels++
    }

    const transitionChannels = channels.filter((ch) => ch.row !== ch.col).length
    const dephasingChannels = channels.filter((ch) => ch.row === ch.col).length

    expect(transitionChannels).toBe(expectedTransitionChannels)
    expect(dephasingChannels).toBe(basis.length)
    expect(channels.length).toBe(expectedTransitionChannels + basis.length)
  })
})
