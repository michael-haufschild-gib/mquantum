import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ArrowRightIcon from '@/assets/icons/arrow-right-filled.svg?react'

describe('SVG ?react imports under Vitest', () => {
  it('render as SVG components instead of data-url tag names', () => {
    render(<ArrowRightIcon aria-label="next" data-testid="next-icon" />)

    const icon = screen.getByTestId('next-icon')
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon).toHaveAttribute('viewBox', '0 0 16 16')
  })
})
