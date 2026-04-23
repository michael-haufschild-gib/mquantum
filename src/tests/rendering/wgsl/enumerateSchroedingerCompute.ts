/**
 * Phase 1b: Schrödinger compute-mode shader enumerator.
 *
 * Enumerates every pure compose function extracted by Phase 2b across the
 * compute-pass setup files. All composers here are 0-arg (they either use
 * static WGSL or concatenate static blocks) so each contributes exactly one
 * `ShaderRecord`. Adding a compile-time specialization axis to any of these
 * passes means (a) extending the compose function's signature and (b) adding
 * a loop here.
 *
 * @module tests/rendering/wgsl/enumerateSchroedingerCompute
 */

import { createHash } from 'node:crypto'

import {
  composeDiracAbsorberShader,
  composeDiracDiagFinalizeShader,
  composeDiracDiagReduceShader,
  composeDiracFftSharedMemShader,
  composeDiracFftStageShader,
  composeDiracInitShader,
  composeDiracKineticShader,
  composeDiracPackShader,
  composeDiracPotentialHalfShader,
  composeDiracPotentialShader,
  composeDiracRenormalizeShader,
  composeDiracUnpackShader,
  composeDiracWriteGridShader,
} from '@/rendering/webgpu/passes/DiracComputePassSetup'
import {
  composeFsfAbsorberShader,
  composeFsfInitShader,
  composeFsfUpdatePhiShader,
  composeFsfUpdatePiShader,
  composeFsfWriteGridShader,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassSetup'
import {
  composePauliAbsorberShader,
  composePauliDiagFinalizeShader,
  composePauliDiagReduceShader,
  composePauliFftStageShader,
  composePauliInitShader,
  composePauliKineticShader,
  composePauliPackShader,
  composePauliPotentialHalfShader,
  composePauliRenormalizeShader,
  composePauliUnpackShader,
  composePauliWriteGridShader,
} from '@/rendering/webgpu/passes/PauliComputePassSetup'
import {
  composeQwAbsorberShader,
  composeQwCoinShader,
  composeQwShiftShader,
  composeQwWriteGridShader,
} from '@/rendering/webgpu/passes/QuantumWalkPipelines'
import { composeBecHawkingInjectShader } from '@/rendering/webgpu/passes/TDSEComputePassHawking'
import {
  composeTdseAbsorberShader,
  composeTdseDiagFinalizeShader,
  composeTdseDiagReduceShader,
  composeTdseFftSharedMemShader,
  composeTdseFftStageShader,
  composeTdseFusedPotentialPackShader,
  composeTdseFusedUnpackPotentialShader,
  composeTdseInitShader,
  composeTdseKineticShader,
  composeTdsePackShader,
  composeTdsePotentialHalfShader,
  composeTdsePotentialShader,
  composeTdseRenormalizeShader,
  composeTdseUnpackShader,
  composeTdseWriteGridShader,
} from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { composeTdseWormholeCoupleShader } from '@/rendering/webgpu/passes/TDSEComputePassWormhole'
import {
  composeTdseCurvedAccumulateShader,
  composeTdseCurvedBuildKShader,
  composeTdseCurvedKineticShader,
  composeTdseCurvedStageShader,
} from '@/rendering/webgpu/passes/TDSECurvedIntegrator'
import {
  composeEnergySpectrumShader,
  composeGsFinalizeShader,
  composeGsReduceShader,
  composeGsSubtractShader,
  composeObsMomFinalShader,
  composeObsMomReduceShader,
  composeObsPosFinalShader,
  composeObsPosReduceShader,
} from '@/rendering/webgpu/passes/TDSEObservablesGSPipelines'
import {
  composeTdseStochasticExpectFinalizeShader,
  composeTdseStochasticExpectReduceShader,
  composeTdseStochasticLocShader,
} from '@/rendering/webgpu/passes/TDSEStochasticLocalization'
import {
  composeVortexDetectFinalizeShader,
  composeVortexDetectReduceShader,
} from '@/rendering/webgpu/passes/TDSEVortexDetect'

import type { ShaderRecord } from './enumerateSchroedingerAnalytic'

type Entry = { label: string; fn: () => string }

const COMPUTE_SHADERS: readonly Entry[] = [
  // TDSE core
  { label: 'tdse-init', fn: composeTdseInitShader },
  { label: 'tdse-potential', fn: composeTdsePotentialShader },
  { label: 'tdse-potential-half', fn: composeTdsePotentialHalfShader },
  { label: 'tdse-fused-potential-pack', fn: composeTdseFusedPotentialPackShader },
  { label: 'tdse-fused-unpack-potential', fn: composeTdseFusedUnpackPotentialShader },
  { label: 'tdse-absorber', fn: composeTdseAbsorberShader },
  { label: 'tdse-renormalize', fn: composeTdseRenormalizeShader },
  { label: 'tdse-pack', fn: composeTdsePackShader },
  { label: 'tdse-unpack', fn: composeTdseUnpackShader },
  { label: 'tdse-fft-stage', fn: composeTdseFftStageShader },
  { label: 'tdse-fft-shared-mem', fn: composeTdseFftSharedMemShader },
  { label: 'tdse-kinetic', fn: composeTdseKineticShader },
  { label: 'tdse-write-grid', fn: composeTdseWriteGridShader },
  { label: 'tdse-diag-reduce', fn: composeTdseDiagReduceShader },
  { label: 'tdse-diag-finalize', fn: composeTdseDiagFinalizeShader },
  // TDSE curved-integrator RK4
  { label: 'tdse-curved-kinetic', fn: composeTdseCurvedKineticShader },
  { label: 'tdse-curved-buildk', fn: composeTdseCurvedBuildKShader },
  { label: 'tdse-curved-stage', fn: composeTdseCurvedStageShader },
  { label: 'tdse-curved-accumulate', fn: composeTdseCurvedAccumulateShader },
  // TDSE observables + Gram-Schmidt
  { label: 'obs-pos-reduce', fn: composeObsPosReduceShader },
  { label: 'obs-pos-final', fn: composeObsPosFinalShader },
  { label: 'obs-mom-reduce', fn: composeObsMomReduceShader },
  { label: 'obs-mom-final', fn: composeObsMomFinalShader },
  { label: 'gs-reduce', fn: composeGsReduceShader },
  { label: 'gs-finalize', fn: composeGsFinalizeShader },
  { label: 'gs-subtract', fn: composeGsSubtractShader },
  { label: 'energy-spectrum', fn: composeEnergySpectrumShader },
  // TDSE vortex + stochastic + hawking + wormhole
  { label: 'tdse-vortex-reduce', fn: composeVortexDetectReduceShader },
  { label: 'tdse-vortex-finalize', fn: composeVortexDetectFinalizeShader },
  { label: 'tdse-stochastic-loc', fn: composeTdseStochasticLocShader },
  { label: 'tdse-stochastic-expect-reduce', fn: composeTdseStochasticExpectReduceShader },
  { label: 'tdse-stochastic-expect-finalize', fn: composeTdseStochasticExpectFinalizeShader },
  { label: 'bec-hawking-inject', fn: composeBecHawkingInjectShader },
  { label: 'tdse-wormhole-couple', fn: composeTdseWormholeCoupleShader },
  // Dirac
  { label: 'dirac-init', fn: composeDiracInitShader },
  { label: 'dirac-potential', fn: composeDiracPotentialShader },
  { label: 'dirac-potential-half', fn: composeDiracPotentialHalfShader },
  { label: 'dirac-absorber', fn: composeDiracAbsorberShader },
  { label: 'dirac-renormalize', fn: composeDiracRenormalizeShader },
  { label: 'dirac-pack', fn: composeDiracPackShader },
  { label: 'dirac-unpack', fn: composeDiracUnpackShader },
  { label: 'dirac-fft-stage', fn: composeDiracFftStageShader },
  { label: 'dirac-fft-shared-mem', fn: composeDiracFftSharedMemShader },
  { label: 'dirac-kinetic', fn: composeDiracKineticShader },
  { label: 'dirac-write-grid', fn: composeDiracWriteGridShader },
  { label: 'dirac-diag-reduce', fn: composeDiracDiagReduceShader },
  { label: 'dirac-diag-finalize', fn: composeDiracDiagFinalizeShader },
  // Pauli
  { label: 'pauli-init', fn: composePauliInitShader },
  { label: 'pauli-potential-half', fn: composePauliPotentialHalfShader },
  { label: 'pauli-absorber', fn: composePauliAbsorberShader },
  { label: 'pauli-kinetic', fn: composePauliKineticShader },
  { label: 'pauli-renormalize', fn: composePauliRenormalizeShader },
  { label: 'pauli-write-grid', fn: composePauliWriteGridShader },
  { label: 'pauli-pack', fn: composePauliPackShader },
  { label: 'pauli-unpack', fn: composePauliUnpackShader },
  { label: 'pauli-fft-stage', fn: composePauliFftStageShader },
  { label: 'pauli-diag-reduce', fn: composePauliDiagReduceShader },
  { label: 'pauli-diag-finalize', fn: composePauliDiagFinalizeShader },
  // FSF (Klein-Gordon leapfrog)
  { label: 'free-scalar-init', fn: composeFsfInitShader },
  { label: 'free-scalar-absorber', fn: composeFsfAbsorberShader },
  { label: 'free-scalar-update-pi', fn: composeFsfUpdatePiShader },
  { label: 'free-scalar-update-phi', fn: composeFsfUpdatePhiShader },
  { label: 'free-scalar-write-grid', fn: composeFsfWriteGridShader },
  // Quantum walk
  { label: 'qw-coin', fn: composeQwCoinShader },
  { label: 'qw-shift', fn: composeQwShiftShader },
  { label: 'qw-write-grid', fn: composeQwWriteGridShader },
  { label: 'qw-absorber', fn: composeQwAbsorberShader },
]

/**
 * Yield a `ShaderRecord` for each compute-pass compose function. All entries
 * are 0-arg so specialization axes (if added later via config params) extend
 * the entry list here.
 */
export function* enumerateSchroedingerCompute(): Generator<ShaderRecord> {
  for (const { label, fn } of COMPUTE_SHADERS) {
    const wgsl = fn()
    yield {
      label: `compute_${label}`,
      wgsl,
      sha256: createHash('sha256').update(wgsl).digest('hex'),
      cacheKey: `compute:${label}`,
      surface: 'schroedinger-compute',
    }
  }
}
