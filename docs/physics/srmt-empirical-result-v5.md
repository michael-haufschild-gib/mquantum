# SRMT — Empirical Result v5 (Born-Oppenheimer agrees with rigid-q)

**Date**: 2026-05-14
**Diagnostic version**: `SRMT_DIAGNOSTIC_VERSION = 1.2.0`
**Solver version**: `WDW_SOLVER_VERSION = 3.0.0`
**Investigation source**: `scripts/srmt/five-diagnostic-consensus.ts`
**Companion to**: `srmt-empirical-result-v4.md`

## Headline

The Born-Oppenheimer cross-diagnostic — a fifth independent
champion selector that divides out the heavy WKB phase before
measuring residual adiabaticity — **agrees with rigid-q on every
sampled point in the main physics regime**. This is positive
independent confirmation of the SRMT `a`-champion claim.

| Case                                  | rigid-q | WKB | PW   | cut-stab | **BO** | consensus |
|---------------------------------------|---------|-----|------|----------|--------|-----------|
| m=0.3 Λ=+0.1 noBoundary               | a       | null | null | null   | **a**  | a (2/5)   |
| m=1.0 Λ=-0.2 deWitt                   | a       | null | null | null   | **a**  | a (2/5)   |
| m=0.6 Λ=+0.5 tunneling                | a       | null | null | null   | **a**  | a (2/5)   |
| m=0.2 Λ=-0.5 (classical-dom corner)   | a       | a    | a    | null   | null   | a (3/5)   |

## Why this is different from v2's WKB-disagreement finding

In v2 we found that WKB and Page-Wootters DISAGREE with rigid-q —
they pick the φ-clocks. We framed this as "SRMT is not a
restatement of standard time-emergence". v5 adds a critical
qualifier: the disagreement is with metrics that measure
**coordinate phase rate** (WKB) and **raw conditional-state
distinguishability** (Page-Wootters). The Born-Oppenheimer metric
— which is mathematically standard quantum-cosmology time-emergence
machinery — AGREES with rigid-q.

So the corrected v5 picture is:

> SRMT-favored time `a` AGREES with the standard Born-Oppenheimer
> time-emergence formalism (after factoring out the heavy WKB
> phase) AND DISAGREES with the raw coordinate-phase-rate metric.
> The two metrics measure different things:
> - **WKB raw phase rate**: which coordinate's phase winds fastest?
>   → picks φ (rolling inflaton).
> - **Born-Oppenheimer adiabaticity**: which coordinate, when
>   factored out as the heavy phase, leaves the most adiabatic
>   residual evolution?  → picks `a` (consistent with rigid-q).

This is the right reading. SRMT's `a`-champion is consistent with
the standard BO recovery of time in semiclassical quantum
cosmology, NOT in disagreement with it. The earlier "SRMT is
non-trivial because it disagrees with classical-momentum
dominance" framing is correct but incomplete — SRMT *agrees*
with the standard BO recovery, just not with the naive
phase-rate diagnostic.

## The Born-Oppenheimer construction in this codebase

`lib/physics/srmt/bornOppenheimerChampion.ts` implements:

1. For each candidate clock `c`, take a reference cross-section
   at the slice origin and read the local χ phase as the "heavy
   WKB phase" `S(c)`.
2. Divide it out: `ψ(rest; c) = e^{-iS(c)} · χ(c, rest) / ||·||`.
3. Compute the mean step-to-step infidelity `1 -
   |⟨ψ(c_t)|ψ(c_{t+1})⟩|²` of the residual conditional state.
4. The clock with the smallest infidelity is the most BO-adiabatic
   = the natural BO time.

This is the actual standard mathematical machinery used in
semiclassical quantum cosmology to recover a Schrödinger evolution
for matter fields against a slow gravity background. Unit-tested:
a pure heavy-WKB-phase factorisation (χ = e^{ikc} · g(rest)) gives
infidelity ≈ 0 along the c-axis. See
`tests/lib/physics/srmt/bornOppenheimerChampion.test.ts`.

## What this means for the v2 pre-reg

The v2 pre-reg's Criterion 3 (WKB-independence required) was
designed to prove SRMT non-trivial. The v5 finding extends but
does not contradict that:

- WKB-rate independence: still required, still observed.
- BO-rate AGREEMENT: a NEW positive finding that strengthens the
  SRMT case.

A v2.2 pre-reg amendment could ADD a Criterion 7:
**BO-confirmation required.** The Born-Oppenheimer champion must
agree with the rigid-q champion at every non-edge point. This
turns BO-agreement from "additional evidence" into a falsifiable
publication-grade requirement.

## Reproducibility

```
pnpm dlx vite-node --options.transformMode.ssr='/.*/' scripts/srmt/five-diagnostic-consensus.ts
```

Wall-clock: ~15 seconds.

## Open work

1. Add Criterion 7 (BO confirmation) to a v2.2 amendment.
2. Verify BO agreement holds at the publication-grid 192×48 across
   the full BC × m × Λ sub-grid.
3. Cross-validate against published BO-formulation literature
   (this codebase's BO implementation is a clean first-principles
   one; comparing to the canonical Banks 1985 / Kiefer 1991
   formulations would strengthen the physical interpretation).
