/**
 * Regression test: JSX text and string-attribute literals do not process
 * JavaScript backslash escape sequences.
 *
 * Several control panels previously had `label="Coupling (\u03BB)"` and
 * `<p>... \u03B2 ...</p>` patterns. JSX attribute strings and JSX text are
 * parsed XML-style — `\u03BB` survives as the literal six-character string
 * instead of becoming `λ`. The bug was invisible during development because
 * we never opened those panels in dev mode and TypeScript happily compiles it.
 *
 * This file fixes the rule by:
 *   1. Documenting the broken-by-design behavior with a probe (so future
 *      contributors don't try to "simplify" working `{...}` expressions
 *      back into bare attribute strings).
 *   2. Asserting that the fixed components actually render the intended
 *      Unicode glyphs in their visible labels — guarding against regressions
 *      that swap the literal characters back to escape sequences.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { OpenQuantumDiagnosticsSection } from '@/components/sections/Analysis/OpenQuantumDiagnosticsSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('JSX backslash-u escapes', () => {
  it('does not process \\uXXXX in JSX text content (regression probe)', () => {
    render(<span data-testid="probe">\u03BB</span>)
    // If this assertion ever flips, JSX semantics changed — re-evaluate the
    // class of bugs this whole regression suite was guarding against.
    expect(screen.getByTestId('probe')).toHaveTextContent('\\u03BB')
  })

  it('does not process \\uXXXX in JSX string attributes (regression probe)', () => {
    render(<span data-testid="probe" title="\u03BB" />)
    expect(screen.getByTestId('probe')).toHaveAttribute('title', '\\u03BB')
  })
})

describe('OpenQuantumDiagnosticsSection — formula display', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    // The section gates on (openQuantum.enabled && analytic mode && repr !== wigner).
    // harmonicOscillator + position is the simplest valid combo.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'harmonicOscillator',
        representation: 'position',
        openQuantum: { ...state.schroedinger.openQuantum, enabled: true },
      },
    }))
  })

  it('renders Greek/Unicode glyphs in formula text after the fix', async () => {
    const user = userEvent.setup()
    render(<OpenQuantumDiagnosticsSection />)
    // Section component starts collapsed via defaultOpen={false} → click the
    // section header (aria-expanded="false") to mount its body, then click
    // the Formulas toggle inside.
    const sectionHeader = screen.getByRole('button', { expanded: false })
    await user.click(sectionHeader)
    const formulasToggle = screen.getByRole('button', { name: /Formulas/i })
    await user.click(formulasToggle)

    // Each formula previously rendered the literal escape, e.g. "Tr(\u03C1\u00B2)".
    // After the fix the actual Unicode glyphs (ρ, ², ∈, −, Σ) must reach the DOM.
    expect(screen.getByText(/Purity = Tr\(ρ²\) ∈/)).toBeInTheDocument()
    expect(screen.getByText(/Linear Entropy = 1 − Tr\(ρ²\)/)).toBeInTheDocument()
    expect(screen.getByText(/von Neumann S = −Tr\(ρ ln ρ\)/)).toBeInTheDocument()
    // The Coherence formula renders as a <p> with mixed text + <sub>; check
    // a specific Unicode glyph that wouldn't survive if the literal escape
    // had survived (\u03A3 → Σ).
    expect(screen.getByText(/Coherence = Σ/)).toBeInTheDocument()
  })
})
