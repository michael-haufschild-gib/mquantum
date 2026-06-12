#!/usr/bin/env python3
"""Verify the frozen xi-head identity against cached moments and roots."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import mpmath as mp


def load_log_data(path: Path, dps: int) -> tuple[list[mp.mpf], list[mp.mpf]]:
    mp.mp.dps = dps
    raw = json.loads(path.read_text())
    jmax = max(int(k) for k in raw)
    log_moments = [mp.mpf(raw[str(j)]) for j in range(jmax + 1)]
    loggamma = [
        log_moments[j] + mp.loggamma(j + 1) - mp.loggamma(2 * j + 1)
        for j in range(jmax + 1)
    ]
    return log_moments, loggamma


def curvature(loggamma: list[mp.mpf]) -> list[mp.mpf]:
    values = [mp.nan] * len(loggamma)
    for j in range(1, len(loggamma) - 1):
        values[j] = 2 * loggamma[j] - loggamma[j - 1] - loggamma[j + 1]
    return values


def head_s(curv: list[mp.mpf], degree: int) -> list[mp.mpf]:
    s_vals = [mp.mpf("0")] * (degree + 1)
    running_c = mp.mpf("0")
    running_s = mp.mpf("0")
    for k in range(1, degree + 1):
        s_vals[k] = running_s
        running_c += curv[k]
        running_s += running_c
    return s_vals


def parse_real_roots(path: Path) -> list[mp.mpf]:
    payload = json.loads(path.read_text())
    roots: list[mp.mpf] = []
    for row in payload.get("first_roots", []):
        if mp.mpf(row["im"]) == 0:
            roots.append(mp.mpf(row["re"]))
    return roots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("--roots", type=Path)
    parser.add_argument("--degree", type=int, default=90)
    parser.add_argument("--dps", type=int, default=100)
    parser.add_argument("--zero-count", type=int, default=10)
    args = parser.parse_args()

    log_moments, loggamma = load_log_data(args.cache, args.dps)
    if args.degree + 1 >= len(loggamma):
        raise SystemExit(f"degree {args.degree} needs cache through {args.degree + 1}")
    curv = curvature(loggamma)
    s_vals = head_s(curv, args.degree)
    delta0 = loggamma[1] - loggamma[0]
    scale = mp.e ** delta0

    coeff_rows: dict[int, dict[str, str]] = {}
    max_abs_error = mp.mpf("0")
    for k in range(args.degree + 1):
        head_log_abs = -s_vals[k] - mp.loggamma(k + 1)
        xi_scaled_log_abs = (
            log_moments[k]
            - mp.loggamma(2 * k + 1)
            - k * delta0
            - log_moments[0]
        )
        err = head_log_abs - xi_scaled_log_abs
        max_abs_error = max(max_abs_error, abs(err))
        if k <= 12 or k in {20, 40, 60, 80, args.degree}:
            coeff_rows[k] = {
                "head_log_abs_coeff": mp.nstr(head_log_abs, 50),
                "xi_scaled_log_abs_coeff": mp.nstr(xi_scaled_log_abs, 50),
                "log_error": mp.nstr(err, 30),
            }

    zero_rows: dict[int, dict[str, str]] = {}
    if args.roots:
        archived_roots = parse_real_roots(args.roots)
        for n, archived in enumerate(archived_roots[: args.zero_count], start=1):
            gamma_n = mp.im(mp.zetazero(n))
            predicted = scale * gamma_n * gamma_n
            zero_rows[n] = {
                "gamma_n": mp.nstr(gamma_n, 50),
                "predicted_head_zero": mp.nstr(predicted, 50),
                "archived_head_zero": mp.nstr(archived, 50),
                "abs_error": mp.nstr(abs(predicted - archived), 30),
                "rel_error": mp.nstr(abs(predicted - archived) / abs(predicted), 30),
            }

    result = {
        "cache": str(args.cache),
        "roots": str(args.roots) if args.roots else None,
        "dps": args.dps,
        "degree": args.degree,
        "identity": (
            "Phi_xi,0(s) = Xi(sqrt(exp(-DeltaLG0) s))/Xi(0); "
            "head zeros s_n = exp(DeltaLG0) gamma_n^2."
        ),
        "DeltaLG0": mp.nstr(delta0, 80),
        "scale_exp_DeltaLG0": mp.nstr(scale, 80),
        "max_abs_log_coefficient_error": mp.nstr(max_abs_error, 30),
        "coefficient_checks": coeff_rows,
        "zero_checks": zero_rows,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
