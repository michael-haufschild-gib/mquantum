/**
 * Tests for EditorTopBar component — top-level navigation bar.
 *
 * Verifies rendering of menu buttons and panel toggles.
 * Store-dependent behavior is tested via menuItems.test.ts.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EditorTopBar } from '@/components/layout/EditorTopBar'
import { ToastProvider } from '@/contexts/ToastContext'

function renderTopBar(props: Partial<Parameters<typeof EditorTopBar>[0]> = {}) {
  return render(
    <ToastProvider>
      <EditorTopBar showRightPanel={true} toggleRightPanel={() => {}} {...props} />
    </ToastProvider>
  )
}

describe('EditorTopBar', () => {
  it('renders the top bar container', () => {
    renderTopBar()
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it('renders left panel toggle button', () => {
    renderTopBar()
    expect(screen.getByTestId('toggle-left-panel')).toBeInTheDocument()
  })

  it('renders right panel toggle button', () => {
    renderTopBar()
    expect(screen.getByTestId('toggle-right-panel')).toBeInTheDocument()
  })

  it('renders without crashing with showRightPanel=false', () => {
    renderTopBar({ showRightPanel: false })
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })
})
