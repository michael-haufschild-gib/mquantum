import React from 'react'

import { AnalysisSection } from '@/components/sections/Analysis/AnalysisSection'
import { BECPageCurveSection } from '@/components/sections/Analysis/BECPageCurveSection'
import { CoordinateEntanglementSection } from '@/components/sections/Analysis/CoordinateEntanglementSection'
import { DecoherenceSection } from '@/components/sections/Analysis/DecoherenceSection'
import { OpenQuantumDiagnosticsSection } from '@/components/sections/Analysis/OpenQuantumDiagnosticsSection'
import { QuantumnessAtlasSection } from '@/components/sections/Analysis/QuantumnessAtlasSection'
import { SchroedingerQuantumEffectsSection } from '@/components/sections/Analysis/SchroedingerQuantumEffectsSection'
import { SrmtDiagnosticSection } from '@/components/sections/Analysis/SrmtDiagnosticSection'
import { SrmtSweepSection } from '@/components/sections/Analysis/SrmtSweepSection'

/** Analysis tab — cross-section, decoherence, entanglement, and quantum effects. */
const AnalysisTabContent: React.FC = () => (
  <div>
    <AnalysisSection defaultOpen={true} />
    <BECPageCurveSection />
    <DecoherenceSection />
    <CoordinateEntanglementSection />
    <QuantumnessAtlasSection />
    <SchroedingerQuantumEffectsSection defaultOpen={true} />
    <OpenQuantumDiagnosticsSection />
    <SrmtDiagnosticSection />
    <SrmtSweepSection />
  </div>
)
AnalysisTabContent.displayName = 'AnalysisTabContent'

export default AnalysisTabContent
