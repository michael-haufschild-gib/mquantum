import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'

function CollapsibleGroupWithHeaderSwitch() {
  const [enabled, setEnabled] = useState(false)

  return (
    <ControlGroup
      title="Measurement"
      collapsible
      defaultOpen={false}
      data-testid="control-group-measurement"
      rightElement={
        <Switch checked={enabled} onCheckedChange={setEnabled} ariaLabel="Toggle measurement" />
      }
    >
      <div data-testid="measurement-content">Measurement settings</div>
    </ControlGroup>
  )
}

describe('ControlGroup', () => {
  it('lets keyboard activation of a header switch change the switch without toggling collapse', async () => {
    const user = userEvent.setup()
    render(<CollapsibleGroupWithHeaderSwitch />)

    const header = screen.getByTestId('control-group-measurement-header')
    const measurementToggle = screen.getByRole('switch', { name: 'Toggle measurement' })

    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(measurementToggle).not.toBeChecked()
    expect(screen.queryByTestId('measurement-content')).not.toBeInTheDocument()

    measurementToggle.focus()
    await user.keyboard('[Space]')

    expect(measurementToggle).toBeChecked()
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('measurement-content')).not.toBeInTheDocument()
  })
})
