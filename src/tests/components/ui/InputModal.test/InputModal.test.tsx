/**
 * InputModal component tests.
 *
 * Verifies: typing updates value, confirm/cancel callbacks fire correctly,
 * Enter key submits, empty value handling, readOnly prevents editing.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { InputModal } from '@/components/ui/InputModal'

describe('InputModal', () => {
  it('renders title, message, and input when open', () => {
    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Enter Name"
        message="Please type a name"
        placeholder="Name..."
      />
    )

    expect(screen.getByText('Enter Name')).toBeInTheDocument()
    expect(screen.getByText('Please type a name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Name...')).toBeInTheDocument()
  })

  it('does not show the input when closed', () => {
    render(<InputModal isOpen={false} onClose={() => {}} onConfirm={() => {}} title="Hidden" />)
    // Modal may render the title in DOM but the input should not be interactive
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('calls onConfirm with typed value and onClose when confirm clicked', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <InputModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Test"
        initialValue=""
      />
    )

    const input = screen.getByRole('textbox')
    await user.type(input, 'hello world')

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' })
    await user.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('hello world')
    expect(onClose).toHaveBeenCalled()
  })

  it('Enter key submits the value', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <InputModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Test"
        initialValue=""
      />
    )

    const input = screen.getByRole('textbox')
    await user.type(input, 'typed-value')
    await user.keyboard('{Enter}')

    expect(onConfirm).toHaveBeenCalledWith('typed-value')
    expect(onClose).toHaveBeenCalled()
  })

  it('confirm button is disabled when value is empty and allowEmpty=false', () => {
    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        initialValue=""
        allowEmpty={false}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmBtn).toBeDisabled()
  })

  it('confirm button is enabled when value is empty and allowEmpty=true', () => {
    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        initialValue=""
        allowEmpty={true}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmBtn).not.toBeDisabled()
  })

  it('does not submit empty value when allowEmpty=false', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()

    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Test"
        initialValue=""
        allowEmpty={false}
      />
    )

    // Try pressing Enter with empty input
    const input = screen.getByRole('textbox')
    await user.click(input)
    await user.keyboard('{Enter}')

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('submits empty value when allowEmpty=true', async () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <InputModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Test"
        initialValue=""
        allowEmpty={true}
      />
    )

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' })
    await user.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<InputModal isOpen={true} onClose={onClose} onConfirm={() => {}} title="Test" />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('uses custom button text', () => {
    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        confirmText="Save"
        cancelText="Discard"
      />
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('sets initial value from props', async () => {
    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        initialValue="preset-name"
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('preset-name')
    })
  })

  it('readOnly prevents editing the input value', async () => {
    const user = userEvent.setup()

    render(
      <InputModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Test"
        initialValue="read-only-value"
        readOnly={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('read-only-value')
    })

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('readOnly')

    // Typing should not change the value
    await user.type(input, 'new text')
    expect(input).toHaveValue('read-only-value')
  })
})
