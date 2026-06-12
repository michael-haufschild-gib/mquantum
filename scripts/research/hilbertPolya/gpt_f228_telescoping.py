#!/usr/bin/env python3
"""F228 telescoping diagnostic for xi-head curvature caches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import mpmath as mp


def load_loggamma(path: Path, dps: int) -> tuple[list[mp.mpf], list[mp.mpf]]:
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


def c_w(j: int) -> mp.mpf:
    w = mp.lambertw(2 * mp.mpf(j) / mp.pi)
    return (1 / mp.mpf(j)) * (1 - 2 / (w + 1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cache", type=Path)
    parser.add_argument("--dps", type=int, default=120)
    parser.add_argument("--ks", default="40,80,120,166,200,240,280,320,359")
    parser.add_argument(
        "--normalization-factor",
        type=mp.mpf,
        default=mp.mpf("4"),
        help="Optional factor mapping cached moments to the Xi normalization.",
    )
    parser.add_argument(
        "--cstar",
        type=mp.mpf,
        default=mp.mpf("1.28796206"),
        help="C* value used in c0^W = EulerGamma - 2C*.",
    )
    args = parser.parse_args()

    log_moments, loggamma = load_loggamma(args.cache, args.dps)
    curv = curvature(loggamma)
    max_valid = len(loggamma) - 2
    requested = [int(part) for part in args.ks.split(",") if part]
    if min(requested) < 1 or max(requested) > max_valid:
        raise SystemExit(f"cache only supports curvature through {max_valid}")

    base_delta = loggamma[1] - loggamma[0]
    f88_c0 = mp.log(8 * mp.e ** log_moments[1] / mp.e ** log_moments[0])
    f88_scale = mp.e ** (-f88_c0)
    c0_w = mp.euler - 2 * args.cstar
    f88_sinf = f88_c0 - c0_w
    norm = args.normalization_factor
    rows: dict[int, dict[str, str]] = {}
    for k in requested:
        c_sum = mp.fsum(curv[j] for j in range(1, k + 1))
        cw_sum = mp.fsum(c_w(j) for j in range(1, k + 1))
        s_k = c_sum - cw_sum
        delta_next = loggamma[k + 1] - loggamma[k]
        limit_proxy = delta_next + cw_sum
        w = mp.lambertw(2 * mp.mpf(k) / mp.pi)
        saddle_t_squared = (w / 2) ** 2
        moment_ratio = mp.e ** (log_moments[k + 1] - log_moments[k])
        c0_k = c_sum - mp.log(k) + 2 * mp.log(w)
        r_k = ((2 * mp.mpf(k) + 1) / 2) * mp.e ** (-c_sum)
        ratio = r_k / (w * w)
        rows[k] = {
            "C_k": mp.nstr(c_sum, 50),
            "CW_k": mp.nstr(cw_sum, 50),
            "S_k": mp.nstr(s_k, 50),
            "c0_k": mp.nstr(c0_k, 50),
            "c0_k_minus_f88_c0": mp.nstr(c0_k - f88_c0, 50),
            "DeltaLG_next": mp.nstr(delta_next, 50),
            "limit_proxy_DeltaLG_next_plus_CW_k": mp.nstr(limit_proxy, 50),
            "S_from_telescoping": mp.nstr(base_delta - limit_proxy, 50),
            "moment_ratio_M_next_over_M": mp.nstr(moment_ratio, 50),
            "saddle_t_squared_W_over_2_squared": mp.nstr(saddle_t_squared, 50),
            "moment_ratio_over_saddle_t_squared": mp.nstr(moment_ratio / saddle_t_squared, 50),
            "r_k": mp.nstr(r_k, 50),
            "W_2k_over_pi_squared": mp.nstr(w * w, 50),
            "r_k_over_W_squared": mp.nstr(ratio, 50),
            "r_k_over_W_squared_minus_f88_scale": mp.nstr(ratio - f88_scale, 50),
            "distance_to_Sinf_1": mp.nstr(1 - s_k, 50),
            "distance_to_f88_Sinf": mp.nstr(f88_sinf - s_k, 50),
            "limit_proxy_minus_A_minus_1": mp.nstr(limit_proxy - (base_delta - 1), 50),
            "telescoping_error": mp.nstr(c_sum - (base_delta - delta_next), 20),
        }

    result = {
        "cache": str(args.cache),
        "dps": args.dps,
        "max_curvature_index": max_valid,
        "definition": {
            "LG_j": "log(moment_j) + log Gamma(j+1) - log Gamma(2j+1)",
            "c_j": "2 LG_j - LG_{j-1} - LG_{j+1}",
            "C_k": "sum_{j=1}^k c_j = (LG_1-LG_0) - (LG_{k+1}-LG_k)",
            "S_k": "C_k - sum_{j=1}^k c_w(j)",
        },
        "normalization_note": (
            "The cached Phi kernel is globally scaled relative to Xi; "
            "M2/(2M0) and LG_1-LG_0 are invariant under that scale."
        ),
        "normalization_factor": mp.nstr(norm, 30),
        "cached_M0": mp.nstr(mp.e ** log_moments[0], 80),
        "cached_M2": mp.nstr(mp.e ** log_moments[1], 80),
        "normalized_M0": mp.nstr(norm * mp.e ** log_moments[0], 80),
        "normalized_M2": mp.nstr(norm * mp.e ** log_moments[1], 80),
        "A_log_M2_over_2M0": mp.nstr(base_delta, 80),
        "exp_A_M2_over_2M0": mp.nstr(mp.e ** base_delta, 80),
        "A_minus_1_if_Sinf_is_1": mp.nstr(base_delta - 1, 80),
        "f88_closed_form": {
            "c0_log_8M2_over_M0": mp.nstr(f88_c0, 80),
            "scale_exp_minus_c0": mp.nstr(f88_scale, 80),
            "c0_w_euler_minus_2cstar": mp.nstr(c0_w, 80),
            "cstar": mp.nstr(args.cstar, 50),
            "predicted_Sinf_c0_minus_c0w": mp.nstr(f88_sinf, 80),
        },
        "rows": rows,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
