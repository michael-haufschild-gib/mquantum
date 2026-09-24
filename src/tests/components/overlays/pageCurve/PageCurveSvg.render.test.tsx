/**
 * PageCurveSvg t_Page guide placement.
 *
 * Regression: once pageCurveStore latches t_Page after its crossing scrolls out
 * of the ring buffer, the value predates the plotted window; the guide line
 * was still drawn at a pixel left of PAD_L (inside the y-axis label gutter or
 * off-canvas). It is now drawn only while t_Page lies within [tMin, tMax].
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PageCurveSvg } from '@/components/overlays/pageCurve/PageCurveSvg'
import { PAD_L, type PageCurveSnapshot } from '@/components/overlays/pageCurve/snapshot'
import type { HorizonContext } from '@/hooks/usePageCurveSampling'

function snapshot(tPage: number | null): PageCurveSnapshot {
  return {
    tMin: 100,
    tMax: 200,
    sMax: 2,
    sBH: 1,
    tPage,
    thermPath: 'M 36 150 L 352 20',
    pagePath: 'M 36 150 L 352 80',
    hasData: true,
    bufferVersion: 1,
  }
}

const horizon: HorizonContext = { isBec: true, horizonPresent: true, cs0: 1 }

describe('PageCurveSvg t_Page guide', () => {
  it('draws the guide inside the plot when t_Page is in the window', () => {
    render(
      <PageCurveSvg
        snapshot={snapshot(150)}
        horizonContext={horizon}
        islandOverlayEnabled={false}
        lastIslandRadius={0}
        dMaxFrac={0.5}
      />
    )
    const line = screen.getByTestId('hawking-tpage-line')
    expect(Number(line.getAttribute('x1'))).toBeGreaterThan(PAD_L)
  })

  it('omits the guide when a latched t_Page predates the plotted window', () => {
    render(
      <PageCurveSvg
        snapshot={snapshot(40)}
        horizonContext={horizon}
        islandOverlayEnabled={false}
        lastIslandRadius={0}
        dMaxFrac={0.5}
      />
    )
    expect(screen.queryByTestId('hawking-tpage-line')).not.toBeInTheDocument()
  })

  it('keeps the post-Page island guide for a latched t_Page', () => {
    render(
      <PageCurveSvg
        snapshot={snapshot(40)}
        horizonContext={horizon}
        islandOverlayEnabled
        lastIslandRadius={0.3}
        dMaxFrac={0.5}
      />
    )
    expect(screen.getByTestId('hawking-island-extent-line')).toBeInTheDocument()
  })
})
