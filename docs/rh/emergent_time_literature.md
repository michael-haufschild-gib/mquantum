# Emergent Time Literature — SRMT's Ancestry and What It Lends the RH Quest

_Compiled 2026-06-12 (round 279). Findings document; significant items ported
to the quest log. Companion to `failed_attempts_graveyard.md` and
`untaken_paths_review.md`._

## 1. Page–Wootters and the "Trinity" of relational dynamics

The Page–Wootters mechanism extracts dynamics from a globally stationary
state via conditional probabilities on a clock subsystem; Höhn–Smith–Lock
([arXiv:1912.00033](https://arxiv.org/pdf/1912.00033),
[relativistic version arXiv:2007.00580](https://arxiv.org/pdf/2007.00580))
proved the **trinity**: Page–Wootters, relational Dirac observables, and
deparametrization are equivalent formulations, with clock covariance
implemented by POVMs. Caveat track: bad clocks produce clock-dependent
pathologies (temporal nonlocality).

**For the quest.** Three "clocks" act on the head family: the shift ladder
n (F213), the de Bruijn flow t (F219), and the theta damping q (F220). The
trinity suggests demanding a **clock dictionary**: explicit conjugations
between the flows and equivalence (or controlled inequivalence) of their
criticality thresholds. F219 (drift t-rigidity) is one dictionary entry.
NEW EXACT ENTRY derived this round (F226, quest log): the ladder and the
damping commute up to rescale — ∂_s Φ_{n,q}(s) = −q Φ_{n+1,q}(q²e^{−c_{n+1}}s)
— giving a 2D monotone phase diagram on (n, −ln q): LP-region upward-closed
in both coordinates; RH(head) ⟺ the boundary staircase n_c(q) is
identically 0. The damping axis is instrument-accessible artifact-free, so
the staircase can be MEASURED from the safe side. Also the Szegő saga in
this language: hard truncation K is a *bad clock* — the trinity caveat made
computational flesh.

## 2. Thermal time (Connes–Rovelli) and modular theory

Time-flow = modular (Tomita–Takesaki) flow of the state
([analysis](https://www.theorie.physik.uni-goettingen.de/forschung2/qft/theses/dipl/Paetz.pdf),
[The Time in Thermal Time, arXiv:2407.18948](https://arxiv.org/html/2407.18948v1),
[thermal time as unsharp observable](https://pubs.aip.org/aip/jmp/article/65/3/032105/3277936/Thermal-time-as-an-unsharp-observable)).
Crucial structural fact (Connes' cocycle theorem): modular flows of
different states agree **up to inner automorphisms** — the flow is canonical
up to gauge.

**For the quest.** "Unique up to inner" is the operator-algebra original of
our F218-SRMT affine-gauge lemma (constant + linear parts of E_k are gauge;
only the centered residual is physical). The lemma is not an ad hoc trick;
it is the coefficient-space shadow of cocycle equivalence. Citable framing
for the written version.

## 3. Crossed products, type II algebras, and the observer (CLPW)

Chandrasekaran–Longo–Penington–Witten
([arXiv:2206.10780](https://arxiv.org/pdf/2206.10780), JHEP 02 (2023) 082;
[Witten, Gravity and the crossed product](https://par.nsf.gov/biblio/10411139-gravity-crossed-product);
[large-N generalized entropy](https://link.springer.com/article/10.1007/JHEP04%282023%29009)):
the type III static-patch algebra, crossed with the modular flow of an
included **observer** (clock), becomes type II₁ — a trace exists, entropy
becomes definable, the maximum-entropy state is empty de Sitter, and S_gen
is recovered.

**For the quest (direction F225, speculative but precise).** Weil positivity
is a trace-positivity statement. The Bost–Connes system is itself a crossed
product whose partition function is ζ(β). CLPW's lesson — *no trace without
the observer; including the clock makes the algebra traceable* — suggests
the right home for the Weil functional is the crossed product of the
arithmetic (finite-places) algebra by its scaling flow with the
**Archimedean place as the observer**. Striking echo in our coefficient
program: the drift law F205 — the engine of all criticality — derives
entirely from the theta kernel, i.e. from the infinite place; the census
(finite-j data) carries the arithmetic of the finite places. The
adelic split of the proof (census + transport) mirrors the
observer/system split that makes traces exist. Direction note for the
zero-side (K′/Weil) route; no overclaim.

## 4. Semiclassical WDW time (WKB / Born–Oppenheimer; Kiefer school)

Time emerges along WKB branches; the arrow comes from boundary conditions
(Hartle–Hawking keeps both orientations; tunneling picks one)
([semiclassical limit and time](https://arxiv.org/pdf/gr-qc/9907031),
[WDW with time](https://www.mdpi.com/2218-1997/8/11/580),
[York-time semiclassics](https://arxiv.org/pdf/1504.08156),
[critique: Quo Vadis WDW time](https://philsci-archive.pitt.edu/23999/1/Bamonti,Cinti,Sanchioni-WheelerDeWitt.pdf)).

**For the quest.** The WKB-branch emergence of time is the same maneuver as
F218's phase transport: "time" of the head IS the WKB/Prüfer phase, and the
turning-point (Langer/Airy) matching that the WDW literature fights with is
exactly our G1c. The critique literature (clock validity domains) maps onto
our trust-radius discipline: every emergent-time claim needs its domain
certificate — design rule 1 of the graveyard, rediscovered by philosophers
of physics.

## Synthesis — what was actually new

1. **F226 (theorem, exact):** q-deformed ladder identity + the (n, q)
   monotone phase diagram; staircase n_c(q); RH(head) ⟺ trivial staircase;
   measurable from the artifact-free q-side. Ported to quest log.
2. **F225 (direction):** Archimedean-observer/crossed-product framing of
   Weil positivity; adelic split census↔finite places, transport↔infinite
   place. Zero-side route note.
3. **Gauge naturalness:** F218-SRMT affine gauge = Connes cocycle
   uniqueness, citable.
4. **Bad-clock dictionary:** truncation = bad clock; trinity caveats =
   artifact phenomenology. Conceptual, sharpens exposition.

## Sources

- [Trinity of relational quantum dynamics (1912.00033)](https://arxiv.org/pdf/1912.00033); [relativistic equivalence (2007.00580)](https://arxiv.org/pdf/2007.00580); [GFT Page–Wootters (Quantum 2025)](https://quantum-journal.org/papers/q-2025-01-27-1610/)
- [Thermal time analysis (Paetz)](https://www.theorie.physik.uni-goettingen.de/forschung2/qft/theses/dipl/Paetz.pdf); [The Time in Thermal Time (2407.18948)](https://arxiv.org/html/2407.18948v1); [Thermodynamics without Time (2409.19098)](https://arxiv.org/pdf/2409.19098)
- [CLPW: An algebra of observables for de Sitter space (2206.10780)](https://arxiv.org/pdf/2206.10780); [Witten: Gravity and the crossed product](https://par.nsf.gov/biblio/10411139-gravity-crossed-product)
- [Semiclassical limit and time in quantum cosmology (gr-qc/9907031)](https://arxiv.org/pdf/gr-qc/9907031); [York-time semiclassical momentum representation (1504.08156)](https://arxiv.org/pdf/1504.08156); [Quo Vadis WDW time (philsci)](https://philsci-archive.pitt.edu/23999/1/Bamonti,Cinti,Sanchioni-WheelerDeWitt.pdf)
