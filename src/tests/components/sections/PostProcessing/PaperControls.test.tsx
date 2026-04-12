/**
 * Behavioral tests for `PaperControls`.
 *
 * PaperControls is a thin UI panel that wires its sliders/color pickers
 * directly into the post-processing Zustand store. Before this file
 * existed there was zero coverage — if any one of the ~15 slider->setter
 * wirings regressed (e.g. by a refactor that shuffled the selector
 * keys), the only signal was a manual click-through of the sidebar.
 *
 * This suite is intentionally narrow:
 *
 *   1. Sliders in the always-visible top half (Intensity, Contrast,
 *      Roughness, Fiber Amount) are rendered and drive the correct
 *      store setter with the correct numeric value.
 *   2. The collapsible "Details" section starts collapsed — none of its
 *      sliders are in the DOM.
 *   3. Clicking the Details header expands the section and reveals its
 *      sliders; clicking again collapses it.
 *   4. A slider inside Details (Fold Count) drives the correct setter
 *      once expanded.
 *
 * Everything is mutation-sensitive: swap any label→setter pair in
 * PaperControls and the matching test fails because the wrong store
 * value will have changed.
 *
 * @module tests/components/sections/PostProcessing/PaperControls
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { PaperControls } from '@/components/sections/PostProcessing/PaperControls'
import { usePostProcessingStore } from '@/stores/postProcessingStore'

function getPaperState() {
  const s = usePostProcessingStore.getState()
  return {
    paperIntensity: s.paperIntensity,
    paperContrast: s.paperContrast,
    paperRoughness: s.paperRoughness,
    paperFiber: s.paperFiber,
    paperFoldCount: s.paperFoldCount,
    paperFolds: s.paperFolds,
  }
}

describe('PaperControls', () => {
  beforeEach(() => {
    // Reset the store to its initial state so one test's slider drag
    // cannot leak into another.
    usePostProcessingStore.setState(usePostProcessingStore.getInitialState())
  })

  describe('always-visible sliders', () => {
    it('drives setPaperIntensity on Intensity slider change', () => {
      render(<PaperControls />)
      const slider = screen.getByRole('slider', { name: 'Intensity' })
      fireEvent.change(slider, { target: { value: '0.42' } })
      expect(getPaperState().paperIntensity).toBeCloseTo(0.42, 6)
    })

    it('drives setPaperContrast on Contrast slider change', () => {
      render(<PaperControls />)
      const slider = screen.getByRole('slider', { name: 'Contrast' })
      fireEvent.change(slider, { target: { value: '0.75' } })
      expect(getPaperState().paperContrast).toBeCloseTo(0.75, 6)
    })

    it('drives setPaperRoughness on Roughness slider change', () => {
      render(<PaperControls />)
      const slider = screen.getByRole('slider', { name: 'Roughness' })
      fireEvent.change(slider, { target: { value: '0.33' } })
      expect(getPaperState().paperRoughness).toBeCloseTo(0.33, 6)
    })

    it('drives setPaperFiber on "Fiber Amount" slider change', () => {
      render(<PaperControls />)
      const slider = screen.getByRole('slider', { name: 'Fiber Amount' })
      fireEvent.change(slider, { target: { value: '0.91' } })
      expect(getPaperState().paperFiber).toBeCloseTo(0.91, 6)
    })
  })

  describe('collapsible Details section', () => {
    it('is collapsed by default — Details-only sliders not in the DOM', () => {
      render(<PaperControls />)
      // "Folds" and "Fold Count" live inside the Details collapsible.
      expect(screen.queryByRole('slider', { name: 'Folds' })).not.toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Fold Count' })).not.toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Drops' })).not.toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Fade' })).not.toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Seed' })).not.toBeInTheDocument()
    })

    it('expands when the Details header is clicked', () => {
      render(<PaperControls />)
      const header = screen.getByRole('button', { name: /Details/i })
      fireEvent.click(header)
      expect(screen.getByRole('slider', { name: 'Folds' })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: 'Fold Count' })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: 'Fade' })).toBeInTheDocument()
    })

    it('collapses again on a second click', () => {
      render(<PaperControls />)
      const header = screen.getByRole('button', { name: /Details/i })
      fireEvent.click(header) // expand
      expect(screen.getByRole('slider', { name: 'Folds' })).toBeInTheDocument()
      fireEvent.click(header) // collapse
      expect(screen.queryByRole('slider', { name: 'Folds' })).not.toBeInTheDocument()
    })

    it('drives setPaperFoldCount on Fold Count slider change (regression guard for setter wiring inside collapsed sections)', () => {
      // The wiring-in-collapsed-section pattern is specifically error-prone
      // because the component is lazily rendered — a refactor that moves
      // the state selector or setter resolution could break only the
      // collapsed branch and leave the visible sliders working. This test
      // locks in the Details→setter routing.
      render(<PaperControls />)
      fireEvent.click(screen.getByRole('button', { name: /Details/i }))
      const slider = screen.getByRole('slider', { name: 'Fold Count' })
      fireEvent.change(slider, { target: { value: '7' } })
      expect(getPaperState().paperFoldCount).toBe(7)
    })

    it('drives setPaperFolds on Folds slider change', () => {
      render(<PaperControls />)
      fireEvent.click(screen.getByRole('button', { name: /Details/i }))
      const slider = screen.getByRole('slider', { name: 'Folds' })
      fireEvent.change(slider, { target: { value: '0.6' } })
      expect(getPaperState().paperFolds).toBeCloseTo(0.6, 6)
    })
  })
})
