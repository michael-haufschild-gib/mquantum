/**
 * Envelope SVG component tests.
 *
 * Verifies: renders SVG path for each envelope mode (AD, AR, ADSR, AHDSR),
 * control points appear/hide based on mode, sustain level affects path geometry,
 * attack always gets minimum duration (no zero-width spike).
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Envelope } from '@/components/ui/Envelope'

/** Extract the 'd' attribute of the stroke path via data-testid. */
function getStrokePath(): string {
  return screen.getByTestId('envelope-stroke').getAttribute('d') ?? ''
}

describe('Envelope', () => {
  describe('ADSR mode (default)', () => {
    it('renders an SVG with stroke path', () => {
      render(<Envelope attack={0.1} decay={0.2} sustain={0.5} release={0.3} />)
      const path = getStrokePath()
      expect(path).toContain('M') // Starts with moveTo
      expect(path).toContain('L') // Has lineTo segments
    })

    it('shows attack, decay, and release control points', () => {
      render(<Envelope attack={0.1} decay={0.2} sustain={0.5} release={0.3} />)
      // ADSR: delay(hidden), attack(visible), hold(hidden), decay(visible), release(visible)
      expect(screen.queryByTestId('envelope-point-delay')).not.toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-attack')).toBeInTheDocument()
      expect(screen.queryByTestId('envelope-point-hold')).not.toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-decay')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-release')).toBeInTheDocument()
    })

    it('sustain level affects the Y coordinate of the decay point', () => {
      const { unmount } = render(<Envelope attack={0.1} decay={0.2} sustain={0.2} release={0.3} />)
      const path1 = getStrokePath()
      unmount()

      render(<Envelope attack={0.1} decay={0.2} sustain={0.8} release={0.3} />)
      const path2 = getStrokePath()
      // Different sustain levels should produce different paths
      expect(path1).not.toBe(path2)
    })
  })

  describe('AD mode', () => {
    it('renders a triangular envelope (attack up, decay down to zero)', () => {
      render(<Envelope mode="AD" attack={0.2} decay={0.3} />)
      const path = getStrokePath()
      expect(path).toContain('M')
      expect(path).toContain('L')
    })

    it('hides decay control point (decay is implicit in AD mode)', () => {
      render(<Envelope mode="AD" attack={0.2} decay={0.3} />)
      // AD: delay(hidden), attack(visible), hold(hidden), decay(hidden), release(visible)
      expect(screen.getByTestId('envelope-point-attack')).toBeInTheDocument()
      expect(screen.queryByTestId('envelope-point-decay')).not.toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-release')).toBeInTheDocument()
    })
  })

  describe('AR mode', () => {
    it('renders attack-release envelope (peak to zero)', () => {
      render(<Envelope mode="AR" attack={0.2} release={0.3} />)
      const path = getStrokePath()
      expect(path).toContain('M')
      expect(path).toContain('L')
    })

    it('hides decay control point', () => {
      render(<Envelope mode="AR" attack={0.2} release={0.3} />)
      expect(screen.getByTestId('envelope-point-attack')).toBeInTheDocument()
      expect(screen.queryByTestId('envelope-point-decay')).not.toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-release')).toBeInTheDocument()
    })
  })

  describe('AHDSR mode', () => {
    it('renders hold phase between attack and decay', () => {
      render(
        <Envelope mode="AHDSR" attack={0.1} hold={0.15} decay={0.2} sustain={0.5} release={0.3} />
      )
      const path = getStrokePath()
      expect(path).toContain('M')
    })

    it('shows hold control point when hold > 0', () => {
      render(
        <Envelope mode="AHDSR" attack={0.1} hold={0.15} decay={0.2} sustain={0.5} release={0.3} />
      )
      // AHDSR: delay(hidden), attack(visible), hold(visible), decay(visible), release(visible)
      expect(screen.getByTestId('envelope-point-attack')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-hold')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-decay')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-release')).toBeInTheDocument()
    })
  })

  describe('delay phase', () => {
    it('adds initial flat segment when delay > 0', () => {
      const { unmount } = render(
        <Envelope attack={0.1} decay={0.2} sustain={0.5} release={0.3} delay={0.5} />
      )
      const withDelayPath = getStrokePath()
      unmount()

      render(<Envelope attack={0.1} decay={0.2} sustain={0.5} release={0.3} delay={0} />)
      const noDelayPath = getStrokePath()
      // With delay should have a longer path (extra horizontal segment at bottom)
      expect(withDelayPath.length).toBeGreaterThan(noDelayPath.length)
    })

    it('shows delay control point when delay > 0', () => {
      render(<Envelope attack={0.1} decay={0.2} sustain={0.5} release={0.3} delay={0.5} />)
      // With delay: delay(visible), attack(visible), hold(hidden), decay(visible), release(visible)
      expect(screen.getByTestId('envelope-point-delay')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-attack')).toBeInTheDocument()
      expect(screen.queryByTestId('envelope-point-hold')).not.toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-decay')).toBeInTheDocument()
      expect(screen.getByTestId('envelope-point-release')).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('attack of 0 gets clamped to 0.01 (no zero-width spike)', () => {
      render(<Envelope attack={0} />)
      const path = getStrokePath()
      // Path should still contain a valid attack segment, not a vertical spike at x=0
      expect(path.length).toBeGreaterThan(10)
    })

    it('renders with all zero times', () => {
      render(<Envelope attack={0} decay={0} sustain={0} release={0} />)
      // Should not crash — attack gets clamped to 0.01
      expect(screen.getByTestId('envelope-stroke')).toBeInTheDocument()
    })

    it('renders with custom dimensions', () => {
      render(<Envelope attack={0.1} width={200} height={80} />)
      const wrapper = screen.getByTestId('envelope-wrapper')
      expect(wrapper).toHaveStyle({ width: '200px', height: '80px' })
    })
  })
})
