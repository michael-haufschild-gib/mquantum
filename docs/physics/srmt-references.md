# SRMT — literature anchor

SRMT (Superspace-Relational Modular Time) as used in this project is a
**project-local composite conjecture** combining four strands of the
quantum-gravity / problem-of-time literature. No single paper
originates it; the name is specific to this codebase. A thesis defence
that says "SRMT holds" must cite all four strands, because the
conjecture inherits from all four.

This document lists the load-bearing references. Every subsequent claim
about SRMT in the thesis / this repo should cross-reference at least one
entry here.

## 1. Modular Hamiltonians and Tomita–Takesaki

- **Bisognano, J. J.; Wichmann, E. H.** *On the duality condition for a
  Hermitian scalar field.* J. Math. Phys. 16 (1975), 985–1007; and the
  follow-up (1976), 17, 303. — The modular Hamiltonian of a half-space
  vacuum is the boost generator. First known closed form of a modular
  Hamiltonian in QFT.

- **Haag, R.** *Local Quantum Physics: Fields, Particles, Algebras.*
  Springer (1992). — Standard reference for modular theory applied to
  local algebras. SRMT uses this machinery on the factorisation
  `H = H_L ⊗ H_R` induced by the minisuperspace cut.

- **Witten, E.** *APS Medal Essay: Entanglement properties of quantum
  field theory.* Rev. Mod. Phys. 90 (2018), 045003. — Modern pedagogical
  treatment of modular theory in QFT, including the sense in which
  modular Hamiltonians reproduce physical Hamiltonians.

## 2. Thermal time hypothesis (Connes–Rovelli)

- **Connes, A.; Rovelli, C.** *Von Neumann algebra automorphisms and
  time-thermodynamics relation in generally covariant quantum theories.*
  Class. Quant. Grav. 11 (1994), 2899. — The thermal-time hypothesis:
  in a generally covariant theory, the modular flow of the state
  *generates* physical time. SRMT specialises this to the Wheeler–DeWitt
  state on minisuperspace.

- **Rovelli, C.** *Statistical mechanics of gravity and the thermodynamic
  origin of time.* Class. Quant. Grav. 10 (1993), 1549. — Earlier
  statement of the idea in a more physical frame.

## 3. Problem of time and relational / emergent clocks

- **Isham, C. J.** *Canonical quantum gravity and the problem of time.*
  arXiv:gr-qc/9210011 (1992). — Standard survey of the problem of time
  in canonical quantum gravity. Any SRMT claim is in this article's
  problem space; SRMT is one candidate "internal clock".

- **Kuchař, K. V.** *Time and interpretations of quantum gravity.* Int.
  J. Mod. Phys. D 20 (2011), 3–86 (reprint of 1992 Winnipeg lectures).
  — Companion survey. The classification of time-candidates (internal,
  matter, phenomenological) that SRMT fits into.

- **Page, D. N.; Wootters, W. K.** *Evolution without evolution:
  Dynamics described by stationary observables.* Phys. Rev. D 27 (1983),
  2885. — The Page–Wootters mechanism: time as correlation within a
  stationary state. The prototype for every "relational modular clock"
  construction including SRMT.

- **Giovannetti, V.; Lloyd, S.; Maccone, L.** *Quantum time.* Phys. Rev.
  D 92 (2015), 045033. — Modern reformulation of Page–Wootters;
  the operator-algebraic language SRMT borrows.

## 4. Entanglement-first reconstructions of spacetime

- **Van Raamsdonk, M.** *Building up spacetime with quantum
  entanglement.* Gen. Rel. Grav. 42 (2010), 2323–2329. — The thesis
  that emergent spacetime is built from entanglement. SRMT's
  identification of the scale-factor clock with the modular
  decomposition of a spatial cut is a minisuperspace analogue of this
  programme.

- **Maldacena, J.; Susskind, L.** *Cool horizons for entangled black
  holes.* Fortschr. Phys. 61 (2013), 781–811. — ER=EPR. SRMT's
  "preferred clock = DeWitt-timelike axis" motivation is that the
  modular cross-cut that glues two bulk regions is precisely the
  analogue of the bipartition SRMT operates on.

- **Jacobson, T.** *Entanglement Equilibrium and the Einstein Equation.*
  Phys. Rev. Lett. 116 (2016), 201101. — Derives Einstein's equations
  from modular-Hamiltonian variations. Evidence that modular quantities
  carry gravitational information, which is the physical case for SRMT
  even attempting what it claims.

## 5. Wheeler–DeWitt foundational

- **DeWitt, B. S.** *Quantum theory of gravity. I. The canonical theory.*
  Phys. Rev. 160 (1967), 1113. — The original WdW equation. The "DeWitt"
  in SRMT's name refers to the DeWitt supermetric signature
  (`−, +, +, ...`) that distinguishes the scale-factor axis `a` as
  timelike from the matter axes `φᵢ` as spacelike — the feature SRMT's
  "clock-axis selector" exploits.

- **Hartle, J. B.; Hawking, S. W.** *Wave function of the universe.*
  Phys. Rev. D 28 (1983), 2960. — The no-boundary proposal. The
  corresponding boundary condition option in this project's WdW solver.

- **Vilenkin, A.** *Boundary conditions in quantum cosmology.* Phys.
  Rev. D 33 (1986), 3560. — Tunneling proposal. The second boundary
  condition in the solver.

## What SRMT is NOT

SRMT as used here is **not**:

- A theorem. The conjecture has not been proved in this or any setting.
- A published conjecture. The name is internal to this repository.
- A direct continuation of a specific person's work. It is a *composite*
  of the strands above, designed to be numerically testable on a 3D
  minisuperspace lattice.

A thesis defence that represents SRMT as "the standard approach" or "a
well-known conjecture" would be defensible only if the committee reads
the name for what it is: a project-local synthesis whose numerical
behaviour is the object of study, not a finalised physical hypothesis.

## Where in the code

- Affine-fit metric derivation: `docs/physics/srmt-metric.md`.
- Wheeler–DeWitt mode overview: `docs/physics/wheeler-dewitt.md`.
- SRMT implementation: `src/lib/physics/srmt/*`.
- Sensitivity sweeps: `src/lib/physics/srmt/sweepDriver.ts`
  and the `SrmtSweepSection` UI panel.
