/**
 * Tests for EditorLayout — main application layout with panels.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EditorLayout } from '@/components/layout/EditorLayout'
import { ToastProvider } from '@/contexts/ToastContext'

function renderLayout() {
  return render(
    <ToastProvider>
      <EditorLayout>
        <div data-testid="child-content">Canvas</div>
      </EditorLayout>
    </ToastProvider>
  )
}

describe('EditorLayout', () => {
  it('renders children in the canvas area', () => {
    renderLayout()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders without crashing when children are null', () => {
    // Verifies the component tree mounts without throwing.
    // EditorLayout imports lazy panels and Motion animations — this test ensures
    // all dependencies resolve in the test environment.
    expect(() => {
      render(
        <ToastProvider>
          <EditorLayout />
        </ToastProvider>
      )
    }).not.toThrow()
  })
})
