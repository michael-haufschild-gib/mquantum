/**
 * Decoherence controls for stochastic localization and branch visualization.
 *
 * Shows when quantum mode is tdseDynamics. Controls CSL parameters (γ, σ, N_loc)
 * and dual-color branching visualization.
 *
 * @module components/sections/Analysis/DecoherenceSection
 */

import { useShallow } from 'zustand/react/shallow'

import { MonitoringSweepSection } from '@/components/sections/Analysis/MonitoringSweepSection'
import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { NumberInput } from '@/components/ui/NumberInput'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { MAX_STOCHASTIC_SITES } from '@/lib/physics/stochastic/localizationKernel'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/** Decoherence section — controls CSL localization and branch visualization. */
export function DecoherenceSection() {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

  if (quantumMode !== 'tdseDynamics') {
    return <UnavailableSection title="Decoherence" reason="Available in TDSE Dynamics mode" />
  }

  return <DecoherenceContent />
}

/** Inner content — only rendered when quantumMode === 'tdseDynamics'. */
function DecoherenceContent() {
  const sweepRunning = useCoordinateEntanglementStore((s) => s.sweepStatus === 'running')
  const {
    tdse,
    setStochasticEnabled,
    setStochasticGamma,
    setStochasticSigma,
    setStochasticNumSites,
    setStochasticSeed,
    setBranchingEnabled,
    setBranchPlanePosition,
    setBranchColorA,
    setBranchColorB,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      tdse: s.schroedinger?.tdse,
      setStochasticEnabled: s.setTdseStochasticEnabled,
      setStochasticGamma: s.setTdseStochasticGamma,
      setStochasticSigma: s.setTdseStochasticSigma,
      setStochasticNumSites: s.setTdseStochasticNumSites,
      setStochasticSeed: s.setTdseStochasticSeed,
      setBranchingEnabled: s.setTdseBranchingEnabled,
      setBranchPlanePosition: s.setTdseBranchPlanePosition,
      setBranchColorA: s.setTdseBranchColorA,
      setBranchColorB: s.setTdseBranchColorB,
    }))
  )

  if (!tdse) return null

  const rgbToHex = (c: [number, number, number]): string => {
    const r = Math.round(c[0] * 255)
      .toString(16)
      .padStart(2, '0')
    const g = Math.round(c[1] * 255)
      .toString(16)
      .padStart(2, '0')
    const b = Math.round(c[2] * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${r}${g}${b}`
  }

  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return [r, g, b]
  }

  return (
    <Section title="Decoherence">
      <div
        className={`space-y-0 transition-opacity${sweepRunning ? ' pointer-events-none opacity-50' : ''}`}
      >
        <Switch
          label="Enable Decoherence"
          checked={tdse.stochasticEnabled}
          onCheckedChange={setStochasticEnabled}
          disabled={sweepRunning}
        />
        {tdse.stochasticEnabled && (
          <>
            <Slider
              label="Monitoring rate (γ)"
              value={tdse.stochasticGamma}
              onChange={setStochasticGamma}
              min={0}
              max={10}
              step={0.1}
            />
            <Slider
              label="Localization width (σ)"
              value={tdse.stochasticSigma}
              onChange={setStochasticSigma}
              min={0.5}
              max={5.0}
              step={0.1}
            />
            <Slider
              label="Collapse sites/step"
              value={tdse.stochasticNumSites}
              onChange={setStochasticNumSites}
              min={1}
              max={MAX_STOCHASTIC_SITES}
              step={1}
            />
            <NumberInput
              label="Seed"
              value={tdse.stochasticSeed}
              onChange={setStochasticSeed}
              min={0}
              max={999999}
              step={1}
            />

            <Switch
              label="Show branches"
              checked={tdse.branchingEnabled}
              onCheckedChange={setBranchingEnabled}
            />
            {tdse.branchingEnabled && (
              <>
                <Slider
                  label="Branch plane"
                  value={tdse.branchPlanePosition}
                  onChange={setBranchPlanePosition}
                  min={-1.0}
                  max={1.0}
                  step={0.01}
                />
                <ColorPicker
                  label="Branch A"
                  value={rgbToHex(tdse.branchColorA)}
                  onChange={(hex) => setBranchColorA(hexToRgb(hex))}
                />
                <ColorPicker
                  label="Branch B"
                  value={rgbToHex(tdse.branchColorB)}
                  onChange={(hex) => setBranchColorB(hexToRgb(hex))}
                />
              </>
            )}

            <MonitoringSweepSection />
          </>
        )}
      </div>
    </Section>
  )
}
