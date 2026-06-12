#!/usr/bin/env python3
"""Independent xi-head audit for the RH proof quest.

Computes Riemann Xi moment coefficients from the classical Phi(t) integral,
builds the fixed-shift xi head Phi_{xi,n}, locates nonreal zeros of truncated
heads, estimates their central indices, and probes finite Jensen sections by
local argument-principle counts.

The script is intentionally checkpointed. It can be interrupted and resumed.
"""

from __future__ import annotations

import argparse
import json
import math
import multiprocessing as mp_pool
import os
import time
from dataclasses import dataclass
from typing import Iterable

import mpmath as mp


def log_event(path: str, payload: dict) -> None:
    payload = {"ts": time.time(), **payload}
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")
        handle.flush()


def phi_kernel(t: mp.mpf, nmax: int) -> mp.mpf:
    e2t = mp.exp(2 * t)
    e5 = mp.exp(mp.mpf("2.5") * t)
    e9 = mp.exp(mp.mpf("4.5") * t)
    total = mp.mpf("0")
    for n in range(1, nmax + 1):
        nn = mp.mpf(n)
        term = (
            2 * mp.pi**2 * nn**4 * e9
            - 3 * mp.pi * nn**2 * e5
        ) * mp.exp(-mp.pi * nn**2 * e2t)
        total += term
        if n >= 6 and abs(term) < mp.mpf(10) ** (-(mp.mp.dps - 20)) * max(1, abs(total)):
            break
    return total


def moment_log(args: tuple[int, int, int, str]) -> tuple[int, str]:
    j, dps, nmax, intervals_json = args
    mp.mp.dps = dps
    intervals = [mp.mpf(x) for x in json.loads(intervals_json)]

    def integrand(t: mp.mpf) -> mp.mpf:
        return phi_kernel(t, nmax) * t ** (2 * j)

    # Split integral heavily around the saddle. For j <= 200 the tail after
    # t=10 is far below the requested precision.
    val = mp.quad(integrand, intervals)
    if val <= 0:
        raise ValueError(f"nonpositive moment at j={j}: {mp.nstr(val, 30)}")
    return j, mp.nstr(mp.log(val), dps)


def load_json(path: str, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: str, payload) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
    os.replace(tmp, path)


def compute_log_moments(
    jmax: int,
    dps: int,
    workers: int,
    nmax: int,
    workdir: str,
    event_log: str,
) -> dict[int, str]:
    path = os.path.join(workdir, "xi_log_moments.json")
    raw = load_json(path, {})
    have = {int(k): v for k, v in raw.items()}
    missing = [j for j in range(jmax + 1) if j not in have]
    log_event(event_log, {"event": "moments_start", "jmax": jmax, "missing": len(missing), "dps": dps})
    if not missing:
        return have

    intervals = [
        "0", "0.125", "0.25", "0.375", "0.5", "0.625", "0.75", "0.875",
        "1.0", "1.125", "1.25", "1.375", "1.5", "1.625", "1.75", "1.875",
        "2.0", "2.25", "2.5", "2.75", "3.0", "3.5", "4.0", "5.0", "6.5",
        "8.0", "10.0",
    ]
    packed_intervals = json.dumps(intervals)
    tasks = [(j, dps, nmax, packed_intervals) for j in missing]
    done = 0
    if workers <= 1:
        iterator: Iterable[tuple[int, str]] = map(moment_log, tasks)
        for j, value in iterator:
            have[j] = value
            done += 1
            if done % 5 == 0 or done == len(missing):
                save_json(path, {str(k): have[k] for k in sorted(have)})
                log_event(event_log, {"event": "moments_progress", "done": done, "missing": len(missing), "latest_j": j})
    else:
        with mp_pool.Pool(processes=workers) as pool:
            for j, value in pool.imap_unordered(moment_log, tasks, chunksize=1):
                have[j] = value
                done += 1
                if done % 5 == 0 or done == len(missing):
                    save_json(path, {str(k): have[k] for k in sorted(have)})
                    log_event(event_log, {"event": "moments_progress", "done": done, "missing": len(missing), "latest_j": j})
    save_json(path, {str(k): have[k] for k in sorted(have)})
    log_event(event_log, {"event": "moments_done", "count": len(have)})
    return have


@dataclass
class XiData:
    loggamma: list[mp.mpf]
    curvature: list[mp.mpf]


def build_xi_data(log_moments: dict[int, str], jmax: int, dps: int) -> XiData:
    mp.mp.dps = dps
    loggamma: list[mp.mpf] = []
    for j in range(jmax + 1):
        lm = mp.mpf(log_moments[j])
        lg = lm + mp.loggamma(j + 1) - mp.loggamma(2 * j + 1)
        loggamma.append(lg)
    curvature = [mp.nan] * (jmax + 1)
    for j in range(1, jmax):
        curvature[j] = 2 * loggamma[j] - loggamma[j - 1] - loggamma[j + 1]
    return XiData(loggamma=loggamma, curvature=curvature)


def head_exponents(curvature: list[mp.mpf], shift: int, degree: int) -> list[mp.mpf]:
    # S(k)=sum_{r=1}^{k-1}(k-r)c_{shift+r}
    s_vals = [mp.mpf("0")] * (degree + 1)
    running_c = mp.mpf("0")
    running_s = mp.mpf("0")
    for k in range(1, degree + 1):
        s_vals[k] = running_s
        idx = shift + k
        if idx < len(curvature):
            running_c += curvature[idx]
            running_s += running_c
        else:
            raise IndexError(f"need curvature[{idx}] for degree={degree}, shift={shift}")
    return s_vals


def head_coefficients(curvature: list[mp.mpf], shift: int, degree: int) -> list[mp.mpf]:
    s_vals = head_exponents(curvature, shift, degree)
    coeffs = []
    for k in range(degree + 1):
        coeffs.append(((-1) ** k) * mp.exp(-s_vals[k] - mp.loggamma(k + 1)))
    return coeffs


def finite_coefficients(curvature: list[mp.mpf], shift: int, degree: int, finite_d: int) -> list[mp.mpf]:
    s_vals = head_exponents(curvature, shift, degree)
    coeffs = []
    for k in range(degree + 1):
        if k <= finite_d:
            log_binom_factor = mp.loggamma(finite_d + 1) - mp.loggamma(finite_d - k + 1) - k * mp.log(finite_d)
            coeffs.append(((-1) ** k) * mp.exp(-s_vals[k] - mp.loggamma(k + 1) + log_binom_factor))
        else:
            coeffs.append(mp.mpf("0"))
    return coeffs


def poly_eval(coeffs_low_to_high: list[mp.mpf], z) -> mp.mpc:
    acc = mp.mpc("0")
    zz = mp.mpc(z)
    for coeff in reversed(coeffs_low_to_high):
        acc = acc * zz + coeff
    return acc


def roots_for_head(curvature: list[mp.mpf], shift: int, degree: int, event_log: str) -> list[mp.mpc]:
    coeffs = head_coefficients(curvature, shift, degree)
    # mpmath wants descending coefficients.
    desc = list(reversed(coeffs))
    attempts = [
        {"maxsteps": 1000, "extraprec": mp.mp.prec // 2},
        {"maxsteps": 4000, "extraprec": mp.mp.prec},
        {"maxsteps": 9000, "extraprec": 2 * mp.mp.prec},
    ]
    failures = []
    for attempt in attempts:
        log_event(event_log, {
            "event": "polyroots_start",
            "shift": shift,
            "degree": degree,
            **attempt,
        })
        try:
            roots = mp.polyroots(desc, cleanup=True, error=False, **attempt)
            roots = [mp.mpc(z) for z in roots]
            log_event(event_log, {
                "event": "polyroots_done",
                "shift": shift,
                "degree": degree,
                "roots": len(roots),
                **attempt,
            })
            return roots
        except Exception as exc:
            failures.append(f"{type(exc).__name__}: {exc}")
            log_event(event_log, {
                "event": "polyroots_fail",
                "shift": shift,
                "degree": degree,
                "error_type": type(exc).__name__,
                "error": str(exc),
                **attempt,
            })
    raise RuntimeError(f"polyroots failed for shift={shift}, degree={degree}: {failures}")


def central_index(curvature: list[mp.mpf], shift: int, degree: int, z: mp.mpc) -> tuple[int, str]:
    s_vals = head_exponents(curvature, shift, degree)
    R = abs(z)
    best_k = 0
    best = mp.ninf
    for k in range(degree + 1):
        term_log = -s_vals[k] - mp.loggamma(k + 1) + k * mp.log(R)
        if term_log > best:
            best = term_log
            best_k = k
    return best_k, mp.nstr(best, 30)


def nearest_distance(z: mp.mpc, roots: list[mp.mpc]) -> mp.mpf:
    distances = [abs(z - w) for w in roots if abs(z - w) > mp.mpf("1e-40")]
    if not distances:
        return max(mp.mpf("0.01"), abs(z) * mp.mpf("0.05"))
    return min(distances)


def argument_count(coeffs: list[mp.mpf], center: mp.mpc, radius: mp.mpf, samples: int) -> tuple[int, str]:
    prev_arg = None
    total = mp.mpf("0")
    min_abs = mp.inf
    for i in range(samples + 1):
        theta = 2 * mp.pi * i / samples
        z = center + radius * mp.e ** (1j * theta)
        val = poly_eval(coeffs, z)
        min_abs = min(min_abs, abs(val))
        arg = mp.arg(val)
        if prev_arg is not None:
            delta = arg - prev_arg
            while delta <= -mp.pi:
                delta += 2 * mp.pi
            while delta > mp.pi:
                delta -= 2 * mp.pi
            total += delta
        prev_arg = arg
    count = int(mp.nint(total / (2 * mp.pi)))
    return count, mp.nstr(min_abs, 20)


def summarize_shift(
    curvature: list[mp.mpf],
    shift: int,
    degree: int,
    samples: int,
    event_log: str,
    workdir: str,
) -> None:
    roots = roots_for_head(curvature, shift, degree, event_log)
    roots_sorted = sorted(roots, key=lambda z: (abs(z), abs(mp.im(z))))
    nonreal = [z for z in roots_sorted if abs(mp.im(z)) > mp.mpf("1e-20") * max(1, abs(z))]
    real_count = len(roots) - len(nonreal)
    worst_relim = max([abs(mp.im(z)) / max(mp.mpf("1e-40"), abs(z)) for z in roots], default=mp.mpf("0"))
    payload = {
        "event": "head_summary",
        "shift": shift,
        "degree": degree,
        "real_count": real_count,
        "root_count": len(roots),
        "worst_relim": mp.nstr(worst_relim, 30),
        "first_roots": [
            {"re": mp.nstr(mp.re(z), 30), "im": mp.nstr(mp.im(z), 30), "abs": mp.nstr(abs(z), 30)}
            for z in roots_sorted[:12]
        ],
        "first_nonreal": [
            {"re": mp.nstr(mp.re(z), 30), "im": mp.nstr(mp.im(z), 30), "abs": mp.nstr(abs(z), 30)}
            for z in nonreal[:8]
        ],
    }
    log_event(event_log, payload)
    save_json(os.path.join(workdir, f"xi_head_shift_{shift}_roots.json"), payload)

    if shift == 0 and nonreal:
        z0 = nonreal[0]
        nu, logterm = central_index(curvature, shift, degree, z0)
        near = nearest_distance(z0, roots)
        radius = max(mp.mpf("1e-8"), near * mp.mpf("0.25"))
        try:
            w = mp.lambertw(2 * nu / mp.pi)
            d_move = max(4, int(mp.ceil(nu * nu / max(mp.mpf("1"), w * w))))
        except Exception:
            w = mp.mpf("1")
            d_move = max(4, int(nu * nu))
        d_list = sorted(set([d_move] + [max(4, int(c * nu * nu)) for c in [1, 2, 4, 8, 16, 32]]))
        log_event(event_log, {
            "event": "nonreal_probe_start",
            "degree": degree,
            "z0_re": mp.nstr(mp.re(z0), 40),
            "z0_im": mp.nstr(mp.im(z0), 40),
            "nu": nu,
            "central_logterm": logterm,
            "radius": mp.nstr(radius, 30),
            "nearest": mp.nstr(near, 30),
            "d_move": d_move,
            "d_schedule": d_list,
        })
        for fd in d_list:
            coeffs = finite_coefficients(curvature, shift, degree, fd)
            count, min_abs = argument_count(coeffs, z0, radius, samples)
            log_event(event_log, {
                "event": "finite_arg_count",
                "head_degree": degree,
                "finite_d": fd,
                "count": count,
                "min_abs": min_abs,
                "z0_re": mp.nstr(mp.re(z0), 30),
                "z0_im": mp.nstr(mp.im(z0), 30),
            })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", default=".")
    parser.add_argument("--jmax", type=int, default=130)
    parser.add_argument("--degree", type=int, default=90)
    parser.add_argument("--dps", type=int, default=320)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--nmax", type=int, default=40)
    parser.add_argument("--shifts", default="0,16,64")
    parser.add_argument("--samples", type=int, default=768)
    args = parser.parse_args()

    os.makedirs(args.workdir, exist_ok=True)
    event_log = os.path.join(args.workdir, "xihead_audit_events.jsonl")
    log_event(event_log, {"event": "start", "args": vars(args)})
    log_moments = compute_log_moments(args.jmax, args.dps, args.workers, args.nmax, args.workdir, event_log)
    data = build_xi_data(log_moments, args.jmax, args.dps)

    alpha = {}
    for j in [1, 2, 4, 8, 16, 32, 64, 96, 128]:
        if j < len(data.curvature) - 1:
            alpha[str(j)] = mp.nstr(j * data.curvature[j], 30)
    log_event(event_log, {"event": "alpha_pt", "values": alpha})

    shifts = [int(x.strip()) for x in args.shifts.split(",") if x.strip()]
    for shift in shifts:
        needed = shift + args.degree + 2
        if needed >= len(data.curvature):
            log_event(event_log, {"event": "skip_shift", "shift": shift, "reason": "insufficient_curvature", "needed": needed})
            continue
        summarize_shift(data.curvature, shift, args.degree, args.samples, event_log, args.workdir)
    log_event(event_log, {"event": "done"})


if __name__ == "__main__":
    main()
