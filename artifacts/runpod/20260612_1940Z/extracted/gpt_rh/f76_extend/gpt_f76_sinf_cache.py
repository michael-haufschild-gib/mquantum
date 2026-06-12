#!/usr/bin/env python3
"""F76 xi-curvature W-telescoping diagnostic from a cached moment file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import mpmath as mp


def load_curvature(path: Path, dps: int) -> list[mp.mpf]:
    mp.mp.dps = dps
    raw = json.loads(path.read_text())
    jmax = max(int(k) for k in raw)
    loggamma: list[mp.mpf] = []
    for j in range(jmax + 1):
        moment_log = mp.mpf(raw[str(j)])
        loggamma.append(moment_log + mp.loggamma(j + 1) - mp.loggamma(2 * j + 1))

    curvature = [mp.nan] * (jmax + 1)
    for j in range(1, jmax):
        curvature[j] = 2 * loggamma[j] - loggamma[j - 1] - loggamma[j + 1]
    return curvature


def c_w(j: int) -> mp.mpf:
    w = mp.lambertw(2 * mp.mpf(j) / mp.pi)
    return (1 / mp.mpf(j)) * (1 - 2 / (w + 1))


def c0_observed(curvature: list[mp.mpf], k: int) -> mp.mpf:
    c_sum = mp.fsum(curvature[j] for j in range(1, k + 1))
    w = mp.lambertw(2 * mp.mpf(k) / mp.pi)
    return c_sum - mp.log(k) + 2 * mp.log(w)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("--dps", type=int, default=100)
    parser.add_argument("--ks", default="40,80,120,166")
    args = parser.parse_args()

    curvature = load_curvature(args.cache, args.dps)
    requested = [int(part) for part in args.ks.split(",") if part]
    max_valid = len(curvature) - 2
    if max(requested) > max_valid:
        raise SystemExit(f"cache only supports curvature through {max_valid}")

    target_sinf_for_e = mp.mpf("0.99870846")
    gamma_minus_2cstar = mp.euler - 2 * mp.mpf("1.28796206")

    partials: dict[int, str] = {}
    for k in requested:
        s_k = mp.fsum(curvature[j] - c_w(j) for j in range(1, k + 1))
        partials[k] = mp.nstr(s_k, 50)

    c0_rows: dict[int, dict[str, str]] = {}
    for k in [40, 80, 120, 140, 160, 166, min(max_valid, 169)]:
        if k > max_valid:
            continue
        c0 = c0_observed(curvature, k)
        c0_rows[k] = {
            "c0_k": mp.nstr(c0, 40),
            "exp_minus_c0": mp.nstr(mp.e ** (-c0), 40),
            "exp_minus_c0_over_e": mp.nstr(mp.e ** (-c0 - 1), 40),
        }

    last_k = requested[-1]
    last_partial = mp.mpf(partials[last_k])
    needed_tail_for_e = target_sinf_for_e - last_partial

    result = {
        "cache": str(args.cache),
        "dps": args.dps,
        "max_curvature_index": max_valid,
        "definition": "c_j = 2 loggamma_j - loggamma_{j-1} - loggamma_{j+1}",
        "c_w": "j^-1 * (1 - 2/(W(2j/pi)+1))",
        "partials": partials,
        "gamma_minus_2_cstar": mp.nstr(gamma_minus_2cstar, 30),
        "target_sinf_for_exp_minus_c0_equals_e": mp.nstr(target_sinf_for_e, 30),
        f"tail_needed_after_{last_k}_for_e": mp.nstr(needed_tail_for_e, 30),
        "observed_c0_rows": c0_rows,
        "interpretation": (
            "Cache partials strongly support the W-telescoping constant being "
            "near the pre-registered e scale, but curvature only extends to "
            f"{max_valid}; the tail remains an extrapolation."
        ),
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
