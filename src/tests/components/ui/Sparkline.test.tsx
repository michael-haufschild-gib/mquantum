/**
 * Sparkline component tests.
 *
 * Verifies: ring buffer reading order (oldest→newest), Y-axis auto-scaling,
 * min/max prop override, count < 2 renders empty SVG, polyline path generation,
 * gradient fill path closes correctly.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Sparkline } from '@/components/ui/Sparkline'

/** Create a ring buffer with known values for testing. */
function makeRingBuffer(
  values: number[],
  bufferSize = 8
): { data: Float32Array; head: number; count: number } {
  const data = new Float32Array(bufferSize)
  for (let i = 0; i < values.length; i++) {
    data[i % bufferSize] = values[i]!
  }
  return {
    data,
    head: values.length % bufferSize,
    count: values.length,
  }
}

describe('Sparkline', () => {
  it('renders an SVG with role="img" and aria-label', () => {
    const { data, head, count } = makeRingBuffer([1, 2, 3, 4])
    render(<Sparkline data={data} head={head} count={count} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(screen.getByLabelText('Sparkline chart')).toBeInTheDocument()
  })

  it('renders empty SVG when count < 2', () => {
    const data = new Float32Array(8)
    data[0] = 1.0
    render(<Sparkline data={data} head={1} count={1} />)
    // No polyline or path elements when count < 2
    expect(screen.queryByTestId('sparkline-line')).not.toBeInTheDocument()
  })

  it('renders polyline when count >= 2', () => {
    const { data, head, count } = makeRingBuffer([10, 20, 30])
    render(<Sparkline data={data} head={head} count={count} />)
    const polyline = screen.getByTestId('sparkline-line')
    expect(polyline).toHaveAttribute('points', expect.stringContaining(','))
  })

  it('renders fill path below the polyline', () => {
    const { data, head, count } = makeRingBuffer([10, 20, 30])
    render(<Sparkline data={data} head={head} count={count} />)
    const fillPath = screen.getByTestId('sparkline-fill')
    const d = fillPath.getAttribute('d') ?? ''
    expect(d).toContain('Z')
  })

  it('handles ring buffer wrap-around correctly', () => {
    // Buffer size 4, written 6 values: head=2, buffer = [5, 6, 3, 4]
    // Chronological order should be: 3, 4, 5, 6
    const data = new Float32Array(4)
    data[0] = 5
    data[1] = 6
    data[2] = 3
    data[3] = 4
    render(<Sparkline data={data} head={2} count={6} />)
    const polyline = screen.getByTestId('sparkline-line')
    // The polyline should have 4 points (one per value)
    const points = polyline.getAttribute('points')?.split(' ') ?? []
    expect(points).toHaveLength(4)
  })

  it('auto-scales Y axis when min/max not provided', () => {
    const { data, head, count } = makeRingBuffer([0, 100, 50, 75])
    render(<Sparkline data={data} head={head} count={count} />)
    const polyline = screen.getByTestId('sparkline-line')
    // All Y coordinates should be within the viewBox (0-50)
    const points = polyline.getAttribute('points')!.split(' ')
    for (const pt of points) {
      const y = parseFloat(pt.split(',')[1]!)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(50)
    }
  })

  it('uses explicit min/max when provided', () => {
    const { data, head, count } = makeRingBuffer([50, 50, 50])
    render(<Sparkline data={data} head={head} count={count} min={0} max={100} />)
    const polyline = screen.getByTestId('sparkline-line')
    // All values are 50 with range [0, 100] — should be at 50% height
    const points = polyline.getAttribute('points')!.split(' ')
    for (const pt of points) {
      const y = parseFloat(pt.split(',')[1]!)
      // 50% of usable height + padding ≈ 25 (middle of viewBox)
      expect(y).toBeGreaterThan(10)
      expect(y).toBeLessThan(40)
    }
  })

  it('handles all-equal values without division by zero', () => {
    const { data, head, count } = makeRingBuffer([42, 42, 42, 42])
    render(<Sparkline data={data} head={head} count={count} />)
    // Should render without NaN in the points
    const polyline = screen.getByTestId('sparkline-line')
    expect(polyline).toHaveAttribute('points', expect.not.stringContaining('NaN'))
    expect(polyline).toHaveAttribute('points', expect.not.stringContaining('Infinity'))
  })

  it('applies custom height', () => {
    const { data, head, count } = makeRingBuffer([1, 2])
    render(<Sparkline data={data} head={head} count={count} height={64} />)
    const svg = screen.getByRole('img')
    expect(svg).toHaveAttribute('height', '64')
  })

  it('applies custom className', () => {
    const { data, head, count } = makeRingBuffer([1, 2])
    render(<Sparkline data={data} head={head} count={count} className="my-sparkline" />)
    const svg = screen.getByRole('img')
    const cls = typeof svg.className === 'string' ? svg.className : (svg.className?.baseVal ?? '')
    expect(cls).toContain('my-sparkline')
  })
})
