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
  composeDiracAbsorberShader3D,
  composeDiracDiagFinalizeShader,
  composeDiracDiagReduceShader,
  composeDiracFftSharedMemShader,
  composeDiracFftStageShader,
  composeDiracInitShader,
  composeDiracInitShader3D,
  composeDiracKineticShader,
  composeDiracKineticShader3D,
  composeDiracPackShader,
  composeDiracPotentialHalfShader,
  composeDiracPotentialShader,
  composeDiracPotentialShader3D,
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
  composePauliAbsorber3DShader,
  composePauliAbsorberShader,
  composePauliDiagFinalizeShader,
  composePauliDiagReduceShader,
  composePauliFftSharedMemShader,
  composePauliInit3DShader,
  composePauliInitShader,
  composePauliKinetic3DShader,
  composePauliKineticShader,
  composePauliPackShader,
  composePauliPotential3DShader,
  composePauliPotentialHalf3DShader,
  composePauliPotentialHalfShader,
  composePauliPotentialShader,
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
  composeTdseAbsorber3DShader,
  composeTdseAbsorberShader,
  composeTdseDiagFinalizeShader,
  composeTdseDiagReduceShader,
  composeTdseFftSharedMemShader,
  composeTdseFftStageShader,
  composeTdseFusedPotentialPackShader,
  composeTdseFusedUnpackPotentialShader,
  composeTdseInit3DShader,
  composeTdseInitShader,
  composeTdseKinetic3DShader,
  composeTdseKineticShader,
  composeTdsePackShader,
  composeTdsePotential3DShader,
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
  composeTdseCurvedKinetic3DShader,
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
  composeTdseStochasticLoc3DShader,
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
  { label: 'tdse-init-3d', fn: composeTdseInit3DShader },
  { label: 'tdse-potential', fn: composeTdsePotentialShader },
  { label: 'tdse-potential-3d', fn: composeTdsePotential3DShader },
  { label: 'tdse-potential-half', fn: composeTdsePotentialHalfShader },
  { label: 'tdse-fused-potential-pack', fn: composeTdseFusedPotentialPackShader },
  { label: 'tdse-fused-unpack-potential', fn: composeTdseFusedUnpackPotentialShader },
  { label: 'tdse-absorber', fn: composeTdseAbsorberShader },
  { label: 'tdse-absorber-3d', fn: composeTdseAbsorber3DShader },
  { label: 'tdse-renormalize', fn: composeTdseRenormalizeShader },
  { label: 'tdse-pack', fn: composeTdsePackShader },
  { label: 'tdse-unpack', fn: composeTdseUnpackShader },
  { label: 'tdse-fft-stage', fn: composeTdseFftStageShader },
  { label: 'tdse-fft-shared-mem', fn: composeTdseFftSharedMemShader },
  { label: 'tdse-kinetic', fn: composeTdseKineticShader },
  { label: 'tdse-kinetic-3d', fn: composeTdseKinetic3DShader },
  { label: 'tdse-write-grid', fn: composeTdseWriteGridShader },
  { label: 'tdse-diag-reduce', fn: composeTdseDiagReduceShader },
  { label: 'tdse-diag-finalize', fn: composeTdseDiagFinalizeShader },
  // TDSE curved-integrator RK4
  { label: 'tdse-curved-kinetic', fn: composeTdseCurvedKineticShader },
  { label: 'tdse-curved-kinetic-3d', fn: composeTdseCurvedKinetic3DShader },
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
  { label: 'tdse-stochastic-loc-3d', fn: composeTdseStochasticLoc3DShader },
  { label: 'tdse-stochastic-expect-reduce', fn: composeTdseStochasticExpectReduceShader },
  { label: 'tdse-stochastic-expect-finalize', fn: composeTdseStochasticExpectFinalizeShader },
  { label: 'bec-hawking-inject', fn: composeBecHawkingInjectShader },
  { label: 'tdse-wormhole-couple', fn: composeTdseWormholeCoupleShader },
  // Dirac
  { label: 'dirac-init', fn: composeDiracInitShader },
  // 3-D dispatch variant (workgroup 4x4x4, gid.xyz coords). Compiled when
  // latticeDim===3 to skip the per-thread linearToND coord decode.
  { label: 'dirac-init-3d', fn: composeDiracInitShader3D },
  { label: 'dirac-potential', fn: composeDiracPotentialShader },
  { label: 'dirac-potential-3d', fn: composeDiracPotentialShader3D },
  { label: 'dirac-potential-half', fn: composeDiracPotentialHalfShader },
  { label: 'dirac-absorber', fn: composeDiracAbsorberShader },
  { label: 'dirac-absorber-3d', fn: composeDiracAbsorberShader3D },
  { label: 'dirac-renormalize', fn: composeDiracRenormalizeShader },
  { label: 'dirac-pack', fn: composeDiracPackShader },
  { label: 'dirac-unpack', fn: composeDiracUnpackShader },
  { label: 'dirac-fft-stage', fn: composeDiracFftStageShader },
  { label: 'dirac-fft-shared-mem', fn: composeDiracFftSharedMemShader },
  { label: 'dirac-diag-reduce', fn: composeDiracDiagReduceShader },
  { label: 'dirac-diag-finalize', fn: composeDiracDiagFinalizeShader },
  // Dirac kinetic + write-grid are specialized on latticeDim for the sparse
  // monomial gamma-matrix specialization. Enumerate both sparse and dense
  // dims so the WGSL validation suite covers every compile-time permutation.
  // The 3-D kinetic variant is enumerated only at d=3 (the only dim where
  // the host pipeline path picks it).
  ...[1, 2, 3, 4, 5, 7, 11].flatMap((dim) => [
    { label: `dirac-kinetic-d${dim}`, fn: () => composeDiracKineticShader(dim) },
    { label: `dirac-write-grid-d${dim}`, fn: () => composeDiracWriteGridShader(dim) },
  ]),
  { label: 'dirac-kinetic-3d-d3', fn: () => composeDiracKineticShader3D(3) },
  // Pauli
  { label: 'pauli-init', fn: composePauliInitShader },
  { label: 'pauli-init-3d', fn: composePauliInit3DShader },
  { label: 'pauli-potential', fn: composePauliPotentialShader },
  { label: 'pauli-potential-3d', fn: composePauliPotential3DShader },
  { label: 'pauli-potential-half', fn: composePauliPotentialHalfShader },
  { label: 'pauli-potential-half-3d', fn: composePauliPotentialHalf3DShader },
  { label: 'pauli-absorber', fn: composePauliAbsorberShader },
  { label: 'pauli-absorber-3d', fn: composePauliAbsorber3DShader },
  { label: 'pauli-kinetic', fn: composePauliKineticShader },
  { label: 'pauli-kinetic-3d', fn: composePauliKinetic3DShader },
  { label: 'pauli-renormalize', fn: composePauliRenormalizeShader },
  { label: 'pauli-write-grid', fn: composePauliWriteGridShader },
  { label: 'pauli-pack', fn: composePauliPackShader },
  { label: 'pauli-unpack', fn: composePauliUnpackShader },
  { label: 'pauli-fft-shared-mem', fn: composePauliFftSharedMemShader },
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
