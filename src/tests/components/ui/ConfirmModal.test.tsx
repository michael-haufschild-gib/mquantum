/**
 * ConfirmModal component tests.
 *
 * Verifies: confirm/cancel callbacks, destructive variant styling,
 * custom button text, close-on-confirm behavior.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmModal } from '@/components/ui/ConfirmModal'

describe('ConfirmModal', () => {
  it('renders title and message when open', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete Item"
        message="Are you sure you want to delete this item?"
      />
    )

    expect(screen.getByText('Delete Item')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to delete this item?')).toBeInTheDocument()
  })

  it('dialog is not open when isOpen=false', () => {
    render(
      <ConfirmModal
        isOpen={false}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Hidden"
        message="Content"
      />
    )

    // Native dialog element exists in DOM but its content should be excluded
    // from the normal accessibility tree. The button is only reachable with
    // `{ hidden: true }`, which proves the dialog never called `showModal()`.
    const confirmBtn = screen.getByRole('button', { name: 'Confirm', hidden: true })
    expect(confirmBtn).toBeInTheDocument()
    // Normal (non-hidden) a11y query must NOT find the button — a regression
    // that accidentally opened the dialog when isOpen=false would surface here.
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('calls onConfirm and onClose when confirm is clicked', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm Action"
        message="Proceed?"
      />
    )

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose (not onConfirm) when cancel is clicked', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Confirm"
        message="Proceed?"
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('renders custom button text', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Remove"
        message="Remove this?"
        confirmText="Yes, Remove"
        cancelText="Keep It"
      />
    )

    expect(screen.getByRole('button', { name: 'Yes, Remove' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep It' })).toBeInTheDocument()
  })

  it('uses danger variant for destructive actions', () => {
    const { rerender } = render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete"
        message="Permanently delete?"
        isDestructive={true}
        confirmText="Delete"
        data-testid="delete-modal"
      />
    )

    const destructiveBtn = screen.getByTestId('delete-modal-confirm')
    expect(destructiveBtn).toHaveTextContent('Delete')
    // Stable variant marker: Button.tsx applies `bg-[var(--bg-danger)]` for
    // `variant="danger"`. Checking the class name makes the test fail if the
    // destructive variant silently regresses to primary.
    expect(destructiveBtn).toHaveClass('bg-[var(--bg-danger)]')

    // Negative control: the primary variant must NOT carry the danger class.
    rerender(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Delete"
        message="Permanently delete?"
        isDestructive={false}
        confirmText="Delete"
        data-testid="delete-modal"
      />
    )
    const primaryBtn = screen.getByTestId('delete-modal-confirm')
    expect(primaryBtn).not.toHaveClass('bg-[var(--bg-danger)]')
  })

  it('renders JSX content in message prop', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Complex Message"
        message={
          <span>
            This action will affect <strong>3 items</strong>.
          </span>
        }
      />
    )

    expect(screen.getByText('3 items')).toBeInTheDocument()
  })

  it('supports data-testid prefix on buttons', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        message="Test"
        data-testid="overwrite-scene"
      />
    )

    expect(screen.getByTestId('overwrite-scene-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('overwrite-scene-cancel')).toBeInTheDocument()
  })
})
