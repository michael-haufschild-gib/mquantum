import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { MiscControls } from '@/components/sections/PostProcessing/MiscControls'
import { usePostProcessingStore } from '@/stores/postProcessingStore'

describe('MiscControls', () => {
  beforeEach(() => {
    usePostProcessingStore.setState(usePostProcessingStore.getInitialState())
  })

  it('renders and wires Memory Spin when horizon memory is enabled', () => {
    usePostProcessingStore.setState({
      frameBlendingEnabled: true,
      horizonMemoryEnabled: true,
    })

    render(<MiscControls />)

    const slider = screen.getByRole('slider', { name: 'Memory Spin' })
    fireEvent.change(slider, { target: { value: '0.8' } })

    expect(usePostProcessingStore.getState().horizonMemorySpin).toBeCloseTo(0.8, 6)
  })
})
