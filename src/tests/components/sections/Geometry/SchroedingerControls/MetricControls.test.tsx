/**
 * Tests for TDSE MetricControls lattice-dimension compatibility.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { MetricControls } from '@/components/sections/Geometry/SchroedingerControls/MetricControls'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

function makeTd(overrides: Partial<TdseConfig>): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

async function openGroup() {
  const user = userEvent.setup()
  await user.click(screen.getByTestId('control-group-tdse-metric-header'))
}

function optionLabels(): string[] {
  const select = screen.getByTestId('tdse-metric-kind') as HTMLSelectElement
  return Array.from(select.options).map((option) => option.textContent ?? '')
}

describe('MetricControls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('hides metric options that are flat-degenerate for the active latticeDim', async () => {
    render(<MetricControls td={makeTd({ latticeDim: 2 })} />)
    await openGroup()

    const labels = optionLabels()
    expect(labels).toContain('Morris–Thorne throat')
    expect(labels).not.toContain('2-Sphere (θ, φ)')
  })

  it('normalizes an incompatible current metric to flat in the control surface', async () => {
    render(
      <MetricControls
        td={makeTd({
          latticeDim: 2,
          metric: { kind: 'sphere2D', sphereRadius: 2 },
        })}
      />
    )
    await openGroup()

    expect(screen.getByTestId('tdse-metric-kind')).toHaveValue('flat')
    expect(screen.queryByTestId('tdse-metric-sphere-r')).not.toBeInTheDocument()
  })

  it('hides throat metrics in 1D where their evaluator falls back to flat', async () => {
    render(<MetricControls td={makeTd({ latticeDim: 1 })} />)
    await openGroup()

    const labels = optionLabels()
    expect(labels).not.toContain('Morris–Thorne throat')
    expect(labels).not.toContain('Double Morris–Thorne throat')
    expect(labels).toContain('Schwarzschild (isotropic)')
  })
})
