/**
 * Unified Analysis Section
 *
 * Single collapsible section that renders the appropriate analysis content
 * based on the current quantum mode. Covers all modes:
 * - harmonicOscillator / hydrogenND: cross-section, radial probability, second quantization
 * - freeScalarField / tdseDynamics / becDynamics / diracEquation: mode-specific diagnostics
 *
 * Returns null when no analysis content is applicable (e.g. dim <= 2 in Wigner mode).
 *
 * @module components/sections/Advanced/AnalysisSection
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { CrossSectionAnalysisContent } from '@/components/sections/Advanced/SchroedingerCrossSectionSection'
import { FSFAnalysisContent } from '@/components/sections/Advanced/FSFAnalysisSection'
import { TDSEAnalysisContent } from '@/components/sections/Advanced/TDSEAnalysisSection'
import { BECAnalysisContent } from '@/components/sections/Advanced/BECAnalysisSection'
import { DiracAnalysisContent } from '@/components/sections/Advanced/DiracAnalysisSection'

/**
 * Props for AnalysisSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface AnalysisSectionProps {
  defaultOpen?: boolean
}

const MODE_LABELS: Record<string, string> = {
  harmonicOscillator: 'Cross Section',
  hydrogenND: 'Cross Section',
  freeScalarField: 'FSF',
  tdseDynamics: 'TDSE',
  becDynamics: 'BEC',
  diracEquation: 'Dirac',
}

/**
 * Unified analysis section for all quantum modes.
 * Renders mode-specific diagnostics, visualizations, and observables
 * inside a single collapsible section.
 *
 * @param props - Component props
 * @returns The analysis section, or null when not applicable
 *
 * @example
 * ```tsx
 * <AnalysisSection defaultOpen={true} />
 * ```
 */
export const AnalysisSection: React.FC<AnalysisSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const {
      quantumMode, representation,
      setFsfDiagnosticsEnabled, setTdseDiagnosticsEnabled,
      setBecDiagnosticsEnabled, setDiracDiagnosticsEnabled,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        setFsfDiagnosticsEnabled: s.setFreeScalarDiagnosticsEnabled,
        setTdseDiagnosticsEnabled: s.setTdseDiagnosticsEnabled,
        setBecDiagnosticsEnabled: s.setBecDiagnosticsEnabled,
        setDiracDiagnosticsEnabled: s.setDiracDiagnosticsEnabled,
      })),
    )
    const dimension = useGeometryStore((s) => s.dimension)

    const isAnalytic = quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND'

    // Analytic modes require 3D+ and non-Wigner representation for cross-section
    if (isAnalytic && (dimension <= 2 || representation === 'wigner')) return null

    const label = MODE_LABELS[quantumMode]
    if (!label) return null

    // Wire diagnosticsEnabled to section open/close state for all dynamic modes
    const handleOpenChange = useCallback(
      (isOpen: boolean) => {
        switch (quantumMode) {
          case 'freeScalarField': setFsfDiagnosticsEnabled(isOpen); break
          case 'tdseDynamics': setTdseDiagnosticsEnabled(isOpen); break
          case 'becDynamics': setBecDiagnosticsEnabled(isOpen); break
          case 'diracEquation': setDiracDiagnosticsEnabled(isOpen); break
        }
      },
      [quantumMode, setFsfDiagnosticsEnabled, setTdseDiagnosticsEnabled, setBecDiagnosticsEnabled, setDiracDiagnosticsEnabled],
    )

    return (
      <Section
        title={`${label} Analysis`}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        data-testid="analysis-section"
      >
        {isAnalytic && <CrossSectionAnalysisContent />}
        {quantumMode === 'freeScalarField' && <FSFAnalysisContent />}
        {quantumMode === 'tdseDynamics' && <TDSEAnalysisContent />}
        {quantumMode === 'becDynamics' && <BECAnalysisContent />}
        {quantumMode === 'diracEquation' && <DiracAnalysisContent />}
      </Section>
    )
  },
)

AnalysisSection.displayName = 'AnalysisSection'
