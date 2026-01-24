import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Envelope } from '../../../components/ui/Envelope'

describe('Envelope', () => {
  it('renders an SVG for a valid ADSR envelope', () => {
    const { container } = render(
      <Envelope mode="ADSR" attack={0.1} decay={0.2} sustain={0.5} release={0.3} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
