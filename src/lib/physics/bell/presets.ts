/**
 * Bell / CHSH scenario presets.
 *
 * Each preset is a curated `Partial<BellPairConfig>` that demonstrates a
 * specific physics regime — singlet+canonical angles, Werner threshold,
 * Eberhard threshold, detection loophole, classical LHV baseline, dynamic
 * precession. The preset id is the URL-stable key consumed by the
 * scenario dropdown and the `ID_PRESET_TABLES` description lookup.
 *
 * @module lib/physics/bell/presets
 */

import type { BellPairConfig } from '@/lib/geometry/extended/bellPair'
import { CANONICAL_CHSH_PHI, WERNER_VIOLATION_THRESHOLD } from '@/lib/physics/bell/analytic'
import { EBERHARD_THRESHOLD } from '@/lib/physics/bell/loopholes'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/**
 * Curated Bell-pair scenarios. Each one isolates a single physics knob so
 * the user can flip between them and watch CHSH react.
 *
 * The canonical CHSH angles (Alice 0, π/2; Bob π/4, 3π/4) sit at the
 * singlet's |S| = 2√2 maximum and form the default. Other presets keep
 * the canonical angles and vary only state noise, sampler, or detection
 * efficiency — that way the angle choice does not confound the demo.
 */
export const BELL_SCENARIO_PRESETS: readonly ScenarioPreset<Partial<BellPairConfig>>[] =
  Object.freeze([
    {
      id: 'chshSinglet',
      name: 'CHSH singlet (canonical)',
      description:
        'Maximally entangled singlet, perfect detectors, canonical CHSH angles. QM converges to |S| = 2√2 ≈ 2.828.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 1,
        detectionEfficiency: 1,
        analysisMode: 'fairSampling',
        fieldA: [0, 0, 0],
        fieldB: [0, 0, 0],
        samplerMode: 'qm',
        lhvStrategyId: 'deterministicBell',
      },
    },
    {
      id: 'wernerMarginal',
      name: 'Werner threshold (marginal violation)',
      description:
        'Werner visibility just above 1/√2 ≈ 0.7071. |S| barely clears the classical bound — pedagogical view of the threshold.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: Math.min(1, WERNER_VIOLATION_THRESHOLD + 0.015),
        detectionEfficiency: 1,
        analysisMode: 'fairSampling',
        samplerMode: 'qm',
      },
    },
    {
      id: 'wernerBelowThreshold',
      name: 'Werner below threshold (no violation)',
      description:
        'Werner v = 0.55 < 1/√2; CHSH violation is impossible regardless of angles. Loophole panel turns amber.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 0.55,
        detectionEfficiency: 1,
        analysisMode: 'fairSampling',
        samplerMode: 'qm',
      },
    },
    {
      id: 'eberhardMarginal',
      name: 'Eberhard η (marginal, fair-sampling)',
      description:
        'Detection η just above 2/(1+√2) ≈ 0.828 under fair sampling. Demonstrates the loophole-free regime.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 1,
        detectionEfficiency: Math.min(1, EBERHARD_THRESHOLD + 0.02),
        analysisMode: 'fairSampling',
        samplerMode: 'qm',
      },
    },
    {
      id: 'detectionLoopholeExploit',
      name: 'Detection loophole (LHV fakes violation)',
      description:
        'Low η + assignNonDetection policy lets a local hidden-variable strategy reproduce |S| > 2. Selects the LHV sampler.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 1,
        detectionEfficiency: 0.6,
        analysisMode: 'assignNonDetection',
        samplerMode: 'lhv',
        lhvStrategyId: 'detectionLoophole_0.500',
      },
    },
    {
      id: 'classicalLhvBaseline',
      name: 'Classical LHV baseline',
      description:
        'Deterministic local hidden-variable sampler under perfect detectors. Caps at the classical bound |S| ≤ 2.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 1,
        detectionEfficiency: 1,
        analysisMode: 'fairSampling',
        samplerMode: 'lhv',
        lhvStrategyId: 'deterministicBell',
      },
    },
    {
      id: 'precessingFields',
      name: 'Precessing fields (dynamic correlations)',
      description:
        'Non-zero per-particle precession fields rotate Bloch vectors between trials; CHSH oscillates around |S| = 2√2.',
      overrides: {
        aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
        aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
        bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
        bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],
        visibility: 1,
        detectionEfficiency: 1,
        analysisMode: 'fairSampling',
        fieldA: [0, 0, 0.5],
        fieldB: [0, 0.5, 0],
        samplerMode: 'qm',
      },
    },
  ])
