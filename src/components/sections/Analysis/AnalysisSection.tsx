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
 * @module components/sections/Analysis/AnalysisSection
 */

import React, { useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { BECAnalysisContent } from '@/components/sections/Analysis/BECAnalysisSection'
import { DiracAnalysisContent } from '@/components/sections/Analysis/DiracAnalysisSection'
import { FSFAnalysisContent } from '@/components/sections/Analysis/FSFAnalysisSection'
import { MeasurementControls } from '@/components/sections/Analysis/MeasurementControls'
import { PauliAnalysisContent } from '@/components/sections/Analysis/PauliAnalysisSection'
import { CrossSectionAnalysisContent } from '@/components/sections/Analysis/SchroedingerCrossSectionSection'
import { TDSEAnalysisContent } from '@/components/sections/Analysis/TDSEAnalysisSection'
import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { FileInput } from '@/components/ui/FileInput'
import { Switch } from '@/components/ui/Switch'
import {
  downloadFile,
  exportAtlasSweepCSV,
  exportBecDiagnosticsCSV,
  exportDiagnosticsJSON,
  exportDiracDiagnosticsCSV,
  exportEntanglementCSV,
  exportFilename,
  exportFsfDiagnosticsCSV,
  exportObservablesDiagnosticsCSV,
  exportOpenQuantumDiagnosticsCSV,
  exportPauliDiagnosticsCSV,
  exportTdseDiagnosticsCSV,
  exportWavefunctionSliceCSV,
} from '@/lib/export/dataExport'
import {
  isAnalyticQuantumType,
  isComputeQuantumType,
  type QuantumTypeKey,
} from '@/lib/geometry/registry'
import { useCarpetStore } from '@/stores/carpetStore'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'
import { useWavefunctionSliceStore } from '@/stores/wavefunctionSliceStore'

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
  hydrogenNDCoupled: 'Cross Section',
  freeScalarField: 'FSF',
  tdseDynamics: 'TDSE',
  becDynamics: 'BEC',
  diracEquation: 'Dirac',
  quantumWalk: 'Quantum Walk',
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
      quantumMode,
      representation,
      setFsfDiagnosticsEnabled,
      setTdseDiagnosticsEnabled,
      setBecDiagnosticsEnabled,
      setDiracDiagnosticsEnabled,
      setPauliDiagnosticsEnabled,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        setFsfDiagnosticsEnabled: s.setFreeScalarDiagnosticsEnabled,
        setTdseDiagnosticsEnabled: s.setTdseDiagnosticsEnabled,
        setBecDiagnosticsEnabled: s.setBecDiagnosticsEnabled,
        setDiracDiagnosticsEnabled: s.setDiracDiagnosticsEnabled,
        setPauliDiagnosticsEnabled: s.setPauliDiagnosticsEnabled,
      }))
    )
    const objectType = useGeometryStore((s) => s.objectType)
    const dimension = useGeometryStore((s) => s.dimension)
    const observablesHasData = useDiagnosticsStore((s) => s.observables.hasData)

    // Wire diagnosticsEnabled to section open/close state for all dynamic modes
    const handleOpenChange = useCallback(
      (isOpen: boolean) => {
        switch (quantumMode) {
          case 'freeScalarField':
            setFsfDiagnosticsEnabled(isOpen)
            break
          case 'tdseDynamics':
            setTdseDiagnosticsEnabled(isOpen)
            break
          case 'becDynamics':
            setBecDiagnosticsEnabled(isOpen)
            break
          case 'diracEquation':
            setDiracDiagnosticsEnabled(isOpen)
            break
        }
      },
      [
        quantumMode,
        setFsfDiagnosticsEnabled,
        setTdseDiagnosticsEnabled,
        setBecDiagnosticsEnabled,
        setDiracDiagnosticsEnabled,
      ]
    )

    const carpetEnabled = useCarpetStore((s) => s.enabled)
    const setCarpetEnabled = useCarpetStore((s) => s.setEnabled)

    const isPauli = objectType === 'pauliSpinor'

    // Pauli spinor has its own analysis path
    if (isPauli) {
      return (
        <Section
          title="Pauli Analysis"
          defaultOpen={defaultOpen}
          onOpenChange={setPauliDiagnosticsEnabled}
          data-testid="analysis-section"
        >
          <PauliAnalysisContent />
          <DataExportButtons quantumMode="pauliSpinor" />
        </Section>
      )
    }

    const isAnalytic = isAnalyticQuantumType(quantumMode)

    // Analytic modes require 3D+ and non-Wigner representation for cross-section
    if (isAnalytic && (dimension <= 2 || representation === 'wigner')) return null

    const label = MODE_LABELS[quantumMode]
    if (!label) return null

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
        {dimension >= 3 && (
          <ControlGroup
            title="Quantum Carpet"
            rightElement={
              <Switch
                checked={carpetEnabled}
                onCheckedChange={setCarpetEnabled}
                tooltip="Toggle the quantum carpet — a space-time density plot of the evolution history."
                data-testid="carpet-toggle"
              />
            }
          />
        )}
        {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && (
          <MeasurementControls />
        )}
        <DataExportButtons quantumMode={quantumMode} observablesHasData={observablesHasData} />
      </Section>
    )
  }
)

AnalysisSection.displayName = 'AnalysisSection'

/* MeasurementControls extracted to ./MeasurementControls.tsx */

/* ────────────────────────────────────────────────────────────── */
/*  Save/Load State Buttons                                       */
/* ────────────────────────────────────────────────────────────── */

const SaveLoadButtons: React.FC = React.memo(() => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const status = useSimulationStateStore((s) => s.status)

  return (
    <>
      <div className="border-t border-border-subtle pt-1.5 mt-1.5 flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => useSimulationStateStore.getState().requestSave()}
          disabled={status === 'saving'}
          data-testid="save-state"
        >
          {status === 'saving' ? 'Saving...' : 'Save State'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={status === 'loading'}
          data-testid="load-state"
        >
          {status === 'loading' ? 'Loading...' : 'Load State'}
        </Button>
      </div>
      <FileInput
        ref={fileInputRef}
        accept=".mqstate"
        onFileSelected={(file) => {
          if (file) useSimulationStateStore.getState().loadFromFile(file)
        }}
      />
    </>
  )
})

SaveLoadButtons.displayName = 'SaveLoadButtons'

/* ────────────────────────────────────────────────────────────── */
/*  Data Export Buttons                                           */
/* ────────────────────────────────────────────────────────────── */

const CSV_EXPORTERS: Record<string, { fn: () => string; prefix: string }> = {
  tdseDynamics: { fn: exportTdseDiagnosticsCSV, prefix: 'mdim-tdse' },
  becDynamics: { fn: exportBecDiagnosticsCSV, prefix: 'mdim-bec' },
  freeScalarField: { fn: exportFsfDiagnosticsCSV, prefix: 'mdim-fsf' },
  diracEquation: { fn: exportDiracDiagnosticsCSV, prefix: 'mdim-dirac' },
  pauliSpinor: { fn: exportPauliDiagnosticsCSV, prefix: 'mdim-pauli' },
}

/**
 * Unified data export controls for all quantum modes.
 * Renders CSV and JSON export buttons, observables export, wavefunction
 * slice export, and save/load controls as appropriate for the mode.
 */
const DataExportButtons: React.FC<{
  quantumMode: QuantumTypeKey
  observablesHasData?: boolean
}> = React.memo(({ quantumMode, observablesHasData }) => {
  const isAnalytic = isAnalyticQuantumType(quantumMode)
  const hasSaveLoad = isComputeQuantumType(quantumMode) || quantumMode === 'pauliSpinor'

  // Wavefunction slice availability
  const densitySliceAvailable = useDiagnosticsStore(
    (s) => s.density.sliceX !== null && s.density.sliceGridSize > 0
  )
  const wfSliceHasData = useWavefunctionSliceStore(
    (s) => s.hasData && s.sliceAxis === 'x' && s.sliceSourceMode === quantumMode
  )

  // Entanglement export availability
  const entEnabled = useCoordinateEntanglementStore((s) => s.enabled)
  const hasSweepResults = useCoordinateEntanglementStore((s) => s.sweepResults.length > 0)

  return (
    <ControlGroup
      title="Data Export"
      collapsible
      defaultOpen={false}
      data-testid="data-export-group"
    >
      <div className="space-y-1.5">
        {/* Mode-specific diagnostics CSV */}
        {CSV_EXPORTERS[quantumMode] && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const exporter = CSV_EXPORTERS[quantumMode]!
              const csv = exporter.fn()
              if (csv) downloadFile(csv, exportFilename(exporter.prefix, 'csv'))
            }}
            data-testid="export-diagnostics-csv"
          >
            Export Diagnostics (CSV)
          </Button>
        )}

        {/* Open quantum metrics CSV (analytic modes) */}
        {isAnalytic && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const csv = exportOpenQuantumDiagnosticsCSV()
              if (csv) downloadFile(csv, exportFilename('mdim-openquantum', 'csv'))
            }}
            data-testid="export-openquantum-csv"
          >
            Export Open Quantum (CSV)
          </Button>
        )}

        {/* Observables CSV (TDSE/BEC with data) */}
        {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') &&
          observablesHasData && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const csv = exportObservablesDiagnosticsCSV()
                if (csv) downloadFile(csv, exportFilename('mdim-observables', 'csv'))
              }}
              data-testid="export-observables-csv"
            >
              Export Observables (CSV)
            </Button>
          )}

        {/* Entanglement CSV (TDSE with entanglement enabled) */}
        {quantumMode === 'tdseDynamics' && entEnabled && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const csv = exportEntanglementCSV()
                if (csv) downloadFile(csv, exportFilename('mdim-entanglement', 'csv'))
              }}
              data-testid="export-entanglement-csv"
            >
              Export Entanglement (CSV)
            </Button>
            {hasSweepResults && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const csv = exportAtlasSweepCSV()
                  if (csv) downloadFile(csv, exportFilename('mdim-atlas-sweep', 'csv'))
                }}
                data-testid="export-atlas-sweep-csv"
              >
                Export λ×N Sweep (CSV)
              </Button>
            )}
          </>
        )}

        {/* Wavefunction slice CSV (analytic: from density grid) */}
        {isAnalytic && densitySliceAvailable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const csv = exportWavefunctionSliceCSV('density', 'x')
              if (csv) downloadFile(csv, exportFilename('mdim-slice-x', 'csv'))
            }}
            data-testid="export-slice-csv"
          >
            Export |&psi;|&sup2; Slice (CSV)
          </Button>
        )}

        {/* Wavefunction slice capture (dynamic modes) */}
        {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && !wfSliceHasData && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              useWavefunctionSliceStore.getState().requestCapture('x', quantumMode)
            }}
            data-testid="capture-slice"
          >
            Capture |&psi;|&sup2; Slice
          </Button>
        )}
        {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && wfSliceHasData && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const csv = exportWavefunctionSliceCSV('wavefunction', 'x')
              if (csv) downloadFile(csv, exportFilename('mdim-slice', 'csv'))
            }}
            data-testid="export-wf-slice-csv"
          >
            Export |&psi;|&sup2; Slice (CSV)
          </Button>
        )}

        {/* JSON export (all modes) */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const json = exportDiagnosticsJSON(quantumMode)
            downloadFile(json, exportFilename('mdim-diagnostics', 'json'), 'application/json')
          }}
          data-testid="export-diagnostics-json"
        >
          Export All (JSON)
        </Button>

        {/* Save/Load state (TDSE/BEC only) */}
        {hasSaveLoad && <SaveLoadButtons />}
      </div>
    </ControlGroup>
  )
})

DataExportButtons.displayName = 'DataExportButtons'
