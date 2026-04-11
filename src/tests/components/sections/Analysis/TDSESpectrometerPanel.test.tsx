/**
 * Tests for TDSESpectrometerPanel — plain-language Heller wavepacket
 * spectrometer UI.
 *
 * Focus: the state machine that maps {enabled, sampleCount,
 * hamiltonianTimeDependent, computeAttempted} onto the status block
 * copy, the time-dep-H info banner, the "Compute spectrum" gate, the
 * theoretical overlay for harmonic traps, and the peak list's
 * ω/E = ℏω columns.
 *
 * The ring buffer is set up by hand via the store's `bufferRef` so
 * the tests don't need the TDSE compute pass.
 *
 * @module tests/components/sections/Analysis/TDSESpectrometerPanel
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { TDSESpectrometerPanel } from '@/components/sections/Analysis/TDSESpectrometerPanel'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  createHellerBuffer,
  HELLER_DEFAULT_MIN_SAMPLES,
  pushAutocorrelationSample,
} from '@/lib/physics/tdse/heller'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'

/**
 * Build a TDSE config seeded from {@link DEFAULT_TDSE_CONFIG} with
 * overrides shallow-merged over it.
 */
function cfg(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

/**
 * Seed the store with a synthetic buffer and set capture state to
 * "enabled + N samples already collected" as if a real capture just
 * finished. Uses `setState` directly so it bypasses the off→on reset
 * path in `setEnabled` (which zeroes `sampleCount`).
 *
 * @param count - Number of samples (>= HELLER_DEFAULT_MIN_SAMPLES for
 *   the Compute button to unlock)
 * @param omega0 - Tone frequency embedded in C(t); the spectrum should
 *   show a single peak near ω ≈ omega0
 */
function seedEnabledCapture(count: number, omega0 = 1.5): void {
  const buf = createHellerBuffer()
  const dt = 0.05
  for (let i = 0; i < count; i++) {
    // C(t) = exp(-i·ω₀·t) — recovered as a single FFT peak.
    const t = i * dt
    pushAutocorrelationSample(buf, Math.cos(omega0 * t), -Math.sin(omega0 * t), t)
  }
  useHellerSpectrometerStore.setState({
    enabled: true,
    bufferRef: buf,
    sampleCount: count,
  })
}

describe('TDSESpectrometerPanel', () => {
  beforeEach(() => {
    // Reset to initial state between tests so cross-test leakage of
    // `enabled`, `bufferRef`, or `hamiltonianTimeDependent` does not
    // contaminate the state-machine assertions.
    useHellerSpectrometerStore.setState(useHellerSpectrometerStore.getInitialState())
  })

  /**
   * Helper: open the collapsible ControlGroup by clicking its header
   * button. The panel defaults to `defaultOpen={false}` for a reason
   * (it's an advanced instrument), so every test must open it first.
   */
  function openPanel(): void {
    const header = screen.getByTestId('control-group-heller-spectrometer-header')
    fireEvent.click(header)
  }

  describe('state machine copy', () => {
    it('shows the idle label when capture is off and no samples exist', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      openPanel()
      expect(screen.getByTestId('heller-status-label')).toHaveTextContent(/idle/i)
      expect(screen.getByTestId('heller-status-detail')).toHaveTextContent(/turn on capture/i)
    })

    it('shows the "Collecting…" label with sample count when below the min gate', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      act(() => {
        seedEnabledCapture(HELLER_DEFAULT_MIN_SAMPLES - 4)
      })
      openPanel()

      const label = screen.getByTestId('heller-status-label')
      // We display `X / 64 samples`. Any count below the min should
      // render in that exact format so the user knows the target.
      expect(label).toHaveTextContent(new RegExp(`Collecting.*/ ${HELLER_DEFAULT_MIN_SAMPLES}`))
    })

    it('shows the "Ready" label once the minimum sample count is reached', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      act(() => {
        seedEnabledCapture(HELLER_DEFAULT_MIN_SAMPLES + 8)
      })
      openPanel()

      expect(screen.getByTestId('heller-status-label')).toHaveTextContent(/Ready/)
      const compute = screen.getByTestId('heller-compute-button')
      expect(compute).toBeEnabled()
    })

    it('shows the info banner and disables compute when the Hamiltonian is time-dependent', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      act(() => {
        seedEnabledCapture(HELLER_DEFAULT_MIN_SAMPLES + 8)
        useHellerSpectrometerStore.getState().setHamiltonianTimeDependent(true)
      })
      openPanel()

      // The info banner explains *why* capture is paused — use role
      // text rather than a fixed color since the tone is intentionally
      // not a warning.
      expect(screen.getByTestId('heller-time-dependent-notice')).toBeInTheDocument()
      expect(screen.getByTestId('heller-compute-button')).toBeDisabled()
      expect(screen.getByTestId('heller-status-label')).toHaveTextContent(/Paused.*time-dependent/i)
    })
  })

  describe('compute flow', () => {
    it('renders peak rows with both ω and E = ℏω columns on Compute click', () => {
      render(<TDSESpectrometerPanel tdse={cfg({ hbar: 1.5 })} />)
      act(() => {
        seedEnabledCapture(256, 2.0)
      })
      openPanel()

      fireEvent.click(screen.getByTestId('heller-compute-button'))

      const peakList = screen.getByTestId('heller-peak-list')
      expect(peakList).toBeInTheDocument()
      // The header row names both columns explicitly so users never
      // mix up ω and energy.
      expect(within(peakList).getByText('ω')).toBeInTheDocument()
      expect(within(peakList).getByText('E = ℏω')).toBeInTheDocument()

      // At least the first peak is reported.
      const firstPeak = screen.getByTestId('heller-peak-row-0')
      const cells = within(firstPeak).getAllByText(/[0-9]+\.[0-9]+/)
      expect(cells.length).toBeGreaterThanOrEqual(2)
      // E = ℏω is bigger than ω since hbar=1.5, catches the silent
      // "I forgot to multiply by hbar" regression.
      const [omegaCell, energyCell] = cells
      const omegaVal = parseFloat(omegaCell!.textContent!)
      const energyVal = parseFloat(energyCell!.textContent!)
      expect(energyVal).toBeCloseTo(omegaVal * 1.5, 3)
    })

    it('restart button bumps pendingResetToken and drops any displayed spectrum', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      act(() => {
        seedEnabledCapture(256)
      })
      openPanel()
      fireEvent.click(screen.getByTestId('heller-compute-button'))
      expect(screen.getByTestId('heller-spectrum-plot')).toBeInTheDocument()

      const tokenBefore = useHellerSpectrometerStore.getState().pendingResetToken
      fireEvent.click(screen.getByTestId('heller-reset-button'))

      expect(useHellerSpectrometerStore.getState().pendingResetToken).toBe(tokenBefore + 1)
      // The effect keyed on resetVersion should have dropped the
      // computed spectrum back to the placeholder.
      expect(screen.getByTestId('heller-spectrum-placeholder')).toBeInTheDocument()
      expect(screen.queryByTestId('heller-spectrum-plot')).not.toBeInTheDocument()
    })
  })

  describe('theoretical overlay', () => {
    it('renders theory overlay for isotropic harmonic trap', () => {
      render(
        <TDSESpectrometerPanel
          tdse={cfg({ potentialType: 'harmonicTrap', harmonicOmega: 1.0, latticeDim: 3 })}
        />
      )
      act(() => {
        seedEnabledCapture(256, 1.5)
      })
      openPanel()
      fireEvent.click(screen.getByTestId('heller-compute-button'))

      // 8 levels by default — the user sees n=0..7 on the plot.
      // We query by testid instead of walking SVG nodes so the test
      // survives non-functional DOM shape changes.
      expect(screen.getByTestId('heller-theory-overlay')).toBeInTheDocument()
      for (let n = 0; n < 8; n++) {
        expect(screen.getByTestId(`heller-theory-line-${n}`)).toBeInTheDocument()
      }
      // Defensive: if we ever draw 9 lines the extra should trip here.
      expect(screen.queryByTestId('heller-theory-line-8')).not.toBeInTheDocument()
    })

    it('omits the overlay for barrier potentials where there are no discrete eigenvalues', () => {
      render(<TDSESpectrometerPanel tdse={cfg({ potentialType: 'barrier' })} />)
      act(() => {
        seedEnabledCapture(256)
      })
      openPanel()
      fireEvent.click(screen.getByTestId('heller-compute-button'))

      expect(screen.queryByTestId('heller-theory-overlay')).not.toBeInTheDocument()
      // The expectation hint should tell the user why.
      expect(screen.getByTestId('heller-expectation-hint')).toHaveTextContent(
        /scattering|continuous|resonances/i
      )
    })

    it('omits the overlay for anisotropic harmonic traps (the ladder is not degenerate)', () => {
      render(
        <TDSESpectrometerPanel
          tdse={cfg({
            potentialType: 'harmonicTrap',
            harmonicOmega: 1.0,
            latticeDim: 3,
            // 1.0 / 2.0 / 3.0 → no degenerate ladder → no overlay.
            trapAnisotropy: [1.0, 2.0, 3.0],
          })}
        />
      )
      act(() => {
        seedEnabledCapture(256)
      })
      openPanel()
      fireEvent.click(screen.getByTestId('heller-compute-button'))

      expect(screen.queryByTestId('heller-theory-overlay')).not.toBeInTheDocument()
    })
  })

  describe('status block dot', () => {
    it('renders a visible status label inside the panel body (live, not gated on the plot)', () => {
      render(<TDSESpectrometerPanel tdse={cfg()} />)
      openPanel()
      // The status block is always visible — it's the core affordance
      // that tells the user "something is happening / not happening /
      // waiting for you". Catch regressions that hide it behind the
      // plot placeholder.
      expect(screen.getByTestId('heller-status-block')).toBeInTheDocument()
      expect(screen.getByTestId('heller-status-label')).toBeInTheDocument()
    })
  })
})
