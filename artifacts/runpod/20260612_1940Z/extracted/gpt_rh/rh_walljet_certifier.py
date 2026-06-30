#!/usr/bin/env python3
"""Exact wall-jet certificates for the finite hard-head Laguerre lift.

This script implements GPT-F55's Krawtchouk wall-jet formula.

For C_d(w)=sum_k (-1)^k ((d)_k/d^k) w^(2k)/(2k)! and
P_d(X)=C_d(sqrt(X)), critical wall squares r are roots of H_d=P_d'.
For z=r-q+2i sqrt(rq), s=v^2, certify positivity of

  Q_d(s,q;r) = (|P_d(z)|^2 - |P_d(sz)|^2)/(1-s)

by expanding Q=sum_m q^m B_m(s;r), reducing in r modulo H_d, substituting
each critical square as an exact CRootOf, and running Sturm root counts in s.
The q^0 coefficient has an expected extra (1-s) factor from P_d'(r)=0.
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass

import sympy as sp


s, q, r = sp.symbols("s q r")


@dataclass(frozen=True)
class WallResult:
    index: int
    root: sp.CRootOf
    ok: bool
    message: str = ""


def c_coeffs(d: int) -> list[sp.Rational]:
    coeffs: list[sp.Rational] = []
    for k in range(d + 1):
        poch = sp.prod(d - i for i in range(k)) if k else 1
        coeffs.append((-1) ** k * sp.Rational(poch, d**k * sp.factorial(2 * k)))
    return coeffs


def primitive_r(poly: sp.Expr) -> sp.Poly:
    p = sp.Poly(poly, r)
    den = sp.ilcm(*[c.q for c in p.all_coeffs()])
    return sp.Poly(p.as_expr() * den, r).primitive()[1]


def h_poly(d: int) -> sp.Poly:
    coeffs = c_coeffs(d)
    deriv = sum(k * coeffs[k] * r ** (k - 1) for k in range(1, d + 1))
    return primitive_r(deriv)


def krawtchouk_even(k: int, l: int, m: int) -> sp.Integer:
    if m > k + l:
        return sp.Integer(0)
    total = sp.Integer(0)
    lo = max(0, 2 * m - 2 * l)
    hi = min(2 * k, 2 * m)
    for a in range(lo, hi + 1):
        total += (-1) ** a * sp.binomial(2 * k, a) * sp.binomial(2 * l, 2 * m - a)
    return sp.Integer((-1) ** m) * total


def s_bracket(n: int) -> sp.Expr:
    if n <= 0:
        return sp.Integer(0)
    return sum(s**h for h in range(n))


def q_formula(d: int) -> sp.Expr:
    coeffs = c_coeffs(d)
    out = sp.Integer(0)
    for k, ak in enumerate(coeffs):
        if ak == 0:
            continue
        for l, al in enumerate(coeffs):
            n = k + l
            if n == 0 or al == 0:
                continue
            bracket = s_bracket(n)
            for m in range(n + 1):
                kernel = krawtchouk_even(k, l, m)
                if kernel:
                    out += ak * al * r ** (n - m) * kernel * bracket * q**m
    return sp.expand(out)


def certify_wall(
    q_reduced: sp.Expr,
    root: sp.CRootOf,
    wall_index: int,
    deg_q: int,
    *,
    transverse_only: bool = False,
    progress: bool = False,
) -> WallResult:
    start_m = 1 if transverse_only else 0
    for m in range(start_m, deg_q + 1):
        if progress:
            print(f"wall {wall_index} q^{m} start", flush=True)
        coeff = sp.Poly(q_reduced, q).coeff_monomial(q**m)
        if m == 0:
            coeff = sp.cancel(coeff / (1 - s))
        expr = coeff.subs(r, root)
        poly = sp.Poly(expr, s, extension=True)
        count = poly.count_roots(0, 1)
        v0 = sp.N(expr.subs(s, 0), 30)
        v1 = sp.N(expr.subs(s, 1), 30)
        if count != 0 or v0 <= 0 or v1 <= 0:
            return WallResult(
                wall_index,
                root,
                False,
                f"q^{m}: roots_in_(0,1)={count} endpoint0={v0} endpoint1={v1} degree={poly.degree()}",
            )
        if progress:
            print(
                f"wall {wall_index} q^{m} OK degree={poly.degree()} "
                f"endpoint0={v0} endpoint1={v1}",
                flush=True,
            )
    return WallResult(wall_index, root, True)


def certify_degree(
    d: int,
    *,
    wall: int | None = None,
    transverse_only: bool = False,
    progress: bool = False,
) -> bool:
    started = time.time()
    h = h_poly(d)
    roots = [sp.CRootOf(h.as_expr(), i) for i in range(d - 1)]
    if wall is not None and not 1 <= wall <= len(roots):
        raise ValueError(f"wall must be in [1,{len(roots)}] for d={d}")
    print(f"d={d} H_degree={h.degree()} H={h.as_expr()}", flush=True)
    print("critical_squares=" + ", ".join(str(root.evalf(16)) for root in roots), flush=True)

    q_reduced = sp.rem(sp.Poly(q_formula(d), r), h).as_expr()
    deg_q = sp.degree(q_reduced, q)
    deg_s = sp.degree(q_reduced, s)
    deg_r = sp.degree(q_reduced, r)
    print(f"Q_degrees q={deg_q} s={deg_s} r={deg_r}", flush=True)

    ok = True
    indexed_roots = list(enumerate(roots, start=1))
    if wall is not None:
        indexed_roots = [indexed_roots[wall - 1]]
    for i, root in indexed_roots:
        print(f"wall {i}/{len(roots)} r={root.evalf(18)}", flush=True)
        result = certify_wall(
            q_reduced,
            root,
            i,
            deg_q,
            transverse_only=transverse_only,
            progress=progress,
        )
        if result.ok:
            print(f"wall {i} OK elapsed={int(time.time() - started)}s", flush=True)
        else:
            ok = False
            print(f"wall {i} BAD {result.message}", flush=True)
            break
    mode = "TRANSVERSE_PASS" if transverse_only else "PASS"
    print(f"RESULT d={d} {mode if ok else 'FAIL'} elapsed={int(time.time() - started)}s", flush=True)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("degrees", nargs="+", type=int, help="degrees to certify")
    parser.add_argument("--wall", type=int, help="1-based critical wall to certify")
    parser.add_argument(
        "--transverse-only",
        action="store_true",
        help="certify only q^m coefficients with m>=1",
    )
    parser.add_argument("--progress", action="store_true", help="print each q-coefficient check")
    args = parser.parse_args()

    all_ok = True
    for degree in args.degrees:
        if degree < 2:
            print(f"skip d={degree}: degree must be >=2", flush=True)
            all_ok = False
            continue
        all_ok = certify_degree(
            degree,
            wall=args.wall,
            transverse_only=args.transverse_only,
            progress=args.progress,
        ) and all_ok
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
