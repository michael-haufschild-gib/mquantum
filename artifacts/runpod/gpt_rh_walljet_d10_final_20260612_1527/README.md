# GPT d=10 Transverse Wall-Jet Certificate

Generated: 2026-06-12 15:27 CEST  
Remote source: `ssh root@157.157.221.30 -p 12784 -i ~/.ssh/id_ed25519`  
Remote workdir: `/workspace/gpt_rh/walljet_d10`

## Purpose

This archive preserves the exact d=10 transverse Krawtchouk wall-jet run before
the Runpod can disappear. The computation checks the F55 wall-jet cone in
transverse-only mode:

```text
Q_d(s,q;r) = (|P_d(z)|^2 - |P_d(sz)|^2)/(1-s),
z = r - q + 2i sqrt(rq),
Q_d = sum_m q^m B_m(s;r).
```

For `d=10`, there are nine positive critical walls. The script reduces in `r`
modulo `H_d=P_d'`, substitutes each wall as an exact `CRootOf`, and uses Sturm
root counts in `s in (0,1)`.

## Command

One worker was launched per wall:

```text
venv/bin/python rh_walljet_certifier.py 10 --wall J --transverse-only --progress
```

with `J=1,...,9`.

Environment reported by the pod:

```text
Python 3.13.5
sympy 1.14.0
mpmath 1.3.0
```

## Result

All nine workers completed with `RESULT d=10 TRANSVERSE_PASS`.

```text
wall 1: 20 q-coefficients passed, elapsed 3187s
wall 2: 20 q-coefficients passed, elapsed 3188s
wall 3: 20 q-coefficients passed, elapsed 3212s
wall 4: 20 q-coefficients passed, elapsed 3211s
wall 5: 20 q-coefficients passed, elapsed 3210s
wall 6: 20 q-coefficients passed, elapsed 3212s
wall 7: 20 q-coefficients passed, elapsed 3220s
wall 8: 20 q-coefficients passed, elapsed 3202s
wall 9: 20 q-coefficients passed, elapsed 3213s
```

Every `.err` file is empty. Each wall log reports:

```text
Q_degrees q=20 s=19 r=8
```

The final `q^20` endpoint values are positive on every wall:

```text
endpoint0=2.22472754514720217934897411637E-44
endpoint1=4.44945509029440435869794823274E-43
```

## Files

- `rh_walljet_certifier.py`: exact certifier source used on the pod.
- `walljet_d10_wJ.log`: stdout/progress/result for wall `J`.
- `walljet_d10_wJ.err`: stderr for wall `J`; all are empty.
- `SHA256SUMS`: local hashes for this archive.

Combined with F58 for the `q^0` real-axis term, this extends the exact
wall-jet diagnostic from `d<=9` to `d=10` for all transverse coefficients.
