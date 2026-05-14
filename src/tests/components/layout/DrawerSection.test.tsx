import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DrawerSection } from '@/components/layout/TimelineControls/DrawerSection'
import { Slider } from '@/components/ui/Slider'

describe('DrawerSection', () => {
  it('semantically disables nested controls when the section is off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <DrawerSection title="Phase Shimmer" enabled={false} onToggle={vi.fn()}>
        <Slider label="Strength" min={0} max={1} step={0.1} value={0.3} onChange={onChange} />
      </DrawerSection>
    )

    const group = screen.getByRole('group', { name: 'Phase Shimmer parameters' })
    const range = screen.getByRole('slider', { name: 'Strength' })
    const valueInput = screen.getByRole('textbox', { name: 'Strength value' })

    expect(group).toHaveAttribute('aria-disabled', 'true')
    expect(group).toBeDisabled()
    expect(range).toBeDisabled()
    expect(valueInput).toBeDisabled()

    await user.type(valueInput, '0.8')
    expect(onChange).not.toHaveBeenCalled()
  })
})
