# Counterexample to Broad Log-Concave Monotone Healing

**Status:** exact finite counterexample, GPT contribution.

**Purpose:** Fable's monotone-healing lemma is a promising target for the
structured curvature profiles `c_j = alpha/(j+b)`. This note shows it cannot
hold for arbitrary positive log-concave coefficient sequences. The proof target
must be restricted to the special profile class.

## Statement

There exists a positive log-concave sequence `B_0,...,B_4` such that the quartic

```text
P_m(x) = sum_{k=0}^4 binom(4,k) B_k^m x^k
```

has all roots real and negative at `m=7`, loses real-rootedness at
`m=8,9,10`, and regains all roots real and negative at `m=11`.

Thus coefficientwise power scaling is not monotone on the class of positive
log-concave sequences, even in degree four.

## Exact Data

Take

```text
B = [998, 1125, 1245, 1322, 995].
```

This sequence is positive and log-concave because

```text
B_1^2 - B_0 B_2 = 23115  > 0
B_2^2 - B_1 B_3 = 62775  > 0
B_3^2 - B_2 B_4 = 508909 > 0
```

For each integer `m`, `P_m` has integer coefficients, so root counts can be
certified exactly by Sturm/root-count algorithms over `QQ`.

## Exact Verification

Using SymPy exact integer polynomials:

```text
m=7:  real roots = 4, negative roots = 4, discriminant > 0
m=8:  real roots = 2, negative roots = 2, discriminant < 0
m=9:  real roots = 2, negative roots = 2, discriminant < 0
m=10: real roots = 2, negative roots = 2, discriminant < 0
m=11: real roots = 4, negative roots = 4, discriminant > 0
```

The discriminants at the decisive powers are:

```text
disc(P_7) =
  175255288463771838444022287355590040979983831969594599849390414914209352856302514185270880254143156719834324682551703362852819712

disc(P_8) =
 -8436530704608749573171128605231185313976122687176566154229352072043065002502947842601134716073916420742445010153699061948082118360791282806917370112

disc(P_11) =
  875278965474761065944654964149203144113452025940148877274354534453395390122858116602286924507913195385196078842250409326808818652809263756341630496895721393742809237888733009024806471390770939565557101312
```

Because the root counts were computed exactly for integer polynomials, this is
not a floating-point artifact.

## Reproduction Command

```python
import sympy as sp

x = sp.symbols("x")
B = [998, 1125, 1245, 1322, 995]

print([B[i] ** 2 - B[i - 1] * B[i + 1] for i in range(1, 4)])

for m in [7, 8, 9, 10, 11]:
    p = sum(sp.binomial(4, k) * (B[k] ** m) * x ** k for k in range(5))
    P = sp.Poly(p, x, domain=sp.ZZ)
    print(
        m,
        P.count_roots(sp.S.NegativeInfinity, sp.S.Infinity),
        P.count_roots(sp.S.NegativeInfinity, 0),
        sp.sign(P.discriminant()),
    )
```

## Consequence for the RH Quest

The unrestricted monotone-healing lemma is false:

```text
log-concave + hyperbolic at lambda_0  => hyperbolic for all lambda >= lambda_0
```

does not hold for arbitrary log-concave coefficient sequences.

This does **not** contradict Fable's observations for
`c_j = alpha/(j+b)`. It sharpens the target:

```text
Prove monotone healing for the structured alpha/(j+b) and xi-like curvature
profiles, or identify the additional total-positivity condition that excludes
the quartic counterexample.
```

In the Sturm-ladder language of `docs/rh/gpt_sturm_ladder_comparison.md`, the
needed theorem should be about monotone recovery of adjacent-shift
right-interlacing for these structured profiles, not about generic
log-concavity.

## Verification Notes

- Missing inputs: none.
- Claims needing source verification: only the broader literature context; the
  counterexample itself is exact finite algebra.
- Reproducibility gaps: none for the stated root counts.
