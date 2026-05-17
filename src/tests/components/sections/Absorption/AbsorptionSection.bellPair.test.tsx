/**
 * Bell-pair AbsorptionSection should render as Unavailable (not null) so
 * the section is visible but communicates that PML is meaningless for the
 * Bell experiment.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AbsorptionSection } from '@/components/sections/Absorption/AbsorptionSection'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

beforeEach(() => {
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
})

describe('AbsorptionSection for bellPair', () => {
  it('renders Unavailable variant with a Bell-specific reason', () => {
    useGeometryStore.getState().setObjectType('bellPair')
    render(<AbsorptionSection defaultOpen={true} />)
    const section = screen.getByTestId('absorption-section')
    expect(section).toBeInTheDocument()
    expect(section).toHaveTextContent(/Bell-pair has no boundary absorber/i)
  })

  it('does NOT render any PML toggle/sliders for bellPair', () => {
    useGeometryStore.getState().setObjectType('bellPair')
    render(<AbsorptionSection defaultOpen={true} />)
    expect(screen.queryByTestId('absorption-pml-width')).not.toBeInTheDocument()
    expect(screen.queryByTestId('absorption-pml-reflection')).not.toBeInTheDocument()
  })
})
