import { describe, expect, it } from 'vitest'

import {
  composeTdseStochasticExpectFinalizeShader,
  composeTdseStochasticLoc3DShader,
  composeTdseStochasticLocShader,
} from '@/rendering/webgpu/passes/TDSEStochasticLocalization'

describe('TDSE stochastic localization finite guards', () => {
  it('expectation finalize clears invalid density-weighted means instead of forwarding NaN/Inf', () => {
    const shader = composeTdseStochasticExpectFinalizeShader()

    expect(shader).toContain('fn isSafeStochasticScalar')
    expect(shader).toContain('let weightedMeanNumerator = result[0]')
    expect(shader).toContain('isSafeStochasticScalar(weightedMeanNumerator)')
    expect(shader).toContain('isSafeStochasticNorm(normSq)')
    expect(shader).toContain('result[0] = 0.0')
  })

  it('localization apply pass falls back to zero centering when expectResult is invalid', () => {
    for (const shader of [composeTdseStochasticLocShader(), composeTdseStochasticLoc3DShader()]) {
      expect(shader).toContain('fn safeStochasticMean')
      expect(shader).toContain('let meanW = safeStochasticMean(expectResult[0])')
      expect(shader).toContain('let wCentered = noiseField - meanW')
      expect(shader).not.toContain('let wCentered = noiseField - expectResult[0]')
    }
  })
})
