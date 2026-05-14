import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/Button'
import { Z_INDEX } from '@/constants/zIndex'
import { ToastProvider } from '@/contexts/ToastContext'
import { useToast } from '@/hooks/useToast'

const ToastButton: React.FC = () => {
  const { addToast } = useToast()
  return <Button onClick={() => addToast('Export failed', 'error')}>Show toast</Button>
}

describe('ToastProvider', () => {
  it('renders toasts above modal layers', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <ToastButton />
      </ToastProvider>
    )

    await user.click(screen.getByRole('button', { name: /show toast/i }))

    expect(screen.getByTestId('toast-message')).toHaveTextContent('Export failed')
    expect(screen.getByTestId('toast-container')).toHaveStyle({ zIndex: Z_INDEX.TOOLTIP })
  })
})
