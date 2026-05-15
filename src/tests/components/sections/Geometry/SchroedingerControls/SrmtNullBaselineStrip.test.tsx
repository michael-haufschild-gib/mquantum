/**
 * Tests for {@link SrmtNullBaselineStrip} — the SRMT robustness readout
 * that surfaces multi-metric quality and null-baseline ratios.
 *
 * The strip is the primary UI affordance for Criteria 2 (metric
 * robustness) and 3 (null-baseline floor) in
 * `docs/physics/srmt-falsification.md`. These tests verify the three
 * surfaces a publication reviewer would scan:
 *
 *  1. **Rendered when present, absent when not.** Legacy snapshots
 *     without `qualityMetrics` / `nullBaselines` must not render the
 *     strip at all — silent legacy compatibility.
 *  2. **Falsification flag wired up.** When a null baseline beats the
 *     real fit, `data-falsified="true"` and the danger palette appear.
 *  3. **Ratio + metric numbers reach the DOM.** Reviewers should be
 *     able to read `q_L2`, `q_L∞`, `q_rigid` and `q_shuffled / reversed
 *     / synthetic` directly without opening the dev tools.
 *
 * @module tests/components/sections/Geometry/SchroedingerControls/SrmtNullBaselineStrip
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SrmtNullBaselineStrip } from '@/components/sections/Geometry/SchroedingerControls/SrmtNullBaselineStrip'
import type { SrmtSnapshot } from '@/stores/diagnostics/srmtDiagnosticStore'

function makeSnapshot(overrides: Partial<SrmtSnapshot> = {}): SrmtSnapshot {
  return {
    clock: 'a',
    slicePlane: 'phi-phi',
    cutIndex: 12,
    rankCap: 32,
    kSpectrum: Float32Array.from([0.05, 0.2, 0.8, 1.5, 2.4]),
    hjSpectrum: Float32Array.from([0.1, 0.4, 0.9, 1.8, 3.0]),
    affineMatchQuality: 0.04,
    qualityMetrics: { lInf: 0.12, rigid: 0.09 },
    nullBaselines: { shuffled: 0.5, reversed: 0.8, synthetic: 0.7 },
    nullBaselinesRigid: { shuffled: 1.5, reversed: 2.0, synthetic: 1.8 },
    computeTimeMs: 17,
    ...overrides,
  }
}

describe('SrmtNullBaselineStrip', () => {
  it('renders nothing when no falsification fields are present', () => {
    const snapshot = makeSnapshot({
      qualityMetrics: undefined,
      nullBaselines: undefined,
      nullBaselinesRigid: undefined,
    })
    const { container } = render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the strip with metrics and baselines when present', () => {
    render(<SrmtNullBaselineStrip snapshot={makeSnapshot()} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toBeInTheDocument()
    expect(strip).toHaveAttribute('data-falsified', 'false')
    // Per-metric cells reach the DOM.
    expect(screen.getByTestId('wdw-srmt-metric-l2')).toHaveTextContent('0.040')
    expect(screen.getByTestId('wdw-srmt-metric-linf')).toHaveTextContent('0.120')
    expect(screen.getByTestId('wdw-srmt-metric-rigid')).toHaveTextContent('0.090')
    // Per-baseline cells reach the DOM.
    expect(screen.getByTestId('wdw-srmt-baseline-shuffled')).toHaveTextContent('0.500')
    expect(screen.getByTestId('wdw-srmt-baseline-reversed')).toHaveTextContent('0.800')
    expect(screen.getByTestId('wdw-srmt-baseline-synthetic')).toHaveTextContent('0.700')
  })

  it('sets data-falsified="true" when a baseline beats the real fit', () => {
    // shuffled (0.01) < real (0.04). bestBaselineRatio = 0.25 < 1.
    const snapshot = makeSnapshot({
      nullBaselines: { shuffled: 0.01, reversed: 0.8, synthetic: 0.7 },
    })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toHaveAttribute('data-falsified', 'true')
    // The headline includes the explicit "BASELINE WIN" label.
    expect(strip).toHaveTextContent(/BASELINE WIN/i)
  })

  it('renders the wins-by ratio for a real fit that beats every baseline', () => {
    // min(baseline) = 0.5; real = 0.04; ratio = 12.5 ≈ "12.5×".
    render(<SrmtNullBaselineStrip snapshot={makeSnapshot()} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toHaveTextContent(/wins by/i)
    expect(strip).toHaveTextContent(/12\.5×/)
  })

  it('renders only the metrics row when baselines are missing', () => {
    const snapshot = makeSnapshot({
      nullBaselines: undefined,
      nullBaselinesRigid: undefined,
    })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    expect(screen.getByTestId('wdw-srmt-metric-l2')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-srmt-baseline-shuffled')).not.toBeInTheDocument()
  })

  it('renders only the baselines row when metrics are missing', () => {
    const snapshot = makeSnapshot({ qualityMetrics: undefined })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    expect(screen.queryByTestId('wdw-srmt-metric-linf')).not.toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-baseline-shuffled')).toBeInTheDocument()
  })

  it('renders the rigid-baselines row with rigid-ratio under the affine row', () => {
    // L2 real = 0.04, min(affine baselines) = 0.5 → ratio = 12.5×
    // Rigid real = 0.09, min(rigid baselines) = 1.5 → ratio ≈ 16.7×
    render(<SrmtNullBaselineStrip snapshot={makeSnapshot()} />)
    expect(screen.getByTestId('wdw-srmt-rigid-baseline-shuffled')).toHaveTextContent('1.500')
    expect(screen.getByTestId('wdw-srmt-rigid-baseline-reversed')).toHaveTextContent('2.000')
    expect(screen.getByTestId('wdw-srmt-rigid-baseline-synthetic')).toHaveTextContent('1.800')
    expect(screen.getByTestId('wdw-srmt-rigid-ratio')).toHaveTextContent(/16\.\d/)
  })

  it('falsifies (data-falsified="true") when the rigid baseline ratio drops below 1', () => {
    const snapshot = makeSnapshot({
      // Rigid real = 0.09 > rigid baselines = 0.05 → ratio = 0.55×
      nullBaselinesRigid: { shuffled: 0.05, reversed: 2.0, synthetic: 1.8 },
    })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toHaveAttribute('data-falsified', 'true')
  })

  it('falsifies on a tie (ratio === 1) — real fit must STRICTLY beat the best null', () => {
    // Affine real = 0.04 matched exactly by the best affine baseline →
    // ratio === 1. Rigid stays comfortably above 1 so the tie alone
    // must trigger the falsification flag.
    const snapshot = makeSnapshot({
      nullBaselines: { shuffled: 0.04, reversed: 0.8, synthetic: 0.7 },
    })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toHaveAttribute('data-falsified', 'true')
    expect(strip).toHaveTextContent(/BASELINE WIN/i)
  })

  it('renders ∞ for the wins-by ratio when real affine quality is zero (perfect fit)', () => {
    // Real = 0 → bestBaselineRatio returns +∞. The strip must show
    // the ∞ glyph rather than swallowing it as a dash.
    const snapshot = makeSnapshot({ affineMatchQuality: 0 })
    render(<SrmtNullBaselineStrip snapshot={snapshot} />)
    const strip = screen.getByTestId('wdw-srmt-null-baseline-strip')
    expect(strip).toHaveTextContent(/∞×/)
    expect(strip).toHaveAttribute('data-falsified', 'false')
  })
})
