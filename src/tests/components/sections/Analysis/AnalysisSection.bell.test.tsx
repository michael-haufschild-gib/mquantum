import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { AnalysisSection } from '@/components/sections/Analysis/AnalysisSection'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

beforeEach(() => {
  useGeometryStore.getState().reset()
  useExtendedObjectStore.getState().reset()
  useBellExperimentStore.getState().reset()
  useGeometryStore.getState().setObjectType('bellPair')
})

describe('AnalysisSection — Bell diagnostics export', () => {
  it('renders Bell export controls without exposing state save/load', async () => {
    const user = userEvent.setup()
    render(<AnalysisSection />)

    expect(screen.getByTestId('bell-experiment-content')).toBeInTheDocument()
    await user.click(screen.getByTestId('data-export-group-header'))

    expect(screen.getByTestId('export-diagnostics-csv')).toBeInTheDocument()
    expect(screen.getByTestId('export-diagnostics-json')).toBeInTheDocument()
    expect(screen.queryByTestId('save-state')).not.toBeInTheDocument()
    expect(screen.queryByTestId('load-state')).not.toBeInTheDocument()
  })
})
