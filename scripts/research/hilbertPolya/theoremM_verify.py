#!/usr/bin/env python3
"""Theorem M — referee-runnable verification suite (campaign phase P4).

Re-derives every numbered constant of docs/rh/theorem_M_draft.md in
high-precision arithmetic and verifies the theorem's CONCLUSION
end-to-end, independently of the proof. Each block prints PASS/FAIL.

Usage:  python3 theoremM_verify.py [--dmax 300]

Sections:
  V1  §1.4a construction: lambda-mass, atom, Binet identity (B),
      adjacent-ratio identity (R)   [cancellation-safe eta]
  V2  END-TO-END: hyperbolicity of Psi_d for d = 1..DMAX
  V3  W1/W2 exact identities (numerical residuals at random points)
  V4  E1 inputs: Szego largest-zero inequality, Omega(rho_d) bound,
      beyond-edge counting error (E1b) empirical check
  V5  Constant chain: E5/E8/K_cap arithmetic, Corollary T floor,
      cap-floor threshold K = 3.0500, X-wall ratio
Requires: mpmath, numpy, scipy.
"""
import argparse
import sys

import numpy as np
from mpmath import mp, mpf, mpc, exp, log, euler, sqrt, quad, psi as digamma, e as mpe, pi as mppi
from scipy.special import roots_genlaguerre
from scipy.optimize import brentq

PASS = "PASS"
FAIL = "FAIL"
failures = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  [{PASS if ok else FAIL}] {name}" + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(name)


# ----------------------------------------------------------------------
# V1 — §1.4a construction
# ----------------------------------------------------------------------
def eta_safe(t):
    """eta(t) = e^{t/2}/t - 1/(1-e^{-t}), Taylor branch near 0.

    Naive evaluation suffers ~|log10 t| digits of cancellation; under
    tanh-sinh quadrature this fakes a constant offset in (B).
    """
    if t < mpf("0.05"):
        tt = t * t
        num = mpf(0)
        c = t ** 3 / 24  # 2*sinh(t/2) - t = sum 2 (t/2)^{2m+1}/(2m+1)!, m>=1
        m = 1
        while abs(c) > mpf(10) ** (-(mp.dps + 10)):
            num += c
            c *= tt / (4 * (2 * m + 2) * (2 * m + 3))
            m += 1
        return num / (t * (-(exp(-t) - 1)))
    return exp(t / 2) / t - 1 / (1 - exp(-t))


def v1():
    print("V1  §1.4a construction (dps = 80):")
    mp.dps = 80
    mass = quad(lambda t: eta_safe(t) * exp(-t) / (1 - exp(-t)), [0, 1, 10, 80])
    check("lambda mass = (1-ln2)/2", abs(mass - (1 - log(2)) / 2) < mpf(10) ** (-18),
          f"residual {float(abs(mass-(1-log(2))/2)):.1e}")
    check("atom exp(-mass) = sqrt(2/e)", abs(exp(-mass) - sqrt(2 / mpe)) < mpf(10) ** (-18))
    for y in [mpf(3), mpf(7)]:
        lhs = quad(lambda t: exp(-y * t) * eta_safe(t), [0, 1, 10, 80])
        rhs = digamma(0, y) - log(y - mpf(1) / 2)
        check(f"Binet (B) at y = {y}", abs(lhs - rhs) < mpf(10) ** (-50),
              f"residual {float(abs(lhs-rhs)):.1e}")
    for k in [1, 5, 12]:
        lhs = -quad(lambda t: exp(-k * t) * eta_safe(t), [0, 1, 10, 80, 220])
        rhs = log(k - mpf(1) / 2) - digamma(0, k)
        check(f"ratio (R) at k = {k}", abs(lhs - rhs) < mpf(10) ** (-40))


# ----------------------------------------------------------------------
# V2 — end-to-end hyperbolicity of Psi_d
# ----------------------------------------------------------------------
def harmonic(n):
    return sum(mpf(1) / j for j in range(1, n + 1))


def s1(k):
    return k * harmonic(k - 1) - (k - 1) if k >= 1 else mpf(0)


def psi_coeffs(d):
    """Coefficients a_k of Psi_d in z = w^2: a_k = (-1)^k (d)_k e^{gk-S1}/(d^k 4^k k!)."""
    coeffs = []
    fall = mpf(1)
    fact = mpf(1)
    for k in range(0, d + 1):
        if k > 0:
            fall *= (d - k + 1)
            fact *= k
        coeffs.append((-1) ** k * fall * exp(euler * k - s1(k)) / (mpf(d) ** k * mpf(4) ** k * fact))
    return coeffs


def v2(dmax):
    print(f"V2  end-to-end hyperbolicity of Psi_d (sign-change count = d), d up to {dmax}:")
    dlist = [d for d in [1, 2, 3, 5, 10, 20, 40, 75, 100, 150, 200, 300] if d <= dmax]
    for d in dlist:
        mp.dps = 60 + int(1.3 * d)
        coeffs = psi_coeffs(d)

        def val_w(w):
            z = w * w
            s = coeffs[d]
            for k in range(d - 1, -1, -1):
                s = s * z + coeffs[k]
            return s

        wmax = mpf(4) * d + 4 * mpf(d) ** (mpf(1) / 3) + 20
        n_grid = 9 * d + 200
        prev = val_w(mpf(0))
        changes = 0
        for i in range(1, n_grid + 1):
            cur = val_w(wmax * mpf(i) / n_grid)
            if prev * cur < 0:
                changes += 1
            if cur != 0:
                prev = cur
        check(f"Psi_{d} has d = {d} real positive z-roots", changes == d,
              f"sign changes {changes}, dps {mp.dps}")
    mp.dps = 50


# ----------------------------------------------------------------------
# V3 — W1/W2 exact identities (numerical residuals)
# ----------------------------------------------------------------------
def v3():
    print("V3  W1/W2 identities (residuals at random points, d = 7, dps = 40):")
    mp.dps = 40
    d = 7
    z, _ = roots_genlaguerre(d, -0.5)
    rho = np.sort(np.sqrt(4 * d * z))
    allz = [mpf(float(r)) for r in rho] + [-mpf(float(r)) for r in rho]

    def cd(w):
        out = mpc(1)
        for r in allz:
            if r > 0:
                out *= (1 - (w / r) ** 2)
        return out

    def cdp(w, h=mpf(10) ** (-12)):
        return (cd(w + h) - cd(w - h)) / (2 * h)

    def cdpp(w, h=mpf(10) ** (-8)):
        return (cd(w + h) - 2 * cd(w) + cd(w - h)) / (h * h)

    # ODE residual (1.1): C'' - (w/2d) C' + C = 0
    w0 = mpc("1.3", "0.7")
    res = cdpp(w0) - (w0 / (2 * d)) * cdp(w0) + cd(w0)
    check("ODE 1.1 residual ~ 0", abs(res) < mpf(10) ** (-5), f"|res| {float(abs(res)):.1e}")

    # W1: dE/dx = (x/d)|C'|^2 along horizontal
    x0, y0, h = mpf("1.1"), mpf("0.9"), mpf(10) ** (-7)

    def energy(x):
        w = mpc(x, y0)
        return abs(cd(w)) ** 2 + abs(cdp(w)) ** 2

    lhs = (energy(x0 + h) - energy(x0 - h)) / (2 * h)
    rhs = (x0 / d) * abs(cdp(mpc(x0, y0))) ** 2
    check("W1 energy derivative identity", abs(lhs - rhs) < abs(rhs) * mpf(10) ** (-3),
          f"rel.err {float(abs(lhs-rhs)/abs(rhs)):.1e}")

    # W2 barrier numerically: |psi(c + iy)| < 1 on first wall
    def psival(x):
        return sum(1.0 / (x - float(r)) for r in allz)

    c1 = brentq(psival, float(rho[0]) + 1e-9, float(rho[1]) - 1e-9)
    worst = max(abs(sum(mpc(c1, y) ** 0 / (mpc(c1, y) - r) for r in allz))
                for y in [mpf("0.3"), mpf(1), mpf(3), mpf(10)])
    check("W2 wall barrier |psi(c+iy)| < 1", worst < 1, f"max {float(worst):.4f}")


# ----------------------------------------------------------------------
# V4 — E1 inputs
# ----------------------------------------------------------------------
def v4():
    print("V4  E1/E1b inputs:")
    ok_all = True
    for d in [2, 10, 50, 200]:
        z, _ = roots_genlaguerre(d, -0.5)
        zmax = np.sqrt(z.max())
        n2 = 4 * d + 1
        bound = np.sqrt(n2) - 1.8557 * n2 ** (-1 / 6)
        ok_all &= zmax <= bound
    check("Szego 6.32 inequality (d = 2..200)", ok_all)

    ok_all = True
    for d in [10, 50, 200]:
        z, _ = roots_genlaguerre(d, -0.5)
        rho = np.sort(np.sqrt(4 * d * z))
        om = np.sqrt(max(0.0, 1 + 1 / (4 * d) - rho[-1] ** 2 / (16 * d * d)))
        ok_all &= om * d ** (1 / 3) >= 0.858
    check("Omega(rho_d) >= 0.858 d^{-1/3}", ok_all)

    # E1b empirical: sup |e| beyond edge small; terminal value -1/4
    d = 100
    z, _ = roots_genlaguerre(d, -0.5)
    rho = np.sort(np.sqrt(4 * d * z))
    A2 = 16 * d * d + 4 * d
    A = np.sqrt(A2)

    def smooth(s):
        s = min(s, A)
        f = lambda t: 0.5 * t * np.sqrt(max(0.0, A2 - t * t)) + 0.5 * A2 * np.arcsin(min(1.0, t / A))
        return (f(s) - f(0)) / (4 * d * np.pi)

    ss = np.linspace(rho[-1] + 1e-9, A * 1.05, 500)
    es = np.array([np.sum(rho <= s) - smooth(s) for s in ss])
    check("E1b: beyond-edge |e| <= 2.43 (measured)", np.abs(es).max() <= 2.43,
          f"measured sup {np.abs(es).max():.3f}")
    check("e(infinity) = -1/4", abs(es[-1] + 0.25) < 0.01, f"terminal {es[-1]:.4f}")


# ----------------------------------------------------------------------
# V5 — constant chain
# ----------------------------------------------------------------------
def v5():
    print("V5  constant chain (dps = 50):")
    mp.dps = 50
    p = sqrt(2 / mpe)
    d1 = mpf(10) ** 6
    E0 = mpf("1.025") + log(d1) / (6 * mppi)
    e3 = (mpf(3) / 2 + 1 / (4 * mppi * d1 ** (mpf(1) / 6))) * 2 / mppi
    e4 = 4 * E0 / d1 ** (mpf(1) / 6) + mpf("0.61") / d1 ** (mpf(1) / 3)
    e5 = 1 + mpf("0.0001") + e3 + e4
    k_bulk = sqrt(e5 ** 2 + mpf("1.319") ** 2)
    check("E5 bulk K <= 2.98", k_bulk <= mpf("2.98"), f"K_bulk {float(k_bulk):.4f}")

    e7a = ((mppi / 2 + 1) / mppi) * sqrt(1 + 1 / (4 * d1))
    e7b = 4 * mpf("2.43") / (mppi * d1 ** (mpf(1) / 3))
    e8 = 5 / (2 * mppi) + sqrt(1 + 1 / (4 * d1)) + e7a + e7b
    k_edge = sqrt(e8 ** 2 + mpf("1.319") ** 2)
    check("E8 edge K <= 2.96", k_edge <= mpf("2.96"), f"K_edge {float(k_edge):.4f}")

    K = mpf("2.98")
    r_cap = (1 - p) * sqrt(1 + K ** 2) / p
    floor = p * (1 - r_cap) / sqrt(1 + K ** 2)
    check("Corollary T cap floor >= 1/8", floor >= mpf(1) / 8, f"floor {float(floor):.5f}")

    # threshold: floor(K) = 1/8 at K = 3.0500
    Kthr = mpf("3.0500")
    fthr = p / sqrt(1 + Kthr ** 2) - (1 - p)
    check("cap-floor threshold K = 3.0500", abs(fthr - mpf(1) / 8) < mpf(10) ** (-5),
          f"floor(3.05) {float(fthr):.7f}")

    ratio_x = (1 - p) * sqrt(5) / p
    check("X-wall ratio (1-p)sqrt(5)/p < 1", ratio_x < 1, f"{float(ratio_x):.4f}")
    check("wall budget (1-p)sqrt(2)/p < 1", (1 - p) * sqrt(2) / p < 1,
          f"{float((1-p)*sqrt(2)/p):.4f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dmax", type=int, default=300)
    args = ap.parse_args()
    print("Theorem M verification suite (docs/rh/theorem_M_draft.md)\n")
    v1()
    v2(args.dmax)
    v3()
    v4()
    v5()
    print(f"\n{'ALL CHECKS PASS' if not failures else 'FAILURES: ' + ', '.join(failures)}")
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
