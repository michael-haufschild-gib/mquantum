import { logger } from '@/lib/logger'

import {
  type ColumnAiryInfo,
  emptyColumnAiry,
  extractColumnAiry,
  langerEvaluate,
} from '../airyConnection'
import { buildWdwBoundary, type WdwBoundaryField } from '../boundaryConditions'
import {
  applyTransitionAbsorber,
  captureMatch,
  classifyCellBand,
  initColumnWkbStates4D,
  propagateWkbTail,
} from '../columnWkb'
import { wdwEuclideanWkbAction, wdwU } from '../constants'
import {
  allocImplicitBulkScratch3D,
  type ImplicitBulkScratch3D,
  solveADILaplacianNeumann3D,
} from '../implicitBulk'
import { phiLaplacianAt3D } from '../phiLaplacian'
import { buildPhiSpongeDamping, isConstantInPhiSlab } from '../phiSponge'
import { WDW_CFL_BUDGET, WDW_CFL_WARN_BUDGET } from '../solverConstants'
import {
  validateWdwCustomBoundary,
  validateWheelerDeWittSolverInput,
} from '../solverInputValidation'
import {
  BandKind,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput4D,
} from '../solverTypes'

/**
 * Run the leapfrog Wheeler–DeWitt solver on the 4D minisuperspace
 * `(a, φ₁, φ₂, φ₃)`. Same staged pipeline as the 3D solver (boundary
 * slab → leapfrog bulk → WKB tail → Airy/Langer overwrite) with `Nφ³`
 * φ-slabs instead of `Nφ²`.
 *
 * @param input - Solver config; `minisuperspaceDimension` is forced to 4.
 * @returns Dense 4D `χ` grid and auxiliary metadata.
 */
export function solveWheelerDeWitt4D(input: WheelerDeWittSolverInput): WheelerDeWittSolverOutput4D {
  validateWheelerDeWittSolverInput({ ...input, minisuperspaceDimension: 4 })

  const {
    boundaryCondition,
    inflatonMass,
    cosmologicalConstant,
    aMin,
    aMax,
    gridNa,
    gridNphi,
    phiExtent,
  } = input
  const inflatonMassAsymmetry = input.inflatonMassAsymmetry ?? 1

  const Na = gridNa
  const Nphi = gridNphi
  const slabSize = Nphi * Nphi * Nphi
  const complexSlabFloats = 2 * slabSize

  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)
  const bandKind = new Uint8Array(Na * slabSize)

  const da = (aMax - aMin) / (Na - 1)
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)

  if (aMin > 0 && WDW_CFL_WARN_BUDGET.remaining > 0) {
    const cflPhi = (da * da * 12 * invDphi2) / (aMin * aMin)
    if (cflPhi > WDW_CFL_BUDGET) {
      WDW_CFL_WARN_BUDGET.remaining -= 1
      logger.warn(
        `[wdw] 4D CFL margin tight: da²·(1/aMin²)·12/dphi² = ${cflPhi.toFixed(2)} ` +
          `(budget ${WDW_CFL_BUDGET}). Current: aMin=${aMin}, aMax=${aMax}, ` +
          `gridNa=${gridNa}, gridNphi=${gridNphi}, phiExtent=${phiExtent}.`
      )
    }
  }

  let spongeEnabled = !input.customBoundary && !input.disableSponge
  const expectedInitialLen = 2 * slabSize
  let initial: WdwBoundaryField
  if (input.customBoundary) {
    validateWdwCustomBoundary(input.customBoundary, expectedInitialLen)
    initial = input.customBoundary
  } else {
    initial = buildWdwBoundary(boundaryCondition, {
      Nphi,
      phiExtent,
      aMin,
      mass: inflatonMass,
      lambda: cosmologicalConstant,
      asymmetry: inflatonMassAsymmetry,
      minisuperspaceDimension: 4,
    })
  }

  const columnStates = initColumnWkbStates4D(
    Nphi,
    phiExtent,
    inflatonMass,
    cosmologicalConstant,
    inflatonMassAsymmetry
  )

  chi.set(initial.chi, 0)
  if (spongeEnabled && isConstantInPhiSlab(initial.chi, Nphi, 3)) {
    spongeEnabled = false
  }
  const phiSponge: Float32Array | null = spongeEnabled ? buildPhiSpongeDamping(Nphi, 3) : null

  const idx3 = (i1: number, i2: number, i3: number): number => (i1 * Nphi + i2) * Nphi + i3
  const phiAt = (i: number): number => -phiExtent + i * dphi

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = phiAt(i1)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = phiAt(i2)
      for (let i3 = 0; i3 < Nphi; i3++) {
        const phi3 = phiAt(i3)
        const idx = idx3(i1, i2, i3)
        const U0 = wdwU(
          aMin,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry,
          phi3
        )
        mask[idx] = U0 < 0 ? 1 : 0
        bandKind[idx] = classifyCellBand(columnStates[idx]!, aMin, U0)
      }
    }
  }

  const a0 = aMin
  const a1 = aMin + da
  const invA0Sq = 1 / (a0 * a0)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = phiAt(i1)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = phiAt(i2)
      for (let i3 = 0; i3 < Nphi; i3++) {
        const phi3 = phiAt(i3)
        const idx = idx3(i1, i2, i3)
        const U0 = wdwU(
          a0,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry,
          phi3
        )
        const U1 = wdwU(
          a1,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry,
          phi3
        )
        const cre = initial.chi[2 * idx] ?? 0
        const cim = initial.chi[2 * idx + 1] ?? 0
        const lap = phiLaplacianAt3D(initial.chi, 0, i1, i2, i3, Nphi, invDphi2)
        const chiDDotRe = invA0Sq * lap.re + U0 * cre
        const chiDDotIm = invA0Sq * lap.im + U0 * cim
        const dre = initial.chiDeriv[2 * idx] ?? 0
        const dim = initial.chiDeriv[2 * idx + 1] ?? 0

        let nextRe = cre + da * dre + 0.5 * da * da * chiDDotRe
        let nextIm = cim + da * dim + 0.5 * da * da * chiDDotIm
        const state = columnStates[idx]!
        const band = classifyCellBand(state, a1, U1)
        if (band === BandKind.EuclideanTransition) {
          const damped = applyTransitionAbsorber(nextRe, nextIm, U1, da)
          nextRe = damped.re
          nextIm = damped.im
        } else if (band === BandKind.EuclideanDeep) {
          captureMatch(
            state,
            a1,
            phi1,
            phi2,
            inflatonMass,
            cosmologicalConstant,
            inflatonMassAsymmetry,
            U1,
            nextRe,
            nextIm,
            phi3
          )
        }

        chi[complexSlabFloats + 2 * idx] = nextRe
        chi[complexSlabFloats + 2 * idx + 1] = nextIm
        mask[slabSize + idx] = U1 < 0 ? 1 : 0
        bandKind[slabSize + idx] = band
      }
    }
  }

  const adiScratch: ImplicitBulkScratch3D = allocImplicitBulkScratch3D(Nphi)
  const adiRhs = new Float32Array(complexSlabFloats)
  const adiOut = new Float32Array(complexSlabFloats)
  const da2 = da * da
  const halfDa2 = 0.5 * da2

  for (let ia = 2; ia < Na; ia++) {
    const aNext = aMin + ia * da
    const aCur = aMin + (ia - 1) * da
    const aPrev = aMin + (ia - 2) * da
    const invAcurSq = 1 / (aCur * aCur)
    const invAprevSq = 1 / (aPrev * aPrev)
    const prevSlabBase = (ia - 2) * complexSlabFloats
    const curSlabBase = (ia - 1) * complexSlabFloats
    const nextSlabBase = ia * complexSlabFloats
    const maskBase = ia * slabSize
    const kappaNext = (halfDa2 * (1 / (aNext * aNext))) / (dphi * dphi)
    const lapPrevScale = halfDa2 * invAprevSq

    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = phiAt(i1)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = phiAt(i2)
        for (let i3 = 0; i3 < Nphi; i3++) {
          const phi3 = phiAt(i3)
          const idx = idx3(i1, i2, i3)
          const Ucur = wdwU(
            aCur,
            phi1,
            phi2,
            inflatonMass,
            cosmologicalConstant,
            inflatonMassAsymmetry,
            phi3
          )
          const curRe = chi[curSlabBase + 2 * idx] ?? 0
          const curIm = chi[curSlabBase + 2 * idx + 1] ?? 0
          const prevRe = chi[prevSlabBase + 2 * idx] ?? 0
          const prevIm = chi[prevSlabBase + 2 * idx + 1] ?? 0
          const lapPrev = phiLaplacianAt3D(chi, prevSlabBase, i1, i2, i3, Nphi, invDphi2)
          adiRhs[2 * idx] = 2 * curRe - prevRe + lapPrevScale * lapPrev.re + da2 * Ucur * curRe
          adiRhs[2 * idx + 1] = 2 * curIm - prevIm + lapPrevScale * lapPrev.im + da2 * Ucur * curIm
        }
      }
    }

    solveADILaplacianNeumann3D(adiRhs, adiOut, Nphi, kappaNext, adiScratch)

    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = phiAt(i1)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = phiAt(i2)
        for (let i3 = 0; i3 < Nphi; i3++) {
          const phi3 = phiAt(i3)
          const idx = idx3(i1, i2, i3)
          const Ucur = wdwU(
            aCur,
            phi1,
            phi2,
            inflatonMass,
            cosmologicalConstant,
            inflatonMassAsymmetry,
            phi3
          )
          const Unext = wdwU(
            aNext,
            phi1,
            phi2,
            inflatonMass,
            cosmologicalConstant,
            inflatonMassAsymmetry,
            phi3
          )
          const state = columnStates[idx]!
          const band = classifyCellBand(state, aNext, Unext)

          let nextRe: number
          let nextIm: number
          if (band === BandKind.Lorentzian) {
            nextRe = adiOut[2 * idx] ?? 0
            nextIm = adiOut[2 * idx + 1] ?? 0
          } else if (band === BandKind.EuclideanTransition) {
            const curRe = chi[curSlabBase + 2 * idx] ?? 0
            const curIm = chi[curSlabBase + 2 * idx + 1] ?? 0
            const prevRe = chi[prevSlabBase + 2 * idx] ?? 0
            const prevIm = chi[prevSlabBase + 2 * idx + 1] ?? 0
            const lapCur = phiLaplacianAt3D(chi, curSlabBase, i1, i2, i3, Nphi, invDphi2)
            const explicitRe = 2 * curRe - prevRe + da2 * (invAcurSq * lapCur.re + Ucur * curRe)
            const explicitIm = 2 * curIm - prevIm + da2 * (invAcurSq * lapCur.im + Ucur * curIm)
            const damped = applyTransitionAbsorber(explicitRe, explicitIm, Unext, da)
            nextRe = damped.re
            nextIm = damped.im
          } else if (!state.matched) {
            nextRe = adiOut[2 * idx] ?? 0
            nextIm = adiOut[2 * idx + 1] ?? 0
            captureMatch(
              state,
              aNext,
              phi1,
              phi2,
              inflatonMass,
              cosmologicalConstant,
              inflatonMassAsymmetry,
              Unext,
              nextRe,
              nextIm,
              phi3
            )
          } else {
            const S = wdwEuclideanWkbAction(
              aNext,
              phi1,
              phi2,
              inflatonMass,
              cosmologicalConstant,
              inflatonMassAsymmetry,
              phi3
            )
            const propagated = propagateWkbTail(state, S, Unext)
            nextRe = propagated.re
            nextIm = propagated.im
          }

          const spongeFactor = phiSponge ? phiSponge[idx]! : 1
          chi[nextSlabBase + 2 * idx] = nextRe * spongeFactor
          chi[nextSlabBase + 2 * idx + 1] = nextIm * spongeFactor
          mask[maskBase + idx] = Unext < 0 ? 1 : 0
          bandKind[maskBase + idx] = band
        }
      }
    }
  }

  const columnAiry: ColumnAiryInfo[] = new Array(slabSize)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = phiAt(i1)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = phiAt(i2)
      for (let i3 = 0; i3 < Nphi; i3++) {
        const phi3 = phiAt(i3)
        const slabIndex = idx3(i1, i2, i3)
        const info = extractColumnAiry(
          {
            chi,
            Na,
            slabSize,
            slabIndex,
            da,
            aMin,
            phi1,
            phi2,
            phi3,
            mass: inflatonMass,
            lambda: cosmologicalConstant,
            asymmetry: inflatonMassAsymmetry,
          },
          boundaryCondition
        )
        columnAiry[slabIndex] = info
        if (!info.hasOverwrite) continue
        for (let ia = 0; ia < Na; ia++) {
          const a = aMin + ia * da
          if (a <= info.aTurn!) continue
          const { re, im } = langerEvaluate(
            info,
            a,
            phi1,
            phi2,
            inflatonMass,
            cosmologicalConstant,
            inflatonMassAsymmetry,
            phi3
          )
          const cellOff = 2 * (ia * slabSize + slabIndex)
          chi[cellOff] = re
          chi[cellOff + 1] = im
        }
      }
    }
  }
  for (let i = 0; i < columnAiry.length; i++) {
    if (columnAiry[i] === undefined) columnAiry[i] = emptyColumnAiry(null)
  }

  let maxDensity = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    const d = re * re + im * im
    if (d > maxDensity) maxDensity = d
  }

  return {
    chi,
    lorentzianMask: mask,
    bandKind,
    gridSize: [Na, Nphi, Nphi, Nphi],
    aMin,
    aMax,
    phiExtent,
    maxDensity,
    columnAiry,
  }
}
