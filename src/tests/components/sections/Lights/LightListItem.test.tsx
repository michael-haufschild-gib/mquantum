/**
 * Tests for LightListItem — single light entry with toggle, select, and remove.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AMBIENT_LIGHT_ID, LightListItem } from '@/components/sections/Lights/LightListItem'
import type { LightSource } from '@/lib/lighting/lightSource'

function makeLight(overrides: Partial<LightSource> = {}): LightSource {
  return {
    id: 'light-1',
    type: 'point',
    name: 'Point Light',
    color: '#ffffff',
    intensity: 1.0,
    enabled: true,
    position: [0, 1, 2],
    rotation: [0, 0, 0],
    coneAngle: 45,
    penumbra: 0.5,
    range: 10,
    decay: 2,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LightListItem', () => {
  it('renders light name', () => {
    render(
      <LightListItem
        light={makeLight({ name: 'My Point' })}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText('My Point')).toBeInTheDocument()
  })

  it('shows enabled/disable toggle button', () => {
    render(
      <LightListItem
        light={makeLight({ enabled: true })}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /disable light/i })).toBeInTheDocument()
  })

  it('shows enable button when light is disabled', () => {
    render(
      <LightListItem
        light={makeLight({ enabled: false })}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /enable light/i })).toBeInTheDocument()
  })

  it('calls onToggle when toggle button clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <LightListItem
        light={makeLight()}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={onToggle}
        onRemove={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: /disable light/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('calls onSelect when item is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <LightListItem
        light={makeLight({ name: 'Test Light' })}
        isSelected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    await user.click(screen.getByText('Test Light'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('calls onRemove when delete button clicked for regular light', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <LightListItem
        light={makeLight()}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={onRemove}
      />
    )
    await user.click(screen.getByRole('button', { name: /remove light/i }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onRemove when delete button clicked for ambient light (isDeleteDisabled)', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(
      <LightListItem
        light={makeLight({ id: AMBIENT_LIGHT_ID, name: 'Ambient Light' })}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={onRemove}
        isDeleteDisabled={true}
      />
    )
    // Delete button is disabled for ambient light
    const deleteBtn = screen.getByRole('button', { name: /cannot remove/i })
    expect(deleteBtn).toBeDisabled()
    await user.click(deleteBtn)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('applies selected styles when isSelected is true', () => {
    render(
      <LightListItem
        light={makeLight({ name: 'Selected Light' })}
        isSelected={true}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    // Item has aria-pressed=true when selected
    const item = screen.getByRole('button', { name: /Selected Light/ })
    expect(item).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onSelect on Enter keypress', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <LightListItem
        light={makeLight({ name: 'Keyboard Light' })}
        isSelected={false}
        onSelect={onSelect}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    const item = screen.getByText('Keyboard Light')
    item.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
