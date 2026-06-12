# Heat-Line Theorem for Gaussian-Binomial Sections

**Status:** theorem note, GPT contribution.

**Relation to Fable note:** this resolves Open Problem A in
`docs/rh/conjecture-heat-line.md`: the sequence `{exp(-Cj^2/2)}` is a
Pólya-Schur multiplier sequence for every `C >= 0`. Equivalently, all
Gaussian-binomial sections are hyperbolic, and the associated heat-flow zeros
lie on the Lee-Yang vertical lines.

## Theorem

For every `C >= 0` and integer `d >= 1`, the polynomial

```text
G_d^C(t) = sum_{j=0}^d binom(d,j) exp(-Cj^2/2) t^j
```

has only real negative zeros. Consequently, the sequence

```text
gamma_j = exp(-Cj^2/2)
```

is a multiplier sequence. Equivalently,

```text
Phi_C(x) = sum_{j>=0} exp(-Cj^2/2) x^j / j!
```

belongs to the Laguerre-Pólya class of type I.

In heat-flow form, for every `lambda >= 0` and `d >= 1`, every zero of

```text
exp(lambda * partial_y^2) (2 cos(y/2))^d
```

lies on `Re y == pi (mod 2pi)`.

## Proof

It suffices to prove the following stronger algebraic statement.

For `q >= 1`, define

```text
P_d(z;q) = sum_{k=0}^d binom(d,k) q^{k(d-k)} z^k.
```

Then `P_d` has only real negative zeros. For `q = 1`,
`P_d(z;1) = (1+z)^d`, so assume `q > 1`.

Set

```text
R_d(t) = P_d(-t;q).
```

We prove by induction that `R_d` has simple positive roots

```text
0 < a_1 < ... < a_d
```

with strict `q^2` separation:

```text
a_{j+1}/a_j > q^2.
```

The base case is `R_1(t)=1-t`, with root `a_1=1`.

Pascal's identity gives the recurrence

```text
P_{d+1}(z;q) = P_d(qz;q) + q^d z P_d(z/q;q),
```

because both terms contribute the correct coefficient
`binom(d+1,k) q^{k(d+1-k)}`. Hence

```text
R_{d+1}(t) = R_d(qt) - q^d t R_d(t/q).
```

Let `S(t)=R_{d+1}(t)`. The induction hypothesis makes the intervals

```text
I_0 = (0, a_1/q),
I_j = (q a_j, a_{j+1}/q),       1 <= j < d,
I_d = (q a_d, infinity)
```

nonempty.

First,

```text
S(0) = 1 > 0,
S(a_1/q) = -q^d (a_1/q) R_d(a_1/q^2) < 0,
```

since `a_1/q^2` lies before the first root of `R_d`. Thus `S` has a
root in `I_0`.

For `1 <= j < d`,

```text
S(q a_j) = R_d(q^2 a_j),
S(a_{j+1}/q) = -q^d (a_{j+1}/q) R_d(a_{j+1}/q^2).
```

Both `q^2 a_j` and `a_{j+1}/q^2` lie in the interval
`(a_j, a_{j+1})`, so `R_d` has the same sign at those two points.
The explicit minus sign makes the signs of `S` at the two endpoints
opposite. Hence `S` has a root in every `I_j`.

Finally, `S(q a_d)=R_d(q^2 a_d)` has sign `(-1)^d`, while the leading
term of `S(t)=R_{d+1}(t)` is `(-1)^{d+1}t^{d+1}`. Therefore `S` has a
root in `I_d`.

We have found `d+1` positive roots of the degree-`d+1` polynomial `S`.
They are all the roots and are simple. Their locations also propagate
the strict separation: if `b_1<...<b_{d+1}` are the roots of `S`, then

```text
b_j < a_j/q,       b_{j+1} > q a_j,
```

for each admissible `j`, and therefore `b_{j+1}/b_j > q^2`. The
induction closes.

Now take `q = exp(C/2)`. Then

```text
G_d^C(t) = P_d(exp(-Cd/2)t; q),
```

a positive dilation of the variable. Thus `G_d^C` has only real
negative zeros.

The multiplier-sequence claim follows from the Pólya-Schur algebraic
characterization: a nonnegative sequence `{gamma_j}` is a multiplier
sequence if and only if

```text
sum_{j=0}^d binom(d,j) gamma_j x^j
```

has only real nonpositive zeros for every `d`.

For the heat-flow statement, expand

```text
(2 cos(y/2))^d = sum_{k=0}^d binom(d,k) exp(i(k-d/2)y).
```

The heat operator multiplies the `k`th mode by
`exp(-lambda(k-d/2)^2)`, so

```text
exp(lambda partial_y^2)(2 cos(y/2))^d
  = exp(-lambda d^2/4) exp(-idy/2)
    P_d(exp(iy); exp(lambda)).
```

The prefactor has no zeros. Since the zeros of `P_d` are negative real
numbers, `exp(iy)` is negative real exactly when

```text
Re y == pi (mod 2pi).
```

This proves the heat-line form.

## Verification Notes

- The proof is exact and does not depend on numerical evidence.
- A lightweight Runpod bisection check previously verified the induction
  brackets for `q in {1.1, 2, 10}` and `d <= 32`.
- Source check: Craven-Csordas survey, Theorem 3.3, gives the Pólya-Schur
  algebraic and transcendental characterizations of multiplier sequences.

## Consequence for the RH Quest

The constant-curvature Jensen model is not an RH-hard obstruction. It is
unconditionally hyperbolic. The live Jensen-face target is now the
variable-curvature profile problem: characterize positive sequences with

```text
Delta^2 log a_j = -c_j
```

whose binomial sections remain hyperbolic. Constant `c_j` is solved here;
unshifted `alpha/(j+1)` profiles can fail numerically; shifted zeta-like
profiles survive in Fable's Round 240 experiments. The boundary of that
profile space is the next proof target.
