"""GPT interlacing scan for Jensen variable-curvature profiles.

Fable-aligned model:
    Delta^2 log a_j = -alpha / (j + b)

For each profile, this checks two conditions for Jensen polynomials
R_d^n(t) = sum_k (-1)^k binom(d,k) a_{n+k} t^k:
    1. all roots are positive real;
    2. adjacent shifts right-interlace:
       r_i(n) < r_i(n+1) < r_{i+1}(n), with r_d(n) < r_d(n+1).

The scan is intentionally high precision. It is a referee instrument, not a
proof. Run on the shared pod as /root/gpt_interlace_scan.py.
"""

from __future__ import annotations

import time
from typing import Optional

from mpmath import binomial, exp, log, mp, mpf, polyroots


mp.dps = 260
T0 = time.time()
LOG_CACHE: dict[tuple[str, str, int], list[mpf]] = {}


def build_logs(alpha: mpf, b: mpf, nmax: int) -> list[mpf]:
    key = (str(alpha), str(b), nmax)
    if key in LOG_CACHE:
        return LOG_CACHE[key]

    logs = [mpf(0)] * (nmax + 1)
    delta = mpf(0)
    for j in range(1, nmax + 1):
        delta -= alpha / (mpf(j) + b)
        logs[j] = logs[j - 1] + delta

    LOG_CACHE[key] = logs
    return logs


def roots_r(alpha: mpf, b: mpf, n: int, d: int) -> tuple[Optional[list[mpf]], str]:
    logs = build_logs(alpha, b, n + d + 3)
    log_coeffs = [log(binomial(d, k)) + logs[n + k] for k in range(d + 1)]
    max_log = max(log_coeffs)
    coeffs = [((-1) ** k) * exp(log_coeffs[k] - max_log) for k in range(d + 1)]

    try:
        roots = polyroots(list(reversed(coeffs)), maxsteps=2500, error=False, extraprec=180)
    except Exception as exc:  # noqa: BLE001 - report mpmath failure class in log
        return None, f"noconv:{exc.__class__.__name__}"

    scale = max([mpf(1)] + [abs(z) for z in roots])
    rel_im = max(abs(z.imag) / scale for z in roots)
    if rel_im > mpf("1e-45"):
        return None, f"complex:{mp.nstr(rel_im, 8)}"

    real_roots = sorted([z.real for z in roots])
    if any(root <= 0 for root in real_roots):
        return None, "nonpos"

    return real_roots, "ok"


def right_interlaces(roots_n: Optional[list[mpf]], roots_next: Optional[list[mpf]]) -> bool:
    if roots_n is None or roots_next is None:
        return False
    if len(roots_n) != len(roots_next):
        return False
    if not (roots_n[0] < roots_next[0]):
        return False
    for i in range(len(roots_n) - 1):
        if not (roots_n[i] < roots_next[i] < roots_n[i + 1]):
            return False
    return roots_n[-1] < roots_next[-1]


def scan(name: str, alpha_text: str, b_text: str, dmax: int, nmax: int) -> None:
    alpha = mpf(alpha_text)
    b = mpf(b_text)
    first_nonhyper = None
    first_noninterlace = None

    print(
        "PROFILE",
        name,
        "alpha",
        alpha_text,
        "b",
        b_text,
        "dmax",
        dmax,
        "nmax",
        nmax,
        flush=True,
    )

    for d in range(1, dmax + 1):
        for n in range(0, nmax + 1):
            roots_n, status_n = roots_r(alpha, b, n, d)
            if status_n != "ok" and first_nonhyper is None:
                first_nonhyper = (d, n, status_n)

            roots_next, status_next = roots_r(alpha, b, n + 1, d)
            if not right_interlaces(roots_n, roots_next) and first_noninterlace is None:
                first_noninterlace = (d, n, status_n, status_next)

        if d % 8 == 0:
            print(
                "progress",
                name,
                "d",
                d,
                "first_nonhyper",
                first_nonhyper,
                "first_noninterlace",
                first_noninterlace,
                "elapsed",
                int(time.time() - T0),
                flush=True,
            )

        if first_nonhyper is not None and first_noninterlace is not None:
            break

    print(
        "RESULT",
        name,
        "first_nonhyper",
        first_nonhyper,
        "first_noninterlace",
        first_noninterlace,
        "elapsed",
        int(time.time() - T0),
        flush=True,
    )


def main() -> None:
    scan("pure04_b0", "0.4", "0", 36, 2)
    scan("pure05_b0", "0.5", "0", 56, 2)
    scan("pure07_b0", "0.7", "0", 132, 1)
    scan("shift07_b8.36", "0.7", "8.36", 80, 1)
    print("DONE elapsed", int(time.time() - T0), flush=True)


if __name__ == "__main__":
    main()
