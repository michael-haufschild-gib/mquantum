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

import React, { useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { BECAnalysisContent } from '@/components/sections/Advanced/BECAnalysisSection'
import { DiracAnalysisContent } from '@/components/sections/Advanced/DiracAnalysisSection'
import { FSFAnalysisContent } from '@/components/sections/Advanced/FSFAnalysisSection'
import { PauliAnalysisContent } from '@/components/sections/Advanced/PauliAnalysisSection'
import { CrossSectionAnalysisContent } from '@/components/sections/Advanced/SchroedingerCrossSectionSection'
import { TDSEAnalysisContent } from '@/components/sections/Advanced/TDSEAnalysisSection'
import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import {
  downloadFile,
  exportBecDiagnosticsCSV,
  exportFilename,
  exportFsfDiagnosticsCSV,
  exportObservablesDiagnosticsCSV,
  exportOpenQuantumDiagnosticsCSV,
  exportTdseDiagnosticsCSV,
} from '@/lib/export/dataExport'
import { useCarpetStore } from '@/stores/carpetStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useMeasurementStore } from '@/stores/measurementStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

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
      quantumMode,
      representation,
      classicalOverlayEnabled,
      classicalOverlayTrailFraction,
      classicalOverlayColor,
      setClassicalOverlayEnabled,
      setClassicalOverlayTrailFraction,
      setClassicalOverlayColor,
      setFsfDiagnosticsEnabled,
      setTdseDiagnosticsEnabled,
      setBecDiagnosticsEnabled,
      setDiracDiagnosticsEnabled,
      setPauliDiagnosticsEnabled,
    } = useExtendedObjectStore(
      useShallow((s) => ({
        quantumMode: s.schroedinger.quantumMode,
        representation: s.schroedinger.representation,
        classicalOverlayEnabled: s.schroedinger.classicalOverlayEnabled,
        classicalOverlayTrailFraction: s.schroedinger.classicalOverlayTrailFraction,
        classicalOverlayColor: s.schroedinger.classicalOverlayColor,
        setClassicalOverlayEnabled: s.setSchroedingerClassicalOverlayEnabled,
        setClassicalOverlayTrailFraction: s.setSchroedingerClassicalOverlayTrailFraction,
        setClassicalOverlayColor: s.setSchroedingerClassicalOverlayColor,
        setFsfDiagnosticsEnabled: s.setFreeScalarDiagnosticsEnabled,
        setTdseDiagnosticsEnabled: s.setTdseDiagnosticsEnabled,
        setBecDiagnosticsEnabled: s.setBecDiagnosticsEnabled,
        setDiracDiagnosticsEnabled: s.setDiracDiagnosticsEnabled,
        setPauliDiagnosticsEnabled: s.setPauliDiagnosticsEnabled,
      }))
    )
    const objectType = useGeometryStore((s) => s.objectType)
    const dimension = useGeometryStore((s) => s.dimension)

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
        </Section>
      )
    }

    const isAnalytic = quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND'

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
        {quantumMode === 'harmonicOscillator' && dimension === 3 && (
          <ControlGroup
            title="Classical Trajectory"
            collapsible
            defaultOpen={false}
            rightElement={
              <Switch
                checked={classicalOverlayEnabled}
                onCheckedChange={setClassicalOverlayEnabled}
                data-testid="classical-overlay-toggle"
              />
            }
          >
            {classicalOverlayEnabled && (
              <div className="space-y-2">
                <Slider
                  label="Trail Length"
                  tooltip="Fraction of the oscillation period shown as a trailing path behind the classical particle."
                  min={0.05}
                  max={0.5}
                  step={0.01}
                  value={classicalOverlayTrailFraction}
                  onChange={setClassicalOverlayTrailFraction}
                  showValue
                  data-testid="classical-overlay-trail"
                />
                <div
                  className="flex items-center justify-between"
                  data-testid="classical-overlay-color"
                >
                  <label className="text-xs text-text-secondary">Trail Color</label>
                  <ColorPicker
                    value={classicalOverlayColor}
                    onChange={setClassicalOverlayColor}
                    disableAlpha={true}
                    className="w-24"
                  />
                </div>
              </div>
            )}
          </ControlGroup>
        )}
        {dimension >= 3 && (
          <ControlGroup
            title="Quantum Carpet"
            rightElement={
              <Switch
                checked={carpetEnabled}
                onCheckedChange={setCarpetEnabled}
                data-testid="carpet-toggle"
              />
            }
          />
        )}
        {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && (
          <MeasurementControls />
        )}
        {!isAnalytic && (
          <ControlGroup title="Data Export" collapsible defaultOpen={false}>
            <div className="space-y-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  let csv = ''
                  let prefix = 'mdim'
                  if (quantumMode === 'tdseDynamics') {
                    csv = exportTdseDiagnosticsCSV()
                    prefix = 'mdim-tdse'
                  } else if (quantumMode === 'becDynamics') {
                    csv = exportBecDiagnosticsCSV()
                    prefix = 'mdim-bec'
                  } else if (quantumMode === 'freeScalarField') {
                    csv = exportFsfDiagnosticsCSV()
                    prefix = 'mdim-fsf'
                  }
                  if (csv) downloadFile(csv, exportFilename(prefix, 'csv'))
                }}
                data-testid="export-diagnostics-csv"
              >
                Export Diagnostics (CSV)
              </Button>
              {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && (
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
              {(quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics') && (
                <SaveLoadButtons />
              )}
            </div>
          </ControlGroup>
        )}
        {isAnalytic && (
          <ControlGroup title="Data Export" collapsible defaultOpen={false}>
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
          </ControlGroup>
        )}
      </Section>
    )
  }
)

AnalysisSection.displayName = 'AnalysisSection'

/* ────────────────────────────────────────────────────────────── */
/*  Measurement Controls                                         */
/* ────────────────────────────────────────────────────────────── */

const DIM_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p']

const MeasurementControls: React.FC = React.memo(() => {
  const {
    enabled,
    measurements,
    totalCount,
    collapseWidth,
    positionMean,
    positionStd,
    setEnabled,
    setCollapseWidth,
    clearMeasurements,
  } = useMeasurementStore(
    useShallow((s) => ({
      enabled: s.enabled,
      measurements: s.measurements,
      totalCount: s.totalCount,
      collapseWidth: s.collapseWidth,
      positionMean: s.positionMean,
      positionStd: s.positionStd,
      setEnabled: s.setEnabled,
      setCollapseWidth: s.setCollapseWidth,
      clearMeasurements: s.clearMeasurements,
    }))
  )

  return (
    <ControlGroup
      title="Measurement"
      collapsible
      defaultOpen={false}
      rightElement={
        <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="measurement-toggle" />
      }
    >
      {enabled && (
        <div className="space-y-3">
          <Slider
            label="Collapse Width"
            tooltip="Width of the post-measurement Gaussian collapse. Smaller values give more localized collapse."
            min={0.05}
            max={2.0}
            step={0.05}
            value={collapseWidth}
            onChange={setCollapseWidth}
            showValue
            data-testid="measurement-collapse-width"
          />

          <div className="text-[10px] text-text-secondary">Measurements: {totalCount}</div>

          {measurements.length > 0 && positionMean.length > 0 && (
            <div className="text-[10px] font-mono space-y-0.5">
              <div className="flex gap-2 text-text-tertiary font-semibold">
                <span className="w-4">d</span>
                <span className="w-16 text-right">mean</span>
                <span className="w-12 text-right">std</span>
              </div>
              {positionMean.map((mean, d) => (
                <div key={d} className="flex gap-2 text-text-secondary">
                  <span className="w-4 text-text-tertiary">{DIM_LABELS[d]}</span>
                  <span className="w-16 text-right">{mean.toFixed(3)}</span>
                  <span className="w-12 text-right">{(positionStd[d] ?? 0).toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearMeasurements}
            data-testid="measurement-clear"
          >
            Clear Measurements
          </Button>
        </div>
      )}
    </ControlGroup>
  )
})

MeasurementControls.displayName = 'MeasurementControls'

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
      {/* eslint-disable-next-line project-rules/no-raw-html-controls -- file input has no UI primitive equivalent */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mqstate"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            useSimulationStateStore.getState().loadFromFile(file)
            e.target.value = ''
          }
        }}
      />
    </>
  )
})

SaveLoadButtons.displayName = 'SaveLoadButtons'
