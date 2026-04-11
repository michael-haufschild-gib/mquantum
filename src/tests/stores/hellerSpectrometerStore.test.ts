/**
 * Tests for the Heller wavepacket spectrometer store.
 *
 * Focus: the auto-reset semantics that protect the downstream
 * `computeHellerSpectrum` consumer from stale ψ₀ snapshots and mixed
 * sampling cadences. The pass-side scheduler and spectrum uniformity
 * check are tested separately.
 *
 * @module tests/stores/hellerSpectrometerStore
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'

describe('hellerSpectrometerStore', () => {
  beforeEach(() => {
    useHellerSpectrometerStore.setState(useHellerSpectrometerStore.getInitialState())
  })

  describe('setEnabled reset semantics', () => {
    it('bumps the pending reset token on off→on', () => {
      // Preload a non-zero sampleCount so the `toBe(0)` assertion
      // below genuinely verifies the setter clears prior samples; a
      // regression that dropped that line would otherwise slip
      // through because the fresh store starts at 0.
      useHellerSpectrometerStore.setState({ sampleCount: 42 })
      const before = useHellerSpectrometerStore.getState()
      expect(before.enabled).toBe(false)
      expect(before.sampleCount).toBe(42)
      const prevToken = before.pendingResetToken
      const prevVersion = before.resetVersion

      useHellerSpectrometerStore.getState().setEnabled(true)

      const after = useHellerSpectrometerStore.getState()
      expect(after.enabled).toBe(true)
      // Off→on must start a fresh measurement — the TDSE pass observes
      // the token mismatch on its next frame and calls
      // `resetHellerCapture`, which discards any ψ₀ cached before the
      // capture was paused.
      expect(after.pendingResetToken).toBe(prevToken + 1)
      expect(after.resetVersion).toBe(prevVersion + 1)
      expect(after.sampleCount).toBe(0)
    })

    it('does not bump the reset token on on→off', () => {
      useHellerSpectrometerStore.getState().setEnabled(true)
      const mid = useHellerSpectrometerStore.getState()
      const midToken = mid.pendingResetToken
      const midVersion = mid.resetVersion

      useHellerSpectrometerStore.getState().setEnabled(false)

      const after = useHellerSpectrometerStore.getState()
      expect(after.enabled).toBe(false)
      // Freezing the capture must preserve the ring buffer so the user
      // can still compute a spectrum from what has been captured.
      expect(after.pendingResetToken).toBe(midToken)
      expect(after.resetVersion).toBe(midVersion)
    })

    it('is a no-op when the new value equals the current value', () => {
      useHellerSpectrometerStore.getState().setEnabled(true)
      const afterOn = useHellerSpectrometerStore.getState()
      const token = afterOn.pendingResetToken
      const version = afterOn.resetVersion

      useHellerSpectrometerStore.getState().setEnabled(true)

      const after = useHellerSpectrometerStore.getState()
      expect(after.pendingResetToken).toBe(token)
      expect(after.resetVersion).toBe(version)
    })
  })

  describe('setSampleInterval reset semantics', () => {
    it('bumps the pending reset token when the interval changes', () => {
      // Preload a non-zero sampleCount so the clear-on-cadence-change
      // guarantee is actually exercised by the assertion.
      useHellerSpectrometerStore.setState({ sampleCount: 17 })
      const before = useHellerSpectrometerStore.getState()
      expect(before.sampleCount).toBe(17)
      const prevToken = before.pendingResetToken
      const prevVersion = before.resetVersion
      const prevInterval = before.sampleInterval

      useHellerSpectrometerStore.getState().setSampleInterval(prevInterval + 3)

      const after = useHellerSpectrometerStore.getState()
      expect(after.sampleInterval).toBe(prevInterval + 3)
      // Cadence change must restart capture — mixing two dt values into
      // one FFT input shifts every peak on the ω axis.
      expect(after.pendingResetToken).toBe(prevToken + 1)
      expect(after.resetVersion).toBe(prevVersion + 1)
      expect(after.sampleCount).toBe(0)
    })

    it('ignores non-finite input without touching state', () => {
      // NaN / Infinity must be rejected before `Math.round` gets a
      // chance to propagate them into the store. Otherwise a bad
      // slider binding could publish an invalid interval and break
      // the per-step readback scheduler.
      useHellerSpectrometerStore.setState({ sampleInterval: 3, sampleCount: 10 })
      const before = useHellerSpectrometerStore.getState()
      const prevToken = before.pendingResetToken
      const prevVersion = before.resetVersion

      useHellerSpectrometerStore.getState().setSampleInterval(Number.NaN)
      useHellerSpectrometerStore.getState().setSampleInterval(Number.POSITIVE_INFINITY)
      useHellerSpectrometerStore.getState().setSampleInterval(Number.NEGATIVE_INFINITY)

      const after = useHellerSpectrometerStore.getState()
      expect(after.sampleInterval).toBe(3)
      expect(after.sampleCount).toBe(10)
      expect(after.pendingResetToken).toBe(prevToken)
      expect(after.resetVersion).toBe(prevVersion)
    })

    it('does not bump the reset token when the clamped value equals the current interval', () => {
      // The store clamps sampleInterval to [HELLER_MIN_SAMPLE_INTERVAL,
      // HELLER_MAX_SAMPLE_INTERVAL]. A raw value equal (after clamp) to
      // the current setting must NOT trigger a reset — otherwise every
      // slider tick at the min/max edges would wipe the buffer.
      const initial = useHellerSpectrometerStore.getState().sampleInterval
      const token = useHellerSpectrometerStore.getState().pendingResetToken

      useHellerSpectrometerStore.getState().setSampleInterval(initial)

      const after = useHellerSpectrometerStore.getState()
      expect(after.sampleInterval).toBe(initial)
      expect(after.pendingResetToken).toBe(token)
    })

    it('clamps to bounds and bumps token only when clamped value differs', () => {
      // Drive the slider below the minimum — clamp should pin it to the
      // minimum, which equals the default (1), so no reset expected.
      useHellerSpectrometerStore.setState({ sampleInterval: 1 })
      const before = useHellerSpectrometerStore.getState()
      const token = before.pendingResetToken

      useHellerSpectrometerStore.getState().setSampleInterval(-5)

      const after = useHellerSpectrometerStore.getState()
      expect(after.sampleInterval).toBe(1)
      expect(after.pendingResetToken).toBe(token)
    })
  })

  describe('setHamiltonianTimeDependent', () => {
    it('round-trips the flag that the TDSE pass uses to suspend capture', () => {
      expect(useHellerSpectrometerStore.getState().hamiltonianTimeDependent).toBe(false)
      useHellerSpectrometerStore.getState().setHamiltonianTimeDependent(true)
      expect(useHellerSpectrometerStore.getState().hamiltonianTimeDependent).toBe(true)
      useHellerSpectrometerStore.getState().setHamiltonianTimeDependent(false)
      expect(useHellerSpectrometerStore.getState().hamiltonianTimeDependent).toBe(false)
    })
  })
})
