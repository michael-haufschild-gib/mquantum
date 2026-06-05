import { describe, expect, it } from 'vitest'

import {
  computeRankDefectGenesisMoments,
  type RankDefectGenesisParams,
  sampleRankDefectGenesis,
} from '@/lib/physics/freeScalar/rankDefectGenesis'

const BASE: RankDefectGenesisParams = {
  latticeDim: 3,
  gridSize: [33, 33, 33],
  spacing: [0.12, 0.12, 0.12],
  packetCenter: [0, 0, 0],
  packetWidth: 0.9,
  packetAmplitude: 1.15,
  mass: 0.4,
}

describe('rank-defect genesis initial condition', () => {
  it('is globally null but locally energetic on a symmetric lattice', () => {
    const moments = computeRankDefectGenesisMoments(BASE)
    expect(Math.abs(moments.sumPhi)).toBeLessThan(1e-10)
    expect(Math.abs(moments.sumPi)).toBeLessThan(1e-10)
    expect(moments.energy).toBeGreaterThan(100)
  })

  it('creates a positive covariance orientation that can act as a clock direction', () => {
    const moments = computeRankDefectGenesisMoments(BASE)
    expect(moments.phiAxis0).toBeGreaterThan(0)
    expect(Math.abs(moments.phiAxis1)).toBeLessThan(1e-10)
    expect(Math.abs(moments.piAxis0)).toBeLessThan(1e-10)
    expect(moments.piAxis1).toBeGreaterThan(0)
    expect(moments.orientation).toBeGreaterThan(1_000)
  })

  it('scales energy quadratically with rank-completion amplitude', () => {
    const low = computeRankDefectGenesisMoments({ ...BASE, packetAmplitude: 0.5 }).energy
    const high = computeRankDefectGenesisMoments({ ...BASE, packetAmplitude: 1.0 }).energy
    expect(high / low).toBeCloseTo(4, 6)
  })

  it('keeps phi and pi on orthogonal axes at representative samples', () => {
    const phiAxis = sampleRankDefectGenesis([24, 16, 16], BASE)
    const piAxis = sampleRankDefectGenesis([16, 24, 16], BASE)
    expect(Math.abs(phiAxis.phi)).toBeGreaterThan(0.2)
    expect(Math.abs(phiAxis.pi)).toBeLessThan(1e-10)
    expect(Math.abs(piAxis.pi)).toBeGreaterThan(0.3)
    expect(Math.abs(piAxis.phi)).toBeLessThan(1e-10)
  })
})
