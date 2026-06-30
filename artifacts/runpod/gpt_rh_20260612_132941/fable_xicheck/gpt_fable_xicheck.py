# fable_xicheck.py — Turan/Szego trap audit of the xihead result.
# xihead (K=140, dps=1000) reported Phi_{xi,0} with 22 nonreal zeros among
# the first 40 by modulus (onset |z|~180, relIm~0.39). History warns:
# Turan's partial-sum program died on zeros that truncations have but the
# function does not (Montgomery 1983), and Taylor sections of entire
# functions grow spurious zeros near a Szego-type fidelity boundary
# (Buckholtz; for xi itself arXiv:1609.05965). The 40-zero window reaches
# |z|~800 while the estimated K=140 trust radius is ~400-660 — the window
# straddles the boundary. This job decides artifact vs genuine:
#   A. re-root the K=140 section; print EVERY nonreal root (xihead only
#      printed counts) with central index nu(|z|) and ln(T_K/T_nu).
#   B. fidelity radii z*(K) where nu(z*)=K, for K=100,140,240,360.
#      (z*(100) also reinterprets the running xishift job post hoc.)
#   C. winding counts of the K=240 and K=360 sections on small circles
#      around each onset nonreal zero (|z| < 0.8*z*(140)).
#      Persistence at K=360 inside the faithful zone => genuine zero of
#      Phi_{xi,0} (tail beyond k=360 is e^{-O(100)} there) => GPT F62
#      argument-principle d=C*nu^2 test is GO. Vanishing => Szego
#      artifact => the 18/40 "refutation" is retracted.
import time
from mpmath import arg, cos, exp, fabs, gamma, log, mp, mpc, mpf, pi, polyroots, sin

T0 = time.time()
mp.dps = 1000
KA = 140
KBS = [240, 360]
KMAX = 364
H_INV = 3200


def moments(kmax):
    h = mpf(1) / H_INV
    ns = int(mpf(9) / 2 * H_INV)
    M = [mpf(0)] * (kmax + 1)
    pi2 = pi * pi
    cut = mp.dps * mpf('2.31') + 50
    for i in range(1, ns + 1):
        u = i * h
        e2 = exp(2 * u)
        s = mpf(0)
        n = 1
        while True:
            a = pi * n * n * e2
            if a > cut:
                break
            s += (4 * pi2 * n**4 * exp(mpf(9) / 2 * u)
                  - 6 * pi * n * n * exp(mpf(5) / 2 * u)) * exp(-a)
            n += 1
        if s == 0:
            continue
        w = 1 if i == ns else (4 if i % 2 == 1 else 2)
        base = s * w
        u2 = u * u
        p = mpf(1)
        for k in range(kmax + 1):
            M[k] += base * p
            p *= u2
    s0 = mpf(0)
    n = 1
    while True:
        a = pi * n * n
        if a > cut:
            break
        s0 += (4 * pi * pi * n**4 - 6 * pi * n * n) * exp(-a)
        n += 1
    M[0] += s0
    return [m * 2 * h / 3 for m in M]


print("XICHECK — Szego/Turan trap audit of Phi_{xi,0} (dps=%d)" % mp.dps, flush=True)
M = moments(KMAX)
print("Xi(0) gate: %s [%ds]" % (mp.nstr(M[0], 14), int(time.time() - T0)), flush=True)
LG = [log(M[j]) + log(gamma(j + 1)) - log(gamma(2 * j + 1)) for j in range(KMAX)]
C = [None] * (KMAX - 1)
for j in range(1, KMAX - 1):
    C[j] = 2 * LG[j] - LG[j - 1] - LG[j + 1]

# S(k) = sum_{r=1}^{k-1} (k-r) c_r via S(k+1) = S(k) + sum_{r<=k} c_r
KS = KMAX - 3
S = [mpf(0), mpf(0)]
P = mpf(0)
for k in range(1, KS):
    P += C[k]
    S.append(S[-1] + P)
LNFACT = [log(gamma(k + 1)) for k in range(KS + 1)]


def lnterm(k, lnz):
    return -S[k] + k * lnz - LNFACT[k]


def nu_of(z):
    lnz = log(z)
    best, bk = None, -1
    for k in range(KS):
        v = lnterm(k, lnz)
        if best is None or v > best:
            best, bk = v, k
    return bk, best


def zstar(K):
    lo, hi = mpf(10), mpf(10)
    while nu_of(hi)[0] < K and hi < mpf("1e9"):
        hi *= 2
    for _ in range(50):
        mid = (lo + hi) / 2
        if nu_of(mid)[0] < K:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# --- Part B first (cheap): fidelity radii -------------------------------
ZS = {}
for K in [100, 140, 240, 360]:
    ZS[K] = zstar(K)
    print("z*(%d) = %s  (trust boundary: nu(z)=K)" % (K, mp.nstr(ZS[K], 6)), flush=True)

# --- Part A: re-root K=140, print all nonreal roots ---------------------
coefA = [((-1) ** k) * exp(-S[k]) / gamma(k + 1) for k in range(KA + 1)]
rts = [mpc(z) for z in polyroots(list(reversed(coefA)), maxsteps=4000,
                                 extraprec=mp.prec)]
rts.sort(key=lambda z: abs(z))
print("K=140 re-root done [%ds]" % int(time.time() - T0), flush=True)
nonreal = [z for z in rts if z.imag > abs(z) * mpf("1e-22")]
print("K=140 nonreal roots (upper half), with central index:", flush=True)
for z in nonreal:
    nv, _ = nu_of(abs(z))
    tail = lnterm(KA, log(abs(z))) - lnterm(nv, log(abs(z)))
    flag = "FAITHFUL" if abs(z) < mpf("0.8") * ZS[140] else "SZEGO-BAND"
    print("  z=%s  |z|=%s nu=%d ln(T_K/T_nu)=%s %s"
          % (mp.nstr(z, 8), mp.nstr(abs(z), 6), nv, mp.nstr(tail, 4), flag),
          flush=True)

# --- Part C: persistence of onset nonreal zeros at K=240, 360 -----------
onset = [z for z in nonreal if abs(z) < mpf("0.8") * ZS[140]]
print("Onset set: %d zeros below 0.8*z*(140)=%s"
      % (len(onset), mp.nstr(mpf("0.8") * ZS[140], 6)), flush=True)
COEF = {}
for K in KBS:
    COEF[K] = [((-1) ** k) * exp(-S[k]) / gamma(k + 1) for k in range(K + 1)]
COEF[KA] = coefA


def feval(coef, s):
    acc = mpc(0)
    for c in reversed(coef):
        acc = acc * s + c
    return acc


def winding(coef, z0, rho, n=480):
    tot = mpf(0)
    prev = None
    mn = None
    for i in range(n + 1):
        th = 2 * pi * i / n
        s = z0 + rho * mpc(cos(th), sin(th))
        v = feval(coef, s)
        a = fabs(v)
        mn = a if mn is None or a < mn else mn
        if prev is not None:
            tot += arg(v / prev)
        prev = v
    return tot / (2 * pi), mn


for z0 in onset:
    others = [abs(z0 - z) for z in rts if abs(z0 - z) > mpf("1e-10")]
    others.append(2 * z0.imag)          # conjugate partner
    rho = min(min(others) * mpf("0.4"), abs(z0) * mpf("0.05") + 1)
    line = "z0=%s rho=%s :" % (mp.nstr(z0, 6), mp.nstr(rho, 4))
    for K in [KA] + KBS:
        w, mn = winding(COEF[K], z0, rho)
        line += "  K=%d count=%s(min|f|=%s)" % (K, mp.nstr(w, 3), mp.nstr(mn, 3))
    print(line + "  [%ds]" % int(time.time() - T0), flush=True)

print("VERDICT KEY: count(360)>=1 on FAITHFUL zero => genuine, F62 GO;")
print("             count(360)=0 => Szego artifact, 18/40 verdict retracted.")
print("done in %ds" % int(time.time() - T0), flush=True)
